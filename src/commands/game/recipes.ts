/**
 * /recipes — List available crafting recipes.
 *
 * Shows paginated recipe list. Can filter by profession.
 * Only shows recipes the character has unlocked (prof level >= minProfessionLevel).
 *
 * Design (CONTEXT.md D-13):
 *  - Auto-unlock: recipe visible when prof_level >= min_profession_level
 *  - D-11: Crafted items are NOT in gather pool
 *
 * Shows 5 recipes per page; pagination via ◀/▶ buttons.
 */

/* eslint-disable i18next/no-literal-string -- Discord API static strings */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { recipes } from '../../db/schema/recipes.js';
import { recipeIngredients } from '../../db/schema/recipe_ingredients.js';
import { items } from '../../db/schema/items.js';
import { getProfessionLevel } from '../../types/professions.js';
import type { ProfessionKey } from '../../types/professions.js';
import { buildRecipesPage, type RecipeDisplayItem } from '../../ui/embeds/buildRecipesEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

const RECIPES_PER_PAGE = 5;

// Professions list for autocomplete / choice
const PROFESSION_CHOICES = [
  { name: 'Luyện Đan',       nameLocalizations: { 'en-US': 'Pill Crafting',          'zh-CN': '炼丹' },         value: 'luyen_dan' },
  { name: 'Luyện Khí Nghề',  nameLocalizations: { 'en-US': 'Qi Refinement',          'zh-CN': '炼气术' },       value: 'luyen_khi_nc' },
  { name: 'Trận Pháp',       nameLocalizations: { 'en-US': 'Formation Arrays',        'zh-CN': '阵法' },         value: 'tran_phap' },
  { name: 'Linh Trù',        nameLocalizations: { 'en-US': 'Spirit Cooking',          'zh-CN': '灵厨' },         value: 'linh_tru' },
  { name: 'Luyện Cổ Trùng',  nameLocalizations: { 'en-US': 'Gu Insect Cultivation',  'zh-CN': '蛊虫培育' },     value: 'luyen_co' },
  { name: 'Dược Sư',         nameLocalizations: { 'en-US': 'Herbalism',               'zh-CN': '药师' },         value: 'duoc_su' },
  { name: 'Thuần Thú',       nameLocalizations: { 'en-US': 'Spirit Beast Taming',     'zh-CN': '驯灵兽' },       value: 'thuan_thu' },
  { name: 'Luyện Kim',       nameLocalizations: { 'en-US': 'Metal Refinement',        'zh-CN': '炼金' },         value: 'luyen_kim' },
  { name: 'Phù Sư',          nameLocalizations: { 'en-US': 'Talisman Crafting',       'zh-CN': '符师' },         value: 'phu_su' },
  { name: 'Thuật Sư',        nameLocalizations: { 'en-US': 'Divination',              'zh-CN': '术士' },         value: 'thuat_su' },
] as const;

export const data = new SlashCommandBuilder()
  .setName('recipes')
  .setDescription('Xem danh sách công thức chế tạo')
  .setDescriptionLocalizations({
    'en-US': 'View list of crafting recipes',
    'zh-CN': '查看制作配方列表',
  })
  .addStringOption((opt) => {
    const o = opt
      .setName('profession')
      .setDescription('Lọc theo nghề nghiệp')
      .setDescriptionLocalizations({
        'en-US': 'Filter by profession',
        'zh-CN': '按职业筛选',
      })
      .setRequired(false);
    for (const choice of PROFESSION_CHOICES) {
      o.addChoices({ name: choice.name, name_localizations: choice.nameLocalizations, value: choice.value });
    }
    return o;
  })
  .addIntegerOption((opt) =>
    opt
      .setName('page')
      .setDescription('Trang (mặc định 1)')
      .setDescriptionLocalizations({
        'en-US': 'Page (default 1)',
        'zh-CN': '页码（默认1）',
      })
      .setRequired(false)
      .setMinValue(1),
  );
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  const professionFilter = interaction.options.getString('profession') as ProfessionKey | null;
  const page = Math.max(1, interaction.options.getInteger('page') ?? 1);

  // 1. Fetch all recipes (optionally filtered by profession)
  const allRecipes = await db
    .select({
      id: recipes.id,
      resultItemId: recipes.resultItemId,
      professionType: recipes.professionType,
      minProfessionLevel: recipes.minProfessionLevel,
    })
    .from(recipes)
    .where(professionFilter ? eq(recipes.professionType, professionFilter) : undefined)
    .orderBy(asc(recipes.professionType), asc(recipes.minProfessionLevel));

  // 2. Filter by character's profession level — only show unlocked recipes (Gap 4 fix)
  const visibleRecipes = allRecipes.filter((r) => {
    const charLevel = getProfessionLevel(
      char.professionPoints,
      r.professionType as ProfessionKey,
    );
    return charLevel >= r.minProfessionLevel;
  });

  // 3. Empty-state check (covers: no DB recipes AND no unlocked recipes for this character)
  if (visibleRecipes.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:recipes.empty'), shardId)],
    });
    return;
  }

  // 4. Paginate over visible recipes only
  const totalPages = Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE);
  const clampedPage = Math.min(page, totalPages);
  const pageRecipes = visibleRecipes.slice(
    (clampedPage - 1) * RECIPES_PER_PAGE,
    clampedPage * RECIPES_PER_PAGE,
  );

  // 5. Fetch result items for this page
  const resultItemIds = pageRecipes.map((r) => r.resultItemId);
  const resultItems = await db
    .select({ id: items.id, nameI18nKey: items.nameI18nKey, tier: items.tier })
    .from(items)
    .where(
      resultItemIds.length === 1
        ? eq(items.id, resultItemIds[0]!)
        : inArray(items.id, resultItemIds),
    );

  const resultItemMap = new Map(resultItems.map((r) => [r.id, r]));

  // 6. Fetch ingredients for this page's recipes
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

  // 7. Fetch ingredient item names
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

  // 8. Group ingredients by recipe
  const ingByRecipe = new Map<number, { nameKey: string; quantity: number }[]>();
  for (const ing of allIngredients) {
    if (!ingByRecipe.has(ing.recipeId)) ingByRecipe.set(ing.recipeId, []);
    ingByRecipe.get(ing.recipeId)!.push({
      nameKey: ingredientNameMap.get(ing.itemId) ?? 'game:items.unknown',
      quantity: ing.quantity,
    });
  }

  // 9. Build display items
  const charProfLevel = professionFilter
    ? getProfessionLevel(char.professionPoints, professionFilter)
    : undefined;

  const displayRecipes: RecipeDisplayItem[] = pageRecipes.map((r) => {
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

  // 10. Render embed with pagination buttons
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
}
