/**
 * Recipe list embed builder.
 *
 * Shows paginated recipe list filtered by profession and min_profession_level.
 * Displays ingredient requirements and output item name.
 *
 * Source: Phase 02.1 PLAN.md — /recipes command spec
 */

import { EmbedBuilder } from 'discord.js';
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
 * Build a paginated recipe list embed.
 *
 * @param data - Recipe list data with pagination metadata
 * @param t - i18next TFunction bound to the user's locale
 */
export function buildRecipesEmbed(data: RecipesEmbedData, t: TFunction): EmbedBuilder {
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

    lines.push(`${statusIcon} ${badge} **${outputName}** \`#${recipe.recipeId}\`${profLevelStr}`);

    // Ingredients list
    const ingParts = recipe.ingredients.map((ing) => `${t(ing.nameKey)} ×${ing.quantity}`);
    lines.push(`　└ ${ingParts.join(', ')}`);
  }

  const description = lines.length > 0
    ? lines.join('\n')
    : t('game:recipes.empty');

  const footerText = `${embedFooter(data.shardId).text} • ${t('game:leaderboard.page', { current: data.page, total: data.totalPages })}`;

  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footerText })
    .setTimestamp();
}
