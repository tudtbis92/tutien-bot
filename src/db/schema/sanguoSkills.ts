import { pgTable, serial, varchar, smallint } from 'drizzle-orm/pg-core';

/**
 * sanguo_skills — skill catalog for the sanguo sub-game (Phase 11, D-30/D-31).
 * Mechanics-in-DB: class/slot/rarity/mp/effect columns; skill NAMES are i18n
 * keys (per-locale lookup), NOT per-locale name columns (heroes/items pattern)
 * — the 11-02 seed writes mechanics, the i18n layer renders names.
 * code is the natural key for the D-11 idempotent upsert.
 */
export const sanguoSkills = pgTable('sanguo_skills', {
  id: serial('id').primaryKey(),
  // Natural key for D-11 upsert (drizzle-kit unique constraint)
  code: varchar('code', { length: 50 }).notNull().unique(),
  // 8-class enum values (heroes.ts heroClassEnum) — the class pool the spawn
  // roll draws from (11-06 skillService)
  class: varchar('class', { length: 20 }).notNull(),
  // 'normal'|'special' — the 2 skill slots (D-31, per-copy columns)
  slot: varchar('slot', { length: 10 }).notNull(),
  // 'common'|'rare'|'epic' — drives the spawn/reroll rarity weights
  rarity: varchar('rarity', { length: 10 }).notNull(),
  mpCost: smallint('mp_cost').notNull().default(0),
  mpGain: smallint('mp_gain').notNull().default(0),
  // 'damage'|'attack_up'|'hp_regen'|'mp_regen' — battleEngine resolves by id
  effectType: varchar('effect_type', { length: 20 }).notNull(),
  effectValue: smallint('effect_value').notNull().default(0),
  // Content-driven emoji (UI-SPEC) — never theme constants (RESEARCH don't-hand-roll)
  emoji: varchar('emoji', { length: 100 }),
});

export type SanguoSkill = typeof sanguoSkills.$inferSelect;
export type NewSanguoSkill = typeof sanguoSkills.$inferInsert;
