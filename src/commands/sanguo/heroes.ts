import crypto from 'node:crypto';
import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { heroes } from '../../db/schema/heroes.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { mapZones } from '../../db/schema/mapZones.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import { resolveLocale, getT, type SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoHeroesEmbed } from '../../ui/embeds/buildSanguoHeroesEmbed.js';
import {
  STARTER_PICK_PREFIX,
  STARTER_SET_1,
  STARTER_SET_2,
  buildStarterButtons,
} from '../../ui/components/sanguoStarterButtons.js';
import { buildZoneFilterMenu } from '../../ui/components/sanguoHeroesZoneMenu.js';

/**
 * /sanguo heroes command (Phase 10 — TQC-12/TQC-13, D-14/D-15).
 *
 * Two execute modes:
 *  - EMPTY collection → the starter picker (D-14 onboarding surface): exactly
 *    3 buttons in ONE ActionRow, set 1 (Tào Tháo / Lưu Bị / Tôn Kiên) while
 *    user_sanguo_state.starterViews < 3, set 2 (Trương Giác / Viên Thiệu /
 *    Đổng Trác) from the 4th empty invocation. Every empty invocation
 *    INCREMENTS starterViews (FOR UPDATE — one row per user, single-writer);
 *    a pick resets it.
 *  - NON-EMPTY collection → the owned-only collection grouped per zone: one
 *    line per hero `{{emoji}} {{name}} • {{stars}} • {{grade}}{{active}}`
 *    with stars from the PUBLIC heroes.tier (★1-5, never rarity — D-12), IV
 *    grade keys, and the ⭐ active badge on exactly one hero; the zone filter
 *    select (sanguo:heroes:zone, D-15) in its OWN ActionRow (CR-09-01).
 *
 * handleStarterPick is the game's ONLY faucet (D-19 exception): FREE — no
 * wallet call anywhere (grep-gated). The grant runs in a FOR UPDATE tx that
 * re-checks the collection is still empty (T-10-07-01 double-grant guard),
 * rolls 6× crypto.randomInt(0,32) IVs (same distribution as capture,
 * TQC-12), writes hp_current = base HP, sets activeHeroId, resets
 * starterViews.
 *
 * Identity rule: every service call keys on users.id (users.id) — NEVER
 * char.id. Errors are Error('MACHINE_CODE') matched on err.message.
 */

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const heroesSubcommand = new SlashCommandSubcommandBuilder()
  .setName('heroes')
  .setDescription('Xem bộ sưu tập hero của bạn')
  .setDescriptionLocalizations({
    'en-US': 'View your hero collection',
    'zh-CN': '查看你的英雄收藏',
  });
/* eslint-enable i18next/no-literal-string */

/** IV grade bands (STATE.md D-12 / RESEARCH Common Operation 5): sum/186 → key. */
function ivGradeKey(ivStr: number, ivAgi: number, ivInt: number, ivMov: number, ivLea: number, ivCha: number): string {
  const pct = Math.round(((ivStr + ivAgi + ivInt + ivMov + ivLea + ivCha) / 186) * 100);
  if (pct === 100) return 'iv_grade.gold';
  if (pct >= 90) return 'iv_grade.ruby';
  if (pct >= 80) return 'iv_grade.sapphire';
  if (pct >= 60) return 'iv_grade.jade';
  return 'iv_grade.gray';
}

interface PerLocaleName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Per-locale hero name column (D-07 content-in-DB — never i18n keys). */
function pickName(row: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return row.nameEn;
  if (locale === 'zh-cn') return row.nameZh ?? row.nameVi;
  return row.nameVi;
}

function pickZoneName(zone: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return zone.nameEn;
  if (locale === 'zh-cn') return zone.nameZh ?? zone.nameVi;
  return zone.nameVi;
}

function safeHeroEmoji(heroId: string): string | undefined {
  try {
    return heroEmoji(heroId);
  } catch {
    // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 pattern)
    return undefined;
  }
}

/** Owned-hero row shape — the collection line source (heroes joined user_heroes). */
interface OwnedHeroRow extends PerLocaleName {
  id: number;
  heroId: number;
  heroHeroId: string;
  tier: number;
  ivStr: number;
  ivAgi: number;
  ivInt: number;
  ivMov: number;
  ivLea: number;
  ivCha: number;
  capturedZone: string | null;
}

const OWNED_COLUMNS = {
  id: userHeroes.id,
  heroId: userHeroes.heroId,
  heroHeroId: heroes.heroId,
  nameVi: heroes.nameVi,
  nameEn: heroes.nameEn,
  nameZh: heroes.nameZh,
  tier: heroes.tier,
  ivStr: userHeroes.ivStr,
  ivAgi: userHeroes.ivAgi,
  ivInt: userHeroes.ivInt,
  ivMov: userHeroes.ivMov,
  ivLea: userHeroes.ivLea,
  ivCha: userHeroes.ivCha,
  capturedZone: userHeroes.capturedZone,
} as const;

async function queryOwnedHeroes(
  userId: number,
  zoneCode?: string,
): Promise<OwnedHeroRow[]> {
  return db
    .select(OWNED_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(
      and(
        eq(userHeroes.userId, userId),
        zoneCode ? eq(userHeroes.capturedZone, zoneCode) : undefined,
      ),
    )
    .orderBy(asc(heroes.id));
}

interface InteractionUserCtx {
  userId: number;
  t: TFunction;
  locale: SupportedLocale;
  shardId: number | undefined;
}

/** Resolve the users.id row for a component press (users.discordId → users.id). */
async function resolveInteractionUser(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<InteractionUserCtx | null> {
  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
      components: [],
    });
    return null;
  }
  return { userId: userRow.id, t, locale, shardId };
}

/**
 * D-14 rotation counter: every /sanguo heroes invocation while the collection
 * is empty increments user_sanguo_state.starterViews (FOR UPDATE — one row
 * per user; INSERT when missing) and returns the PRE-increment value (the
 * rotation source: >= 3 → starter set 2 on the NEXT render, i.e. the 4th
 * empty invocation shows set 2).
 */
async function incrementStarterViews(userId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [stateRow] = await tx
      .select()
      .from(userSanguoState)
      .where(eq(userSanguoState.userId, userId))
      .for('update');
    const views = stateRow?.starterViews ?? 0;
    if (stateRow) {
      await tx
        .update(userSanguoState)
        .set({ starterViews: views + 1, updatedAt: new Date() })
        .where(eq(userSanguoState.userId, userId));
    } else {
      await tx.insert(userSanguoState).values({ userId, starterViews: 1 });
    }
    return views;
  });
}

/** Resolve the starter pool heroes from the catalog, in pool order (exactly 3). */
async function fetchStarterHeroes(
  pool: readonly string[],
  locale: SupportedLocale,
): Promise<{ heroId: string; name: string; emoji?: string }[]> {
  const rows = await db
    .select({ heroId: heroes.heroId, nameVi: heroes.nameVi, nameEn: heroes.nameEn, nameZh: heroes.nameZh })
    .from(heroes)
    .where(inArray(heroes.heroId, [...pool]));
  const byId = new Map(rows.map((r) => [r.heroId, r]));
  return pool
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({ heroId: r.heroId, name: pickName(r, locale), emoji: safeHeroEmoji(r.heroId) }));
}

/** Zone filter options (map_zones.sortOrder — D-15). */
async function fetchZones(locale: SupportedLocale): Promise<{ code: string; label: string }[]> {
  const zoneRows = await db.select().from(mapZones).orderBy(asc(mapZones.sortOrder));
  return zoneRows.map((z) => ({ code: z.code, label: pickZoneName(z, locale) }));
}

/**
 * /sanguo heroes execute — NO deferReply (the parent 'sanguo' command owns it,
 * map.ts execute). Empty collection → starter picker; non-empty → collection.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
  if (!char || !user) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }

  try {
    const owned = await queryOwnedHeroes(user.id);

    if (owned.length === 0) {
      // ── Starter picker (D-14) — the ONLY empty-collection state.
      const views = await incrementStarterViews(user.id);
      const pool = views >= 3 ? STARTER_SET_2 : STARTER_SET_1;
      const poolHeroes = await fetchStarterHeroes(pool, locale);
      await interaction.editReply({
        embeds: [buildSanguoHeroesEmbed({ count: 0, lines: [], shardId }, t)],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            ...buildStarterButtons(t, poolHeroes),
          ),
        ],
      });
      return;
    }

    // ── Collection (TQC-13): owned-only, stars + IV grade, one active badge.
    const [state] = await db
      .select()
      .from(userSanguoState)
      .where(eq(userSanguoState.userId, user.id))
      .limit(1);
    const activeHeroId = state?.activeHeroId ?? null;
    const zones = await fetchZones(locale);
    const lines = owned.map((h) => ({
      emoji: safeHeroEmoji(h.heroHeroId),
      name: pickName(h, locale),
      stars: '★'.repeat(h.tier),
      gradeKey: ivGradeKey(h.ivStr, h.ivAgi, h.ivInt, h.ivMov, h.ivLea, h.ivCha),
      active: h.id === activeHeroId,
    }));
    await interaction.editReply({
      embeds: [buildSanguoHeroesEmbed({ count: owned.length, lines, shardId }, t)],
      components: [
        // CR-09-01: the select menu lives in its OWN ActionRow.
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          buildZoneFilterMenu(t, zones),
        ),
      ],
    });
  } catch (err) {
    logger.error('HeroesExecute', 'Error in /sanguo heroes', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Starter pick press (D-14/D-19) — the FREE grant (the ONLY faucet). FOR
 * UPDATE tx: re-check the collection is still empty (T-10-07-01 — a second
 * pick serializes and finds a non-empty collection → heroes.error), roll 6×
 * crypto IVs, insert user_heroes (hp_current = base HP, captured_zone NULL —
 * A5), set activeHeroId + reset starterViews, reply the SUCCESS embed.
 */
export async function handleStarterPick(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const heroIdRaw = interaction.customId.slice(STARTER_PICK_PREFIX.length + 1);
  // T-10-07-03: starter heroIds validated against BOTH sets — a stale or
  // fabricated id outside the sets → heroes.error, no state change.
  if (!STARTER_SET_1.includes(heroIdRaw as (typeof STARTER_SET_1)[number]) &&
      !STARTER_SET_2.includes(heroIdRaw as (typeof STARTER_SET_2)[number])) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const granted = await db.transaction(async (tx) => {
      const [stateRow] = await tx
        .select()
        .from(userSanguoState)
        .where(eq(userSanguoState.userId, userId))
        .for('update');

      // T-10-07-01 double-grant guard: the collection must still be empty.
      const [owned] = await tx
        .select({ id: userHeroes.id })
        .from(userHeroes)
        .where(eq(userHeroes.userId, userId))
        .limit(1);
      if (owned) throw new Error('COLLECTION_NOT_EMPTY');

      const [hero] = await tx
        .select()
        .from(heroes)
        .where(eq(heroes.heroId, heroIdRaw))
        .limit(1);
      if (!hero) throw new Error('INVALID_STARTER');

      // D-19: 6× crypto.randomInt(0,32) — same distribution as capture (TQC-12).
      const iv = {
        str: crypto.randomInt(0, 32),
        agi: crypto.randomInt(0, 32),
        int: crypto.randomInt(0, 32),
        mov: crypto.randomInt(0, 32),
        lea: crypto.randomInt(0, 32),
        cha: crypto.randomInt(0, 32),
      };
      const [uh] = await tx
        .insert(userHeroes)
        .values({
          userId,
          heroId: hero.id,
          level: 1,
          ivStr: iv.str,
          ivAgi: iv.agi,
          ivInt: iv.int,
          ivMov: iv.mov,
          ivLea: iv.lea,
          ivCha: iv.cha,
          hpCurrent: hero.hp, // base HP — a fresh hero is never fainted
          capturedZone: null, // A5: starter grants are not zone-captured
        })
        .returning({ id: userHeroes.id });
      if (!uh) throw new Error('STARTER_INSERT_FAILED');

      if (stateRow) {
        await tx
          .update(userSanguoState)
          .set({ activeHeroId: uh.id, starterViews: 0, updatedAt: new Date() })
          .where(eq(userSanguoState.userId, userId));
      } else {
        await tx
          .insert(userSanguoState)
          .values({ userId, activeHeroId: uh.id, starterViews: 0 });
      }
      return { name: pickName(hero, locale) };
    });

    await interaction.editReply({
      embeds: [buildSanguoHeroesEmbed({ count: 0, lines: [], successName: granted.name, shardId }, t)],
      components: [], // CR-09-04: terminal state clears components
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'COLLECTION_NOT_EMPTY') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroesStarterPick', 'Error in starter pick', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Zone filter select (D-15) — re-renders the collection with only that zone's
 * heroes + the filtered count. T-10-07-05: the value is validated against
 * map_zones codes; an unknown/empty value falls back to the FULL collection —
 * never a crash (drizzle parameterization).
 */
export async function handleZoneFilterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  try {
    const zones = await fetchZones(locale);
    const zoneCode = interaction.values[0];
    const valid = zoneCode !== undefined && zones.some((z) => z.code === zoneCode);
    const effectiveZone = valid ? zoneCode : undefined;

    const owned = await queryOwnedHeroes(userId, effectiveZone);
    const [state] = await db
      .select()
      .from(userSanguoState)
      .where(eq(userSanguoState.userId, userId))
      .limit(1);
    const activeHeroId = state?.activeHeroId ?? null;

    const lines = owned.map((h) => ({
      emoji: safeHeroEmoji(h.heroHeroId),
      name: pickName(h, locale),
      stars: '★'.repeat(h.tier),
      gradeKey: ivGradeKey(h.ivStr, h.ivAgi, h.ivInt, h.ivMov, h.ivLea, h.ivCha),
      active: h.id === activeHeroId,
    }));
    const zoneLabel = effectiveZone
      ? zones.find((z) => z.code === effectiveZone)?.label
      : undefined;

    await interaction.editReply({
      embeds: [
        buildSanguoHeroesEmbed(
          {
            count: owned.length,
            lines,
            zoneLabel,
            // Filtered-empty: never the starter picker — the picker renders
            // only when the collection is entirely empty (flagged assumption).
            emptyHint: effectiveZone && owned.length === 0 ? t('sanguo:heroes.empty_filtered') : undefined,
            shardId,
          },
          t,
        ),
      ],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          buildZoneFilterMenu(t, zones),
        ),
      ],
    });
  } catch (err) {
    logger.error('HeroesZoneFilter', 'Error in zone filter select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}
