import { pgTable, serial, varchar, smallint, bigint, numeric, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * sanguo_items — item catalog for the sanguo sub-game (TQC-02, D-05/D-06/D-07).
 * Content-in-DB: per-locale name columns (NOT i18n keys, NOT JSONB).
 * code is the natural key for the D-11 idempotent upsert.
 * Phase 11 (D-16): single basePrice replaced by the multi-currency model —
 * priceLinh (Linh thạch) + priceEvent (event currency) + saleState
 * ('sold'|'locked' — capture keys stay locked, D-15) + dropWeight (percent
 * 0-100, boss drop pool weights 70/25/4.9/0.1 — scale 2 for 4.9).
 */
export const sanguoItems = pgTable('sanguo_items', {
  id: serial('id').primaryKey(),
  // Natural key for D-11 upsert (drizzle-kit unique constraint)
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // Nullable — filled by Tavily research re-run per D-06/D-11
  nameZh: varchar('name_zh', { length: 100 }),
  itemType: varchar('item_type', { length: 30 }).notNull().default('support'),
  rarity: smallint('rarity').notNull().default(1),
  // CRITICAL: BigInt default as sql`0` due to drizzle-kit serialization bug (items.ts pattern)
  priceLinh: bigint('price_linh', { mode: 'bigint' }).notNull().default(sql`0`),
  priceEvent: bigint('price_event', { mode: 'bigint' }).notNull().default(sql`0`),
  // 'sold'|'locked' — locked items are not purchasable (D-15 capture_key stays locked)
  saleState: varchar('sale_state', { length: 10 }).notNull().default('locked'),
  // Percent 0-100 — boss drop pool weight (4.9 needs scale 2)
  dropWeight: numeric('drop_weight', { precision: 5, scale: 2 }).notNull().default('0'),
  descriptionVi: text('description_vi'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SanguoItem = typeof sanguoItems.$inferSelect;
export type NewSanguoItem = typeof sanguoItems.$inferInsert;
