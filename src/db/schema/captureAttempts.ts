import { pgTable, serial, integer, smallint, bigint, doublePrecision, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { encounterRuns } from './encounterRuns.js';

/**
 * capture_attempts — first-class audit table for EVERY capture attempt
 * (Phase 10 TQC-11, ASVS repudiation / SC2 audit proof).
 * Mirrors wallet_transactions first-class-row philosophy (Phase 12 TQC-19
 * reports depend on this table). outcome: 'success'|'fail'|'flee'.
 * The EXACT displayed chance is stored as displayed_chance, the roll as
 * roll, and a row exists for EVERY attempt including failures.
 */
export const captureAttempts = pgTable(
  'capture_attempts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    encounterId: integer('encounter_id')
      .notNull()
      .references(() => encounterRuns.id),
    tier: smallint('tier').notNull(),
    // Currency — mode: 'bigint' to match users.balance (never mode: 'number')
    fee: bigint('fee', { mode: 'bigint' }).notNull(),
    displayedChance: doublePrecision('displayed_chance').notNull(),
    roll: doublePrecision('roll').notNull(),
    outcome: varchar('outcome', { length: 20 }).notNull(),
    pityBefore: smallint('pity_before').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // TQC-19 report path: per-user attempt history
    index('capture_attempts_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export type CaptureAttempt = typeof captureAttempts.$inferSelect;
export type NewCaptureAttempt = typeof captureAttempts.$inferInsert;
