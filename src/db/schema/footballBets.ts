import { pgTable, serial, integer, varchar, bigint, timestamp, check, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { footballMatches } from './footballMatches.js';

export const footballBets = pgTable(
  'football_bets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => footballMatches.id),
    betType: varchar('bet_type', { length: 20 }).notNull(), // 'result' or 'score'
    prediction: varchar('prediction', { length: 50 }).notNull(), // 'home'/'draw'/'away' or '2-1'/'3-0' etc.
    wagerAmount: bigint('wager_amount', { mode: 'bigint' }).notNull(),
    potentialPayout: bigint('potential_payout', { mode: 'bigint' }),
    oddsUsed: varchar('odds_used', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending'/'won'/'lost'/'void'
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('wager_amount_non_negative', sql`${table.wagerAmount} >= 0`),
    uniqueIndex('football_bets_user_fixture_bet_type_unique_idx').on(table.userId, table.fixtureId, table.betType),
    index('football_bets_fixture_status_idx').on(table.fixtureId, table.status),
    index('football_bets_user_idx').on(table.userId),
  ]
);

export type FootballBet = typeof footballBets.$inferSelect;
export type NewFootballBet = typeof footballBets.$inferInsert;
