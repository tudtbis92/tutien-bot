/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { listBag, useHeal } from '../bagService.js';
import { userHeroes } from '../../../db/schema/userHeroes.js';
import { userSanguoItems } from '../../../db/schema/userSanguoItems.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// ── fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 42;

const INV_ROW = { id: 30, userId: USER_ID, itemId: 3, quantity: 1, itemCode: 'heal_pill' };
const INV_ROW_Q3 = { ...INV_ROW, id: 31, quantity: 3 };

const STATE = { id: 1, userId: USER_ID, activeHeroId: 11, starterViews: 0 };
const STATE_NO_COMPANION = { id: 1, userId: USER_ID, activeHeroId: null, starterViews: 0 };

const TARGET_FAINTED = { id: 11, userId: USER_ID, heroId: 5, hpCurrent: 0 };
const TARGET_DAMAGED = { id: 11, userId: USER_ID, heroId: 5, hpCurrent: 40 };
const TARGET_FULL = { id: 11, userId: USER_ID, heroId: 5, hpCurrent: 100 };

const CATALOG_HERO = { id: 5, hp: 100 };

const BAG_ROWS = [
  { itemCode: 'heal_pill', nameVi: 'Đan Trị Thương', nameEn: 'Healing Pill', nameZh: null, emoji: '💊', quantity: 1 },
  { itemCode: 'booster_x2', nameVi: 'Linh Đan Tăng Tu Vi', nameEn: 'Cultivation Booster', nameZh: null, emoji: '✨', quantity: 2 },
];

/**
 * Fake drizzle tx — mirrors shopService.test.ts's makeTx: select chains
 * resolve the NEXT queued read result in call order; update/delete terminals
 * resolve undefined; insert().values() is a thenable.
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
  const deleteWhere = vi.fn(() => terminal());
  const del = vi.fn((_t: any) => ({ where: deleteWhere }));
  const insertValues = vi.fn((_v: any) => terminal());
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
  return { tx: { select, update, delete: del, insert }, chain, update, updateSet, delete: del, deleteWhere, insert, insertValues };
}

function runInTx<T>(readResults: unknown[][], fn: (tx: any) => Promise<T>) {
  const { tx, ...mocks } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const promise = fn(tx);
  return { promise, tx, ...mocks };
}

// ── listBag (D-13) ──────────────────────────────────────────────────────────

describe('listBag — owned items ordered by item id asc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B1: returns the owned rows ordered by item id asc with quantity', async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve(BAG_ROWS)),
          })),
        })),
      })),
    });

    await expect(listBag(USER_ID)).resolves.toEqual(BAG_ROWS);
    // The join target is the item catalog (id order = catalog order).
    expect(db.select).toHaveBeenCalled();
  });

  it('B2: an empty bag → empty result (the command renders bag.empty)', async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    });

    await expect(listBag(USER_ID)).resolves.toEqual([]);
  });
});

// ── useHeal (D-13 / D-04 soft-lock recovery) ────────────────────────────────

describe('useHeal — heal restores to full base HP, item consumed in the SAME tx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('H1: a FAINTED active companion (hp_current 0) heals to base HP; quantity 1 → inventory row DELETED at 0', async () => {
    const { promise, tx, updateSet, delete: del } = runInTx(
      [
        [INV_ROW],                // 1. inventory FOR UPDATE lock (join by code)
        [STATE],                  // 2. active companion = 11 (no explicit target)
        [TARGET_FAINTED],         // 3. the copy FOR UPDATE lock
        [CATALOG_HERO],           // 4. base hp from the catalog
      ],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).resolves.toEqual({ healedHeroId: 11, hpAfter: 100 });
    // The HP write lands on the copy (user_heroes).
    const hpSet = updateSet.mock.calls.find((c: any) => c[0]?.hpCurrent !== undefined)?.[0];
    expect(hpSet).toMatchObject({ hpCurrent: 100 });
    expect(tx.update).toHaveBeenCalledWith(userHeroes);
    // quantity == 1 → the inventory row is DELETED (quantity_positive check).
    expect(del).toHaveBeenCalledWith(userSanguoItems);
  });

  it('H2: a damaged copy heals FULLY to base HP (hp_current 40 → 100)', async () => {
    const { promise, updateSet } = runInTx(
      [
        [INV_ROW_Q3],
        [STATE],
        [TARGET_DAMAGED],
        [CATALOG_HERO],
      ],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).resolves.toEqual({ healedHeroId: 11, hpAfter: 100 });
    const hpSet = updateSet.mock.calls.find((c: any) => c[0]?.hpCurrent !== undefined)?.[0];
    expect(hpSet).toMatchObject({ hpCurrent: 100 });
  });

  it('H3: a FULL-HP copy → NO_TARGET, item NOT consumed (no update, no delete — whole tx rolls back)', async () => {
    const { promise, tx, delete: del } = runInTx(
      [
        [INV_ROW],
        [STATE],
        [TARGET_FULL],            // hp_current 100 >= base 100
        [CATALOG_HERO],
      ],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).rejects.toThrow('NO_TARGET');
    // The HP write never ran; the item was NOT consumed.
    expect(tx.update).not.toHaveBeenCalledWith(userHeroes);
    expect(del).not.toHaveBeenCalled();
  });

  it('H4: quantity 3 → DECREMENTS to 2 (never zeroed early, never cloned)', async () => {
    const { promise, tx, updateSet, delete: del } = runInTx(
      [
        [INV_ROW_Q3],
        [STATE],
        [TARGET_DAMAGED],
        [CATALOG_HERO],
      ],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).resolves.toEqual({ healedHeroId: 11, hpAfter: 100 });
    const qtySet = updateSet.mock.calls.find((c: any) => c[0]?.quantity !== undefined)?.[0];
    expect(qtySet).toMatchObject({ quantity: 2 });
    expect(tx.update).toHaveBeenCalledWith(userSanguoItems);
    expect(del).not.toHaveBeenCalled();
  });

  it('H5: item NOT owned (no inventory row) → ITEM_NOT_OWNED, no mutation', async () => {
    const { promise, tx } = runInTx(
      [[]],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).rejects.toThrow('ITEM_NOT_OWNED');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('H6: no active companion and no explicit target → NO_TARGET (bag.no_target)', async () => {
    const { promise, tx } = runInTx(
      [
        [INV_ROW],
        [STATE_NO_COMPANION],     // activeHeroId null
      ],
      () => useHeal(USER_ID, 'heal_pill', null),
    );

    await expect(promise).rejects.toThrow('NO_TARGET');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('H7: an explicit targetUserHeroId heals THAT copy (ownership re-gate — a forged id → NO_TARGET)', async () => {
    const { promise } = runInTx(
      [
        [INV_ROW],
        [TARGET_DAMAGED],         // the explicit target copy
        [CATALOG_HERO],
      ],
      () => useHeal(USER_ID, 'heal_pill', 11),
    );

    await expect(promise).resolves.toEqual({ healedHeroId: 11, hpAfter: 100 });

    const { promise: forged } = runInTx(
      [
        [INV_ROW],
        [],                       // the forged copy id matches nothing
      ],
      () => useHeal(USER_ID, 'heal_pill', 999),
    );
    await expect(forged).rejects.toThrow('NO_TARGET');
  });
});
