import { pgTable, serial, integer, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { playerTravelState } from './playerTravelState.js';
import { heroes } from './heroes.js';

/**
 * encounter_runs — encounter/event run history for the sanguo sub-game
 * (TQC-02 -> Phase 9 TQC-08). heroId is the encountered hero (Phase 9/10);
 * boss encounters write hero_id NULL + encounter_type='boss' + zone (D-14).
 * Phase 10 (A7): status stays varchar(20) — vocabulary extends to
 * 'pending'|'captured'|'fled'|'skipped'|'escaped', enforced in service code
 * (no enum migration). pity_count (D-11) is the per-encounter bad-luck
 * counter: incremented per failed capture attempt, reset to 0 on every
 * terminal resolution (captured/fled/skipped/escaped — IN-04: the counter is
 * per-row and terminal-only; service code writes the reset alongside the
 * status transition).
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
    // The encountered hero (Phase 9/10) — null for boss encounters (D-14)
    heroId: integer('hero_id').references(() => heroes.id),
    // Encounter kind (D-14): 'hero'|'boss' — boss writes hero_id NULL + zone
    encounterType: varchar('encounter_type', { length: 20 }).notNull().default('hero'),
    // Phase 10 vocabulary (A7): 'pending'|'captured'|'fled'|'skipped'|'escaped'
    // — kept varchar (no enum migration), service-enforced
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // Phase 10 (D-11): per-encounter bad-luck counter — incremented per failed
    // capture attempt, reset to 0 on every terminal resolution
    // (captured/fled/skipped/escaped, IN-04). Read/written in the SAME
    // capture tx as the fee + roll (Pitfall 2/3).
    pityCount: smallint('pity_count').notNull().default(0),
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
