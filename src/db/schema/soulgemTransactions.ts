import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { heroes } from './heroes.js';

/**
 * soulgem_transactions — hồn ngọc audit ledger (Phase 11, RESEARCH Pattern 5).
 * Mirrors wallet_transactions: one row per hồn ngọc mutation for Phase 12
 * TQC-19 audit + future /profile history. amount is SIGNED: +convert yield,
 * −level/evolve/reroll spend.
 */
export const soulgemTransactions = pgTable(
  'soulgem_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    heroId: integer('hero_id')
      .notNull()
      .references(() => heroes.id),
    // 'convert'|'level'|'evolve'|'reroll' — service-enforced (no enum migration)
    type: varchar('type', { length: 20 }).notNull(),
    // Signed: +convert yield / −spend
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // For fast per-user ledger queries
    index('soulgem_transactions_user_idx').on(table.userId),
  ],
);

export type SoulgemTransaction = typeof soulgemTransactions.$inferSelect;
export type NewSoulgemTransaction = typeof soulgemTransactions.$inferInsert;
