/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { buyItem, buyFormation } from '../shopService.js';
import { users } from '../../../db/schema/users.js';
import { userSanguoItems } from '../../../db/schema/userSanguoItems.js';
import { userFormations } from '../../../db/schema/formations.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// ── fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 42;

const ITEM_HEAL = {
  id: 3,
  code: 'heal_pill',
  nameVi: 'Đan Trị Thương',
  nameEn: 'Healing Pill',
  nameZh: null,
  itemType: 'support',
  rarity: 1,
  priceLinh: 50n,
  priceEvent: 0n,
  saleState: 'sold',
  dropWeight: '70',
  emoji: '💊',
  descriptionVi: null,
  createdAt: new Date('2026-08-14T00:00:00Z'),
};
const ITEM_KEY = {
  ...ITEM_HEAL,
  id: 4,
  code: 'capture_key',
  nameVi: 'Chìa Khóa Bắt Giữ',
  nameEn: 'Capture Key',
  priceLinh: 0n,
  saleState: 'locked', // D-15: shown, never sold for Linh thạch
  dropWeight: '0',
};

const FORMATION_THIEN_CO = {
  id: 2,
  code: 'thien_co',
  nameVi: 'Trận Thiên Cơ',
  nameEn: 'Heavenly Mechanism Formation',
  nameZh: null,
  slotCount: 12,
  basePrice: 200n, // adopt-a5 200/300/500 set
  emoji: '⚔️',
};

/**
 * Fake drizzle tx — mirrors soulgemService.test.ts's makeTx: select chains
 * resolve the NEXT queued read result in call order; update terminals expose
 * .returning() (the wallet deductBalance WHERE-guard reads the new balance
 * there); insert().values() is a thenable carrying .onConflictDoUpdate(),
 * .onConflictDoNothing() + .returning() (the buyFormation TOCTOU close reads
 * the returned rowCount).
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

// ── buyItem (D-16 / T-11-04-01 / T-11-04-02) ────────────────────────────────

describe('buyItem — wallet-sink purchase, anti-tamper price, saleState gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('S1: buying heal_pill with sufficient balance → wallet WHERE-guard deduct (reason sanguo_shop_heal_pill) + inventory quantity 1 upsert, returns name/price', async () => {
    const { promise, tx, insert, insertValues } = runInTx(
      [
        [ITEM_HEAL],              // 1. item by code (price resolves server-side)
        [{ balance: 50n }],       // 2. wallet deductBalance returning (50 - 50)
      ],
      () => buyItem(USER_ID, 'heal_pill'),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({ itemCode: 'heal_pill', qty: 1, price: 50n }),
    );

    // The Linh thạch sink rode the wallet's WHERE-guarded UPDATE (users).
    expect(tx.update).toHaveBeenCalledWith(users);

    // The ledger row carries the 'sanguo_shop_' reason (SC1 reconcilability).
    const ledger = insertValues.mock.calls.find(
      (c: any) => c[0]?.reason === 'sanguo_shop_heal_pill',
    )?.[0];
    expect(ledger).toMatchObject({
      userId: USER_ID,
      type: 'deduct',
      amount: 50n,
      reason: 'sanguo_shop_heal_pill',
    });

    // The inventory row upserts quantity 1 (onConflictDoUpdate +1 pattern).
    expect(insert).toHaveBeenCalledWith(userSanguoItems);
    const inv = insertValues.mock.calls.find((c: any) => c[0]?.itemId === 3)?.[0];
    expect(inv).toMatchObject({ userId: USER_ID, itemId: 3, quantity: 1 });
  });

  it('S2: insufficient balance → INSUFFICIENT_BALANCE, NO inventory change (whole tx rolls back)', async () => {
    const { promise, tx, insert } = runInTx(
      [
        [ITEM_HEAL],
        [],                        // wallet WHERE-guard matches zero rows (balance < 50)
      ],
      () => buyItem(USER_ID, 'heal_pill'),
    );

    await expect(promise).rejects.toThrow('INSUFFICIENT_BALANCE');
    // The inventory upsert never ran.
    expect(insert).not.toHaveBeenCalledWith(userSanguoItems);
    expect(tx.update).toHaveBeenCalledWith(users); // the deduction attempt itself
  });

  it('S3: buying capture_key (saleState locked) → ITEM_NOT_FOR_SALE, NO deduction, NO inventory (D-15 one-way)', async () => {
    const { promise, tx } = runInTx(
      [[ITEM_KEY]],
      () => buyItem(USER_ID, 'capture_key'),
    );

    await expect(promise).rejects.toThrow('ITEM_NOT_FOR_SALE');
    // capture_key can NEVER be bought with Linh thạch — no wallet touch.
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

// ── buyFormation (D-21 / P0-1 TOCTOU close) ─────────────────────────────────

describe('buyFormation — wallet-sink formation purchase, ALREADY_OWNED guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('F1: buying a 200💎 formation → wallet deduct (reason sanguo_shop_formation_thien_co) + user_formations row', async () => {
    const { promise, tx, insert, insertValues } = runInTx(
      [
        [FORMATION_THIEN_CO],     // 1. formation by code
        [],                       // 2. owned check — NOT owned
        [{ balance: 200n }],      // 3. wallet deductBalance returning (200 - 200)
        [{ id: 55 }],             // 4. insert.onConflictDoNothing().returning() — the ownership row
      ],
      () => buyFormation(USER_ID, 'thien_co'),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({ formationCode: 'thien_co', price: 200n }),
    );

    expect(tx.update).toHaveBeenCalledWith(users);
    const ledger = insertValues.mock.calls.find(
      (c: any) => c[0]?.reason === 'sanguo_shop_formation_thien_co',
    )?.[0];
    expect(ledger).toMatchObject({
      userId: USER_ID,
      type: 'deduct',
      amount: 200n,
      reason: 'sanguo_shop_formation_thien_co',
    });

    // Ownership row inserted (user_formations).
    expect(insert).toHaveBeenCalledWith(userFormations);
    const own = insertValues.mock.calls.find((c: any) => c[0]?.formationId === 2)?.[0];
    expect(own).toMatchObject({ userId: USER_ID, formationId: 2 });
  });

  it('F2: already-owned formation → ALREADY_OWNED, no deduction, no duplicate ownership row', async () => {
    const { promise, tx, insert } = runInTx(
      [
        [FORMATION_THIEN_CO],
        [{ id: 9 }],              // owned check — already owned
      ],
      () => buyFormation(USER_ID, 'thien_co'),
    );

    await expect(promise).rejects.toThrow('ALREADY_OWNED');
    expect(tx.update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalledWith(userFormations);
  });

  it('F3: TOCTOU close — a concurrent buy slips past the pre-check, the unique-constraint insert returns zero rows → ALREADY_OWNED (P0-1 defense-in-depth)', async () => {
    const { promise, insert } = runInTx(
      [
        [FORMATION_THIEN_CO],
        [],                       // owned check — NOT owned (stale read)
        [{ balance: 200n }],      // wallet deduct ran…
        [],                       // …but the insert conflict → zero rows returned
      ],
      () => buyFormation(USER_ID, 'thien_co'),
    );

    await expect(promise).rejects.toThrow('ALREADY_OWNED');
    // The deduction happened but the whole tx rolls back — no ownership row.
    expect(insert).toHaveBeenCalledWith(userFormations);
  });
});
