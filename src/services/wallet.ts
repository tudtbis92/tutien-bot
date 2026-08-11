import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { walletTransactions } from '../db/schema/walletTransactions.js';

/**
 * Single choke point for every users.balance mutation (TQC-01 / D-03).
 *
 * Two exported functions:
 *  - deductBalance: WHERE-guard UPDATE (balance >= amount) + ledger INSERT in one
 *    transaction; throws Error('INSUFFICIENT_BALANCE') on zero-row result.
 *  - creditBalance: no balance guard (a credit cannot go negative); the DB-level
 *    balance_non_negative check (users.ts) remains the last line of defense.
 *
 * Every successful mutation writes exactly one wallet_transactions row (userId,
 * type, amount, balance_after, reason, metadata) in the SAME transaction as the
 * balance UPDATE (D-01) — a committed balance change always has a matching
 * ledger row, satisfying SC1 reconcilability.
 *
 * Transaction semantics (D-02):
 *  - Callers already inside a transaction pass their `tx` — the wallet runs the
 *    UPDATE + INSERT directly on it (no nested transaction).
 *  - Callers with no open transaction pass the shared `db` client — the wallet
 *    drives the transaction internally.
 *  - Discrimination is by OBJECT IDENTITY (txOrDb === db), NOT by probing for a
 *    transaction method — drizzle's PgTransaction also exposes .transaction()
 *    (nested savepoint), so a method probe would misclassify a real tx and open
 *    a nested transaction instead of executing directly.
 */

type DbClient = typeof db;
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export interface WalletMutationOptions {
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Atomically deduct `amount` from the user's balance (WHERE-guarded) and write
 * the matching ledger row. Throws Error('INSUFFICIENT_BALANCE') when the user
 * lacks the funds (UPDATE matches zero rows — the whole transaction rolls back).
 *
 * @returns the post-mutation balance (balanceAfter).
 */
export async function deductBalance(
  txOrDb: Tx | DbClient,
  userId: number,
  amount: bigint,
  opts: WalletMutationOptions,
): Promise<bigint> {
  const run = async (client: Tx | DbClient): Promise<bigint> => {
    const rows = await client
      .update(users)
      .set({ balance: sql`${users.balance} - ${amount}` })
      .where(and(eq(users.id, userId), sql`${users.balance} >= ${amount}`))
      .returning({ balance: users.balance });

    if (rows.length === 0) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const balanceAfter = rows[0]!.balance;

    await client.insert(walletTransactions).values({
      userId,
      type: 'deduct',
      amount,
      balanceAfter,
      reason: opts.reason,
      metadata: opts.metadata,
    });

    return balanceAfter;
  };

  if (txOrDb === db) {
    return db.transaction((tx) => run(tx));
  }
  return run(txOrDb);
}

/**
 * Atomically credit `amount` to the user's balance (no balance comparison — a
 * credit cannot go negative) and write the matching ledger row.
 *
 * @returns the post-mutation balance (balanceAfter).
 */
export async function creditBalance(
  txOrDb: Tx | DbClient,
  userId: number,
  amount: bigint,
  opts: WalletMutationOptions,
): Promise<bigint> {
  const run = async (client: Tx | DbClient): Promise<bigint> => {
    const rows = await client
      .update(users)
      .set({ balance: sql`${users.balance} + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ balance: users.balance });

    const balanceAfter = rows[0]!.balance;

    await client.insert(walletTransactions).values({
      userId,
      type: 'credit',
      amount,
      balanceAfter,
      reason: opts.reason,
      metadata: opts.metadata,
    });

    return balanceAfter;
  };

  if (txOrDb === db) {
    return db.transaction((tx) => run(tx));
  }
  return run(txOrDb);
}
