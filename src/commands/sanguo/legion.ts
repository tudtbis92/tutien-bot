import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { heroes, heroClassEnum } from '../../db/schema/heroes.js';
import { heroRelations } from '../../db/schema/heroRelations.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { formationSlots } from '../../db/schema/formations.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoLegionEmbed, type SanguoLegionEmbedData } from '../../ui/embeds/buildSanguoLegionEmbed.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import { mainChemistryPoints, chemistryTier } from '../../services/sanguo/chemistryService.js';
import {
  listOwnedFormations,
  getActiveLegion,
  assignHero,
  saveLegion,
  type OwnedFormationRow,
} from '../../services/sanguo/legionService.js';
import {
  buildSanguoLegionFormationMenu,
} from '../../ui/components/sanguoLegionFormationMenu.js';
import {
  buildSanguoLegionSlotMenu,
} from '../../ui/components/sanguoLegionSlotMenu.js';
import {
  LEGION_HERO_PREFIX,
  buildSanguoLegionHeroMenu,
} from '../../ui/components/sanguoLegionHeroMenu.js';
import { buildSanguoLegionSaveButton } from '../../ui/components/sanguoLegionSaveButton.js';
import { logger } from '../../utils/logger.js';

/**
 * /sanguo legion command (Phase 11 — TQC-17 assembly, D-22, UI-SPEC R-10).
 *
 * The 4-row team-building surface: formation select (row 1) → slot-pick
 * (row 2, 12 slots) → hero-pick (row 3, class-matched owned heroes paged at
 * 25, D-20 strict) → save button (row 4). Every press re-renders the legion
 * embed with the current assignments + per-main chemistry tier lines.
 *
 * The "current" working formation = the active legion's formation (persisted
 * by saveLegion); picking a different owned formation activates it (D-22 one
 * active legion per user) so subsequent assigns use it.
 *
 * Security (V4): every pressed userHeroId is re-validated server-side
 * (ownership + class-match) inside legionService.assignHero — a crafted id →
 * NOT_OWNED / legion.class_mismatch, no state change.
 *
 * D-12: the embed data interface carries PRE-RENDERED field values — tier
 * labels + link counts only, never chemistry points / buff % / raw IV.
 *
 * Identity rule: every service call keys on users.id (grep-gated).
 */

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const legionSubcommand = new SlashCommandSubcommandBuilder()
  .setName('legion')
  .setDescription('Lập trận hình 3 chủ lực + 9 hỗ trợ')
  .setDescriptionLocalizations({
    'en-US': 'Assemble a formation: 3 mains + 9 supports',
    'zh-CN': '组建阵型：3主力 + 9支援',
  });
/* eslint-enable i18next/no-literal-string */

/** The 12 formation slots — the fixed 3 mains + 9 supports layout (D-17). */
const MAIN_SLOT_COUNT = 3;
/** D-04/UI-SPEC hero-pick page size — Discord select-menu option limit. */
const HERO_PAGE_SIZE = 25;

interface PerLocaleName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Per-locale hero name column (D-07 content-in-DB). */
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

function classLabel(t: TFunction, cls: string): string {
  return t(`sanguo:classes.${cls}`);
}

/** IV grade bands (STATE.md D-12): sum/186 → key. */
function ivGradeKey(ivStr: number, ivAgi: number, ivInt: number, ivMov: number, ivLea: number, ivCha: number): string {
  const pct = Math.round(((ivStr + ivAgi + ivInt + ivMov + ivLea + ivCha) / 186) * 100);
  if (pct === 100) return 'iv_grade.gold';
  if (pct >= 90) return 'iv_grade.ruby';
  if (pct >= 80) return 'iv_grade.sapphire';
  if (pct >= 60) return 'iv_grade.jade';
  return 'iv_grade.gray';
}

/** A hero reference row with its chemistry identity (faction/role/family). */
interface ChemHeroRow {
  id: number;
  heroId: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  tier: number;
  class: string;
  factionId: number;
  role: string;
  familyId: number | null;
  ivStr: number;
  ivAgi: number;
  ivInt: number;
  ivMov: number;
  ivLea: number;
  ivCha: number;
}

const CHEM_COLUMNS = {
  id: heroes.id,
  heroId: heroes.heroId,
  nameVi: heroes.nameVi,
  nameEn: heroes.nameEn,
  nameZh: heroes.nameZh,
  tier: heroes.tier,
  class: heroes.class,
  factionId: heroes.factionId,
  role: heroes.role,
  familyId: heroes.familyId,
  ivStr: userHeroes.ivStr,
  ivAgi: userHeroes.ivAgi,
  ivInt: userHeroes.ivInt,
  ivMov: userHeroes.ivMov,
  ivLea: userHeroes.ivLea,
  ivCha: userHeroes.ivCha,
} as const;

/** Resolve the tier label key + the link-count for one main vs its supports. */
function chemistryLineFor(
  main: ChemHeroRow,
  supports: ChemHeroRow[],
  spousePairs: Set<string>,
  t: TFunction,
  locale: SupportedLocale,
): { line: string; linkCount: number } {
  const supportInputs = supports.map((s) => ({
    factionId: s.factionId,
    role: s.role,
    familyId: s.familyId,
    spouseOfMain: spousePairs.has(sortPair(main.id, s.id)),
  }));
  const points = mainChemistryPoints(
    { factionId: main.factionId, role: main.role, familyId: main.familyId },
    supportInputs,
  );
  const tier = chemistryTier(points);
  const linkCount = supportInputs.filter((s) => isLinked(main, s.factionId, s.role, s.familyId, s.spouseOfMain)).length;
  const tierLabel = tier.label ? t(`sanguo:legion.tier_${tier.label.toLowerCase()}`) : t('sanguo:legion.tier_none');
  return {
    line: t('sanguo:legion.chemistry_line', {
      hero: pickName(main, locale),
      tier: tierLabel,
      n: linkCount,
    }),
    linkCount,
  };
}

function sortPair(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isLinked(
  main: ChemHeroRow,
  factionId: number,
  role: string,
  familyId: number | null,
  spouseOfMain: boolean,
): boolean {
  if (spouseOfMain) return true;
  if (main.familyId !== null && familyId === main.familyId) return true;
  if (factionId === main.factionId) return true;
  if (role === main.role) return true;
  return false;
}

/** The per-slot assignment state for the render. */
type AssignmentMap = Map<number, ChemHeroRow>;

/** Fetch the chemistry identity of the assigned heroes (mains + supports). */
async function fetchAssignedHeroes(userId: number): Promise<ChemHeroRow[]> {
  const slots = await getActiveLegion(userId);
  const heroIds = slots?.slots
    .filter((s) => s.userHeroId != null)
    .map((s) => s.userHeroId as number) ?? [];
  if (heroIds.length === 0) return [];
  return db
    .select(CHEM_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(and(eq(userHeroes.userId, userId), inArray(userHeroes.id, heroIds)));
}

/** Fetch the spouse relation pairs among the assigned hero ids. */
async function fetchSpousePairs(heroIds: number[]): Promise<Set<string>> {
  if (heroIds.length === 0) return new Set();
  const rows = await db
    .select({ a: heroRelations.heroAId, b: heroRelations.heroBId })
    .from(heroRelations)
    .where(
      and(
        inArray(heroRelations.heroAId, heroIds),
        inArray(heroRelations.heroBId, heroIds),
      ),
    );
  return new Set(rows.map((r) => sortPair(r.a, r.b)));
}

/** Class-matched owned heroes for the hero-pick menu (D-20 strict). */
async function fetchClassMatchedHeroes(
  userId: number,
  slotClass: string,
  locale: SupportedLocale,
  t: TFunction,
): Promise<{ userHeroId: number; label: string; emoji?: string }[]> {
  const rows = await db
    .select(CHEM_COLUMNS)
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(and(eq(userHeroes.userId, userId), eq(heroes.class, slotClass as (typeof heroClassEnum.enumValues)[number])))
    .orderBy(asc(userHeroes.id));
  return rows.map((h) => ({
    userHeroId: h.id,
    label: t('sanguo:legion.hero_option', {
      name: pickName(h, locale),
      stars: '★'.repeat(h.tier),
      grade: t(ivGradeKey(h.ivStr, h.ivAgi, h.ivInt, h.ivMov, h.ivLea, h.ivCha)),
    }),
    emoji: safeHeroEmoji(h.heroId),
  }));
}

interface RenderOpts {
  /** The slot whose hero-pick menu is shown (0-11). */
  heroSlot?: number;
  savedLine?: string;
}

/**
 * Shared legion renderer (shop-style): computes the current legion state and
 * re-renders the embed + the 4 ActionRows. The current working formation is
 * the active legion's formation, else the first owned formation.
 */
async function renderLegion(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  userId: number,
  locale: SupportedLocale,
  t: TFunction,
  shardId: number | undefined,
  opts: RenderOpts = {},
): Promise<boolean> {
  // 1. Owned formations — the formation menu (D-21/D-22).
  const formations = await listOwnedFormations(userId);
  if (formations.length === 0) return false;

  // 2. The active legion + current working formation.
  const active = await getActiveLegion(userId);
  const currentFormationId = active?.formationId ?? formations[0]!.id;
  const currentFormation = formations.find((f) => f.id === currentFormationId) ?? formations[0]!;

  // 3. The formation's slot layout (class per slot 0-11).
  const slotDefs = await db
    .select()
    .from(formationSlots)
    .where(eq(formationSlots.formationId, currentFormationId))
    .orderBy(asc(formationSlots.slotOrder));

  // 4. The current assignment per slot (from the active legion).
  const assigned = await fetchAssignedHeroes(userId);
  const assignedById = new Map(assigned.map((h) => [h.id, h]));
  const assignment: AssignmentMap = new Map();
  for (const slot of active?.slots ?? []) {
    if (slot.userHeroId != null) {
      const hero = assignedById.get(slot.userHeroId);
      if (hero) assignment.set(slot.slotOrder, hero);
    }
  }

  // 5. The hero-pick slot + its class-matched owned heroes (paged at 25).
  const heroSlot = opts.heroSlot ?? firstEmptySlot(assignment, slotDefs);
  const heroSlotDef = slotDefs.find((s) => s.slotOrder === heroSlot);
  const heroOptions = heroSlotDef
    ? (await fetchClassMatchedHeroes(userId, heroSlotDef.class, locale, t)).slice(0, HERO_PAGE_SIZE)
    : [];

  // 6. Chemistry — spouse pairs among the assigned hero ids.
  const allIds = [...assigned.values()].map((h) => h.id);
  const spousePairs = await fetchSpousePairs(allIds);

  // 7. Build the mains + supports field values.
  const { mainValue, supportValue } = buildSlotFieldValues(
    t,
    slotDefs,
    assignment,
    spousePairs,
    locale,
  );
  const filledMains = slotDefs
    .filter((s) => s.slotOrder < MAIN_SLOT_COUNT && assignment.get(s.slotOrder))
    .length;

  const data: SanguoLegionEmbedData = {
    formationEmoji: currentFormation.emoji ?? undefined,
    formationName: pickName(currentFormation, locale),
    mainFieldName: t('sanguo:legion.field_mains'),
    mainFieldValue: mainValue,
    supportFieldName: t('sanguo:legion.field_supports'),
    supportFieldValue: supportValue,
    incomplete:
      filledMains < MAIN_SLOT_COUNT
        ? t('sanguo:legion.incomplete', { n: filledMains })
        : undefined,
    savedLine: opts.savedLine,
    shardId,
  };

  const components = buildRows(t, formations, slotDefs, assignment, heroSlot, heroOptions, locale);

  await interaction.editReply({ embeds: [buildSanguoLegionEmbed(data)], components });
  return true;
}

/** The first empty slot (main priority), else slot 0. */
function firstEmptySlot(assignment: AssignmentMap, slotDefs: { slotOrder: number }[]): number {
  const ordered = slotDefs.map((s) => s.slotOrder).sort((a, b) => a - b);
  for (const slot of ordered) {
    if (!assignment.get(slot)) return slot;
  }
  return ordered[0] ?? 0;
}

/** Build the mains + supports field VALUES (D-12: tier labels + counts only). */
function buildSlotFieldValues(
  t: TFunction,
  slotDefs: { slotOrder: number; class: string }[],
  assignment: AssignmentMap,
  spousePairs: Set<string>,
  locale: SupportedLocale,
): { mainValue: string; supportValue: string } {
  const mains = slotDefs.filter((s) => s.slotOrder < MAIN_SLOT_COUNT).sort((a, b) => a.slotOrder - b.slotOrder);
  const supports = slotDefs.filter((s) => s.slotOrder >= MAIN_SLOT_COUNT).sort((a, b) => a.slotOrder - b.slotOrder);

  const mainLines: string[] = [];
  for (const def of mains) {
    const n = def.slotOrder + 1;
    const hero = assignment.get(def.slotOrder);
    const slotLabel = t('sanguo:legion.main_slot', { n });
    if (!hero) {
      mainLines.push(`${slotLabel}: ${t('sanguo:legion.slot_empty')}`);
      continue;
    }
    const supportList = supports
      .map((s) => assignment.get(s.slotOrder))
      .filter((h): h is ChemHeroRow => h != null);
    const chem = chemistryLineFor(hero, supportList, spousePairs, t, locale);
    const heroLine = `${slotLabel}: ${safeHeroEmoji(hero.heroId) ?? ''}${pickName(hero, locale)}`;
    mainLines.push(heroLine);
    mainLines.push(`  ${chem.line}`);
  }

  const supportLines: string[] = [];
  for (const def of supports) {
    const n = def.slotOrder - MAIN_SLOT_COUNT + 1;
    const hero = assignment.get(def.slotOrder);
    const slotLabel = t('sanguo:legion.support_slot', { n });
    if (!hero) {
      supportLines.push(`${slotLabel}: ${t('sanguo:legion.slot_empty')}`);
      continue;
    }
    supportLines.push(`${slotLabel}: ${safeHeroEmoji(hero.heroId) ?? ''}${pickName(hero, locale)}`);
  }

  return { mainValue: mainLines.join('\n'), supportValue: supportLines.join('\n') };
}

/** Build the 4 ActionRows (UI-SPEC R-10, ≤ 5 rows). */
function buildRows(
  t: TFunction,
  formations: OwnedFormationRow[],
  slotDefs: { slotOrder: number; class: string }[],
  assignment: AssignmentMap,
  heroSlot: number,
  heroOptions: { userHeroId: number; label: string; emoji?: string }[],
  locale: SupportedLocale,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  // Row 1: formation select (own ActionRow).
  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildSanguoLegionFormationMenu(
        t,
        formations.map((f) => ({
          formationId: f.id,
          label: pickName(f, locale),
          emoji: f.emoji ?? undefined,
        })),
      ),
    ),
  );

  // Row 2: slot-pick select (own ActionRow) — 12 options with class labels.
  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildSanguoLegionSlotMenu(
        t,
        slotDefs.map((def) => {
          const isMain = def.slotOrder < MAIN_SLOT_COUNT;
          const n = isMain ? def.slotOrder + 1 : def.slotOrder - MAIN_SLOT_COUNT + 1;
          const slotLabel = t(isMain ? 'sanguo:legion.main_slot' : 'sanguo:legion.support_slot', { n });
          return { slotIndex: def.slotOrder, label: `${slotLabel} — ${classLabel(t, def.class)}` };
        }),
      ),
    ),
  );

  // Row 3: hero-pick select (own ActionRow) — class-matched owned heroes.
  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildSanguoLegionHeroMenu(t, heroSlot, heroOptions),
    ),
  );

  // Row 4: save button (own ActionRow).
  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildSanguoLegionSaveButton(t),
    ),
  );

  return rows;
}

/**
 * /sanguo legion execute — NO deferReply (the parent 'sanguo' command owns it,
 * map.ts execute).
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
    const ok = await renderLegion(interaction, user.id, locale, t, shardId);
    if (!ok) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:legion.not_assembled'), shardId)],
        components: [],
      });
    }
  } catch (err) {
    logger.error('LegionExecute', 'Error in /sanguo legion', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Formation pick (sanguo:legion:formation, row 1) — activates the chosen owned
 * formation (D-22 one active legion) then re-renders for it.
 */
export async function handleFormationPress(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawId = interaction.values[0] ?? '';
  const formationId = parseInt(rawId, 10);
  if (isNaN(formationId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
    return;
  }
  try {
    await saveLegion(userId, formationId);
    await renderLegion(interaction, userId, locale, t, shardId);
  } catch (err) {
    logger.error('LegionFormationPress', 'Error in formation select', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Slot pick (sanguo:legion:slot, row 2) — re-renders the hero-pick menu (row 3)
 * for the chosen slot's class-filtered heroes.
 */
export async function handleSlotPress(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawIndex = interaction.values[0] ?? '';
  const slotIndex = parseInt(rawIndex, 10);
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 11) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
    return;
  }
  try {
    await renderLegion(interaction, userId, locale, t, shardId, { heroSlot: slotIndex });
  } catch (err) {
    logger.error('LegionSlotPress', 'Error in slot pick', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Hero pick (sanguo:legion:hero:{slotIndex}, row 3) — assignHero (ownership +
 * class-match, V4/D-20) then re-render with the updated assignment + chemistry
 * lines. Error codes render their friendly embeds.
 */
export async function handleHeroPress(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawSlot = interaction.customId.slice(LEGION_HERO_PREFIX.length + 1);
  const slotIndex = parseInt(rawSlot, 10);
  const rawHero = interaction.values[0] ?? '';
  const userHeroId = parseInt(rawHero, 10);
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 11 || isNaN(userHeroId)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
    return;
  }

  // The current working formation = the active legion's formation.
  const active = await getActiveLegion(userId);
  const formations = await listOwnedFormations(userId);
  const formationId = active?.formationId ?? formations[0]?.id;
  if (formationId == null) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.not_assembled'), shardId)],
      components: [],
    });
    return;
  }

  try {
    await assignHero(userId, formationId, slotIndex, userHeroId);
    await renderLegion(interaction, userId, locale, t, shardId, { heroSlot: slotIndex });
  } catch (err) {
    if (err instanceof Error && err.message === 'legion.class_mismatch') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:legion.class_mismatch', { hero: '', slot: String(slotIndex + 1), class: '' }), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'NOT_OWNED') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'HERO_ALREADY_ASSIGNED') {
      await renderLegion(interaction, userId, locale, t, shardId, { heroSlot: slotIndex });
      return;
    }
    logger.error('LegionHeroPress', 'Error in hero pick', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Save press (sanguo:legion:save, row 4) — persists the active legion
 * (formation + slots) and renders the SUCCESS legion.saved confirmation.
 */
export async function handleSavePress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const active = await getActiveLegion(userId);
  const formations = await listOwnedFormations(userId);
  const formationId = active?.formationId ?? formations[0]?.id;
  if (formationId == null) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.not_assembled'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const saved = await saveLegion(userId, formationId);
    const formationName = pickName(saved, locale);
    await renderLegion(interaction, userId, locale, t, shardId, {
      savedLine: t('sanguo:legion.saved', { formation: `${saved.emoji ?? ''} ${formationName}`.trim() }),
    });
  } catch (err) {
    logger.error('LegionSavePress', 'Error in save button', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:legion.error'), shardId)],
      components: [],
    });
  }
}
