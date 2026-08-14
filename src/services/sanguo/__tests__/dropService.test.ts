/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { rollBossDrop } from '../dropService.js';
import { userSanguoItems } from '../../../db/schema/userSanguoItems.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// â”€â”€ fixtures â€” the seeded drop pool (11-02, adopt-a5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// dropWeight arrives as a numeric STRING from drizzle (RESEARCH P2 / F8 â€”
// Number() conversion is the service's job).

const USER_ID = 42;

const DROP_ITEMS = [
  { id: 1, code: 'heal_pill', dropWeight: '70.00' },
  { id: 2, code: 'booster_x2', dropWeight: '25.00' },
  { id: 3, code: 'capture_tier4_key', dropWeight: '4.90' },
  { id: 4, code: 'capture_tier5_key', dropWeight: '0.10' },
];

const DROP_CODES = DROP_ITEMS.map((i) => i.code);

/**
 * Fake drizzle tx â€” mirrors the prior makeTx: select chains resolve the NEXT
 * queued read result; insert().values() is a thenable carrying
 * .onConflictDoUpdate().
 */
function makeTx(readResults: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => readResults[i++] ?? [];
  const terminal = () => {
    const thenable: any = Promise.resolve(undefined);
    thenable.returning = vi.fn(() => Promise.resolve(next()));
    thenable.onConflictDoUpdate = vi.fn(() => thenable);
    thenable.onConflictDoNothing = vi.fn(() => thenable);
    return thenable;
  };
  const chain: any = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    for: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    then: (onF: any, onR: any) => Promise.resolve(next()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(next()).catch(onR),
  };
  const from = vi.fn(() => chain);
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn(() => terminal());
  const updateSet = vi.fn((_v: any) => ({ where: updateWhere }));
  const update = vi.fn((_t: any) => ({ set: updateSet }));
  const insertValues = vi.fn((_v: any) => terminal());
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
  return { tx: { select, update, insert }, chain, update, insert, insertValues };
}

function runInTx<T>(readResults: unknown[][], fn: (tx: any) => Promise<T>) {
  const { tx, ...mocks } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const promise = fn(tx);
  return { promise, tx, ...mocks };
}

// â”€â”€ rollBossDrop (D-14 â€” guaranteed â‰¥1 item, crypto-weighted, half-open) â”€â”€â”€â”€

describe('rollBossDrop â€” guaranteed rarity-weighted item drop (D-14/D-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('D1: boundary rolls land on the checkpoint-confirmed codes (half-open convention: 0.0â†’heal, 0.70â†’booster, 0.95â†’key4, 0.999â†’key5)', async () => {
    const cases: [number, string][] = [
      [0.0, 'heal_pill'],
      [0.70, 'booster_x2'],
      [0.95, 'capture_tier4_key'],
      [0.999, 'capture_tier5_key'],
    ];
    for (const [rngValue, expectedCode] of cases) {
      const { promise, tx, insert, insertValues } = runInTx([DROP_ITEMS],
        () => rollBossDrop(USER_ID, () => rngValue),
      );
      await expect(promise).resolves.toEqual({ itemCode: expectedCode, quantity: 1 });

      // The drop grants inventory â€” the ONLY payout surface (items, never money).
      expect(insert).toHaveBeenCalledWith(userSanguoItems);
      const inv = insertValues.mock.calls.find((c: any) => c[0]?.itemId === 1)?.[0]
        ?? insertValues.mock.calls.find((c: any) => c[0]?.itemId === 2)?.[0]
        ?? insertValues.mock.calls.find((c: any) => c[0]?.itemId === 3)?.[0]
        ?? insertValues.mock.calls.find((c: any) => c[0]?.itemId === 4)?.[0];
      expect(inv).toMatchObject({ userId: USER_ID, quantity: 1 });
      expect(tx.update).not.toHaveBeenCalled();
    }
  });

  it('D2: the cumulative walk NEVER returns undefined (weights sum to 100 from the DB) and every roll resolves to a catalog code', async () => {
    // Sweep the full [0,1) range in coarse steps + the exact boundaries.
    const rolls = [0.0, 0.1, 0.3, 0.5, 0.699999, 0.70, 0.8, 0.949999, 0.95, 0.98, 0.998999, 0.999, 0.999999];
    for (const rngValue of rolls) {
      const { promise } = runInTx([DROP_ITEMS], () => rollBossDrop(USER_ID, () => rngValue));
      const result = await promise;
      expect(result.itemCode).toBeDefined();
      expect(DROP_CODES).toContain(result.itemCode);
      expect(result.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('D3: an empty drop pool (no rows with drop_weight > 0) â†’ EMPTY_DROP_POOL, no inventory grant', async () => {
    const { promise, insert } = runInTx(
      [[]],
      () => rollBossDrop(USER_ID, () => 0.5),
    );
    await expect(promise).rejects.toThrow('EMPTY_DROP_POOL');
    expect(insert).not.toHaveBeenCalled();
  });
});
