import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { eq, asc } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { heroes } from '../../db/schema/heroes.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoHeroEmbed } from '../../ui/embeds/buildSanguoHeroEmbed.js';
import { COMPANION_PREFIX, buildCompanionButton } from '../../ui/components/sanguoHeroCompanionButton.js';

/**
 * /sanguo hero command (Phase 10 — TQC-13, D-16/D-04).
 *
 * Renders the detail of ONE owned hero: emoji, per-locale name, ★ stars
 * (public heroes.tier), IV grade key, HP/MP (base-only, D-05), companion
 * status label when active, and the 'Chọn làm hero đồng hành' button
 * (DISABLED when already active — D-16). A hero the user does NOT own renders
 * hero.error (DANGER) — no stat leak beyond the name lookup (D-16 ownership
 * gate).
 *
 * The companion switch (sanguo:hero:companion:{heroId}) updates
 * user_sanguo_state.activeHeroId in a FOR UPDATE transaction (single-writer;
 * T-10-07-06 serialized, last-writer-wins) — the D-04 recovery path when the
 * active hero is fainted. Duplicate ownership (P10-review F9): user_heroes
 * allows multiple copies per (userId, heroId) — the resolution prefers the
 * ACTIVE companion if it matches, else the earliest captured copy (lowest
 * userHeroes.id).
 *
 * Identity rule: every service call keys on users.id — NEVER char.id
 * (grep-gated).
 */

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const heroSubcommand = new SlashCommandSubcommandBuilder()
  .setName('hero')
  .setDescription('Xem chi tiết một hero')
  .setDescriptionLocalizations({
    'en-US': "View a hero's details",
    'zh-CN': '查看英雄详情',
  })
  .addStringOption((option) =>
    option
      .setName('hero')
      .setDescription('Tên hoặc ID của hero bạn sở hữu')
      .setDescriptionLocalizations({
        'en-US': 'Name or ID of a hero you own',
        'zh-CN': '你所拥有的英雄名称或ID',
      })
      .setRequired(true),
  );
/* eslint-enable i18next/no-literal-string */

/** IV grade bands (STATE.md D-12): sum/186 → key. */
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

function safeHeroEmoji(heroId: string): string | undefined {
  try {
    return heroEmoji(heroId);
  } catch {
    // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 pattern)
    return undefined;
  }
}

/** Owned-hero row shape — user_heroes joined heroes (the detail source). */
interface OwnedHeroRow extends PerLocaleName {
  id: number;
  userId: number;
  heroId: number;
  heroHeroId: string;
  tier: number;
  ivStr: number;
  ivAgi: number;
  ivInt: number;
  ivMov: number;
  ivLea: number;
  ivCha: number;
  hpCurrent: number;
  hp: number;
  mp: number;
}

const OWNED_COLUMNS = {
  id: userHeroes.id,
  userId: userHeroes.userId,
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
  hpCurrent: userHeroes.hpCurrent,
  hp: heroes.hp,
  mp: heroes.mp,
} as const;

/**
 * Resolve the owned hero row for option input against the user's OWNED copies
 * (join heroes) — match by heroes.id (numeric) OR per-locale name
 * (case-insensitive). F9 duplicate disambiguation: prefer the ACTIVE companion
 * copy, else the earliest captured (lowest userHeroes.id). Returns null when
 * not owned.
 */
async function resolveOwnedHero(
  userId: number,
  raw: string,
  locale: SupportedLocale,
): Promise<OwnedHeroRow | null> {
  const owned = await db
    .select(OWNED_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(eq(userHeroes.userId, userId))
    .orderBy(asc(userHeroes.id));
  if (owned.length === 0) return null;

  const trimmed = raw.trim();
  const idNum = parseInt(trimmed, 10);
  const matches = owned.filter((row) => {
    if (!isNaN(idNum) && row.heroId === idNum) return true;
    return pickName(row, locale).toLowerCase() === trimmed.toLowerCase();
  });
  if (matches.length === 0) return null;

  const [state] = await db
    .select({ activeHeroId: userSanguoState.activeHeroId })
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .limit(1);
  const activeMatch = matches.find((m) => m.id === state?.activeHeroId);
  return activeMatch ?? matches[0]!;
}

/**
 * Render the hero detail for one owned copy (userHeroes.id). Shared by
 * execute + handleCompanionPress (the post-switch re-render). Ownership is
 * re-gated at render (the pressed id must belong to the user). Returns null
 * when the copy is not the user's.
 */
async function renderHeroDetail(
  userId: number,
  uhId: number,
  t: TFunction,
  locale: SupportedLocale,
  shardId: number | undefined,
): Promise<{ embed: ReturnType<typeof buildSanguoHeroEmbed>; row: ActionRowBuilder<MessageActionRowComponentBuilder> } | null> {
  const [row] = await db
    .select(OWNED_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(eq(userHeroes.id, uhId))
    .limit(1);
  if (!row || row.userId !== userId) return null;

  const [state] = await db
    .select({ activeHeroId: userSanguoState.activeHeroId })
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .limit(1);
  const isActive = state?.activeHeroId === row.id;

  const embed = buildSanguoHeroEmbed(
    {
      emoji: safeHeroEmoji(row.heroHeroId),
      name: pickName(row, locale),
      stars: '★'.repeat(row.tier),
      gradeKey: ivGradeKey(row.ivStr, row.ivAgi, row.ivInt, row.ivMov, row.ivLea, row.ivCha),
      hpCurrent: row.hpCurrent,
      hpMax: row.hp,
      mp: row.mp,
      isActive,
      fainted: row.hpCurrent === 0,
      shardId,
    },
    t,
  );
  const rowB = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildCompanionButton(t, row.id, isActive),
  );
  return { embed, row: rowB };
}

/**
 * /sanguo hero execute — NO deferReply (the parent 'sanguo' command owns it,
 * map.ts execute). Ownership-gated detail render; not-owned → hero.error.
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
    const raw = interaction.options.getString('hero', true);
    const target = await resolveOwnedHero(user.id, raw, locale);
    if (!target) {
      // D-16 ownership gate: hero.error DANGER — no stat leak.
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    const detail = await renderHeroDetail(user.id, target.id, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: [detail.row] });
  } catch (err) {
    logger.error('HeroExecute', 'Error in /sanguo hero', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Companion switch (D-16/D-04). FOR UPDATE tx: ownership gate (T-10-07-03) →
 * locked state read → activeHeroId switch (no-op when already active —
 * defense in depth, the button is disabled anyway) → re-render the detail
 * with the button now disabled.
 */
export async function handleCompanionPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(COMPANION_PREFIX.length + 1);
  const heroId = parseInt(rawId, 10);
  if (isNaN(heroId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // Ownership gate inside the tx — a forged id → NOT_OWNED → hero.error.
      const [owned] = await tx
        .select()
        .from(userHeroes)
        .where(eq(userHeroes.id, heroId))
        .limit(1);
      if (!owned || owned.userId !== userId) throw new Error('NOT_OWNED');

      // T-10-07-06: FOR UPDATE on the one-row state — serialized switches.
      // IN-06: when NO state row exists the FOR UPDATE locks nothing, so two
      // concurrent first-time presses could both INSERT and hit the unique
      // violation on user_id — the create path uses an upsert
      // (onConflictDoUpdate) so the loser updates-instead-of-inserts.
      const [state] = await tx
        .select()
        .from(userSanguoState)
        .where(eq(userSanguoState.userId, userId))
        .for('update');

      // D-16 defense in depth: pressing the already-active hero is a no-op.
      if (state && state.activeHeroId === heroId) return;

      if (state) {
        await tx
          .update(userSanguoState)
          .set({ activeHeroId: heroId, updatedAt: new Date() })
          .where(eq(userSanguoState.userId, userId));
      } else {
        await tx
          .insert(userSanguoState)
          .values({ userId, activeHeroId: heroId, starterViews: 0 })
          .onConflictDoUpdate({
            target: userSanguoState.userId,
            set: { activeHeroId: heroId, updatedAt: new Date() },
          });
      }
    });

    const detail = await renderHeroDetail(userId, heroId, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: [detail.row] });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroCompanionPress', 'Error switching companion', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
  }
}
