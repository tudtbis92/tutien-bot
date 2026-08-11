/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deductBalance, creditBalance } from '../wallet.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { walletTransactions } from '../../db/schema/walletTransactions.js';

// Mock the DB client BEFORE importing wallet (prevents config.ts env validation;
// wallet.ts imports db from ../db/client.js — the same module instance mocked here)
vi.mock('../../db/client.js', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

// Full chainable mockTx surface — update/set/where/returning/insert/values — PLUS
// its own transaction function, mirroring drizzle's PgTransaction nested-savepoint
// surface, so the identity-based client-vs-tx discrimination is exercised.
function buildMockTx(returningResult: unknown, withTxFn = false) {
  const mockTx: any = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningResult),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue({}),
  };
  if (withTxFn) {
    // Mirror drizzle's nested-savepoint surface — a real PgTransaction also exposes
    // .transaction(); the wallet must NOT treat this as a client (D-02).
    mockTx.transaction = vi.fn();
  }
  return mockTx;
}

// Collect the names of every column referenced in a drizzle SQL AST (circular-safe —
// drizzle column objects reference their table, which references columns back).
function referencedColumnNames(node: unknown): Set<string> {
  const names = new Set<string>();
  const seen = new Set<object>();
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (
      typeof obj.name === 'string' &&
      (typeof obj.table === 'object' || typeof obj.column === 'object')
    ) {
      names.add(obj.name);
    }
    for (const key of Object.keys(obj)) {
      // Do not descend into table/column back-references — a column's table object
      // carries ALL columns (including balance) that are NOT part of this WHERE.
      if (key === 'table' || key === 'columns' || key === 'column') continue;
      const val = obj[key];
      if (Array.isArray(val)) val.forEach(walk);
      else walk(val);
    }
  };
  walk(node);
  return names;
}

describe('wallet service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deductBalance', () => {
    it('resolves balanceAfter and writes one "deduct" ledger row with the full payload', async () => {
      const mockTx = buildMockTx([{ balance: 300n }]);

      const result = await deductBalance(mockTx, 1, 100n, {
        reason: 'gather',
        metadata: { amount: 1, feePerRoll: 100n, majorRealmIndex: 0 },
      });

      expect(result).toBe(300n);
      // Ledger insert payload — the SC1 reconcilability proof
      expect(mockTx.insert).toHaveBeenCalledWith(walletTransactions);
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: 'deduct',
          amount: 100n,
          balanceAfter: 300n,
          reason: 'gather',
          metadata: { amount: 1, feePerRoll: 100n, majorRealmIndex: 0 },
        }),
      );
    });

    it('rejects INSUFFICIENT_BALANCE when the UPDATE returns zero rows and never writes a ledger row', async () => {
      const mockTx = buildMockTx([]);

      await expect(
        deductBalance(mockTx, 1, 100n, { reason: 'gather' }),
      ).rejects.toThrow('INSUFFICIENT_BALANCE');

      // Ledger integrity on failure — no row written
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('succeeds when the balance exactly equals the amount (balance 0 is legal)', async () => {
      const mockTx = buildMockTx([{ balance: 0n }]);

      const result = await deductBalance(mockTx, 1, 100n, { reason: 'gather' });

      expect(result).toBe(0n);
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deduct', amount: 100n, balanceAfter: 0n }),
      );
    });

    it('runs the body inside db.transaction when passed the shared client (identity === db)', async () => {
      const mockTx = buildMockTx([{ balance: 300n }]);
      vi.mocked(db.transaction).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await deductBalance(db, 1, 100n, { reason: 'gather' });

      expect(result).toBe(300n);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      // The UPDATE + INSERT ran on the tx inside the client's transaction
      expect(mockTx.update).toHaveBeenCalledWith(users);
      expect(mockTx.insert).toHaveBeenCalledWith(walletTransactions);
    });

    it('uses a passed tx directly without opening a nested transaction (identity discrimination, D-02)', async () => {
      // mockTx ALSO exposes .transaction (nested-savepoint surface) — the wallet
      // must discriminate by identity (txOrDb === db), NOT by probing for a
      // transaction method, so this tx is used directly.
      const mockTx = buildMockTx([{ balance: 300n }], true);
      vi.mocked(db.transaction).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await deductBalance(mockTx, 1, 100n, { reason: 'gather' });

      expect(result).toBe(300n);
      expect(mockTx.transaction).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('creditBalance', () => {
    it('resolves balanceAfter and writes a "credit" ledger row', async () => {
      const mockTx = buildMockTx([{ balance: 250n }]);

      const result = await creditBalance(mockTx, 1, 50n, {
        reason: 'bet_payout',
        metadata: { betId: 42, matchId: 7 },
      });

      expect(result).toBe(250n);
      expect(mockTx.insert).toHaveBeenCalledWith(walletTransactions);
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: 'credit',
          amount: 50n,
          balanceAfter: 250n,
          reason: 'bet_payout',
          metadata: { betId: 42, matchId: 7 },
        }),
      );
    });

    it('does not include a balance comparison in the UPDATE WHERE clause (credit cannot go negative)', async () => {
      const mockTx = buildMockTx([{ balance: 250n }]);

      await creditBalance(mockTx, 1, 50n, { reason: 'bet_payout' });

      // The WHERE for the balance UPDATE must only guard on the user id — no
      // balance comparison (a credit can never make the balance negative).
      const whereCall = mockTx.where.mock.calls[0]?.[0];
      expect(whereCall).toBeDefined();
      const columns = referencedColumnNames(whereCall);
      expect(columns).not.toContain('balance');
      expect(columns).toContain('id');
    });
  });
});
