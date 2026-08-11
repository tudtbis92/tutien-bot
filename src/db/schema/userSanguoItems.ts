import { pgTable, serial, integer, check, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { sanguoItems } from './sanguoItems.js';

export const userSanguoItems = pgTable(
  'user_sanguo_items',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    itemId: integer('item_id')
      .notNull()
      .references(() => sanguoItems.id),
    // Quantity must always be positive — zero-quantity rows are deleted by logic
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    check('quantity_positive', sql`${table.quantity} > 0`),
    // For fast inventory queries by user
    index('user_sanguo_items_user_idx').on(table.userId),
    // Unique constraint required for ON CONFLICT DO UPDATE (character_items.ts upsert pattern)
    uniqueIndex('user_sanguo_items_unique_user_item').on(table.userId, table.itemId),
  ],
);

export type UserSanguoItem = typeof userSanguoItems.$inferSelect;
export type NewUserSanguoItem = typeof userSanguoItems.$inferInsert;
