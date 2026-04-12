/**
 * /craft - Crafting command with atomic transaction.
 *
 * Consumes recipe ingredients atomically and produces an item.
 * Has a chance to create a unique item with custom name, emoji, and random attributes.
 *
 * Business rules:
 *  - Recipe lookup: SELECT recipe WHERE id = recipeId
 *  - Profession gating: getProfessionLevel(char.professionPoints, profKey) >= recipe.minProfessionLevel
 *  - Ingredient consumption: ALL ingredients checked BEFORE any consumption (T-02-CRAFT-01)
 *  - Zero-quantity cleanup: DELETE character_items WHERE quantity <= 0 (T-02-CRAFT-02)
 *  - Unique item roll: rollUniqueChance(profLevel) probability
 *  - Unique items: INSERT into items with is_unique=true, custom_name, custom_emoji, random attributes
 *  - All operations in a single DB transaction: full commit or full rollback
 *
 * Threat mitigations:
 *  - T-02-CRAFT-01: All ingredient checks BEFORE any consumption; single atomic transaction
 *  - T-02-CRAFT-02: quantity_positive CHECK constraint + DELETE WHERE quantity <= 0
 *  - T-02-CRAFT-03: Drizzle parameterized queries - custom_name is a bind parameter
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
  rollUniqueChance,
  PROFESSION_UNIQUE_ARCHETYPES,
} from '../../constants/itemAttributes.js';
import { getProfessionLevel } from '../../types/professions.js';
import type { ProfessionKey } from '../../types/professions.js';
import { buildItemEmbed } from '../../ui/embeds/buildItemEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

// ── Types ─────────────────────────────────────────────────────────────────

type CraftResult =
  | { success: false; reason: 'not_found' | 'insufficient_level' | 'insufficient_materials' }
  | {
      success: true;
      isUnique: false;
      itemNameI18nKey: string;
    }
  | {
      success: true;
      isUnique: true;
      itemNameI18nKey: string;
      customName: string;
      customEmoji: string;
      creatorTag: string;
    };

// ── Inventory upsert helper ───────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert a standard (non-unique) item into a character's inventory.
 * Inserts quantity 1; on conflict increments by 1.
 * Returns the item's nameI18nKey for the result embed.
 */
async function addItemToInventory(
  tx: TxClient,
  characterId: number,
  resultItemId: number,
): Promise<string> {
  const resultItemRow = await tx
    .select({ nameI18nKey: items.nameI18nKey })
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

  return resultItemRow?.nameI18nKey ?? 'game:items.unknown';
}

// ── Attribute rolling ─────────────────────────────────────────────────────

/**
 * Roll 2-4 random attributes from a pool with random float values [0.01, 0.20].
 */
function rollRandomAttributes(
  pool: readonly [string, string, string, string],
): Record<string, number> {
  // Pick between 2 and 4 random attributes
  const count = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return Object.fromEntries(
    selected.map((attr) => [
      attr,
      // Random value between 0.01 and 0.20 (rounded to 2 decimal places)
      Math.round((0.01 + Math.random() * 0.19) * 100) / 100,
    ]),
  );
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
  )
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Tên tùy chỉnh cho vật phẩm đặc biệt (nếu may mắn tạo ra)')
      .setDescriptionLocalizations({
        'en-US': 'Custom name for unique item (if lucky enough to create one)',
        'zh-CN': '独特物品的自定义名称（如果幸运创造出来）',
      })
      .setMaxLength(50)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName('emoji')
      .setDescription('Emoji tùy chỉnh cho vật phẩm đặc biệt')
      .setDescriptionLocalizations({
        'en-US': 'Custom emoji for unique item',
        'zh-CN': '独特物品的自定义表情符号',
      })
      .setMaxLength(100)
      .setRequired(false),
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

  // 2. Get recipe_id from options
  const recipeId = interaction.options.getInteger('recipe_id', true);
  const customNameInput = interaction.options.getString('name') ?? 'Unnamed Item';
  const customEmojiInput = interaction.options.getString('emoji') ?? '';

  // 3. Execute atomic transaction
  const result = await db.transaction(async (tx): Promise<CraftResult> => {
    // a. SELECT recipe WHERE id = recipeId (T-02-CRAFT-05: null → not_found before any mutation)
    const recipe = await tx
      .select()
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!recipe) {
      return { success: false, reason: 'not_found' };
    }

    // b. Check profession level gate
    const profKey = recipe.professionType as ProfessionKey;
    const profLevel = getProfessionLevel(char.professionPoints, profKey);

    if (profLevel < recipe.minProfessionLevel) {
      return { success: false, reason: 'insufficient_level' };
    }

    // c. SELECT recipe_ingredients WHERE recipeId
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
        .set({
          quantity: sql`${characterItems.quantity} - ${ingredient.quantity}`,
        })
        .where(
          and(
            eq(characterItems.characterId, char.id),
            eq(characterItems.itemId, ingredient.itemId),
          ),
        );

      // Clean up zero-quantity rows (T-02-CRAFT-02: quantity_positive CHECK + zero cleanup)
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

    // f. Roll unique chance
    const isUnique = rollUniqueChance(profLevel);

    if (isUnique) {
      // g. Unique item creation
      const archetype = PROFESSION_UNIQUE_ARCHETYPES.find(
        (a) => a.professionType === profKey,
      );

      if (!archetype) {
        // Fallback: treat as standard craft if no archetype found for this profession
        const nameI18nKey = await addItemToInventory(tx, char.id, recipe.resultItemId);
        return { success: true, isUnique: false, itemNameI18nKey: nameI18nKey };
      }

      // Roll random attributes from archetype pool (2-4 attributes)
      const rolledAttributes = rollRandomAttributes(archetype.attributePool);

      // Get result item type for the unique item
      const resultItemRow = await tx
        .select()
        .from(items)
        .where(eq(items.id, recipe.resultItemId))
        .limit(1)
        .then((rows) => rows[0]);

      const itemType = resultItemRow?.type ?? 'artifact';

      // INSERT unique item into items table (T-02-CRAFT-03: Drizzle parameterized queries)
      const newItemRows = await tx
        .insert(items)
        .values({
          nameI18nKey: archetype.uniqueItemNameI18nKey,
          type: itemType,
          basePrice: sql`0`,
          isUnique: true,
          creatorCharacterId: char.id,
          customName: customNameInput,
          customEmoji: customEmojiInput,
          attributes: rolledAttributes,
          createdAt: sql`now()`,
        })
        .returning({ id: items.id });

      const newItemId = newItemRows[0]?.id;
      if (!newItemId) {
        // Should not happen — INSERT with RETURNING always returns a row on success
        throw new Error(`INSERT into items returned no id for recipe ${recipeId}`);
      }

      // INSERT into character_items for the new unique item
      await tx.insert(characterItems).values({
        characterId: char.id,
        itemId: newItemId,
        quantity: 1,
      });

      return {
        success: true,
        isUnique: true,
        itemNameI18nKey: archetype.uniqueItemNameI18nKey,
        customName: customNameInput,
        customEmoji: customEmojiInput,
        creatorTag: interaction.user.tag,
      };
    }

    // h. Standard craft: add result item to inventory
    const nameI18nKey = await addItemToInventory(tx, char.id, recipe.resultItemId);
    return { success: true, isUnique: false, itemNameI18nKey: nameI18nKey };
  });

  // 4. Handle result outside transaction
  if (!result.success) {
    const errorMsgKey =
      result.reason === 'not_found'
        ? 'game:craft.recipe_not_found'
        : result.reason === 'insufficient_level'
          ? 'game:craft.insufficient_level'
          : 'game:craft.insufficient_materials';

    // For insufficient_level, include level info from recipe (fetch outside transaction)
    let errorMsg: string;
    if (result.reason === 'insufficient_level') {
      const recipe = await db
        .select({ minProfessionLevel: recipes.minProfessionLevel })
        .from(recipes)
        .where(eq(recipes.id, recipeId))
        .limit(1)
        .then((rows) => rows[0]);

      errorMsg = t(errorMsgKey, { level: recipe?.minProfessionLevel ?? '?' });
    } else {
      errorMsg = t(errorMsgKey);
    }

    await interaction.editReply({
      embeds: [buildErrorEmbed(errorMsg, shardId)],
    });
    return;
  }

  // 5. Success path
  if (result.isUnique) {
    await interaction.editReply({
      embeds: [
        buildItemEmbed(
          {
            type: 'unique_craft',
            itemNameI18nKey: result.itemNameI18nKey,
            quantity: 1,
            isUnique: true,
            customName: result.customName,
            customEmoji: result.customEmoji,
            creatorTag: result.creatorTag,
            shardId,
          },
          t,
        ),
      ],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      buildItemEmbed(
        {
          type: 'craft',
          itemNameI18nKey: result.itemNameI18nKey,
          quantity: 1,
          shardId,
        },
        t,
      ),
    ],
  });
}
