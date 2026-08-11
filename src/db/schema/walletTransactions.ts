import { pgTable, serial, integer, varchar, bigint, timestamp, pgEnum, jsonb, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', ['deduct', 'credit']);

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    type: walletTransactionTypeEnum('type').notNull(),
    // CRITICAL: mode: 'bigint' returns JS BigInt — never use mode: 'number' for currency
    // (users.ts balance comment; wallet_transactions mirrors it exactly)
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'bigint' }).notNull(),
    // First-class reason column — attributable every balance change for future
    // /profile history (D-04) and Phase 12 audit (TQC-19)
    reason: varchar('reason', { length: 50 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('amount_non_negative', sql`${table.amount} >= 0`),
    index('wallet_transactions_user_created_idx').on(table.userId, table.createdAt),
  ]
);

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
