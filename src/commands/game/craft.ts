/**
 * /craft - Crafting command with atomic transaction.
 *
 * Consumes recipe ingredients atomically and produces an item.
 * Has a chance to create a unique (mystery) item for the profession.
 *
 * Unique item design (Phase 02.1):
 *  - When rollUniqueChance() succeeds, the character receives one of the
 *    profession's designated mystery items (e.g. "Vô Danh Đan" for Luyện Đan).
 *  - No custom name / emoji at craft time — those are deferred to the
 *    "giám định" (appraisal) phase where quality, stats, and name are set.
 *
 * Business rules:
 *  - Recipe lookup: SELECT recipe WHERE id = recipeId
 *  - Profession gating: getProfessionLevel(char.professionPoints, profKey) >= recipe.minProfessionLevel
 *  - Ingredient consumption: ALL ingredients checked BEFORE any consumption (T-02-CRAFT-01)
 *  - Zero-quantity cleanup: DELETE character_items WHERE quantity <= 0 (T-02-CRAFT-02)
 *  - Unique item roll: rollUniqueChance(profLevel) probability
 *  - Unique items: grant the seeded catalog item for this profession (not a new DB row)
 *  - All operations in a single DB transaction: full commit or full rollback
 *
 * Threat mitigations:
 *  - T-02-CRAFT-01: All ingredient checks BEFORE any consumption; single atomic transaction
 *  - T-02-CRAFT-02: quantity_positive CHECK constraint + DELETE WHERE quantity <= 0
 *  - T-02-CRAFT-05: SELECT recipe returns null → 'not_found' before any mutation
 */

/* eslint-disable i18next/no-literal-string -- slash command names/descriptions are Discord API static strings */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, sql, and, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { items } from '../../db/schema/items.js';
import { characterItems } from '../../db/schema/character_items.js';
import { recipes } from '../../db/schema/recipes.js';
import { recipeIngredients } from '../../db/schema/recipe_ingredients.js';
import {
  craftRoll,
  PROFESSION_UNIQUE_ARCHETYPES,
} from '../../constants/itemAttributes.js';
import { getProfessionLevel } from '../../types/professions.js';
import type { ProfessionKey } from '../../types/professions.js';
import { getMajorRealmIndex } from '../../constants/gatherFees.js';
import { buildItemEmbed } from '../../ui/embeds/buildItemEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

// ── Types ─────────────────────────────────────────────────────────────────

type CraftResult =
  | { success: false; reason: 'not_found' | 'insufficient_level' | 'insufficient_materials' | 'fail' }
  | { success: true; isUnique: false; itemNameI18nKey: string; itemEmoji?: string }
  | { success: true; isUnique: true; itemNameI18nKey: string; itemEmoji?: string; creatorTag: string };

// ── Inventory upsert helper ───────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert an item into a character's inventory by item id.
 * Inserts quantity 1; on conflict increments by 1.
 * Returns the item's nameI18nKey and customEmoji for the result embed.
 */
async function addItemToInventory(
  tx: TxClient,
  characterId: number,
  resultItemId: number,
): Promise<{ nameI18nKey: string; emoji?: string }> {
  const resultItemRow = await tx
    .select({ nameI18nKey: items.nameI18nKey, emoji: items.customEmoji })
    .from(items)
    .where(eq(items.id, resultItemId))
    .limit(1)
    .then((rows) => rows[0]);

  await tx
    .insert(characterItems)
    .values({ characterId, itemId: resultItemId, quantity: 1 })
    .onConflictDoUpdate({
      target: [characterItems.characterId, characterItems.itemId],
      set: { quantity: sql`${characterItems.quantity} + 1` },
    });

  return {
    nameI18nKey: resultItemRow?.nameI18nKey ?? 'game:items.unknown',
    emoji: resultItemRow?.emoji ?? undefined,
  };
}

// ── Command definition ────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('craft')
  .setDescription('Chế tạo vật phẩm từ nguyên liệu')
  .setDescriptionLocalizations({
    'en-US': 'Craft items from materials',
    'zh-CN': '用材料制作物品',
  })
  .addIntegerOption((opt) =>
    opt
      .setName('recipe_id')
      .setDescription('ID của công thức chế tạo')
      .setDescriptionLocalizations({
        'en-US': 'ID of the recipe to craft',
        'zh-CN': '要制作的配方ID',
      })
      .setRequired(true)
      .setMinValue(1),
  );
/* eslint-enable i18next/no-literal-string */

// ── Execute ───────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  const recipeId = interaction.options.getInteger('recipe_id', true);

  // Atomic transaction
  const result = await db.transaction(async (tx): Promise<CraftResult> => {
    // a. SELECT recipe (T-02-CRAFT-05: null → not_found before any mutation)
    const recipe = await tx
      .select()
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!recipe) {
      return { success: false, reason: 'not_found' };
    }

    // b. Profession level gate
    const profKey = recipe.professionType as ProfessionKey;
    const profLevel = getProfessionLevel(char.professionPoints, profKey);

    if (profLevel < recipe.minProfessionLevel) {
      return { success: false, reason: 'insufficient_level' };
    }

    // c. Fetch ingredients
    const ingredients = await tx
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));

    // d. Check ALL ingredients BEFORE any consumption (T-02-CRAFT-01)
    for (const ingredient of ingredients) {
      const inventoryRow = await tx
        .select()
        .from(characterItems)
        .where(
          and(
            eq(characterItems.characterId, char.id),
            eq(characterItems.itemId, ingredient.itemId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!inventoryRow || inventoryRow.quantity < ingredient.quantity) {
        return { success: false, reason: 'insufficient_materials' };
      }
    }

    // e. Consume ingredients (T-02-CRAFT-02: DELETE WHERE quantity <= 0)
    for (const ingredient of ingredients) {
      await tx
        .update(characterItems)
        .set({ quantity: sql`${characterItems.quantity} - ${ingredient.quantity}` })
        .where(
          and(
            eq(characterItems.characterId, char.id),
            eq(characterItems.itemId, ingredient.itemId),
          ),
        );

      await tx
        .delete(characterItems)
        .where(
          and(
            eq(characterItems.characterId, char.id),
            eq(characterItems.itemId, ingredient.itemId),
            lte(characterItems.quantity, 0),
          ),
        );
    }

    // f. Fetch result item tier, then roll craft outcome (3-way: fail / success / unique)
    const resultItemTierRow = await tx
      .select({ tier: items.tier })
      .from(items)
      .where(eq(items.id, recipe.resultItemId))
      .limit(1)
      .then((rows) => rows[0]);
    const itemTier = resultItemTierRow?.tier ?? 1;

    const majorRealmIndex = getMajorRealmIndex(char.realmId);
    const outcome = craftRoll(majorRealmIndex, profLevel, itemTier);

    if (outcome === 'fail') {
      // Ingredients already consumed — craft fails (materials lost)
      return { success: false, reason: 'fail' };
    }

    if (outcome === 'unique') {
      const archetype = PROFESSION_UNIQUE_ARCHETYPES.find((a) => a.professionType === profKey);

      if (archetype) {
        // Look up the seeded catalog item for this profession's unique archetype
        const uniqueItem = await tx
          .select({ id: items.id, nameI18nKey: items.nameI18nKey, emoji: items.customEmoji })
          .from(items)
          .where(eq(items.nameI18nKey, archetype.uniqueItemNameI18nKey))
          .limit(1)
          .then((rows) => rows[0]);

        if (uniqueItem) {
          // Grant the profession's mystery item (upsert into inventory)
          await tx
            .insert(characterItems)
            .values({ characterId: char.id, itemId: uniqueItem.id, quantity: 1 })
            .onConflictDoUpdate({
              target: [characterItems.characterId, characterItems.itemId],
              set: { quantity: sql`${characterItems.quantity} + 1` },
            });

          return {
            success: true,
            isUnique: true,
            itemNameI18nKey: uniqueItem.nameI18nKey,
            itemEmoji: uniqueItem.emoji ?? undefined,
            creatorTag: interaction.user.tag,
          };
        }
        // Fallback: catalog item not found (seed not run) — treat as standard craft
      }
    }

    // g. Standard craft: add result item to inventory
    const itemResult = await addItemToInventory(tx, char.id, recipe.resultItemId);
    return { success: true, isUnique: false, itemNameI18nKey: itemResult.nameI18nKey, itemEmoji: itemResult.emoji };
  });

  // Handle result
  if (!result.success) {
    let errorMsg: string;

    if (result.reason === 'insufficient_level') {
      const recipe = await db
        .select({ minProfessionLevel: recipes.minProfessionLevel })
        .from(recipes)
        .where(eq(recipes.id, recipeId))
        .limit(1)
        .then((rows) => rows[0]);
      errorMsg = t('game:craft.insufficient_level', { level: recipe?.minProfessionLevel ?? '?' });
    } else if (result.reason === 'fail') {
      errorMsg = t('game:craft.fail');
    } else {
      const errorMsgKey =
        result.reason === 'not_found' ? 'game:craft.recipe_not_found' : 'game:craft.insufficient_materials';
      errorMsg = t(errorMsgKey);
    }

    await interaction.editReply({ embeds: [buildErrorEmbed(errorMsg, shardId)] });
    return;
  }

  await interaction.editReply({
    embeds: [
      buildItemEmbed(
        {
          type: result.isUnique ? 'unique_craft' : 'craft',
          itemNameI18nKey: result.itemNameI18nKey,
          itemEmoji: result.itemEmoji,
          quantity: 1,
          creatorTag: result.isUnique ? result.creatorTag : undefined,
          shardId,
        },
        t,
      ),
    ],
  });
}
