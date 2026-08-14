/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { deductHonNgoc, convertDuplicate, levelUp, evolveHero, TIER_VALUE } from '../soulgemService.js';
import { userHeroes } from '../../../db/schema/userHeroes.js';
import { userHeroSoulgems } from '../../../db/schema/userHeroSoulgems.js';
import { userSanguoState } from '../../../db/schema/userSanguoState.js';
import { userSanguoItems } from '../../../db/schema/userSanguoItems.js';
import { soulgemTransactions } from '../../../db/schema/soulgemTransactions.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// ── fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 42;

const COPY_T0 = {
  id: 11,
  userId: USER_ID,
  heroId: 5,
  level: 1,
  tier: 0,
  ivStr: 5, ivAgi: 5, ivInt: 5, ivMov: 5, ivLea: 5, ivCha: 5,
  hpCurrent: 100,
  capturedAt: new Date('2026-08-01T00:00:00Z'),
  skillNormalId: null,
  skillSpecialId: null,
};
const COPY_T1 = { ...COPY_T0, id: 13, tier: 1, capturedAt: new Date('2026-08-02T00:00:00Z') };

const STATE = { id: 1, userId: USER_ID, activeHeroId: 77, starterViews: 0 };

const BOOSTER_ITEM = { id: 2, code: 'booster_x2', saleState: 'sold' };

/**
 * Fake drizzle tx — mirrors battleCheckInService.test.ts's makeTx: select
 * chains resolve the NEXT queued read result in call order; update/delete
 * terminals resolve undefined; update().set().where() terminals ALSO expose
 * .returning() (the deductHonNgoc WHERE-guard reads the new amount there);
 * insert().values() is a thenable carrying .onConflictDoUpdate() + .returning().
 */
function makeTx(readResults: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => readResults[i++] ?? [];
  const terminal = () => {
    const thenable: any = Promise.resolve(undefined);
    thenable.returning = vi.fn(() => Promise.resolve(next()));
    thenable.onConflictDoUpdate = vi.fn(() => thenable);
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
  const deleteWhere = vi.fn(() => terminal());
  const del = vi.fn((_t: any) => ({ where: deleteWhere }));
  const insertValues = vi.fn((_v: any) => terminal());
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
  return { tx: { select, update, delete: del, insert }, chain, update, updateSet, insert, insertValues };
}

function runInTx<T>(readResults: unknown[][], fn: (tx: any) => Promise<T>) {
  const { tx, ...mocks } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const promise = fn(tx);
  return { promise, tx, ...mocks };
}

// ── deductHonNgoc (the WHERE-guard primitive) ───────────────────────────────

describe('deductHonNgoc — WHERE-guard pool deduction (Pitfall 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deducts within the balance and returns the new pool amount', async () => {
    const { promise, tx } = runInTx([[{ amount: 5 }]], (tx) =>
      deductHonNgoc(tx, USER_ID, 5, 10));
    await expect(promise).resolves.toBe(5);
    expect(tx.update).toHaveBeenCalledWith(userHeroSoulgems);
  });

  it('a deduction PAST the balance matches zero rows → INSUFFICIENT_HON_NGOC (the whole tx rolls back)', async () => {
    const { promise } = runInTx([[]], (tx) =>
      deductHonNgoc(tx, USER_ID, 5, 100));
    await expect(promise).rejects.toThrow('INSUFFICIENT_HON_NGOC');
  });
});

// ── convertDuplicate (TQC-14 / D-03 / D-12 / Pitfalls 2-3) ──────────────────

describe('convertDuplicate — dupe → per-hero hồn ngọc (D-03/D-04/D-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C1: t0 dupe (no booster, no pool row) yields 1, upserts the pool, writes the ledger, deletes the copy', async () => {
    const { promise, tx, insert, insertValues } = runInTx(
      [
        [COPY_T0],                        // 1. copy lock
        [COPY_T0, COPY_T1],               // 2. total collection count (2 > 1)
        [STATE],                          // 3. state (not the companion)
        [],                               // 4. legion slots — NOT placed
        [BOOSTER_ITEM],                   // 5. booster catalog row
        [],                               // 6. owned booster — NOT owned
        [],                               // 7. pool row — missing → upsert
      ],
      () => convertDuplicate(USER_ID, 11),
    );
    await expect(promise).resolves.toEqual({ yield: 1, boosterUsed: false });
    expect(TIER_VALUE[0]).toBe(1);

    // The consumed copy is DELETED (userHeroes).
    expect(tx.delete).toHaveBeenCalledWith(userHeroes);

    // The pool upsert adds the yield.
    expect(insert).toHaveBeenCalledWith(userHeroSoulgems);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, heroId: 5, amount: 1 }),
    );

    // The ledger row mirrors the yield with the post-mutation balance.
    expect(insert).toHaveBeenCalledWith(soulgemTransactions);
    const ledger = insertValues.mock.calls.find(
      (c: any) => c[0]?.type === 'convert',
    )?.[0];
    expect(ledger).toMatchObject({
      userId: USER_ID,
      heroId: 5,
      type: 'convert',
      amount: 1,
      balanceAfter: 1,
    });
  });

  it('C2: booster ×2 atomic — owned booster doubles the yield AND is consumed in the SAME tx (Pitfall 2 anti-clone)', async () => {
    const { promise, tx } = runInTx(
      [
        [COPY_T1],                        // t1 dupe (TIER_VALUE[1] = 5)
        [COPY_T0, COPY_T1],               // total collection count (2 > 1)
        [STATE],
        [],                               // legion slots — NOT placed
        [BOOSTER_ITEM],
        [{ id: 30, quantity: 1 }],        // owned booster — 1 charge
        [{ id: 9, amount: 0 }],           // existing pool row
      ],
      () => convertDuplicate(USER_ID, 13),
    );

    await expect(promise).resolves.toEqual({ yield: 10, boosterUsed: true }); // 5 × 2
    // quantity == 1 → the booster row is DELETED at 0 (quantity_positive check).
    expect(tx.delete).toHaveBeenCalledWith(userSanguoItems);
    // The pool was UPDATED (+= yield), not inserted.
    expect(tx.update).toHaveBeenCalledWith(userHeroSoulgems);
  });

  it('C3: booster with quantity 3 decrements to 2 (never cloned, never zeroed early)', async () => {
    const { promise, tx } = runInTx(
      [
        [COPY_T0],
        [COPY_T0, COPY_T1],               // total collection count (2 > 1)
        [STATE],
        [],                               // legion slots — NOT placed
        [BOOSTER_ITEM],
        [{ id: 30, quantity: 3 }],
        [{ id: 9, amount: 0 }],
      ],
      () => convertDuplicate(USER_ID, 11),
    );

    await expect(promise).resolves.toEqual({ yield: 2, boosterUsed: true });
    expect(tx.delete).not.toHaveBeenCalledWith(userSanguoItems);
    expect(tx.update).toHaveBeenCalledWith(userSanguoItems);
  });

  it('C4: a user with exactly 1 hero TOTAL → COLLECTION_EMPTY, no mutation (user amendment — converting must leave >= 1 hero of ANY kind)', async () => {
    const { promise, tx } = runInTx(
      [
        [COPY_T0],
        [COPY_T0],                        // total collection count = 1 (<= 1)
      ],
      () => convertDuplicate(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('COLLECTION_EMPTY');
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('C5: a forged copy id (not owned) → NOT_OWNED, no mutation (ownership re-gate)', async () => {
    const { promise, tx } = runInTx([[]], () => convertDuplicate(USER_ID, 999));
    await expect(promise).rejects.toThrow('NOT_OWNED');
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('C6: converting the ACTIVE companion → ACTIVE_COMPANION, no mutation (user amendment — hard block, NO auto-switch)', async () => {
    const { promise, tx } = runInTx(
      [
        [COPY_T0],                        // the ACTIVE companion (id 11)
        [COPY_T0, COPY_T1],               // total collection count (2 > 1)
        [{ ...STATE, activeHeroId: 11 }], // state locked; 11 IS the companion
      ],
      () => convertDuplicate(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('ACTIVE_COMPANION');
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    // The old auto-switch behavior is REMOVED — no state write, ever.
    expect(tx.update).not.toHaveBeenCalledWith(userSanguoState);
  });

  it('C7: a copy referenced in user_legion_slots → IN_FORMATION, no mutation (user amendment — placed copies are never convertible)', async () => {
    const { promise, tx } = runInTx(
      [
        [COPY_T0],
        [COPY_T0, COPY_T1],               // total collection count (2 > 1)
        [STATE],                          // not the companion
        [{ id: 99 }],                     // legion slot references copy 11
      ],
      () => convertDuplicate(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('IN_FORMATION');
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

// ── levelUp (D-05 / D-01 — explicit hồn ngọc leveling, max 100) ─────────────

describe('levelUp — explicit hồn ngọc leveling (D-05/D-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('L1 copy with a pool of 10 levels to L2 and charges LEVEL_COST(1)=1 (pool 9)', async () => {
    const { promise, tx, updateSet, insertValues } = runInTx(
      [
        [{ ...COPY_T0, level: 1 }],   // copy lock (L1)
        [{ amount: 9 }],              // deduct returning (10 - 1)
      ],
      () => levelUp(USER_ID, 11),
    );

    await expect(promise).resolves.toEqual({ newLevel: 2, cost: 1 });
    // The WHERE-guard deduction ran against the pool…
    expect(tx.update).toHaveBeenCalledWith(userHeroSoulgems);
    // …and the copy's level column was written in the SAME tx.
    expect(tx.update).toHaveBeenCalledWith(userHeroes);
    const levelSet = updateSet.mock.calls.find((c: any) => c[0]?.level !== undefined)?.[0];
    expect(levelSet).toMatchObject({ level: 2 });

    // The ledger row records the −cost spend with the post-deduction balance.
    expect(insert).toHaveBeenCalledWith(soulgemTransactions);
    const ledger = insertValues.mock.calls.find(
      (c: any) => c[0]?.type === 'level',
    )?.[0];
    expect(ledger).toMatchObject({
      userId: USER_ID,
      heroId: 5,
      type: 'level',
      amount: -1,
      balanceAfter: 9,
    });
  });

  it('pool EXACTLY equal to the cost succeeds (pool 0 after)', async () => {
    const { promise } = runInTx(
      [
        [{ ...COPY_T0, level: 1 }],
        [{ amount: 0 }],              // pool 1 − cost 1 = 0
      ],
      () => levelUp(USER_ID, 11),
    );
    await expect(promise).resolves.toEqual({ newLevel: 2, cost: 1 });
  });

  it('pool 1 short → INSUFFICIENT_HON_NGOC with NO level change (whole tx rolls back)', async () => {
    const { promise, tx } = runInTx(
      [
        [{ ...COPY_T0, level: 1 }],
        [],                           // deduct matches zero rows
      ],
      () => levelUp(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('INSUFFICIENT_HON_NGOC');
    // The level write NEVER ran — no userHeroes update beyond the copy lock read.
    expect(tx.update).not.toHaveBeenCalledWith(userHeroes);
    expect(tx.update).not.toHaveBeenCalledWith(userSanguoState);
  });

  it('a L100 copy → LEVEL_MAX error, NO deduction', async () => {
    const { promise, tx } = runInTx(
      [
        [{ ...COPY_T0, level: 100 }], // already maxed
      ],
      () => levelUp(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('LEVEL_MAX');
    expect(tx.update).not.toHaveBeenCalled();
  });
});

// ── evolveHero (D-06/D-07/D-09 — L20→t1 / L50→t2, t3 gated) ─────────────────

describe('evolveHero — level-gated tier evolution (D-06/D-07/D-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a L20 t0 copy with 20+ hồn ngọc evolves to t1 and charges 20', async () => {
    const { promise, tx, updateSet, insertValues } = runInTx(
      [
        [{ ...COPY_T0, level: 20 }],  // t0, exactly at the L20 gate
        [{ amount: 0 }],              // deduct returning (20 − 20)
      ],
      () => evolveHero(USER_ID, 11),
    );

    await expect(promise).resolves.toEqual({ newTier: 1, cost: 20 });
    expect(tx.update).toHaveBeenCalledWith(userHeroSoulgems); // the WHERE-guard charge
    expect(tx.update).toHaveBeenCalledWith(userHeroes);       // tier write in the SAME tx
    const tierSet = updateSet.mock.calls.find((c: any) => c[0]?.tier !== undefined)?.[0];
    expect(tierSet).toMatchObject({ tier: 1 });

    const ledger = insertValues.mock.calls.find(
      (c: any) => c[0]?.type === 'evolve',
    )?.[0];
    expect(ledger).toMatchObject({
      userId: USER_ID,
      heroId: 5,
      type: 'evolve',
      amount: -20,
      balanceAfter: 0,
    });
  });

  it('a L19 t0 copy → LEVEL_REQUIRED error, no mutation', async () => {
    const { promise, tx } = runInTx(
      [
        [{ ...COPY_T0, level: 19 }],  // one short of the L20 gate
      ],
      () => evolveHero(USER_ID, 11),
    );

    await expect(promise).rejects.toThrow('LEVEL_REQUIRED');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('a L50 t1 copy evolves to t2 for 50 (tier writes to user_heroes.tier)', async () => {
    const { promise, updateSet } = runInTx(
      [
        [{ ...COPY_T1, level: 50 }],  // t1, at the L50 gate
        [{ amount: 0 }],              // deduct returning (50 − 50)
      ],
      () => evolveHero(USER_ID, 13),
    );

    await expect(promise).resolves.toEqual({ newTier: 2, cost: 50 });
    const tierSet = updateSet.mock.calls.find((c: any) => c[0]?.tier !== undefined)?.[0];
    expect(tierSet).toMatchObject({ tier: 2 });
  });

  it('a t2 copy pressing evolve → T3_GATED error (D-09 — L80+ AND event item, unreachable in v3)', async () => {
    const { promise, tx } = runInTx(
      [
        [{ ...COPY_T1, tier: 2, level: 80 }],
      ],
      () => evolveHero(USER_ID, 13),
    );

    await expect(promise).rejects.toThrow('T3_GATED');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
