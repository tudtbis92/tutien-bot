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
import { heroes } from '../../db/schema/heroes.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { userSanguoItems } from '../../db/schema/userSanguoItems.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { sanguoSkills } from '../../db/schema/sanguoSkills.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoHeroEmbed } from '../../ui/embeds/buildSanguoHeroEmbed.js';
import { buildSanguoProgressionResultEmbed } from '../../ui/embeds/buildSanguoProgressionResultEmbed.js';
import { COMPANION_PREFIX, buildCompanionButton } from '../../ui/components/sanguoHeroCompanionButton.js';
import { buildSanguoHeroCopyMenu } from '../../ui/components/sanguoHeroCopyMenu.js';
import { COPY_PAGE_PREFIX, buildSanguoHeroPageButtons } from '../../ui/components/sanguoHeroPageButtons.js';
import { CONVERT_PREFIX, buildSanguoConvertButton } from '../../ui/components/sanguoConvertButton.js';
import { convertDuplicate, TIER_VALUE, BOOSTER_ITEM_CODE } from '../../services/sanguo/soulgemService.js';

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

/** D-04 copy-selector page size — Discord select-menu option limit. */
const COPY_PAGE_SIZE = 25;

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
  level: number;
  ivStr: number;
  ivAgi: number;
  ivInt: number;
  ivMov: number;
  ivLea: number;
  ivCha: number;
  hpCurrent: number;
  hp: number;
  mp: number;
  skillNormalId: number | null;
  skillSpecialId: number | null;
}

const OWNED_COLUMNS = {
  id: userHeroes.id,
  userId: userHeroes.userId,
  heroId: userHeroes.heroId,
  heroHeroId: heroes.heroId,
  nameVi: heroes.nameVi,
  nameEn: heroes.nameEn,
  nameZh: heroes.nameZh,
  tier: userHeroes.tier,
  level: userHeroes.level,
  ivStr: userHeroes.ivStr,
  ivAgi: userHeroes.ivAgi,
  ivInt: userHeroes.ivInt,
  ivMov: userHeroes.ivMov,
  ivLea: userHeroes.ivLea,
  ivCha: userHeroes.ivCha,
  hpCurrent: userHeroes.hpCurrent,
  hp: heroes.hp,
  mp: heroes.mp,
  skillNormalId: userHeroes.skillNormalId,
  skillSpecialId: userHeroes.skillSpecialId,
} as const;

/** D-04 copy-list row shape — per-copy identity for the selector + list. */
interface CopyRow {
  id: number;
  level: number;
  ivStr: number;
  ivAgi: number;
  ivInt: number;
  ivMov: number;
  ivLea: number;
  ivCha: number;
  hpCurrent: number;
  capturedAt: Date;
}

const COPY_COLUMNS = {
  id: userHeroes.id,
  level: userHeroes.level,
  ivStr: userHeroes.ivStr,
  ivAgi: userHeroes.ivAgi,
  ivInt: userHeroes.ivInt,
  ivMov: userHeroes.ivMov,
  ivLea: userHeroes.ivLea,
  ivCha: userHeroes.ivCha,
  hpCurrent: userHeroes.hpCurrent,
  capturedAt: userHeroes.capturedAt,
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

/** Resolve the skill-name i18n key for a sanguo_skills row (code = key suffix). */
function skillNameKey(code: string): string {
  return `sanguo:skills.${code}`;
}

/**
 * Render the copy-detail surface (D-04) for one owned copy (userHeroes.id).
 * Shared by execute + every copy-selector press handler. Ownership is
 * re-gated at render (the pressed id must belong to the user). Returns null
 * when the copy is not the user's.
 *
 * Surface (zero-one-many, CR-09-01):
 *  - Row 1 (only when the species has > 1 copies): the copy-select menu,
 *    paged at 25 with hero.copy_option labels + heroEmoji per option.
 *  - Row 2 (only when > 25 copies): the page buttons (⬅️/➡️).
 *  - Row 3: the action buttons for the TARGET copy (convert + companion in
 *    v1; level/evolve/reroll extend it in later waves).
 *
 * The embed gains the copy-list field (≤ 2 fields, ≤ 1,024 chars) + the
 * 🎯 Kỹ năng field (2 slots with MP costs) — visible fields only (D-12).
 */
async function renderCopyDetail(
  userId: number,
  uhId: number,
  pageOffset: number,
  t: TFunction,
  locale: SupportedLocale,
  shardId: number | undefined,
): Promise<{
  embed: ReturnType<typeof buildSanguoHeroEmbed>;
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} | null> {
  // 1. Target copy + catalog row — ownership re-gate at render.
  const [target] = await db
    .select(OWNED_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(eq(userHeroes.id, uhId))
    .limit(1);
  if (!target || target.userId !== userId) return null;

  // 2. ALL copies of the species (earliest-captured first, id tiebreak — the
  //    D-04 selector + companion-switch ordering).
  const copies = await db
    .select(COPY_COLUMNS)
    .from(userHeroes)
    .where(and(eq(userHeroes.userId, userId), eq(userHeroes.heroId, target.heroId)))
    .orderBy(asc(userHeroes.capturedAt), asc(userHeroes.id));

  // 3. Companion state (isActive badge).
  const [state] = await db
    .select({ activeHeroId: userSanguoState.activeHeroId })
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .limit(1);
  const isActive = state?.activeHeroId === target.id;

  // 4. Rolled skills (D-31 per-copy columns) — the 🎯 Kỹ năng field.
  const skillIds = [target.skillNormalId, target.skillSpecialId].filter(
    (v): v is number => v != null,
  );
  const skillRows =
    skillIds.length > 0
      ? await db.select().from(sanguoSkills).where(inArray(sanguoSkills.id, skillIds))
      : [];
  const skillById = new Map(skillRows.map((sk) => [sk.id, sk]));
  const skillLineFor = (sk: typeof sanguoSkills.$inferSelect | undefined): string | undefined =>
    sk
      ? t('sanguo:skills.line', {
          skill_emoji: sk.emoji ?? '',
          name: t(skillNameKey(sk.code)),
          mp_cost: sk.mpCost,
        })
      : undefined;

  // 5. Booster ownership — the convert-button yield label resolves from
  //    server state (never the payload): TIER_VALUE[tier] x booster.
  const [boosterItem] = await db
    .select({ id: sanguoItems.id })
    .from(sanguoItems)
    .where(eq(sanguoItems.code, BOOSTER_ITEM_CODE))
    .limit(1);
  let boosterOwned = false;
  if (boosterItem) {
    const [ownedBooster] = await db
      .select({ quantity: userSanguoItems.quantity })
      .from(userSanguoItems)
      .where(and(eq(userSanguoItems.userId, userId), eq(userSanguoItems.itemId, boosterItem.id)))
      .limit(1);
    boosterOwned = (ownedBooster?.quantity ?? 0) >= 1;
  }

  // 6. Embed — existing fields + copy list + skills (visible only, D-12).
  const gradeFor = (c: Pick<CopyRow, 'ivStr' | 'ivAgi' | 'ivInt' | 'ivMov' | 'ivLea' | 'ivCha'>): string =>
    t(ivGradeKey(c.ivStr, c.ivAgi, c.ivInt, c.ivMov, c.ivLea, c.ivCha));

  const pageCopies = copies.slice(pageOffset, pageOffset + COPY_PAGE_SIZE);
  const embed = buildSanguoHeroEmbed(
    {
      emoji: safeHeroEmoji(target.heroHeroId),
      name: pickName(target, locale),
      stars: '★'.repeat(target.tier),
      gradeKey: gradeFor(target),
      hpCurrent: target.hpCurrent,
      hpMax: target.hp,
      mp: target.mp,
      isActive,
      fainted: target.hpCurrent === 0,
      copyList:
        copies.length > 1
          ? {
              lines: pageCopies.map((c, idx) =>
                t('sanguo:hero.copy_line', {
                  i: pageOffset + idx + 1,
                  level: c.level,
                  grade: gradeFor(c),
                  hp: c.hpCurrent,
                }),
              ),
              page: t('sanguo:hero.copy_page', {
                page: Math.floor(pageOffset / COPY_PAGE_SIZE) + 1,
                total: Math.max(1, Math.ceil(copies.length / COPY_PAGE_SIZE)),
              }),
            }
          : undefined,
      skills:
        target.skillNormalId != null || target.skillSpecialId != null
          ? {
              normal: skillLineFor(target.skillNormalId != null ? skillById.get(target.skillNormalId) : undefined),
              special: skillLineFor(target.skillSpecialId != null ? skillById.get(target.skillSpecialId) : undefined),
            }
          : undefined,
      shardId,
    },
    t,
  );

  // 7. Component rows — select + page buttons + action buttons (3 rows max,
  //    selects never share a row with buttons, CR-09-01).
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (copies.length > 1) {
    const selectRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildSanguoHeroCopyMenu(
        t,
        pageCopies.map((c, idx) => ({
          userHeroId: c.id,
          label: t('sanguo:hero.copy_option', {
            i: pageOffset + idx + 1,
            level: c.level,
            grade: gradeFor(c),
          }),
          emoji: safeHeroEmoji(target.heroHeroId),
        })),
      ),
    );
    rows.push(selectRow);
    if (copies.length > COPY_PAGE_SIZE) {
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          ...buildSanguoHeroPageButtons(pageOffset, target.id),
        ),
      );
    }
  }

  const convertAmount = TIER_VALUE[target.tier] * (boosterOwned ? 2 : 1);
  const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildSanguoConvertButton(t, { userHeroId: target.id, amount: convertAmount }),
    buildCompanionButton(t, target.id, isActive),
  );
  rows.push(actionRow);

  return { embed, rows };
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
    const detail = await renderCopyDetail(user.id, target.id, 0, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
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

    const detail = await renderCopyDetail(userId, heroId, 0, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
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

/**
 * D-04 copy-select press — re-render the copy detail with the action buttons
 * targeting the CHOSEN copy. The chosen userHeroId rides interaction.values[0]
 * (parseInt + isNaN guard); ownership is re-gated inside renderCopyDetail.
 */
export async function handleCopyPress(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.values[0] ?? '';
  const uhId = parseInt(rawId, 10);
  if (isNaN(uhId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const detail = await renderCopyDetail(userId, uhId, 0, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
  } catch (err) {
    logger.error('HeroCopyPress', 'Error in copy select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-04 copy-list page press — re-render the copy selector for the next/prev
 * page. CustomId 'sanguo:hero:page:{dir}:{offset}:{targetUhId}': dir =
 * prev|next, offset = the CURRENT page start, targetUhId keeps the action
 * buttons pinned to the same copy across page flips.
 */
export async function handleCopyPage(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const raw = interaction.customId.slice(COPY_PAGE_PREFIX.length + 1);
  const [dirRaw, offsetRaw, uhIdRaw] = raw.split(':');
  const dir = dirRaw === 'next' || dirRaw === 'prev' ? dirRaw : null;
  const offset = parseInt(offsetRaw ?? '', 10);
  const uhId = parseInt(uhIdRaw ?? '', 10);
  if (!dir || isNaN(offset) || isNaN(uhId) || offset < 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const nextOffset =
      dir === 'next' ? offset + COPY_PAGE_SIZE : Math.max(0, offset - COPY_PAGE_SIZE);
    const detail = await renderCopyDetail(userId, uhId, nextOffset, t, locale, shardId);
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
  } catch (err) {
    logger.error('HeroCopyPage', 'Error in copy page button', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-03 convert press — consumes the selected duplicate copy for per-hero hồn
 * ngọc (flat-by-tier x booster, atomic in ONE tx) and renders the
 * progression-result embed (SUCCESS — convert.done with the yield + booster
 * hint). The display data (name, copy index) is read BEFORE the destructive
 * tx — the consumed copy is deleted inside it.
 */
export async function handleConvertPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(CONVERT_PREFIX.length + 1);
  const uhId = parseInt(rawId, 10);
  if (isNaN(uhId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    // Display data (pre-read — the copy is consumed inside the tx).
    const [copy] = await db
      .select(OWNED_COLUMNS)
      .from(userHeroes)
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userHeroes.id, uhId))
      .limit(1);
    if (!copy || copy.userId !== userId) throw new Error('NOT_OWNED');
    const copies = await db
      .select({ id: userHeroes.id, capturedAt: userHeroes.capturedAt })
      .from(userHeroes)
      .where(and(eq(userHeroes.userId, userId), eq(userHeroes.heroId, copy.heroId)))
      .orderBy(asc(userHeroes.capturedAt), asc(userHeroes.id));
    const copyIndex = copies.findIndex((c) => c.id === uhId) + 1;

    const result = await convertDuplicate(userId, uhId);

    const lines = [
      t('sanguo:convert.done', {
        i: copyIndex,
        amount: result.yield,
        name: pickName(copy, locale),
      }),
    ];
    if (result.boosterUsed) lines.push(t('sanguo:convert.booster_hint'));
    await interaction.editReply({
      embeds: [
        buildSanguoProgressionResultEmbed({
          state: 'success',
          title: t('sanguo:convert.title', {
            hero_emoji: safeHeroEmoji(copy.heroHeroId) ?? '',
            name: pickName(copy, locale),
          }),
          lines,
          shardId,
        }),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_ENOUGH_COPIES') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:convert.insufficient'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroConvertPress', 'Error converting duplicate', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:convert.error'), shardId)],
      components: [],
    });
  }
}
