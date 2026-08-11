import { pgTable, serial, integer, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * sanguo_battles — battle state for the sanguo sub-game (TQC-02 -> Phase 10 TQC-10).
 * Minimal-but-complete; Phase 10 extends with turn state, teams, etc.
 * roundLogs holds the deterministic battle replay log (Phase 10 TQC-10).
 */
export const sanguoBattles = pgTable('sanguo_battles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  // Phase 10 TQC-10 replay logs — empty until battles are implemented
  roundLogs: jsonb('round_logs').$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export type SanguoBattle = typeof sanguoBattles.$inferSelect;
export type NewSanguoBattle = typeof sanguoBattles.$inferInsert;
