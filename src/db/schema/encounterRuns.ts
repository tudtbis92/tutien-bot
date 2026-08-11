import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { playerTravelState } from './playerTravelState.js';
import { heroes } from './heroes.js';

/**
 * encounter_runs — encounter/event run history for the sanguo sub-game
 * (TQC-02 -> Phase 9 TQC-08). heroId is the encountered hero (Phase 9/10).
 */
export const encounterRuns = pgTable('encounter_runs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  travelId: integer('travel_id').references(() => playerTravelState.id),
  zone: varchar('zone', { length: 50 }).notNull(),
  // The encountered hero (Phase 9/10) — null until encounters are implemented
  heroId: integer('hero_id').references(() => heroes.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EncounterRun = typeof encounterRuns.$inferSelect;
export type NewEncounterRun = typeof encounterRuns.$inferInsert;
