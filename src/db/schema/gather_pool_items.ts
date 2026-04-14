import { pgTable, serial, integer, smallint, boolean } from 'drizzle-orm/pg-core';
import { items } from './items.js';

/**
 * Gather pool — defines which items can appear in the /gather gacha roll.
 *
 * Rules (from Phase 02.1 design decisions D-07, D-11):
 * - Crafted items NEVER appear here (D-11)
 * - min_major_realm_index gates high-tier items (D-03)
 * - weight controls relative probability within the pool (D-03)
 * - is_active allows soft-disabling items without delete
 *
 * Major realm index mapping (D-02):
 *   0 = Luyện Khí, 1 = Trúc Cơ, 2 = Kim Đan, 3 = Nguyên Anh,
 *   4 = Hóa Thần, 5 = Luyện Hư, 6 = Vấn Đỉnh, 7 = Đại Thừa,
 *   8 = Bán Tiên, 9 = Địa Tiên, 10 = Chân Tiên, 11 = Đại La Tiên
 */
export const gatherPoolItems = pgTable('gather_pool_items', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id)
    .unique(),
  // Minimum major realm index required for this item to appear in the pool
  minMajorRealmIndex: smallint('min_major_realm_index').notNull().default(0),
  // Relative weight for weighted random selection (higher = more common)
  weight: smallint('weight').notNull().default(100),
  isActive: boolean('is_active').notNull().default(true),
});

export type GatherPoolItem = typeof gatherPoolItems.$inferSelect;
export type NewGatherPoolItem = typeof gatherPoolItems.$inferInsert;
