import { pgTable, serial, varchar, text, pgEnum } from 'drizzle-orm/pg-core';

// 10 factions verified from heroes-v1.json (RESEARCH TQC-02)
export const heroFactionEnum = pgEnum('hero_faction', [
  'hoang_toc',
  'thap_thuong_thi',
  'trieu_dinh',
  'dang_nhan',
  'tuong_trieu',
  'khan_vang',
  'luong_chau',
  'quan_hung',
  'chau_muc',
  'ngoai_toc',
]);

// 5 roles verified from heroes-v1.json (RESEARCH TQC-02)
export const heroRoleEnum = pgEnum('hero_role', [
  'royal',
  'eunuch',
  'military',
  'civil',
  'religious',
]);

/**
 * heroes — hero catalog content table (TQC-02, D-05/D-06/D-07).
 * Content-in-DB: per-locale name columns (NOT i18n keys, NOT JSONB).
 * heroId is the natural key for the D-11 idempotent upsert.
 * nameZh stays NULL until the Tavily research re-run fills it (D-06).
 */
export const heroes = pgTable('heroes', {
  id: serial('id').primaryKey(),
  // Natural key for D-11 upsert (drizzle-kit unique constraint)
  heroId: varchar('hero_id', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // Nullable — filled by Tavily research re-run per D-06/D-11
  nameZh: varchar('name_zh', { length: 100 }),
  faction: heroFactionEnum('faction').notNull(),
  role: heroRoleEnum('role').notNull(),
  // Nullable content columns from heroes-v1.json
  gender: varchar('gender', { length: 20 }),
  people: varchar('people', { length: 50 }),
  titleVi: varchar('title_vi', { length: 200 }),
  weapon: varchar('weapon', { length: 50 }),
  detailEn: text('detail_en'),
});

export type Hero = typeof heroes.$inferSelect;
export type NewHero = typeof heroes.$inferInsert;
