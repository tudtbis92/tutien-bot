import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { playerTravelState } from './playerTravelState.js';
import { heroes } from './heroes.js';

/**
 * encounter_runs — encounter/event run history for the sanguo sub-game
 * (TQC-02 -> Phase 9 TQC-08). heroId is the encountered hero (Phase 9/10);
 * boss encounters write hero_id NULL + encounter_type='boss' + zone (D-14).
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
    status: varchar('status', { length: 20 }).notNull().default('pending'),
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
