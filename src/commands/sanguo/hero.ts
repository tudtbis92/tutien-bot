import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { userHeroSoulgems } from '../../db/schema/userHeroSoulgems.js';
import { heroEmoji, type SanguoTier } from '../../assets/sanguoEmojis.js';
import { LEVEL_COST, MAX_LEVEL, EVOLUTION_COSTS, REROLL_COST } from '../../constants/sanguoProgression.js';
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
import { LEVEL_PREFIX, buildSanguoLevelButton } from '../../ui/components/sanguoLevelButton.js';
import { EVOLVE_PREFIX, buildSanguoEvolveButton } from '../../ui/components/sanguoEvolveButton.js';
import { REROLL_OPEN_PREFIX, REROLL_SLOT_PREFIX, buildSanguoRerollSlotMenu } from '../../ui/components/sanguoRerollSlotMenu.js';
import { REROLL_GO_PREFIX, buildSanguoRerollButton } from '../../ui/components/sanguoRerollButton.js';
import {
  convertDuplicate,
  levelUp,
  evolveHero,
  rerollSkill,
  TIER_VALUE,
  BOOSTER_ITEM_CODE,
} from '../../services/sanguo/soulgemService.js';

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

function safeHeroEmoji(heroId: string, tier: number = 0): string | undefined {
  try {
    return heroEmoji(heroId, tier as SanguoTier);
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
  opts: { rerollOpen?: boolean; rerollSlot?: 'normal' | 'special' } = {},
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

  // 5b. Per-hero hồn ngọc pool — the level/evolve disabled-state arbiter
  //     (spendable resource, VISIBLE per D-12). Missing row = 0 hồn ngọc.
  const [poolRow] = await db
    .select({ amount: userHeroSoulgems.amount })
    .from(userHeroSoulgems)
    .where(and(eq(userHeroSoulgems.userId, userId), eq(userHeroSoulgems.heroId, target.heroId)))
    .limit(1);
  const poolAmount = poolRow?.amount ?? 0;

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

  // Level-button state (D-01/D-05): disabled at the hard cap or when the pool
  // cannot cover the next cost — label shows the block reason, never a
  // guaranteed-error press.
  const levelCost = LEVEL_COST(target.level);
  const levelAtMax = target.level >= MAX_LEVEL;
  const levelDisabled = levelAtMax || poolAmount < levelCost;
  const levelLabel = levelAtMax
    ? t('sanguo:level.max', { name: pickName(target, locale) })
    : poolAmount < levelCost
      ? t('sanguo:level.insufficient', { cost: levelCost })
      : undefined;

  // Evolve-button state (D-06/D-07/D-09, UI-SPEC): disabled until the level
  // gate + sufficient hồn ngọc; t2+ copies are gated forever in v3.
  const evolveTargetTier = target.tier + 1;
  const evolveCost = EVOLUTION_COSTS[evolveTargetTier] ?? 0;
  let evolveDisabled = false;
  let evolveLabel: string | undefined;
  if (target.tier >= 2) {
    evolveDisabled = true;
    evolveLabel = t('sanguo:evolve.t3_gated');
  } else {
    const evolveReq = evolveTargetTier === 1 ? 20 : 50;
    if (target.level < evolveReq) {
      evolveDisabled = true;
      evolveLabel = t('sanguo:evolve.requirement', { req: evolveReq });
    } else if (poolAmount < evolveCost) {
      evolveDisabled = true;
      evolveLabel = t('sanguo:evolve.insufficient', { cost: evolveCost });
    }
  }

  const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    // User amendment: the ACTIVE companion is never convertible — disabled
    // at render (the service enforces ACTIVE_COMPANION server-side too).
    buildSanguoConvertButton(t, { userHeroId: target.id, amount: convertAmount, disabled: isActive }),
    buildSanguoLevelButton(t, { userHeroId: target.id, cost: levelCost, disabled: levelDisabled, label: levelLabel }),
    buildSanguoEvolveButton(t, { userHeroId: target.id, cost: evolveCost, disabled: evolveDisabled, label: evolveLabel }),
    // D-32 reroll ENTRY (hero.reroll_button) — opens the slot-pick flow.
    new ButtonBuilder()
      .setCustomId(`${REROLL_OPEN_PREFIX}:${target.id}`)
      .setLabel(t('sanguo:hero.reroll_button'))
      .setStyle(ButtonStyle.Primary),
    buildCompanionButton(t, target.id, isActive),
  );
  rows.push(actionRow);

  // Reroll-flow states replace the action row (the surface stays at its 3-row
  // budget): rerollOpen → the SLOT select; rerollSlot → the CONFIRM button.
  if (opts.rerollOpen) {
    rows.pop();
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildSanguoRerollSlotMenu(t, { userHeroId: target.id }),
      ),
    );
  } else if (opts.rerollSlot) {
    rows.pop();
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buildSanguoRerollButton(t, {
          userHeroId: target.id,
          slot: opts.rerollSlot,
          cost: REROLL_COST,
        }),
      ),
    );
  }

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
    // User amendment error codes — each maps to its own friendly embed.
    if (err instanceof Error && err.message === 'COLLECTION_EMPTY') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:convert.collection_empty'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'ACTIVE_COMPANION') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:convert.active_companion'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'IN_FORMATION') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:convert.in_formation'), shardId)],
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

/**
 * D-05 level press — charges LEVEL_COST from the per-hero pool (ONE tx,
 * WHERE-guard) and renders the progression-result embed (SUCCESS —
 * level.title + level.up with the NEW level only; NEVER stat deltas, D-12).
 * The display data (name/emoji) is read BEFORE the tx — the level write is
 * inside it.
 */
export async function handleLevelPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(LEVEL_PREFIX.length + 1);
  const uhId = parseInt(rawId, 10);
  if (isNaN(uhId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  let copy: OwnedHeroRow | null = null;
  try {
    // Display data (pre-read — the level write is inside the tx).
    [copy] = await db
      .select(OWNED_COLUMNS)
      .from(userHeroes)
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userHeroes.id, uhId))
      .limit(1);
    if (!copy || copy.userId !== userId) throw new Error('NOT_OWNED');

    const result = await levelUp(userId, uhId);

    await interaction.editReply({
      embeds: [
        buildSanguoProgressionResultEmbed({
          state: 'success',
          title: t('sanguo:level.title', {
            hero_emoji: safeHeroEmoji(copy.heroHeroId) ?? '',
            name: pickName(copy, locale),
          }),
          // D-12: level ONLY — never stat deltas / base stats / multipliers.
          lines: [t('sanguo:level.up', { name: pickName(copy, locale), level: result.newLevel })],
          shardId,
        }),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'LEVEL_MAX') {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            t('sanguo:level.max', { name: copy ? pickName(copy, locale) : '' }),
            shardId,
          ),
        ],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_HON_NGOC') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:level.insufficient', { cost: 0 }), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroLevelPress', 'Error leveling up', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:level.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-06/D-07 evolve press — charges EVOLUTION_COSTS from the per-hero pool and
 * renders the progression-result embed (SUCCESS — evolve.done with the NEW
 * t1/t2 spritesheet emoji via heroEmoji(heroId, newTier), D-07). The display
 * data (name/emoji/tier) is read BEFORE the tx — the tier write is inside it.
 */
export async function handleEvolvePress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(EVOLVE_PREFIX.length + 1);
  const uhId = parseInt(rawId, 10);
  if (isNaN(uhId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  let copy: OwnedHeroRow | null = null;
  try {
    // Display data (pre-read — the tier write is inside the tx).
    [copy] = await db
      .select(OWNED_COLUMNS)
      .from(userHeroes)
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userHeroes.id, uhId))
      .limit(1);
    if (!copy || copy.userId !== userId) throw new Error('NOT_OWNED');

    const result = await evolveHero(userId, uhId);
    const name = pickName(copy, locale);

    await interaction.editReply({
      embeds: [
        buildSanguoProgressionResultEmbed({
          state: 'success',
          title: t('sanguo:evolve.title', {
            hero_emoji: safeHeroEmoji(copy.heroHeroId) ?? '',
            name,
          }),
          // D-07: the NEW emoji is the t1/t2 spritesheet variant; the tier
          // renders as the public ★ badge — NEVER stat deltas (D-12).
          lines: [
            t('sanguo:evolve.done', {
              hero_emoji: safeHeroEmoji(copy.heroHeroId) ?? '',
              name,
              new_emoji: safeHeroEmoji(copy.heroHeroId, result.newTier) ?? '',
              new_tier: '★'.repeat(result.newTier),
            }),
          ],
          shardId,
        }),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'LEVEL_REQUIRED') {
      // The gate error only surfaces AFTER the pre-read succeeded — copy is
      // non-null here; t0→t1 needs L20, t1→t2 needs L50.
      const req = copy ? (copy.tier === 1 ? 50 : 20) : 20;
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            t('sanguo:evolve.level_required', { name: copy ? pickName(copy, locale) : '', req }),
            shardId,
          ),
        ],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'T3_GATED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:evolve.t3_gated'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_HON_NGOC') {
      const cost = copy ? (EVOLUTION_COSTS[copy.tier + 1] ?? 0) : 0;
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:evolve.insufficient', { cost }), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroEvolvePress', 'Error evolving hero', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:evolve.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-32 reroll flow step 1 — the action-row reroll button (hero.reroll_button,
 * customId sanguo:reroll:open:{userHeroId}): re-renders the copy detail with
 * the action row REPLACED by the slot-pick select (normal / special).
 */
export async function handleRerollPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(REROLL_OPEN_PREFIX.length + 1);
  const uhId = parseInt(rawId, 10);
  if (isNaN(uhId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const detail = await renderCopyDetail(userId, uhId, 0, t, locale, shardId, { rerollOpen: true });
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
  } catch (err) {
    logger.error('HeroRerollPress', 'Error opening reroll slot pick', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:reroll.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-32 reroll flow step 2 — the slot select (customId
 * sanguo:reroll:slot:{userHeroId}; the slot rides values[0]): re-renders the
 * copy detail with the action row REPLACED by the confirm button
 * (sanguo:reroll:go:{userHeroId}:{slot}).
 */
export async function handleRerollSlot(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.customId.slice(REROLL_SLOT_PREFIX.length + 1);
  const uhId = parseInt(rawId, 10);
  const slot = interaction.values[0] as 'normal' | 'special' | undefined;
  if (isNaN(uhId) || (slot !== 'normal' && slot !== 'special')) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const detail = await renderCopyDetail(userId, uhId, 0, t, locale, shardId, { rerollSlot: slot });
    if (!detail) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    await interaction.editReply({ embeds: [detail.embed], components: detail.rows });
  } catch (err) {
    logger.error('HeroRerollSlot', 'Error in reroll slot select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:reroll.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-32 reroll flow step 3 — the confirm button (customId
 * sanguo:reroll:go:{userHeroId}:{slot}): calls rerollSkill (ONE tx — charge +
 * weighted class-pool pick + slot write) and renders the progression-result
 * embed (SUCCESS — reroll.title + reroll.done stating the REPLACEMENT skill,
 * Secondary-destructive consequence copy). The display data is read BEFORE
 * the tx; the new skill row is fetched for its name + content emoji.
 */
export async function handleRerollGo(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const raw = interaction.customId.slice(REROLL_GO_PREFIX.length + 1);
  const [uhIdRaw, slotRaw] = raw.split(':');
  const uhId = parseInt(uhIdRaw ?? '', 10);
  const slot = slotRaw === 'normal' || slotRaw === 'special' ? slotRaw : null;
  if (isNaN(uhId) || !slot) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
      components: [],
    });
    return;
  }

  let copy: OwnedHeroRow | null = null;
  try {
    // Display data (pre-read — the slot write is inside the tx).
    [copy] = await db
      .select(OWNED_COLUMNS)
      .from(userHeroes)
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userHeroes.id, uhId))
      .limit(1);
    if (!copy || copy.userId !== userId) throw new Error('NOT_OWNED');

    const result = await rerollSkill(userId, uhId, slot);
    const name = pickName(copy, locale);

    // The replacement skill row — name (i18n key) + content emoji.
    const [skill] = await db
      .select()
      .from(sanguoSkills)
      .where(eq(sanguoSkills.code, result.newSkillCode))
      .limit(1);
    const skillDisplay = skill
      ? `${skill.emoji ?? ''} ${t(skillNameKey(skill.code))}`.trim()
      : result.newSkillCode;

    await interaction.editReply({
      embeds: [
        buildSanguoProgressionResultEmbed({
          state: 'success',
          title: t('sanguo:reroll.title', {
            hero_emoji: safeHeroEmoji(copy.heroHeroId) ?? '',
            name,
          }),
          // The consequence copy states the replacement (old roll lost).
          lines: [
            t('sanguo:reroll.done', {
              slot: t(slot === 'normal' ? 'sanguo:skills.normal_label' : 'sanguo:skills.special_label'),
              name,
              skill: skillDisplay,
            }),
          ],
          shardId,
        }),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:hero.error'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_HON_NGOC') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:reroll.insufficient', { cost: REROLL_COST }), shardId)],
        components: [],
      });
      return;
    }
    logger.error('HeroRerollGo', 'Error re-rolling skill', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:reroll.error'), shardId)],
      components: [],
    });
  }
}
