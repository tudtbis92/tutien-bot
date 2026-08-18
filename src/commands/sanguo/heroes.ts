import crypto from 'node:crypto';
import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { heroes } from '../../db/schema/heroes.js';
import { heroFactions } from '../../db/schema/heroFactions.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { mapZones } from '../../db/schema/mapZones.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import type { TFunction } from 'i18next';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
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
import {
  buildSanguoHeroesFactionMenu,
  FILTER_ALL_VALUE,
} from '../../ui/components/sanguoHeroesFactionMenu.js';
import { buildSanguoHeroesIvMenu, IV_GRADE_KEYS } from '../../ui/components/sanguoHeroesIvMenu.js';

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

/** SC5 filter state — zone + faction (stable code) + IV grade (grade key). */
export interface OwnedHeroFilters {
  /** map_zones.code — the captured zone. */
  zone?: string;
  /** hero_factions.code — the stable faction code. */
  factionCode?: string;
  /** An iv_grade.* KEY — grade, never raw IV (D-12). */
  ivGrade?: string;
}

/** Owned-hero query — zone + faction (via heroFactions) + IV-grade (via the
 *  SAME ivGradeKey() the render uses) filters AND-combined (SC5).
 *  T-11-07-05: an invalid faction code resolves to no faction → EMPTY result
 *  (never a crash); an unknown IV grade key simply matches zero rows via the
 *  JS grade filter. Zone filter is the existing D-15 filter (unchanged). */
export async function queryOwnedHeroes(
  userId: number,
  filters: OwnedHeroFilters = {},
): Promise<OwnedHeroRow[]> {
  // Resolve the faction code → faction id (reference set, T-11-07-05).
  let factionId: number | undefined;
  if (filters.factionCode) {
    const [faction] = await db
      .select({ id: heroFactions.id })
      .from(heroFactions)
      .where(eq(heroFactions.code, filters.factionCode))
      .limit(1);
    factionId = faction?.id;
    if (factionId == null) return [];
  }

  let rows = await db
    .select(OWNED_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(
      and(
        eq(userHeroes.userId, userId),
        filters.zone ? eq(userHeroes.capturedZone, filters.zone) : undefined,
        factionId !== undefined ? eq(heroes.factionId, factionId) : undefined,
      ),
    )
    .orderBy(asc(heroes.id));

  // IV-grade filter — the SAME grade function the collection render uses
  // (D-12: grade keys, never raw IV values on the filter surface).
  if (filters.ivGrade) {
    rows = rows.filter(
      (r) => ivGradeKey(r.ivStr, r.ivAgi, r.ivInt, r.ivMov, r.ivLea, r.ivCha) === filters.ivGrade,
    );
  }
  return rows;
}

/** Per-locale faction name column (D-07 content-in-DB — never i18n keys). */
function pickFactionName(row: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return row.nameEn;
  if (locale === 'zh-cn') return row.nameZh ?? row.nameVi;
  return row.nameVi;
}

/** Faction filter options (hero_factions.sortOrder — SC5). */
async function fetchFactions(locale: SupportedLocale): Promise<{ code: string; label: string }[]> {
  const rows = await db.select().from(heroFactions).orderBy(asc(heroFactions.sortOrder));
  return rows.map((f) => ({ code: f.code, label: pickFactionName(f, locale) }));
}

/** Resolve the users.id row for a component press — shared util (IN-05). */


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
      // IN-06: first-time INSERT uses an upsert — FOR UPDATE locks nothing when
      // no row exists, so a concurrent press could otherwise hit the unique
      // violation on user_id; onConflictDoUpdate makes the loser increment.
      await tx
        .insert(userSanguoState)
        .values({ userId, starterViews: 1 })
        .onConflictDoUpdate({
          target: userSanguoState.userId,
          set: { starterViews: sql`${userSanguoState.starterViews} + 1`, updatedAt: new Date() },
        });
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
 * Shared collection renderer (SC5): applies the current zone + faction + IV
 * filter state and renders the collection embed + the 3 filter rows (one per
 * ActionRow, CR-09-01). The UNFILTERED empty-collection state (no filters, 0
 * rows) still renders the starter picker (the ONLY empty state, D-14).
 */
async function renderCollection(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  userId: number,
  locale: SupportedLocale,
  t: TFunction,
  shardId: number | undefined,
  filters: OwnedHeroFilters,
): Promise<void> {
  // Reference sets first — used to validate the pressed filter values
  // (T-11-07-05: invalid / filter_all → cleared, never a crash).
  const zones = await fetchZones(locale);
  const factions = await fetchFactions(locale);
  const effZone =
    filters.zone && filters.zone !== FILTER_ALL_VALUE && zones.some((z) => z.code === filters.zone)
      ? filters.zone
      : undefined;
  const effFaction =
    filters.factionCode && filters.factionCode !== FILTER_ALL_VALUE && factions.some((f) => f.code === filters.factionCode)
      ? filters.factionCode
      : undefined;
  const effIv =
    filters.ivGrade && filters.ivGrade !== FILTER_ALL_VALUE && (IV_GRADE_KEYS as readonly string[]).includes(filters.ivGrade)
      ? filters.ivGrade
      : undefined;

  const owned = await queryOwnedHeroes(userId, {
    zone: effZone,
    factionCode: effFaction,
    ivGrade: effIv,
  });
  const noFilter = !effZone && !effFaction && !effIv;

  if (noFilter && owned.length === 0) {
    // ── Starter picker (D-14) — the ONLY empty-collection state.
    const views = await incrementStarterViews(userId);
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

  // ── Collection (TQC-13/SC5): owned-only, star + grade, one active badge.
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
  const zoneLabel = effZone ? zones.find((z) => z.code === effZone)?.label : undefined;
  const factionLabel = effFaction
    ? factions.find((f) => f.code === effFaction)?.label
    : undefined;
  const ivLabel = effIv ? t(effIv) : undefined;

  await interaction.editReply({
    embeds: [
      buildSanguoHeroesEmbed(
        {
          count: owned.length,
          lines,
          zoneLabel,
          factionLabel,
          ivLabel,
          emptyHint:
            !noFilter && owned.length === 0 ? t('sanguo:heroes.empty_filtered') : undefined,
          shardId,
        },
        t,
      ),
    ],
    components: [
      // CR-09-01: each select menu lives in its OWN ActionRow (3 filter rows).
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildZoneFilterMenu(t, zones),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildSanguoHeroesFactionMenu(t, factions),
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildSanguoHeroesIvMenu(t),
      ),
    ],
  });
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
    await renderCollection(interaction, user.id, locale, t, shardId, {});
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
    // renderCollection validates the pressed value against map_zones codes
    // (T-10-07-05 / T-11-07-05 — invalid + 'Tất cả' → clear, never a crash).
    await renderCollection(interaction, userId, locale, t, shardId, {
      zone: interaction.values[0],
    });
  } catch (err) {
    logger.error('HeroesZoneFilter', 'Error in zone filter select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Faction filter select (SC5) — re-renders the collection with only that
 * faction's heroes. renderCollection validates the value against heroFactions
 * codes + the 'Tất cả' (filter_all) reset (T-11-07-05).
 */
export async function handleFactionFilterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  try {
    await renderCollection(interaction, userId, locale, t, shardId, {
      factionCode: interaction.values[0],
    });
  } catch (err) {
    logger.error('HeroesFactionFilter', 'Error in faction filter select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}

/**
 * IV-grade filter select (SC5) — re-renders with only that grade's copies.
 * The value is an iv_grade.* KEY (grade — NEVER raw IV, D-12); 'Tất cả'
 * (filter_all) resets; unknown → full collection (T-11-07-05).
 */
export async function handleIvFilterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  try {
    // renderCollection validates the value against the iv_grade KEYS (D-12 —
    // grade, never raw IV; 'Tất cả' clears).
    await renderCollection(interaction, userId, locale, t, shardId, {
      ivGrade: interaction.values[0],
    });
  } catch (err) {
    logger.error('HeroesIvFilter', 'Error in IV-grade filter select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:heroes.error'), shardId)],
      components: [],
    });
  }
}
