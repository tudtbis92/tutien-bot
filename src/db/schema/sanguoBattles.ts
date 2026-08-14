import { pgTable, serial, integer, varchar, timestamp, jsonb, bigint } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { encounterRuns } from './encounterRuns.js';

/**
 * sanguo_battles — battle state for the sanguo sub-game (TQC-02 -> Phase 10 TQC-10).
 * Minimal-but-complete; Phase 10 extends with turn state, teams, etc.
 * roundLogs holds the deterministic battle replay log (Phase 10 TQC-10).
 * Phase 10 (D-06/A6) replay contract: re-run runBattle(seed, input) against
 * the stored full stat snapshot (input jsonb) and deep-compare roundLogs/result.
 */
export const sanguoBattles = pgTable('sanguo_battles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  // Phase 10 TQC-10 replay logs — empty until battles are implemented
  roundLogs: jsonb('round_logs').$type<unknown[]>(),
  // Phase 10 (A6): nullable FK to the driving encounter — NULL for spar
  // battles (D-17: player-initiated practice)
  encounterId: integer('encounter_id').references(() => encounterRuns.id),
  // 'encounter'|'spar' (D-17)
  type: varchar('type', { length: 20 }).notNull().default('encounter'),
  // D-06 replay seed — crypto.randomInt(< 2^32), the seed space pure-rand's
  // xoroshiro128plus actually consumes (WR-01: the constructor truncates via
  // `seed | 0`, so a 2^48 draw contributed only 32 bits of entropy).
  // mode: 'number' is REQUIRED by drizzle (bigint without a mode fails
  // typecheck) and keeps the value a JS number so 10-05 can pass it
  // straight to runBattle(seed: number).
  seed: bigint('seed', { mode: 'number' }),
  // Full stat snapshot + battle result (A6) — cast through Record to keep
  // the schema decoupled from the engine types (CombatantInput/BattleResult).
  input: jsonb('input').$type<Record<string, unknown>>(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export type SanguoBattle = typeof sanguoBattles.$inferSelect;
export type NewSanguoBattle = typeof sanguoBattles.$inferInsert;
