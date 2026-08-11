import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

/**
 * hero_families — bloodline reference table (Phase 8 post-gate).
 * Each family = ONE distinct lineage (not a surname — the Liu imperial clan
 * and an unrelated Liu family would be two separate rows). heroes.family_id
 * references this; chemistry (Phase 11) matches on exact family_id so surname
 * collisions can never create false bonds.
 */
export const heroFamilies = pgTable('hero_families', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  nameZh: varchar('name_zh', { length: 100 }),
});

export type HeroFamily = typeof heroFamilies.$inferSelect;
export type NewHeroFamily = typeof heroFamilies.$inferInsert;
