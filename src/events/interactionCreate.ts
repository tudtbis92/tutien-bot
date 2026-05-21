import { Events, type Interaction } from 'discord.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../i18n/index.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { characters } from '../db/schema/characters.js';
import { recipes as recipesSchema } from '../db/schema/recipes.js';
import { recipeIngredients } from '../db/schema/recipe_ingredients.js';
import { items } from '../db/schema/items.js';
import { getProfessionLevel } from '../types/professions.js';
import type { ProfessionKey } from '../types/professions.js';
import { buildLeaderboardPage } from '../commands/game/leaderboard.js';
import { buildRecipesPage } from '../ui/embeds/buildRecipesEmbed.js';
import { buildBagPage } from '../commands/game/bag.js';
import { handlePredictResult, handlePredictScore, handlePredictModalSubmit } from '../components/predictions/index.js';
import { buildHistoryPage } from '../commands/predictions/predictions.js';

export const name = Events.InteractionCreate;

const RECIPES_PER_PAGE = 5;

export async function execute(interaction: Interaction): Promise<void> {
  // ── StringSelectMenu interaction routing ────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    if (customId.startsWith('predict:result:')) {
      try {
        await handlePredictResult(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictResult', err);
      }
      return;
    }
  }

  // ── ModalSubmit interaction routing ──────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    if (customId.startsWith('predict:modal:')) {
      try {
        await handlePredictModalSubmit(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictModalSubmit', err);
      }
      return;
    }
  }

  // ── Button interaction routing ──────────────────────────────────────────────
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('predict:score:')) {
      try {
        await handlePredictScore(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictScore', err);
      }
      return;
    }

    // /bxh pagination buttons: customId = 'bxh_prev_{page}_{scope}' or 'bxh_next_{page}_{scope}'
    if (customId.startsWith('bxh_prev_') || customId.startsWith('bxh_next_')) {
      const parts = customId.split('_');
      // Format: ['bxh', 'prev'|'next', '{page}', '{scope...}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);

      // T-02-BXH-01: NaN guard — malformed customId should not trigger a query
      if (isNaN(rawPage)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;

      // Negative page guard — cannot go before page 0
      if (newPage < 0) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      // T-02-BXH-02: scope is guildId snowflake or literal 'global'
      // parts[3..] re-joined in case guildId somehow contains '_' (it shouldn't — Discord snowflakes are numeric)
      const scope = parts.slice(3).join('_');

      // Resolve user locale from DB; fallback to 'vi' if not found
      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);

      const shardId = interaction.client.shard?.ids[0];

      const { embed, row } = await buildLeaderboardPage(scope, newPage, t, shardId);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /predictions history pagination buttons: customId = 'pred_hist_prev_{page}_{userId}' or 'pred_hist_next_{page}_{userId}'
    if (customId.startsWith('pred_hist_prev_') || customId.startsWith('pred_hist_next_')) {
      const parts = customId.split('_');
      const direction = parts[2] as 'prev' | 'next';
      const rawPage = parseInt(parts[3] ?? '', 10);
      const targetUserId = parseInt(parts[4] ?? '', 10);

      if (isNaN(rawPage) || isNaN(targetUserId)) {
        await interaction.deferUpdate();
        return;
      }

      const [currentUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));

      if (!currentUser || currentUser.id !== targetUserId) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;
      if (newPage < 0) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      const { embed, row } = await buildHistoryPage(targetUserId, newPage, t, shardId);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /recipes pagination buttons: customId = 'recipes_prev_{page}_{profession|none}' or 'recipes_next_{page}_{profession|none}'
    if (customId.startsWith('recipes_prev_') || customId.startsWith('recipes_next_')) {
      const parts = customId.split('_');
      // Format: ['recipes', 'prev'|'next', '{page}', '{profession|none}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);

      // T-GAP-01: NaN guard
      if (isNaN(rawPage)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;

      // Underflow guard — recipes are 1-indexed
      if (newPage < 1) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      // T-GAP-02: profession string is parameterized via Drizzle WHERE — no SQL injection risk
      const professionRaw = parts.slice(3).join('_');
      const professionFilter = professionRaw === 'none' ? null : (professionRaw as ProfessionKey);

      // Resolve user locale
      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      // Fetch character for profession level filtering
      const [charRow] = await db
        .select({ id: characters.id, discordId: characters.discordId, professionPoints: characters.professionPoints })
        .from(characters)
        .where(eq(characters.discordId, interaction.user.id));

      if (!charRow) {
        await interaction.deferUpdate();
        return;
      }

      // Re-run recipes query (mirrors recipes.ts execute())
      const allRecipesRows = await db
        .select({
          id: recipesSchema.id,
          resultItemId: recipesSchema.resultItemId,
          professionType: recipesSchema.professionType,
          minProfessionLevel: recipesSchema.minProfessionLevel,
        })
        .from(recipesSchema)
        .where(professionFilter ? eq(recipesSchema.professionType, professionFilter) : undefined)
        .orderBy(asc(recipesSchema.professionType), asc(recipesSchema.minProfessionLevel));

      // Apply profession-level filter
      const visibleRecipes = allRecipesRows.filter((r) => {
        const charLevel = getProfessionLevel(
          charRow.professionPoints,
          r.professionType as ProfessionKey,
        );
        return charLevel >= r.minProfessionLevel;
      });

      if (visibleRecipes.length === 0) {
        await interaction.deferUpdate();
        return;
      }

      const totalPages = Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE);
      const clampedPage = Math.min(newPage, totalPages);
      const pageRecipes = visibleRecipes.slice(
        (clampedPage - 1) * RECIPES_PER_PAGE,
        clampedPage * RECIPES_PER_PAGE,
      );

      // Fetch result items
      const resultItemIds = pageRecipes.map((r) => r.resultItemId);
      const resultItemRows = await db
        .select({ id: items.id, nameI18nKey: items.nameI18nKey, tier: items.tier })
        .from(items)
        .where(
          resultItemIds.length === 1
            ? eq(items.id, resultItemIds[0]!)
            : inArray(items.id, resultItemIds),
        );
      const resultItemMap = new Map(resultItemRows.map((r) => [r.id, r]));

      // Fetch ingredients
      const pageRecipeIds = pageRecipes.map((r) => r.id);
      const allIngredients = await db
        .select({
          recipeId: recipeIngredients.recipeId,
          itemId: recipeIngredients.itemId,
          quantity: recipeIngredients.quantity,
        })
        .from(recipeIngredients)
        .where(
          pageRecipeIds.length === 1
            ? eq(recipeIngredients.recipeId, pageRecipeIds[0]!)
            : inArray(recipeIngredients.recipeId, pageRecipeIds),
        );

      const ingredientItemIds = [...new Set(allIngredients.map((i) => i.itemId))];
      const ingredientItems =
        ingredientItemIds.length > 0
          ? await db
              .select({ id: items.id, nameI18nKey: items.nameI18nKey })
              .from(items)
              .where(
                ingredientItemIds.length === 1
                  ? eq(items.id, ingredientItemIds[0]!)
                  : inArray(items.id, ingredientItemIds),
              )
          : [];
      const ingredientNameMap = new Map(ingredientItems.map((i) => [i.id, i.nameI18nKey]));

      const ingByRecipe = new Map<number, { nameKey: string; quantity: number }[]>();
      for (const ing of allIngredients) {
        if (!ingByRecipe.has(ing.recipeId)) ingByRecipe.set(ing.recipeId, []);
        ingByRecipe.get(ing.recipeId)!.push({
          nameKey: ingredientNameMap.get(ing.itemId) ?? 'game:items.unknown',
          quantity: ing.quantity,
        });
      }

      const charProfLevel = professionFilter
        ? getProfessionLevel(charRow.professionPoints, professionFilter)
        : undefined;

      const displayRecipes = pageRecipes.map((r) => {
        const resultItem = resultItemMap.get(r.resultItemId);
        return {
          recipeId: r.id,
          outputNameKey: resultItem?.nameI18nKey ?? 'game:items.unknown',
          outputTier: resultItem?.tier ?? 1,
          profession: r.professionType,
          minProfessionLevel: r.minProfessionLevel,
          ingredients: ingByRecipe.get(r.id) ?? [],
        };
      });

      const { embed, row } = buildRecipesPage(
        {
          recipes: displayRecipes,
          professionKey: professionFilter ?? undefined,
          characterProfLevel: charProfLevel,
          page: clampedPage,
          totalPages,
          shardId,
        },
        t,
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /bag pagination buttons: customId = 'bag_prev_{page}_{characterId}' or 'bag_next_{page}_{characterId}'
    if (customId.startsWith('bag_prev_') || customId.startsWith('bag_next_')) {
      const parts = customId.split('_');
      // Format: ['bag', 'prev'|'next', '{page}', '{characterId}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);
      const characterId = parseInt(parts[3] ?? '', 10);

      if (isNaN(rawPage) || isNaN(characterId)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;
      if (newPage < 1) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      const result = await buildBagPage(characterId, newPage, t, shardId);
      if (!result) {
        await interaction.deferUpdate();
        return;
      }
      await interaction.editReply({ embeds: [result.embed], components: [result.row] });
      return;
    }

    // Unknown button — no-op (future button types handled here)
    return;
  }

  // ── Slash command routing ───────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands?.get(interaction.commandName);

  if (!command) {
    logger.warn('InteractionCreate', `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('InteractionCreate', `Error in command ${interaction.commandName}`, err);

    const [errorUserRow] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(errorUserRow?.locale, interaction.locale);
    const t = getT(locale);

      const errorEmbed = buildErrorEmbed(t('common:errors.internalError'));

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
