import { pgTable, serial, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * player_travel_state — one active journey per user (TQC-02 -> Phase 9 TQC-06).
 * fromNodeId/toNodeId are plain integers WITHOUT Drizzle references() — map_nodes
 * lives in plan 08-01's module and an import dependency would couple the plans;
 * Phase 9 adds the FK in its own migration if needed.
 *
 * D-07 remaining-seconds model: travel_seconds_remaining decrements per counted
 * minute (pause-aware); encounter_active pauses the clock while an encounter is
 * pending (D-25, cleared by the ack button). The Phase 8 absolute-timestamp and
 * money columns were dropped — travel is time-only (D-01).
 */
export const playerTravelState = pgTable('player_travel_state', {
  id: serial('id').primaryKey(),
  // One active journey per user (Phase 9 TQC-06)
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  // Plain integers — no FK to map_nodes (plan-decoupling, see header comment)
  fromNodeId: integer('from_node_id'),
  toNodeId: integer('to_node_id'),
  departAt: timestamp('depart_at', { withTimezone: true }).notNull(),
  // Remaining seconds of the journey clock — decremented per counted minute (D-07)
  travelSecondsRemaining: integer('travel_seconds_remaining').notNull().default(0),
  // Pause flag (D-07/D-25): true while an encounter is pending (roll hit);
  // cleared by the "Tiếp tục hành trình" ack button in 09-03
  encounterActive: boolean('encounter_active').notNull().default(false),
  // Values now 'traveling'|'arrived' only — 'cancelled' removed (D-03, no cancel path)
  status: varchar('status', { length: 20 }).notNull().default('traveling'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerTravelState = typeof playerTravelState.$inferSelect;
export type NewPlayerTravelState = typeof playerTravelState.$inferInsert;
