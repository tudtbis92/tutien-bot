/**
 * Recipe list embed builder.
 *
 * Shows paginated recipe list filtered by profession and min_profession_level.
 * Displays ingredient requirements and output item name.
 *
 * Source: Phase 02.1 PLAN.md — /recipes command spec
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface RecipeDisplayItem {
  recipeId: number;
  outputNameKey: string;
  outputTier: number;
  profession: string;
  minProfessionLevel: number;
  ingredients: { nameKey: string; quantity: number }[];
}

export interface RecipesEmbedData {
  recipes: RecipeDisplayItem[];
  professionKey?: string;
  characterProfLevel?: number;
  page: number;
  totalPages: number;
  shardId?: number;
}

// ── Tier display helpers ──────────────────────────────────────────────────

const TIER_COLORS: Record<number, string> = {
  1: '⬜',
  2: '🟩',
  3: '🟦',
  4: '🟪',
  5: '🟧',
  6: '🔴',
};

function tierBadge(tier: number): string {
  return TIER_COLORS[tier] ?? '⬛';
}

// ── Builder ───────────────────────────────────────────────────────────────

/**
 * Build a paginated recipe list embed with ◀/▶ navigation buttons.
 *
 * @param data - Recipe list data with pagination metadata
 * @param t - i18next TFunction bound to the user's locale
 * @returns { embed, row } — embed and pagination ActionRow
 */
export function buildRecipesPage(
  data: RecipesEmbedData,
  t: TFunction,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const title = data.professionKey
    ? `📋 ${t('game:recipes.title_profession', { profession: t(`game:profession.names.${data.professionKey}`) })}`
    : `📋 ${t('game:recipes.title_all')}`;

  const lines: string[] = [];

  for (const recipe of data.recipes) {
    const outputName = t(recipe.outputNameKey);
    const badge = tierBadge(recipe.outputTier);
    const profLevelStr = recipe.minProfessionLevel > 1
      ? ` *(Lv.${recipe.minProfessionLevel})*`
      : '';

    // Check if character can craft this recipe
    const canCraft = data.characterProfLevel !== undefined
      ? data.characterProfLevel >= recipe.minProfessionLevel
      : undefined;
    const statusIcon = canCraft === true ? '✅' : canCraft === false ? '🔒' : '';

    lines.push(`${statusIcon} ${badge} **${outputName}**${profLevelStr}`);

    // Ingredients list
    const ingParts = recipe.ingredients.map((ing) => `${t(ing.nameKey)} ×${ing.quantity}`);
    lines.push(`　└ ${ingParts.join(', ')}`);
    lines.push(`　└ 🔧 \`/craft recipe_id:${recipe.recipeId}\``);
  }

  const description = lines.length > 0
    ? lines.join('\n')
    : t('game:recipes.empty');

  const footerText = `${embedFooter(data.shardId).text} • ${t('game:leaderboard.page', { current: data.page, total: data.totalPages })}`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footerText })
    .setTimestamp();

  // Pagination buttons — customId pattern: recipes_{prev|next}_{page}_{profession|none}
  const professionPart = data.professionKey ?? 'none';
  const prevCustomId = `recipes_prev_${data.page}_${professionPart}`;
  const nextCustomId = `recipes_next_${data.page}_${professionPart}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(prevCustomId)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.page <= 1),
    new ButtonBuilder()
      .setCustomId(nextCustomId)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.page >= data.totalPages),
  );

  return { embed, row };
}

/**
 * @deprecated Use buildRecipesPage() which returns { embed, row }.
 */
export function buildRecipesEmbed(
  data: RecipesEmbedData,
  t: TFunction,
): EmbedBuilder {
  return buildRecipesPage(data, t).embed;
}
