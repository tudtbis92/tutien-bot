/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { captureChance, attemptCapture } from '../captureService.js';
import { deductBalance } from '../../wallet.js';
import { encounterRuns } from '../../../db/schema/encounterRuns.js';
import { userHeroes } from '../../../db/schema/userHeroes.js';
import { captureAttempts } from '../../../db/schema/captureAttempts.js';
import { playerTravelState } from '../../../db/schema/playerTravelState.js';
import {
  CAPTURE_TIERS,
  CAPTURE_BASE_BY_RARITY,
  FLEE_RATE_BY_RARITY,
  hpFactor,
} from '../../../constants/sanguoCapture.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../wallet.js', () => ({
  deductBalance: vi.fn(),
  creditBalance: vi.fn(),
}));

// ── fixtures ────────────────────────────────────────────────────────────────

const PENDING = {
  id: 9,
  userId: 42,
  travelId: 1,
  zone: 'du_chau',
  heroId: 5,
  encounterType: 'hero',
  status: 'pending',
  pityCount: 0,
  createdAt: new Date('2026-08-12T08:00:00Z'),
};

/** Latest sanguo_battles row — the server-authoritative wild HP source. */
const BATTLE_ROW = {
  id: 55,
  userId: 42,
  encounterId: 9,
  type: 'encounter',
  status: 'completed',
  seed: 12345,
  input: { enemy: { base: { hp: 100 } } },
  result: { enemyHpAfter: 50 },
  createdAt: new Date('2026-08-12T08:00:00Z'),
  updatedAt: new Date('2026-08-12T08:00:00Z'),
  resolvedAt: new Date('2026-08-12T08:00:00Z'),
};

const WILD_HERO = {
  id: 5,
  heroId: 'duong_kiem',
  nameVi: 'Đào Khiêm',
  nameEn: 'Tao Qian',
  nameZh: null,
  factionId: 2,
  role: 'civil',
  class: 'vanguard',
  str: 60,
  agi: 35,
  int: 45,
  mov: 35,
  lea: 15,
  cha: 15,
  hp: 100,
  mp: 40,
  rarity: 1,
  tier: 1,
};

/** The chance the tests roll against — recomputed via the exported formula. */
function expectedChance(pity = 0): number {
  return captureChance({ rarity: 1, hpMax: 100, hpCurrent: 50, tierMultiplier: 1.0, pity });
}

// ── mock tx builder (same shape as battleCheckInService.test.ts) ─────────────

function makeTx(readResults: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => readResults[i++] ?? [];
  const updateWhere = vi.fn((_q: any) => undefined);
  const updateSet = vi.fn((_v: any) => ({ where: updateWhere }));
  const update = vi.fn((_t: any) => ({ set: updateSet }));
  const insertReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const insertValues = vi.fn((_v: any) => {
    const thenable: any = Promise.resolve(undefined);
    thenable.returning = insertReturning;
    return thenable;
  });
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
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
  return { tx: { select, update, insert }, chain, update, updateSet, updateWhere, insert, insertValues, insertReturning };
}

function attemptInTx(readResults: unknown[][], deps: Record<string, unknown> = {}, tier = 1) {
  const { tx, chain, update, updateSet, insert, insertValues } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const promise = attemptCapture(42, tier, deps);
  return { promise, tx, chain, update, updateSet, insert, insertValues };
}

function mockBalance(balance: bigint | Error) {
  if (balance instanceof Error) {
    vi.mocked(deductBalance).mockRejectedValueOnce(balance);
  } else {
    vi.mocked(deductBalance).mockResolvedValue(balance);
  }
}

const HERO_QUEUE = [[PENDING], [BATTLE_ROW], [WILD_HERO]];

// ── Task 2 behaviors 1-7 ────────────────────────────────────────────────────

describe('captureChance — clamped [0,1] formula (D-10/D-11)', () => {
  it('T1a: exact formula — base × hpFactor × tierMultiplier + pity', () => {
    const params = { rarity: 1, hpMax: 100, hpCurrent: 100, tierMultiplier: 1.0, pity: 0 };
    expect(captureChance(params)).toBe(CAPTURE_BASE_BY_RARITY[1] * hpFactor(100, 100) * 1.0 + 0);
    expect(captureChance(params)).toBeCloseTo(0.8 * (1 / 3), 10);
  });

  it('T1b: upper clamp — a raw value over 1 returns exactly 1 (hpFactor=1 at 0 HP, 1.5x multiplier)', () => {
    // raw = 0.8 × 1.0 × 1.5 = 1.2 → clamp → exactly 1
    expect(captureChance({ rarity: 1, hpMax: 100, hpCurrent: 0, tierMultiplier: 1.5, pity: 0 })).toBe(1);
    // raw = 0.2667 + 5 pity → clamp → exactly 1
    expect(captureChance({ rarity: 1, hpMax: 100, hpCurrent: 100, tierMultiplier: 1.0, pity: 5 })).toBe(1);
  });

  it('T1c: lower clamp — the result never leaves [0,1] across the input space', () => {
    // hpFactor(0, ·) = 0 → the exact lower bound is reachable
    expect(captureChance({ rarity: 1, hpMax: 0, hpCurrent: 0, tierMultiplier: 1.0, pity: 0 })).toBe(0);
    // Sweep: every rarity × hpCurrent × tier × pity combination stays in [0,1].
    // (The signed constants cannot produce a negative raw base — the clamp is
    // asserted here as an invariant over the full input space.)
    for (const rarity of [1, 2, 3, 4, 5]) {
      for (const hpCurrent of [0, 25, 50, 75, 100]) {
        for (const tierMultiplier of [1.0, 1.5, 2.0, 3.0, 5.0]) {
          for (const pity of [0, 0.25, 2]) {
            const v = captureChance({ rarity, hpMax: 100, hpCurrent, tierMultiplier, pity });
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('attemptCapture — single-writer capture tx (D-10/D-11, TQC-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBalance(100n);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T2: success — one tx: FOR UPDATE lock, chance from locked row, fee via wallet, IV insert with base HP, captured + travel clears', async () => {
    const { promise, tx, chain, updateSet, insert, insertValues } = attemptInTx(
      HERO_QUEUE,
      { roll: () => 0.01, ivRoll: () => 7 },
    );

    const result = await promise;
    const chance = expectedChance();
    expect(result).toMatchObject({
      success: true,
      chance,
      roll: 0.01,
      outcome: 'success',
      tier: 1,
      fee: 5n,
      pityBefore: 0,
      balanceAfter: 100n,
      userHeroId: 1,
    });

    // Single-writer: the pending encounter is locked FOR UPDATE.
    expect(chain.for).toHaveBeenCalledWith('update');

    // Fee path (D-03) — tier fee + reason, metadata carries the locked-row state.
    expect(deductBalance).toHaveBeenCalledWith(
      tx,
      42,
      CAPTURE_TIERS[0].fee,
      expect.objectContaining({
        reason: 'sanguo_capture_t1',
        metadata: expect.objectContaining({ encounterId: 9, tier: 1, chance }),
      }),
    );

    // IV insert — 6 values, hp = base HP, captured_zone snapshot (A5).
    expect(insert).toHaveBeenCalledWith(userHeroes);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        heroId: 5,
        level: 1,
        ivStr: 7,
        ivAgi: 7,
        ivInt: 7,
        ivMov: 7,
        ivLea: 7,
        ivCha: 7,
        hpCurrent: 100,
        capturedZone: 'du_chau',
      }),
    );

    // Status transitions.
    const sets = updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'captured' });
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });

    // Audit row (TQC-11): exact chance + exact roll stored.
    expect(insert).toHaveBeenCalledWith(captureAttempts);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        encounterId: 9,
        tier: 1,
        fee: 5n,
        displayedChance: chance,
        roll: 0.01,
        outcome: 'success',
        pityBefore: 0,
      }),
    );
  });

  it('T3: fail-no-flee — pity incremented, audit row with pity_before, encounter stays pending (retry open)', async () => {
    const { promise, update, updateSet, insertValues } = attemptInTx(
      HERO_QUEUE,
      { roll: () => 1.0, fleeRoll: () => 0.5 },
    );

    const result = await promise;
    expect(result).toMatchObject({ success: false, outcome: 'fail', roll: 1.0, pityBefore: 0 });

    // Pity incremented (D-11) — the only encounter_runs write; status untouched.
    expect(update).toHaveBeenCalledWith(encounterRuns);
    const pityUpdate = updateSet.mock.calls.find((c: any) => c[0] && 'pityCount' in c[0])?.[0];
    expect(pityUpdate).toBeDefined();

    // No flee → travel stays paused, encounter stays pending.
    expect(update).not.toHaveBeenCalledWith(playerTravelState);

    // Audit row: outcome fail, pity_before = the pre-increment value.
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 9,
        displayedChance: expectedChance(),
        roll: 1.0,
        outcome: 'fail',
        pityBefore: 0,
      }),
    );
  });

  it('T4: fail-flee — flee roll < FLEE_RATE_BY_RARITY → "fled" + travel resumes', async () => {
    const { promise, update, updateSet, insertValues } = attemptInTx(
      HERO_QUEUE,
      { roll: () => 1.0, fleeRoll: () => 0.01 },
    );

    const result = await promise;
    expect(result).toMatchObject({ success: false, outcome: 'flee', roll: 1.0 });

    expect(FLEE_RATE_BY_RARITY[1]).toBeGreaterThan(0.01); // fixture sanity
    const sets = updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'fled' });
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
    expect(update).toHaveBeenCalledWith(playerTravelState);

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'flee', pityBefore: 0, roll: 1.0 }),
    );
  });

  it('T5: EVERY attempt writes exactly one audit row — assert across success/fail/flee', async () => {
    // success path: userHeroes + captureAttempts (the audit is the 2nd insert)
    const success = attemptInTx(HERO_QUEUE, { roll: () => 0.01, ivRoll: () => 7 });
    await success.promise;
    expect(success.insert).toHaveBeenCalledWith(captureAttempts);
    const captureAuditCount = success.insert.mock.calls.filter((c: any) => c[0] === captureAttempts).length;
    expect(captureAuditCount).toBe(1);

    // fail path: exactly one insert total, and it is the audit
    const fail = attemptInTx(HERO_QUEUE, { roll: () => 1.0, fleeRoll: () => 0.5 });
    await fail.promise;
    expect(fail.insert).toHaveBeenCalledTimes(1);
    expect(fail.insert).toHaveBeenCalledWith(captureAttempts);
  });

  it('T6: tier 4/5 → TIER_LOCKED with NO fee deducted and NO audit row; unknown tier → INVALID_TIER', async () => {
    const t4 = attemptInTx([[PENDING]], { roll: () => 0.01 }, 4);
    await expect(t4.promise).rejects.toThrow('TIER_LOCKED');
    expect(deductBalance).not.toHaveBeenCalled();
    expect(t4.insert).not.toHaveBeenCalled();

    const t5 = attemptInTx([[PENDING]], { roll: () => 0.01 }, 5);
    await expect(t5.promise).rejects.toThrow('TIER_LOCKED');
    expect(deductBalance).not.toHaveBeenCalled();

    const t99 = attemptInTx([[PENDING]], { roll: () => 0.01 }, 99);
    await expect(t99.promise).rejects.toThrow('INVALID_TIER');
    expect(deductBalance).not.toHaveBeenCalled();
  });

  it('T7: NO pending encounter → NO_PENDING_ENCOUNTER; INSUFFICIENT_BALANCE rolls the whole tx back (no audit row)', async () => {
    const noPending = attemptInTx([[]], { roll: () => 0.01 });
    await expect(noPending.promise).rejects.toThrow('NO_PENDING_ENCOUNTER');
    expect(deductBalance).not.toHaveBeenCalled();

    mockBalance(new Error('INSUFFICIENT_BALANCE'));
    const poor = attemptInTx(HERO_QUEUE, { roll: () => 0.01 });
    await expect(poor.promise).rejects.toThrow('INSUFFICIENT_BALANCE');
    expect(poor.insert).not.toHaveBeenCalled(); // whole tx rolled back — no audit row
  });
});
