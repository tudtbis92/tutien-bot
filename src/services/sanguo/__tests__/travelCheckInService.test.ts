/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../../../db/client.js';
import { checkInTravel } from '../travelCheckInService.js';
import { playerTravelState } from '../../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../../db/schema/encounterRuns.js';
import { redis } from '../../../cache/redis.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../cache/redis.js', () => ({
  redis: {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

/** Base traveling row — updatedAt is patched per-test for deterministic elapsed. */
const BASE_ROW = {
  id: 1,
  userId: 42,
  fromNodeId: 5,
  toNodeId: 7,
  departAt: new Date('2026-08-12T08:00:00Z'),
  travelSecondsRemaining: 900,
  encounterActive: false,
  status: 'traveling',
  createdAt: new Date('2026-08-12T08:00:00Z'),
  updatedAt: new Date(),
};

/** Row with updatedAt = now - updatedAgoMs (drives the elapsed computation). */
function rowUpdatedAgo(updatedAgoMs: number, overrides: Record<string, unknown> = {}): any {
  return { ...BASE_ROW, updatedAt: new Date(Date.now() - updatedAgoMs), ...overrides };
}

const EDGE = { id: 1, nodeAId: 5, nodeBId: 7, travelSeconds: 900 };

const PENDING_HERO = {
  id: 9,
  userId: 42,
  travelId: 1,
  zone: 'du_chau',
  heroId: 5,
  encounterType: 'hero',
  status: 'pending',
  createdAt: new Date(),
};

/**
 * Build a fake drizzle tx whose terminal methods (for / limit) resolve queued
 * results in call order. update().set().where() is a no-op chain.
 */
function makeTx(readResults: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => readResults[i++] ?? [];
  const updateWhere = vi.fn((_q: any) => undefined);
  const updateSet = vi.fn((_v: any) => ({ where: updateWhere }));
  const update = vi.fn((_t: any) => ({ set: updateSet }));
  const insertValues = vi.fn((_v: any) => undefined);
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
  const chain: any = {
    where: vi.fn(() => chain),
    for: vi.fn(() => Promise.resolve(next())),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(next())),
  };
  const from = vi.fn(() => chain);
  const select = vi.fn(() => ({ from }));
  return { tx: { select, update, insert }, chain, update, updateSet, updateWhere, insert, insertValues };
}

/** Stub-path mock for db.select() (the 09-01 stub reads outside a transaction). */
function mockDbSelect(results: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => results[i++] ?? [];
  const chain: any = {
    where: vi.fn(() => Promise.resolve(next())),
    limit: vi.fn(() => Promise.resolve(next())),
  };
  const from = vi.fn(() => chain);
  (db.select as any).mockReturnValue({ from });
}

function runCheckIn(
  readResults: unknown[][],
  rollMinute?: (ctx: any) => Promise<any>,
  spawnRoll?: { pickRng?: () => number; levelRng?: () => number; skillRng?: () => number },
) {
  mockDbSelect(readResults);
  const { tx, chain, update, updateSet, updateWhere, insert, insertValues } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const result = checkInTravel(42, rollMinute ? { rollMinute } : spawnRoll ? { spawnRoll } : undefined);
  return { result, chain, update, updateSet, updateWhere, insert, insertValues };
}

describe('checkInTravel — pull-based check-in engine (D-22/D-24/D-25/D-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1: no row or status=arrived → { mode: "start" } (command renders the destination menu)', async () => {
    let r = await runCheckIn([[]]).result;
    expect(r).toMatchObject({ mode: 'start' });

    r = await runCheckIn([[rowUpdatedAgo(0, { status: 'arrived' })]]).result;
    expect(r).toMatchObject({ mode: 'start' });
  });

  it('T2: encounterActive=true → encounterPending with the latest pending run, NO time counted (D-25/F2)', async () => {
    const row = rowUpdatedAgo(600_000, { encounterActive: true, travelSecondsRemaining: 300 });
    const { result, update: update1 } = runCheckIn([[row], [PENDING_HERO]]);

    await expect(result).resolves.toMatchObject({
      mode: 'encounterPending',
      encounter: { heroId: 5, zone: 'du_chau', boss: false },
      remaining: 300,
    });
    expect(update1).not.toHaveBeenCalled(); // no decrement while encounter-active

    // boss pending run → encounterType 'boss', hero_id NULL → boss: true
    const bossPending = { ...PENDING_HERO, heroId: null, encounterType: 'boss' };
    const { result: bossResult, update: update2 } = runCheckIn([[row], [bossPending]]);
    await expect(bossResult).resolves.toMatchObject({
      mode: 'encounterPending',
      encounter: { heroId: null, zone: 'du_chau', boss: true },
    });
    expect(update2).not.toHaveBeenCalled();
  });

  it('T2-edge: flag set but no pending run → { mode: "status" } without touching the row', async () => {
    const row = rowUpdatedAgo(600_000, { encounterActive: true, travelSecondsRemaining: 300 });
    const { result, update } = runCheckIn([[row], []]);

    await expect(result).resolves.toMatchObject({ mode: 'status', remaining: 300 });
    expect(update).not.toHaveBeenCalled();
  });

  it('T3: overdue journey (elapsed >= remaining) self-heals to arrived — remaining clamped to 0 (D-05)', async () => {
    const row = rowUpdatedAgo(400_000, { travelSecondsRemaining: 300 });
    const { result, update, updateSet } = runCheckIn([[row], [EDGE]]);

    await expect(result).resolves.toMatchObject({ mode: 'arrived' });
    expect(update).toHaveBeenCalledWith(playerTravelState);
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({
      status: 'arrived',
      travelSecondsRemaining: 0,
      updatedAt: expect.any(Date),
    });
  });

  it('T4: remaining hits 0 after failed rolls → arrived; NO rolls past arrival (D-28)', async () => {
    const row = rowUpdatedAgo(600_000, { travelSecondsRemaining: 600 }); // 10 counted minutes
    const rollMinute = vi.fn().mockResolvedValue({ hit: false });
    const { result, updateSet } = runCheckIn([[row], [EDGE]], rollMinute);

    await expect(result).resolves.toMatchObject({ mode: 'arrived' });
    // minutes 1..9 rolled, minute 10 hits the arrival boundary → exactly 9 rolls
    expect(rollMinute).toHaveBeenCalledTimes(9);
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({
      status: 'arrived',
      travelSecondsRemaining: 0,
    });
  });

  it('T5: a hit at minute k decrements k minutes, pins updatedAt, sets encounterActive, STOPS the loop (D-24/F4)', async () => {
    const row = rowUpdatedAgo(300_000, { travelSecondsRemaining: 900 }); // 5 counted minutes
    const rollMinute = vi
      .fn()
      .mockResolvedValueOnce({ hit: false })
      .mockResolvedValueOnce({ hit: false })
      .mockResolvedValueOnce({ hit: true, heroId: 5, zone: 'du_chau', boss: false });
    const { result, updateSet } = runCheckIn([[row], [EDGE]], rollMinute);

    await expect(result).resolves.toMatchObject({
      mode: 'encounter',
      remaining: 720, // 900 - 3·60 — the hit minute IS counted (F4)
      encounter: { heroId: 5, zone: 'du_chau', boss: false },
    });
    expect(rollMinute).toHaveBeenCalledTimes(3); // loop stops at the first hit
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({
      travelSecondsRemaining: 720,
      encounterActive: true,
    });
    // updatedAt pinned to the hit minute: row.updatedAt + k·60 (ack-pin model)
    const pinned = (updateSet.mock.calls[0]?.[0] as any).updatedAt as Date;
    expect(pinned.getTime()).toBe(row.updatedAt.getTime() + 3 * 60_000);
  });

  it('T6: no hits in the window → remaining decremented, updatedAt=now, { mode: "status" }', async () => {
    const row = rowUpdatedAgo(180_000, { travelSecondsRemaining: 900 }); // 3 counted minutes
    const rollMinute = vi.fn((_ctx: any) => Promise.resolve({ hit: false }));
    const { result, update, updateSet } = runCheckIn([[row], [EDGE]], rollMinute);

    await expect(result).resolves.toMatchObject({ mode: 'status', remaining: 720 });

    // roll context carries remainingAfter / totalSeconds / nodes / capCheck
    expect(rollMinute).toHaveBeenCalledTimes(3);
    expect(rollMinute.mock.calls[0]?.[0]).toMatchObject({
      remainingAfter: 840,
      totalSeconds: 900,
      fromNodeId: 5,
      toNodeId: 7,
      capCheck: expect.any(Function),
    });

    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({
      travelSecondsRemaining: 720,
      updatedAt: expect.any(Date),
    });
    expect(update).toHaveBeenCalledWith(playerTravelState);
  });

  it('T7: the row SELECT uses .for("update") and the tx is the ONLY writer of remaining/updatedAt', async () => {
    const row = rowUpdatedAgo(180_000, { travelSecondsRemaining: 900 });
    const { result, chain, update } = runCheckIn([[row], [EDGE]]);

    await expect(result).resolves.toMatchObject({ mode: 'status' });
    expect(chain.for).toHaveBeenCalledWith('update'); // FOR UPDATE row lock (single writer)
    // every write goes through tx.update(playerTravelState) — nothing else mutates the row
    expect(update).toHaveBeenCalledWith(playerTravelState);
  });
});

// ── 09-04 Task 2: the REAL default rollMinute (cap-first, blend, boss, record) ──

const NODES = [
  { id: 5, zone: 'trung_nguyen' }, // fromNodeId
  { id: 7, zone: 'du_chau' }, // toNodeId
];
// F8: hero_zone_rates.rate arrives as a numeric(4,2) STRING — the roll must Number() it.
const RATES = [
  { id: 1, heroId: 10, zone: 'trung_nguyen', rate: '1.0' },
  { id: 2, heroId: 11, zone: 'du_chau', rate: '0.5' },
];
const HEROES = [
  { id: 10, heroId: 'cao_cao', class: 'vanguard' }, // trung_nguyen (dominant at pos 0.4)
  { id: 11, heroId: 'dong_zhuo', class: 'cavalry' }, // du_chau
];
const ZONE_TRUNG_NGUYEN = {
  id: 1,
  code: 'trung_nguyen',
  nameVi: 'Trung Nguyên',
  nameEn: 'Central Plains',
  nameZh: '中原',
  sortOrder: 1,
  encounterRate: '0.35',
  bossRate: '0.07',
};
/** Boss-triggering zone — bossRate 1.0 makes the sub-roll a guaranteed boss. */
const ZONE_BOSS = { ...ZONE_TRUNG_NGUYEN, bossRate: '1.0' };
/** Skill-pool rows (the 11-02 seed shape) — used by the spawn skill rolls. */
const VANGUARD_SKILLS = [
  { id: 1, code: 'vanguard_normal_common', class: 'vanguard', slot: 'normal', rarity: 'common', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 100, emoji: '⚔️' },
  { id: 2, code: 'vanguard_normal_rare', class: 'vanguard', slot: 'normal', rarity: 'rare', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 120, emoji: '🗡️' },
  { id: 3, code: 'vanguard_special_common', class: 'vanguard', slot: 'special', rarity: 'common', mpCost: 15, mpGain: 0, effectType: 'damage', effectValue: 150, emoji: '🛡️' },
  { id: 4, code: 'vanguard_special_rare', class: 'vanguard', slot: 'special', rarity: 'rare', mpCost: 25, mpGain: 0, effectType: 'damage', effectValue: 200, emoji: '💥' },
  { id: 5, code: 'vanguard_special_epic', class: 'vanguard', slot: 'special', rarity: 'epic', mpCost: 40, mpGain: 0, effectType: 'damage', effectValue: 300, emoji: '🔥' },
];
function normalPool(): any[] {
  return VANGUARD_SKILLS.filter((s) => s.slot === 'normal');
}
function specialPool(): any[] {
  return VANGUARD_SKILLS.filter((s) => s.slot === 'special');
}

describe('checkInTravel — default rollMinute (09-04 encounterService-backed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T8 (D-13): cap window >= 20 → silent skip — no encounter_runs insert, no zadd, travel continues', async () => {
    const row = rowUpdatedAgo(60_000, { travelSecondsRemaining: 600 }); // 1 counted minute
    vi.mocked(redis.zcard).mockResolvedValueOnce(20); // window at the limit
    const { result, insert, insertValues } = runCheckIn([[row], [EDGE], NODES, RATES, [ZONE_TRUNG_NGUYEN]]);

    await expect(result).resolves.toMatchObject({ mode: 'status', remaining: 540 });
    expect(insert).not.toHaveBeenCalled(); // no record
    expect(insertValues).not.toHaveBeenCalled();
    expect(redis.zadd).not.toHaveBeenCalled(); // no inline encounter, no cap ZADD
    expect(redis.zremrangebyscore).toHaveBeenCalled(); // cap window cleaned first
  });

it('T9 (D-10/D-24/F8/D-31/D-33): cap open + roll true → weighted pick → encounter_runs INSERT hero with spawned LEVEL + SKILLS → zadd → result', async () => {
    // Arg-aware crypto mock: the uniform-0.2 roll (0,1e6) + the within-band level draw (1,11) = 3.
    vi.spyOn(crypto, 'randomInt').mockImplementation(((min: number, max: number) =>
      min === 0 && max === 1_000_000 ? 200_000 : 3) as typeof crypto.randomInt);
    const row = rowUpdatedAgo(60_000, { travelSecondsRemaining: 600 });
    const { result, insert, insertValues, updateSet } = runCheckIn(
      [[row], [EDGE], NODES, RATES, [ZONE_TRUNG_NGUYEN], HEROES, normalPool(), specialPool()],
    );

    await expect(result).resolves.toMatchObject({
      mode: 'encounter',
      remaining: 540,
      encounter: { heroId: 10, zone: 'trung_nguyen', boss: false },
    });
    // position = 1 − (540/900) = 0.4 → dominant trung_nguyen; pick = hero10
    expect(insert).toHaveBeenCalledWith(encounterRuns);
    expect(insertValues).toHaveBeenCalledWith({
      userId: 42,
      travelId: 1,
      zone: 'trung_nguyen',
      heroId: 10,
      encounterType: 'hero',
      status: 'pending',
      level: 3, // rollWildLevel: band 0.2 → L1-10; crypto.randomInt(1,11) = 3
      skillNormalId: 1, // normal skill roll 0.2×100=20 → first common of the vanguard normal pool
      skillSpecialId: 3, // special skill roll 0.2×100=20 → first common of the vanguard special pool
    });
    expect(redis.zadd).toHaveBeenCalledTimes(1); // cap ZADD on a successful roll
    // single-writer rule (Pitfall 5): the ONLY playerTravelState write carries
    // exactly the owned columns — nothing else.
    expect(Object.keys(updateSet.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'encounterActive',
      'travelSecondsRemaining',
      'updatedAt',
    ]);
  });

  it('T10 (D-14/D-24): roll true + boss sub-roll true → encounter_runs INSERT boss with a REAL zone-general heroId (hero_id no longer NULL), L50 + rolled skills; boss counts toward the cap', async () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(30_000 as never); // uniform 0.03 → hero AND boss roll true; skill draws
    const row = rowUpdatedAgo(60_000, { travelSecondsRemaining: 600 });
    const { result, insertValues } = runCheckIn(
      [[row], [EDGE], NODES, RATES, [ZONE_BOSS], HEROES, normalPool(), specialPool()],
    );

    await expect(result).resolves.toMatchObject({
      mode: 'encounter',
      encounter: { heroId: 10, zone: 'trung_nguyen', boss: true },
    });
    expect(insertValues).toHaveBeenCalledWith({
      userId: 42,
      travelId: 1,
      zone: 'trung_nguyen', // dominant zone at pos 0.4
      heroId: 10, // D-24: boss = a REAL zone-general hero (hero_id NON-NULL)
      encounterType: 'boss',
      status: 'pending',
      level: 50, // D-35: the boss fights at FIXED level 50
      skillNormalId: 1, // rolled skills — the boss's class pool (vanguard)
      skillSpecialId: 3,
    });
    expect(redis.zadd).toHaveBeenCalledTimes(1); // boss IS an encounter → counts toward the cap
  });

  it('T11: missing edge → the minute is skipped with a warn (no crash), no record, no zadd', async () => {
    const row = rowUpdatedAgo(120_000, { travelSecondsRemaining: 600 }); // 2 counted minutes
    const { result, insert } = runCheckIn([[row], []]); // edge read → empty → totalSeconds 0

    await expect(result).resolves.toMatchObject({ mode: 'status', remaining: 480 });
    expect(insert).not.toHaveBeenCalled();
    expect(redis.zadd).not.toHaveBeenCalled();
  });

  it('T12 (D-33/D-31, spawn integration): a WILD hit writes rollWildLevel + rolled class-pool skills into encounter_runs', async () => {
    // Arg-aware crypto mock: the uniform-0.2 roll (0,1e6) + the within-band level draw (1,11) = 3.
    vi.spyOn(crypto, 'randomInt').mockImplementation(((min: number, max: number) =>
      min === 0 && max === 1_000_000 ? 200_000 : 3) as typeof crypto.randomInt);
    const row = rowUpdatedAgo(60_000, { travelSecondsRemaining: 600 });
    // pick rng 0.5 → lands in hero10's band (weight 0.6 of 0.8 total → [0,0.75));
    // level rng 0.5 → band < 600 → L1-10; skill rng 0.0 → first of each slot pool.
    const pickRng = () => 0.5;
    const levelRng = () => 0.5;
    const skillRng = () => 0.0;
    const { result, insert, insertValues } = runCheckIn(
      [[row], [EDGE], NODES, RATES, [ZONE_TRUNG_NGUYEN], HEROES, normalPool(), specialPool()],
      undefined,
      { pickRng, levelRng, skillRng },
    );
    await expect(result).resolves.toMatchObject({
      mode: 'encounter',
      encounter: { heroId: 10, zone: 'trung_nguyen', boss: false },
    });
    expect(insert).toHaveBeenCalledWith(encounterRuns);
    expect(insertValues).toHaveBeenCalledWith({
      userId: 42,
      travelId: 1,
      zone: 'trung_nguyen',
      heroId: 10,
      encounterType: 'hero',
      status: 'pending',
      level: 3, // band 0.5 → L1-10; crypto.randomInt(1,11) = 3 (arg-aware mock)
      skillNormalId: 1, // skill roll 0.0 → first normal-common of the vanguard pool
      skillSpecialId: 3, // skill roll 0.0 → first special-common of the vanguard pool
    });
  });

  it('T13 (D-24/D-31/D-35, spawn integration): a BOSS sub-roll inserts a REAL zone-general heroId (non-null) with L50 + ROLLED skills via the default roll', async () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(30_000 as never); // uniform 0.03 → hero + boss sub-roll true
    const row = rowUpdatedAgo(60_000, { travelSecondsRemaining: 600 });
    const { result, insertValues } = runCheckIn(
      [[row], [EDGE], NODES, RATES, [ZONE_BOSS], HEROES, normalPool(), specialPool()],
    );
    await expect(result).resolves.toMatchObject({
      mode: 'encounter',
      encounter: { heroId: 10, zone: 'trung_nguyen', boss: true },
    });
    expect(insertValues).toHaveBeenCalledWith({
      userId: 42,
      travelId: 1,
      zone: 'trung_nguyen',
      heroId: 10, // D-24: boss = a REAL zone-general hero — hero_id NON-NULL
      encounterType: 'boss',
      status: 'pending',
      level: 50, // D-35: the boss fights at FIXED level 50
      skillNormalId: 1, // boss's rolled class-pool skills (vanguard)
      skillSpecialId: 3,
    });
  });
});
