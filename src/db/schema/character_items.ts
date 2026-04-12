import { pgTable, serial, integer, check, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { characters } from './characters.js';
import { items } from './items.js';

export const characterItems = pgTable(
  'character_items',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    // Quantity must always be positive — zero-quantity rows are deleted by crafting logic
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    check('quantity_positive', sql`${table.quantity} > 0`),
    // For fast inventory queries by character
    index('char_items_character_idx').on(table.characterId),
    // Unique constraint required for ON CONFLICT DO UPDATE (upsert in gathering/crafting)
    uniqueIndex('char_items_unique_char_item').on(table.characterId, table.itemId),
  ],
);

export type CharacterItem = typeof characterItems.$inferSelect;
export type NewCharacterItem = typeof characterItems.$inferInsert;
