/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../../../db/client.js';
import { startEncounterBattle, startSparBattle, skipEncounter } from '../battleCheckInService.js';
import { runBattle, runLegionBattle, type LegionBattleInput } from '../battleEngine.js';
import { playerTravelState } from '../../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../../db/schema/encounterRuns.js';
import { userHeroes } from '../../../db/schema/userHeroes.js';
import { sanguoBattles } from '../../../db/schema/sanguoBattles.js';
import { checkInTravel } from '../travelCheckInService.js';
import { redis } from '../../../cache/redis.js';
import { TIER_MULTIPLIERS, STAT_GAIN_PER_LEVEL } from '../../../constants/sanguoProgression.js';

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
      tier: 0,
      skillNormalId: null,
      skillSpecialId: null,
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
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
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
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin(0)]],
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

  it('CR-02: a pending encounter with an EXISTING completed battle → BATTLE_ALREADY_FOUGHT, no new battle row (stale fight-button guard)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const existing = { id: 88, userId: 42, encounterId: 9, type: 'encounter', status: 'completed' };
    const { promise, insert } = runBattleInTx(
      [[TRAVEL], [PENDING], [existing], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 1 },
    );

    await expect(promise).rejects.toThrow('BATTLE_ALREADY_FOUGHT');
    expect(runBattleFn).not.toHaveBeenCalled(); // engine never runs
    expect(insert).not.toHaveBeenCalled(); // no second battle record
  });

  it('T4: player WIN → encounter stays pending (capture window open), hp_current written back (D-04)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise, update, updateSet } = runBattleInTx(
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
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
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
      runBattleFn,
      { seed: 1 },
    );

    const result = await promise;
    expect(result.resolution).toBe('lost');
    expect(update).toHaveBeenCalledWith(userHeroes);
    expect(update).toHaveBeenCalledWith(encounterRuns);
    expect(update).toHaveBeenCalledWith(playerTravelState);

    const sets = updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'escaped', pityCount: 0 }); // IN-04
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
  });

  it('T6: wild IV rides crypto.randomInt (6×, 0-31) and the enemy base+IV snapshot is what the engine receives (D-03)', async () => {
    const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockReturnValue(7 as never);
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    const { promise } = runBattleInTx(
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
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

  it('T7-OLD-REMOVED: the boss template path is DELETED per adopt-d24 (D-24 one-way supersession)', async () => {
    // The superseded code is gone — verify via the source text using fs.
    // (ESM-safe: read the file relative to this test via import.meta.url.)
    const srcFile = new URL('../battleCheckInService.ts', import.meta.url);
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(srcFile, 'utf8');
    expect(source).toContain('runLegionBattle');
    // The deleted constants module must no longer be imported (D-24 supersession).
    expect(source).not.toMatch(/sanguoBoss/);
    expect(source).toContain('runLegionBattleFn');
  });
});

// ── Task 3: boss → forced LEGION routing (D-24/D-25/D-35) + win/drop ────────

const LEGION = { id: 1, userId: 42, formationId: 1, updatedAt: new Date() };

/** 12 user_legion_slots ⋈ user_heroes ⋈ heroes joined rows (3 mains + 9 supports). */
function legionJoin(mains = 3, supports = 9): any[] {
  const rows: any[] = [];
  const classes = ['vanguard', 'archer', 'spellcaster', 'cavalry', 'schemer', 'vu_co', 'thu_binh', 'cong_binh', 'vanguard', 'archer', 'spellcaster', 'schemer'];
  for (let slot = 0; slot < mains + supports; slot++) {
    const cls = classes[slot % classes.length];
    rows.push({
      slotOrder: slot,
      uh: {
        id: 100 + slot,
        userId: 42,
        heroId: 1 + slot,
        level: 50,
        ivStr: 10, ivAgi: 10, ivInt: 10, ivMov: 10, ivLea: 10, ivCha: 10,
        hpCurrent: 100,
        tier: 0, // default t0 main
        skillNormalId: 1,
        skillSpecialId: 3,
      },
      h: {
        id: 1 + slot,
        heroId: 'hero_' + slot,
        nameVi: 'Hero ' + slot,
        nameEn: 'Hero ' + slot,
        nameZh: null,
        factionId: 1,
        role: 'general',
        class: cls,
        str: 50, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 100, mp: 50,
        rarity: 3,
        tier: 3,
      },
    });
  }
  return rows;
}

/** The zone-general the boss fights (encounter.heroId). */
const BOSS_ZONE_GENERAL = {
  id: 99,
  heroId: 'lu_bu',
  nameVi: 'Lữ Bố',
  nameEn: 'Lu Bu',
  nameZh: null,
  factionId: 1,
  role: 'general',
  class: 'vanguard',
  str: 70, agi: 60, int: 40, mov: 55, lea: 50, cha: 45, hp: 150, mp: 60,
  rarity: 5,
  tier: 5,
};

/** Boss pending encounter — a REAL hero row (hero_id 99, NOT null) per D-24. */
const PENDING_BOSS_NEW = {
  id: 9, userId: 42, travelId: 1, zone: 'du_chau', heroId: 99,
  encounterType: 'boss', status: 'pending', pityCount: 0,
  level: 50, skillNormalId: 1, skillSpecialId: 3,
  createdAt: new Date('2026-08-12T08:00:00Z'),
};

/** sanguo_skills rows the legion builder resolves (mains snapshot reads +
 *  fetchSupportSpecials + the boss snapshot). Ids 1 (normal) and 3 (special). */
const SKILLS = [
  { id: 1, nameVi: 'Khiêu chiến', nameEn: 'Taunt', nameZh: null, class: 'vanguard', slot: 'normal', mpGain: 10, mpCost: null, effectType: null, effectValue: null },
  { id: 3, nameVi: 'Hỏa cầu', nameEn: 'Fireball', nameZh: null, class: 'spellcaster', slot: 'special', mpGain: null, mpCost: 20, effectType: 'damage', effectValue: 30 },
];
const SPECIALS = [SKILLS[1]]; // fetchSupportSpecials returns the special rows

const LEGION_WIN = {
  roundLogs: [{ round: 1, attacker: 'hero_0', defender: 'lu_bu', hit: true, crit: true, dmg: 60, defenderHpAfter: 90 }],
  winner: 'player',
  rounds: 2,
  totalDamagePlayer: 120,
  totalDamageEnemy: 40,
  playerHpAfter: 300,
  enemyHpAfter: 90,
};

const LEGION_LOSS = {
  roundLogs: [{ round: 1, attacker: 'lu_bu', defender: 'hero_0', hit: true, crit: false, dmg: 200, defenderHpAfter: 0 }],
  winner: 'enemy',
  rounds: 3,
  totalDamagePlayer: 30,
  totalDamageEnemy: 200,
  playerHpAfter: 0,
  enemyHpAfter: 50,
};

describe('startEncounterBattle — boss → FORCED legion routing (D-24/D-25/D-35)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function bossLegionInTx(
    readResults: unknown[][],
    runLegionBattleFn: any,
    deps: Record<string, unknown> = {},
  ) {
    const { tx, chain, update, updateSet, insert, insertValues } = makeTx(readResults);
    (db.transaction as any).mockImplementation(async (cb: any) => cb(tx));
    const promise = startEncounterBattle(42, { runLegionBattleFn, ...deps });
    return { promise, tx, chain, update, updateSet, insert, insertValues };
  }

  /**
   * The full read-result queue for a boss fight with an assembled legion, in
   * call order:
   * 1 travel → 2 pending boss → 3 no prior battle → 4 companion state →
   * 5 companion join → 6 userLegions → 7 the 12 slots →
   * (P0-3 player skill snapshot: activeJoin has null skills → no read) →
   * 8/9/10 the 3 mains' skill snapshots → 11 fetchSupportSpecials →
   * 12 boss heroes row → 13 boss skill snapshot.
   */
  function bossQueue(): unknown[][] {
    return [
      [TRAVEL],
      [PENDING_BOSS_NEW],
      [], // no existing encounter battle (CR-02)
      [STATE],
      [activeJoin()], // active companion (not used for boss, but read)
      [LEGION],
      legionJoin(), // 12 slots
      [], // main[0] skill snapshot
      [], // main[1] skill snapshot
      [], // main[2] skill snapshot
      SPECIALS, // fetchSupportSpecials
      [BOSS_ZONE_GENERAL], // boss enemy heroes row
      SKILLS, // boss skill snapshot (normal id 1 + special id 3)
    ];
  }

  it('B1: a BOSS encounter with an assembled legion routes to runLegionBattle with the full legion input (mains[3] tier-baked+buffed, supports[9] effective-LEA, boss t2×IV31×L50)', async () => {
    const runLegionBattleFn = vi.fn().mockReturnValue(LEGION_WIN);
    const { promise } = bossLegionInTx(
      bossQueue(),
      runLegionBattleFn,
      { seed: 1, bossIvRoll: () => 31, rollBossDropFn: vi.fn().mockResolvedValue({ itemCode: 'heal_pill', quantity: 1 }) },
    );

    const result = await promise;
    expect(result.winner).toBe('player');
    expect(runLegionBattleFn).toHaveBeenCalledTimes(1);
    const [seed, input] = runLegionBattleFn.mock.calls[0] as [number, LegionBattleInput];
    expect(seed).toBe(1);
    expect(input.mains).toHaveLength(3);
    expect(input.supports).toHaveLength(9);
    expect(input.boss.heroId).toBe('lu_bu');
    // Boss: base × TIER_MULTIPLIERS[2] (t2 1.25) × IV31 × L50
    expect(input.boss.base.str).toBe(Math.round(70 * TIER_MULTIPLIERS[2]));
    expect(input.boss.iv.str).toBe(31);
    expect(input.boss.level).toBe(50);
    expect(input.boss.skillNormal).toMatchObject({ id: '1' });
    // Mains: tier multiplier baked in (P0-2) — t0 main → TIER_MULTIPLIERS[0] = 1.0
    expect(input.mains[0].base.str).toBe(50);
    // Supports carry effective LEA = base.lea + IV.lea + (level−1)×STAT_GAIN_PER_LEVEL
    const [support] = input.supports;
    expect(support.lea).toBe(20 + 10 + (50 - 1) * STAT_GAIN_PER_LEVEL);
  });

  it('B2: a BOSS encounter with NO assembled legion → legion.not_assembled, no engine call', async () => {
    const runLegionBattleFn = vi.fn();
    const { promise, insert } = bossLegionInTx(
      [
        [TRAVEL],
        [PENDING_BOSS_NEW],
        [],
        [STATE],
        [activeJoin()],
        [], // no legion row
        [], // no slots
        [],
      ],
      runLegionBattleFn,
      { seed: 1 },
    );
    await expect(promise).rejects.toThrow('legion.not_assembled');
    expect(runLegionBattleFn).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('B3: a WILD encounter still routes to SOLO runBattle (D-23 — the solo path is unchanged)', async () => {
    const runBattleFn = vi.fn().mockReturnValue(WIN_RESULT);
    // bossLegionInTx maps its 2nd positional arg to runLegionBattleFn; the WILD
    // path needs runBattleFn injected via deps (the positional arg is an unused dummy).
    const { promise } = bossLegionInTx(
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
      vi.fn(),
      { seed: 1, runBattleFn, runLegionBattleFn: vi.fn() },
    );
    const result = await promise;
    expect(result.resolution).toBe('won');
    expect(runBattleFn).toHaveBeenCalledTimes(1);
  });

  it('B4: a boss WIN → dropService.rollBossDrop (guaranteed item, D-14); a boss LOSS → boss departs (travel resumes), NO drop', async () => {
    const rollBossDrop = vi.fn().mockResolvedValue({ itemCode: 'heal_pill', quantity: 1 });
    const win = bossLegionInTx(
      bossQueue(),
      vi.fn().mockReturnValue(LEGION_WIN),
      { seed: 1, rollBossDropFn: rollBossDrop },
    );
    await win.promise;
    expect(rollBossDrop).toHaveBeenCalledWith(42); // guaranteed ≥1 item on win

    const loss = bossLegionInTx(
      bossQueue(),
      vi.fn().mockReturnValue(LEGION_LOSS),
      { seed: 1, rollBossDropFn: rollBossDrop },
    );
    await loss.promise;
    expect(rollBossDrop).toHaveBeenCalledTimes(1); // only the win triggered a drop
    // Loss → boss departs: the encounter resolves like a wild loss.
    const sets = loss.updateSet.mock.calls.map((c: any) => c[0]);
    expect(sets).toContainEqual({ status: 'escaped', pityCount: 0 });
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
  });

  it('P0-2 pin: a t2-evolved main (TIER_MULTIPLIERS[2] bake) deals strictly more damage than an identical t0 main at the same level, via the REAL runLegionBattle engine', () => {
    // PLAN-FIX P0-2 (D-07): bakeMain multiplies EACH main's base stats by
    // TIER_MULTIPLIERS[userHeroes.tier] BEFORE the chemistry buff. This pin
    // builds two otherwise-identical legion inputs differing ONLY in the main's
    // tier bake and asserts the t2 legion lands strictly more engine damage at
    // the SAME level — proving an evolved main is combat-meaningful, not a
    // cosmetic tier tag.
    const mkMain = (tier: number): LegionBattleInput['mains'][number] => {
      const mult = TIER_MULTIPLIERS[tier];
      return {
        heroId: 'main_0',
        base: {
          str: Math.round(60 * mult), agi: Math.round(40 * mult), int: Math.round(30 * mult),
          mov: Math.round(35 * mult), lea: Math.round(20 * mult), cha: Math.round(20 * mult),
          hp: Math.round(100 * mult), mp: Math.round(50 * mult),
        },
        iv: { str: 10, agi: 10, int: 10, mov: 10, lea: 10, cha: 10 },
        hpCurrent: Math.round(100 * mult),
        class: 'vanguard',
        isPlayer: true,
        level: 50, // the SAME level — only the tier bake differs
        mpCurrent: Math.round(50 * mult),
        skillNormal: null,
        skillSpecial: null,
      };
    };
    const boss: LegionBattleInput['boss'] = {
      // Low base str/agi so the main hits reliably and the t0/t2 tier gap in
      // atk produces STRICTLY more landed damage (eff() adds +98 level gain at
      // L50 to both sides; the boss def must stay below the main's eff atk).
      heroId: 'boss', base: { str: 20, agi: 5, int: 20, mov: 5, lea: 30, cha: 30, hp: 5000, mp: 100 },
      iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
      hpCurrent: 5000, class: 'vanguard', isPlayer: false, level: 50, mpCurrent: 100,
    };
    const t0 = runLegionBattle(424242, { mains: [mkMain(0)], supports: [], boss });
    const t2 = runLegionBattle(424242, { mains: [mkMain(2)], supports: [], boss });
    expect(TIER_MULTIPLIERS[2]).toBeGreaterThan(TIER_MULTIPLIERS[0]); // fixture sanity
    expect(t2.totalDamagePlayer).toBeGreaterThan(t0.totalDamagePlayer);
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
    expect(sets).toContainEqual({ status: 'skipped', pityCount: 0 }); // IN-04
    expect(sets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });
    expect(update).toHaveBeenCalledWith(encounterRuns);
    expect(update).toHaveBeenCalledWith(playerTravelState);

    // D-18: the encounter cap counts roll hits, not resolutions — no redis interaction.
    expect(redis.zadd).not.toHaveBeenCalled();
    expect(redis.zcard).not.toHaveBeenCalled();
  });
});

// ── Task 3 integration: replay roundtrip + escape/travel-resume regression ──

describe('integration (SC1 / Pitfall 1 / Pitfall 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T8: replay roundtrip — stored input + seed re-run through the REAL engine reproduce the stored roundLogs', async () => {
    // Real runBattle (no engine mock): the service rolls crypto IV + writes the
    // full snapshot; we then replay from the stored record — the SC1 proof the
    // seed+input contract is complete (Pitfall 1).
    const { promise, insertValues } = runBattleInTx(
      [[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]],
      undefined,
      { seed: 424242 },
    );

    await promise;
    const inserted = insertValues.mock.calls[0]?.[0] as any;
    expect(inserted.seed).toBe(424242);

    const parsed = JSON.parse(JSON.stringify(inserted.input)) as {
      player: any;
      enemy: any;
    };
    const replay = runBattle(424242, parsed.player, parsed.enemy);
    expect(replay.roundLogs).toEqual(inserted.roundLogs);
    expect(replay.winner).toBe(inserted.result.winner);
  });

  it('T10: escape resolution — after a loss the next check-in resumes the journey from the pinned updatedAt', async () => {
    // Loss battle: encounterActive cleared + updatedAt pinned (asserted in T5).
    const runBattleFn = vi.fn().mockReturnValue(LOSS_RESULT);
    const loss = runBattleInTx([[TRAVEL], [PENDING], [], [STATE], [activeJoin()], [WILD_HERO]], runBattleFn, { seed: 1 });
    const outcome = await loss.promise;
    expect(outcome.resolution).toBe('lost');
    const lossSets = loss.updateSet.mock.calls.map((c: any) => c[0]);
    expect(lossSets).toContainEqual({ encounterActive: false, updatedAt: expect.any(Date) });

    // A subsequent checkInTravel sees the resumed state — no encounterPending
    // branch, elapsed counts from the pinned updatedAt (Pitfall 7 regression).
    const resumedRow = {
      ...TRAVEL,
      encounterActive: false,
      updatedAt: new Date(Date.now() - 120_000), // 2 minutes since the pin
      travelSecondsRemaining: 300,
    };
    const EDGE = { id: 1, nodeAId: 5, nodeBId: 7, travelSeconds: 300 };
    const { tx: tx2, update: update2 } = makeTx([[resumedRow], [EDGE]]);
    (db.transaction as any).mockImplementation(async (cb: any) => cb(tx2));

    const checkIn = await checkInTravel(42, {
      rollMinute: async () => ({ hit: false }),
    });
    expect(checkIn.mode).toBe('status');
    expect(checkIn.remaining).toBe(180); // 300 − 2 counted minutes — travel resumed
    expect(update2).toHaveBeenCalledWith(playerTravelState);
  });
});
