/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../../../db/client.js';
import { startEncounterBattle, startSparBattle, skipEncounter } from '../battleCheckInService.js';
import { playerTravelState } from '../../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../../db/schema/encounterRuns.js';
import { userHeroes } from '../../../db/schema/userHeroes.js';
import { sanguoBattles } from '../../../db/schema/sanguoBattles.js';
import { BOSS_TEMPLATES, bossTemplateFor } from '../../../constants/sanguoBoss.js';
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

// ── fixtures ────────────────────────────────────────────────────────────────

const TRAVEL = {
  id: 1,
  userId: 42,
  fromNodeId: 5,
  toNodeId: 7,
  departAt: new Date('2026-08-12T08:00:00Z'),
  travelSecondsRemaining: 600,
  encounterActive: true,
  status: 'traveling',
  createdAt: new Date('2026-08-12T08:00:00Z'),
  updatedAt: new Date('2026-08-12T08:00:00Z'),
};

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

const PENDING_BOSS = { ...PENDING, heroId: null, encounterType: 'boss' };

const STATE = {
  id: 1,
  userId: 42,
  activeHeroId: 77,
  starterViews: 0,
  createdAt: new Date('2026-08-12T08:00:00Z'),
  updatedAt: new Date('2026-08-12T08:00:00Z'),
};

/** userHeroes ⋈ heroes join — explicit aliases (uh/h) so the mock key is stable. */
function activeJoin(hpCurrent = 100): any {
  return {
    uh: {
      id: 77,
      userId: 42,
      heroId: 1,
      level: 1,
      ivStr: 5,
      ivAgi: 6,
      ivInt: 7,
      ivMov: 8,
      ivLea: 9,
      ivCha: 10,
      hpCurrent,
      capturedZone: null,
      capturedAt: new Date('2026-08-12T08:00:00Z'),
    },
    h: {
      id: 1,
      heroId: 'cao_cao',
      nameVi: 'Tào Tháo',
      nameEn: 'Cao Cao',
      nameZh: null,
      factionId: 1,
      role: 'ruler',
      class: 'vanguard',
      str: 50,
      agi: 40,
      int: 30,
      mov: 35,
      lea: 20,
      cha: 20,
      hp: 100,
      mp: 50,
      rarity: 5,
      tier: 5,
    },
  };
}

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
  hp: 80,
  mp: 40,
  rarity: 3,
  tier: 3,
};

const WIN_RESULT = {
  roundLogs: [{ round: 1, attacker: 'cao_cao', defender: 'duong_kiem', hit: true, crit: true, dmg: 50, defenderHpAfter: 30 }],
  winner: 'player',
  rounds: 1,
  totalDamagePlayer: 50,
  totalDamageEnemy: 20,
  playerHpAfter: 73,
  enemyHpAfter: 30,
};

const LOSS_RESULT = {
  roundLogs: [{ round: 1, attacker: 'duong_kiem', defender: 'cao_cao', hit: true, crit: false, dmg: 40, defenderHpAfter: 60 }],
  winner: 'enemy',
  rounds: 3,
  totalDamagePlayer: 10,
  totalDamageEnemy: 40,
  playerHpAfter: 0,
  enemyHpAfter: 55,
};

// ── mock tx builder ─────────────────────────────────────────────────────────

/**
 * Fake drizzle tx whose select chain is a thenable: every awaited read resolves
 * the NEXT queued result in call order (for/limit are not terminal in this
 * mock — the whole chain resolves once awaited). update().set().where() and
 * insert().values() are no-op chains; values() is thenable AND carries
 * .returning() so both `await insert(...).values(...)` and
 * `.values(...).returning(...)` shapes work.
 */
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

function runBattleInTx(readResults: unknown[][], runBattleFn: any, deps: Record<string, unknown> = {}) {
  const { tx, chain, update, updateSet, insert, insertValues, insertReturning } = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
  const promise = startEncounterBattle(42, { runBattleFn, ...deps });
  return { promise, tx, chain, update, updateSet, insert, insertValues, insertReturning };
}

// ── Task 1 behaviors 1-7 ────────────────────────────────────────────────────

describe('startEncounterBattle — encounter battle entry (D-01/D-03/D-04/D-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T1: pending encounter + active companion → battle result, replay-record sanguo_battles row, seed set', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, insert, insertValues } = runBattleInTx(
      [[TRAVEL], [PENDING], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 12345, ivRoll: () => 1 },
    );

    const result = await promise;
    expect(result).toMatchObject({ resolution: 'won', battleId: 1, winner: 'player', playerHpAfter: 73, enemyHpAfter: 30 });

    // The engine received the exact seed + combatant pair.
    expect(runBattleFn).toHaveBeenCalledTimes(1);
    const [seed, player, enemy] = runBattleFn.mock.calls[0] as [number, any, any];
    expect(seed).toBe(12345);

    // The stored record is the replay contract: input jsonb === engine input snapshot.
    expect(insert).toHaveBeenCalledWith(sanguoBattles);
    const inserted = insertValues.mock.calls[0]?.[0] as any;
    expect(inserted).toMatchObject({
      userId: 42,
      status: 'completed',
      type: 'encounter',
      encounterId: 9,
      seed: 12345,
      resolvedAt: expect.any(Date),
    });
    expect(inserted.input).toEqual({ player, enemy });
    expect(inserted.roundLogs).toEqual(WIN_RESULT.roundLogs);
    expect(inserted.result).toMatchObject({ winner: 'player' });
  });

  it('T2: active companion HP = 0 → HERO_FAINTED, NO sanguo_battles row (D-04 gate)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, insert } = runBattleInTx(
      [[TRAVEL], [PENDING], [STATE], [activeJoin(0)]],
      runBattleFn,
      { seed: 1 },
    );

    await expect(promise).rejects.toThrow('HERO_FAINTED');
    expect(runBattleFn).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('T3: NO pending encounter → NO_PENDING_ENCOUNTER (no travel row; and flag-set-but-no-pending)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const noRow = runBattleInTx([[]], runBattleFn, { seed: 1 });
    await expect(noRow.promise).rejects.toThrow('NO_PENDING_ENCOUNTER');
    expect(noRow.insert).not.toHaveBeenCalled();

    const flagNoPending = runBattleInTx([[TRAVEL], []], runBattleFn, { seed: 1 });
    await expect(flagNoPending.promise).rejects.toThrow('NO_PENDING_ENCOUNTER');
    expect(flagNoPending.insert).not.toHaveBeenCalled();
  });

  it('T4: player WIN → encounter stays pending (capture window open), hp_current written back (D-04)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, update, updateSet } = runBattleInTx(
      [[TRAVEL], [PENDING], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 1 },
    );

    const result = await promise;
    expect(result.resolution).toBe('won');

    // HP persists: write-back is the ONLY user_heroes mutation.
    expect(update).toHaveBeenCalledWith(userHeroes);
    expect(updateSet.mock.calls[0]?.[0]).toEqual({ hpCurrent: 73 });

    // No resolution writes: the capture window is open, travel stays paused.
    expect(update).not.toHaveBeenCalledWith(encounterRuns);
    expect(update).not.toHaveBeenCalledWith(playerTravelState);
  });

  it('T5: player LOSS → encounter "escaped", encounterActive false + updatedAt pinned (travel resumes)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(LOSS_RESULT);
    const { promise, update, updateSet } = runBattleInTx(
      [[TRAVEL], [PENDING], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 1 },
    );

    const result = await promise;
    expect(result.resolution).toBe('lost');
    expect(update).toHaveBeenCalledWith(userHeroes);
    expect(update).toHaveBeenCalledWith(encounterRuns);
    expect(update).toHaveBeenCalledWith(playerTravelState);

    const sets = updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'escaped' });
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
  });

  it('T6: wild IV rides crypto.randomInt (6×, 0-31) and the enemy base+IV snapshot is what the engine receives (D-03)', async () => {
    const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockReturnValue(7 as never);
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise } = runBattleInTx(
      [[TRAVEL], [PENDING], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 12345 },
    );

    await promise;
    // 6 IV draws, all (0, 32) — the battle seed is injected, so these are the only draws.
    expect(randomIntSpy).toHaveBeenCalledTimes(6);
    for (const call of randomIntSpy.mock.calls) {
      expect(call).toEqual([0, 32]);
    }

    const [, player, enemy] = runBattleFn.mock.calls[0] as [number, any, any];
    expect(enemy.iv).toEqual({ str: 7, agi: 7, int: 7, mov: 7, lea: 7, cha: 7 });
    // The wild combatant's base comes from the heroes row (base+IV snapshot, D-03).
    expect(enemy.base).toMatchObject({ str: 60, agi: 35, int: 45, mov: 35, lea: 15, cha: 15, hp: 80, mp: 40 });
    expect(enemy.hpCurrent).toBe(80);
    expect(enemy.isPlayer).toBe(false);

    // The player side carries the active companion's owned IVs + persisted HP.
    expect(player.iv).toEqual({ str: 5, agi: 6, int: 7, mov: 8, lea: 9, cha: 10 });
    expect(player.hpCurrent).toBe(100);
    expect(player.isPlayer).toBe(true);
  });

  it('T7: boss encounter builds the enemy from the zone boss template (A3), not a heroes row', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise } = runBattleInTx(
      [[TRAVEL], [PENDING_BOSS], [STATE], [activeJoin()]],
      runBattleFn,
      { seed: 1 },
    );

    await promise;
    const [, , enemy] = runBattleFn.mock.calls[0] as [number, any, any];
    const tpl = BOSS_TEMPLATES['du_chau'];
    expect(tpl).toBeDefined();
    expect(tpl.rarity).toBe(5);
    // Elevated ~2× a rarity-5 hero template (A3).
    expect(tpl.hp).toBeGreaterThan(300);
    expect(tpl.str).toBeGreaterThan(80);

    expect(enemy.heroId).toBe('boss:du_chau');
    expect(enemy.base).toMatchObject({
      str: tpl.str, agi: tpl.agi, int: tpl.int, mov: tpl.mov, lea: tpl.lea, cha: tpl.cha, hp: tpl.hp, mp: tpl.mp,
    });
    expect(enemy.hpCurrent).toBe(tpl.hp);
    expect(enemy.isPlayer).toBe(false);

    // Every seeded zone code carries a template; unknown zones throw (defensive).
    const zoneCodes = [
      'trung_nguyen', 'quan_trung', 'du_chau', 'duyen_chau', 'tu_chau', 'thanh_chau',
      'ky_chau', 'u_chau', 'tinh_chau', 'luong_chau', 'kinh_chau', 'duong_chau',
      'ich_chau', 'giao_chau', 'trieu_tien', 'o_hoan', 'tien_ti', 'hung_no',
    ];
    for (const code of zoneCodes) {
      expect(BOSS_TEMPLATES[code]).toBeDefined();
    }
    expect(() => bossTemplateFor('unknown_zone')).toThrow('NO_BOSS_TEMPLATE');
  });
});

// ── D-17 spar (no HP write-back, no fee, no encounter) ──────────────────────

describe('startSparBattle — free practice (D-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const HERO_POOL = [WILD_HERO, { ...WILD_HERO, id: 6, heroId: 'kong_rong', nameVi: 'Khổng Dung', rarity: 2, tier: 2 }];

  function sparInTx(readResults: unknown[][], runBattleFn: any, deps: Record<string, unknown> = {}) {
    const { tx, update, insert, insertValues } = makeTx(readResults);
    (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
    const promise = startSparBattle(42, { runBattleFn, ...deps });
    return { promise, tx, update, insert, insertValues };
  }

  it('S1: runs the engine vs a random real hero, records type "spar" with NO encounter_id, never writes HP back', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, update, insert, insertValues } = sparInTx(
      [[STATE], [activeJoin()], HERO_POOL],
      runBattleFn,
      { seed: 1, pickHeroId: 5 },
    );

    const result = await promise;
    expect(result.resolution).toBe('won');
    expect(runBattleFn.mock.calls[0][2]).toMatchObject({ heroId: 'duong_kiem', isPlayer: false });

    expect(insert).toHaveBeenCalledWith(sanguoBattles);
    const inserted = insertValues.mock.calls[0]?.[0] as any;
    expect(inserted).toMatchObject({ userId: 42, status: 'completed', type: 'spar', encounterId: null, seed: 1 });

    // D-17 hard rule: spar NEVER writes HP back and never charges a fee.
    expect(update).not.toHaveBeenCalledWith(userHeroes);
    expect(update).not.toHaveBeenCalledWith(playerTravelState);
  });

  it('S2: fainted active companion → HERO_FAINTED, no record', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, insert } = sparInTx([[STATE], [activeJoin(0)], HERO_POOL], runBattleFn, { seed: 1 });
    await expect(promise).rejects.toThrow('HERO_FAINTED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('S3: empty hero pool → NO_SPAR_POOL (never crashes)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise } = sparInTx([[STATE], [activeJoin()], []], runBattleFn, { seed: 1 });
    await expect(promise).rejects.toThrow('NO_SPAR_POOL');
  });
});

// ── D-18 skip/retreat ───────────────────────────────────────────────────────

describe('skipEncounter — retreat/skip resolution (D-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the pending encounter "skipped", clears encounterActive + pins updatedAt, cap untouched', async () => {
    const { tx, chain, update, updateSet } = makeTx([[TRAVEL], [PENDING]]);
    (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));

    await skipEncounter(42);

    expect(chain.for).toHaveBeenCalledWith('update');
    const sets = updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'skipped' });
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
    expect(update).toHaveBeenCalledWith(encounterRuns);
    expect(update).toHaveBeenCalledWith(playerTravelState);

    // D-18: the encounter cap counts roll hits, not resolutions — no redis interaction.
    expect(redis.zadd).not.toHaveBeenCalled();
    expect(redis.zcard).not.toHaveBeenCalled();
  });
});
