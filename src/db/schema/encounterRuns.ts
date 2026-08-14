import { pgTable, serial, integer, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { playerTravelState } from './playerTravelState.js';
import { heroes } from './heroes.js';
import { sanguoSkills } from './sanguoSkills.js';

/**
 * encounter_runs — encounter/event run history for the sanguo sub-game
 * (TQC-02 -> Phase 9 TQC-08). heroId is the encountered hero (Phase 9/10);
 * Phase 11 (D-24): bosses now carry a REAL hero row (the zone general) —
 * the earlier boss-encounter NULL convention (D-14) is superseded.
 * Phase 10 (A7): status stays varchar(20) — vocabulary extends to
 * 'pending'|'captured'|'fled'|'skipped'|'escaped', enforced in service code
 * (no enum migration). pity_count (D-11) is the per-encounter bad-luck
 * counter: incremented per failed capture attempt, reset to 0 on every
 * terminal resolution (captured/fled/skipped/escaped — IN-04: the counter is
 * per-row and terminal-only; service code writes the reset alongside the
 * status transition).
 * Phase 11 (D-31/D-33): level + skill FKs written at spawn — the boss fights
 * at level 50 (D-35) and carries its rolled skills into the battle.
 */
export const encounterRuns = pgTable(
  'encounter_runs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    travelId: integer('travel_id').references(() => playerTravelState.id),
    zone: varchar('zone', { length: 50 }).notNull(),
    // The encountered hero (Phase 9/10) — boss encounters carry a REAL hero
    // per D-24 (zone general); the Phase 10 NULL-for-boss convention is gone
    heroId: integer('hero_id').references(() => heroes.id),
    // Encounter kind (D-14): 'hero'|'boss' — boss = real hero + encounter_type='boss'
    encounterType: varchar('encounter_type', { length: 20 }).notNull().default('hero'),
    // Phase 10 vocabulary (A7): 'pending'|'captured'|'fled'|'skipped'|'escaped'
    // — kept varchar (no enum migration), service-enforced
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // Phase 10 (D-11): per-encounter bad-luck counter — incremented per failed
    // capture attempt, reset to 0 on every terminal resolution
    // (captured/fled/skipped/escaped, IN-04). Read/written in the SAME
    // capture tx as the fee + roll (Pitfall 2/3).
    pityCount: smallint('pity_count').notNull().default(0),
    // Phase 11 (D-33): the encounter's fight level — wild = rolled level,
    // boss = 50 (D-35). Added to both combatant inputs at battle time.
    level: smallint('level').notNull().default(1),
    // Phase 11 (D-31): skills rolled at spawn (skillService, 11-06) — carried
    // through to user_heroes on capture, and into the boss/wild battle inputs.
    skillNormalId: integer('skill_normal_id').references(() => sanguoSkills.id),
    skillSpecialId: integer('skill_special_id').references(() => sanguoSkills.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // F2: the 09-03 pending-encounter re-fetch
    // (WHERE userId AND status='pending' ORDER BY id DESC LIMIT 1) is indexed
    index('encounter_runs_user_status_idx').on(table.userId, table.status),
  ],
);

export type EncounterRun = typeof encounterRuns.$inferSelect;
export type NewEncounterRun = typeof encounterRuns.$inferInsert;
