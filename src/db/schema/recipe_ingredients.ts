import { pgTable, serial, integer } from 'drizzle-orm/pg-core';
import { recipes } from './recipes.js';
import { items } from './items.js';

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  // Required quantity of this ingredient for the recipe
  quantity: integer('quantity').notNull(),
});

export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
