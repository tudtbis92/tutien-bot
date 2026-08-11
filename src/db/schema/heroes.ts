import { pgTable, serial, varchar, text, integer, pgEnum } from 'drizzle-orm/pg-core';
import { heroFactions } from './heroFactions.js';

// 9 roles (Phase 8 post-gate — replaces 5-role enum)
export const heroRoleEnum = pgEnum('hero_role', [
  'ruler',
  'general',
  'strategist',
  'civil',
  'royal',
  'eunuch',
  'religious',
  'tribal',
  'scholar',
]);

// 8 classes (Phase 8 post-gate — formation position)
export const heroClassEnum = pgEnum('hero_class', [
  'vanguard',
  'cavalry',
  'archer',
  'spellcaster',
  'schemer',
  'vu_co',
  'thu_binh',
  'cong_binh',
]);

/**
 * heroes — hero catalog content table (TQC-02, D-05/D-06/D-07).
 * Content-in-DB: per-locale name columns (NOT i18n keys, NOT JSONB).
 * heroId is the natural key for the D-11 idempotent upsert.
 * nameZh stays NULL until the Tavily research re-run fills it (D-06).
 * Phase 8 post-gate: faction enum replaced by hero_factions.faction_id FK
 * (flat, no hierarchy); role expanded to 9; class (formation position) and
 * family (chemistry tier, cross-faction) added.
 */
export const heroes = pgTable('heroes', {
  id: serial('id').primaryKey(),
  // Natural key for D-11 upsert (drizzle-kit unique constraint)
  heroId: varchar('hero_id', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // Nullable — filled by Tavily research re-run per D-06/D-11
  nameZh: varchar('name_zh', { length: 100 }),
  // Phase 8 post-gate: FK to flat hero_factions reference table
  factionId: integer('faction_id')
    .notNull()
    .references(() => heroFactions.id),
  role: heroRoleEnum('role').notNull(),
  // Formation position class (8 values) — chemistry (Phase 11) matches slot
  class: heroClassEnum('class').notNull(),
  // Chemistry tier strongest (Phase 8 post-gate) — nullable until research confirms
  family: varchar('family', { length: 30 }),
  // Nullable content columns from heroes-v1.json
  gender: varchar('gender', { length: 20 }),
  people: varchar('people', { length: 50 }),
  titleVi: varchar('title_vi', { length: 200 }),
  weapon: varchar('weapon', { length: 50 }),
  detailEn: text('detail_en'),
});

export type Hero = typeof heroes.$inferSelect;
export type NewHero = typeof heroes.$inferInsert;
