import { pgTable, serial, varchar, smallint } from 'drizzle-orm/pg-core';

/**
 * map_nodes — map content table (TQC-02 slice, D-05/D-07/D-10).
 * Content-in-DB: per-locale name columns (NOT i18n keys, NOT JSONB).
 * `representativeHeroId` is a zone→hero marker for the scaffold (D-07):
 * filled by the Phase 8 placeholder seed so /sanguo map renders a heroEmoji()
 * marker per zone; a null value renders a label-only zone entry.
 * Follows the items.ts content-table pattern.
 */
export const mapNodes = pgTable('map_nodes', {
  id: serial('id').primaryKey(),
  // Natural key for D-11 upsert (drizzle-kit unique index)
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // Nullable — filled by Tavily re-run per D-06/D-11
  nameZh: varchar('name_zh', { length: 100 }),
  zone: varchar('zone', { length: 50 }).notNull(),
  nodeOrder: smallint('node_order').notNull(),
  // zone→hero marker for the scaffold (D-07); null → label-only zone entry
  representativeHeroId: varchar('representative_hero_id', { length: 50 }),
});

export type MapNode = typeof mapNodes.$inferSelect;
export type NewMapNode = typeof mapNodes.$inferInsert;
