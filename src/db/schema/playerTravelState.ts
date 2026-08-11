import { pgTable, serial, integer, varchar, bigint, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * player_travel_state — one active journey per user (TQC-02 -> Phase 9 TQC-06).
 * fromNodeId/toNodeId are plain integers WITHOUT Drizzle references() — map_nodes
 * lives in plan 08-01's module and an import dependency would couple the plans;
 * Phase 9 adds the FK in its own migration if needed.
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
  arriveAt: timestamp('arrive_at', { withTimezone: true }).notNull(),
  // CRITICAL: mode: 'bigint' returns JS BigInt — never use mode: 'number' for currency
  cost: bigint('cost', { mode: 'bigint' }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('traveling'), // 'traveling'|'cancelled'|'arrived'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerTravelState = typeof playerTravelState.$inferSelect;
export type NewPlayerTravelState = typeof playerTravelState.$inferInsert;
