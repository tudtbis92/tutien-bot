import { pgTable, serial, varchar, text, integer, smallint, pgEnum, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { heroFactions } from './heroFactions.js';
import { heroFamilies } from './heroFamilies.js';

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
 * Phase 10 (D-02/D-08): the 8 base-stat columns (str/agi/int/mov/lea/cha/hp/mp),
 * the HIDDEN rarity column (1-5, engine/economy only — D-12: NEVER render it;
 * no UI read path exists) and the PUBLIC tier column (★1-5, the collection
 * display source — seeded independently of rarity, never derived from it).
 */
export const heroes = pgTable(
  'heroes',
  {
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
    // Phase 10 base stats (D-02) — combatStat = base + IV at battle time
    // (HP/MP are base-only, never IV-modified). Numeric values are
    // content-seeded in 10-04; defaults are placeholder-safe only.
    str: integer('str').notNull().default(0),
    agi: integer('agi').notNull().default(0),
    int: integer('int').notNull().default(0),
    mov: integer('mov').notNull().default(0),
    lea: integer('lea').notNull().default(0),
    cha: integer('cha').notNull().default(0),
    hp: integer('hp').notNull().default(100),
    mp: integer('mp').notNull().default(50),
    // Phase 10 hidden rarity (D-08) — 1-5, engine/economy only.
    // D-12 NEVER-RENDER: no UI consumer reads this column; the collection
    // renders stars from `tier`, never from rarity.
    rarity: smallint('rarity').notNull().default(1),
    // Phase 10 public display tier (★1-5) — the collection render source
    // (UI-SPEC resolution). Seeded INDEPENDENTLY of rarity.
    tier: smallint('tier').notNull().default(1),
    // Chemistry tier strongest (Phase 8 post-gate) — FK to hero_families.
    // One row per BLOODLINE (Liu imperial clan != any other Liu family);
    // chemistry matches on exact family_id so surname collisions can't create
    // false bonds. Null until research confirms / no notable clan.
    familyId: integer('family_id').references(() => heroFamilies.id),
    // Nullable content columns from heroes-v1.json
    gender: varchar('gender', { length: 20 }),
    people: varchar('people', { length: 50 }),
    titleVi: varchar('title_vi', { length: 200 }),
    weapon: varchar('weapon', { length: 50 }),
    detailEn: text('detail_en'),
  },
  (table) => [
    // Rarity bounded 1-5 for engine correctness (D-08)
    check('rarity_range', sql`${table.rarity} >= 1 AND ${table.rarity} <= 5`),
    // Public display tier bounded 1-5 (UI-SPEC)
    check('tier_range', sql`${table.tier} >= 1 AND ${table.tier} <= 5`),
  ],
);

export type Hero = typeof heroes.$inferSelect;
export type NewHero = typeof heroes.$inferInsert;
