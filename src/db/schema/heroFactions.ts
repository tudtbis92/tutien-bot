import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';

/**
 * hero_factions — flat faction reference table (Phase 8 post-gate).
 * No hierarchy: 12 top-level codes (han, nguy, thuc, ngo, thap_thuong_thi,
 * khan_vang, luong_chau, nam_man, o_hoan, son_viet, tien_ti, hung_no).
 * heroes.faction_id references this table (replaces the old flat pgEnum).
 * name_vi/en/zh per-locale display names, sort_order for stable ordering.
 */
export const heroFactions = pgTable('hero_factions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  nameZh: varchar('name_zh', { length: 100 }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type HeroFaction = typeof heroFactions.$inferSelect;
export type NewHeroFaction = typeof heroFactions.$inferInsert;
