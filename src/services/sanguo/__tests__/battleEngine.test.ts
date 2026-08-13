import { describe, it, expect } from 'vitest';
import {
  combatStat,
  getAttackType,
  runBattle,
  BATTLE_CONFIG,
  type CombatantInput,
} from '../battleEngine.js';

/**
 * Fixed input fixture (Task 1, behaviors 1-6). Chosen so the MOV/AGI tie
 * ladder and the atk<=def floor case are exercised:
 * - Enemy MOV (35+3=38) > player MOV (35+2=37) -> enemy acts first (4a).
 * - Player STR atk (50+5=55) <= enemy STR def (60+4=64) -> non-crit hits
 *   floor at exactly 1 damage (6).
 * - Both vanguard -> same stat pair (STR) keeps the floor case visible.
 * - Player hpCurrent (100) < base.hp is the D-04 persistence shape; the
 *   engine must start at hpCurrent, never base+iv (3).
 */
const PLAYER: CombatantInput = {
  heroId: 'player-hero',
  base: { str: 50, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 100, mp: 50 },
  iv: { str: 5, agi: 10, int: 3, mov: 2, lea: 1, cha: 1 },
  hpCurrent: 100,
  class: 'vanguard',
  isPlayer: true,
};

const ENEMY: CombatantInput = {
  heroId: 'enemy-hero',
  base: { str: 60, agi: 35, int: 45, mov: 35, lea: 15, cha: 15, hp: 80, mp: 40 },
  iv: { str: 4, agi: 8, int: 5, mov: 3, lea: 2, cha: 2 },
  hpCurrent: 80,
  class: 'vanguard',
  isPlayer: false,
};

const SEED = 12345;

describe('replay contract (D-06)', () => {
  it('runBattle(seed, input) twice deep-equals itself', () => {
    const first = runBattle(SEED, PLAYER, ENEMY);
    const second = runBattle(SEED, PLAYER, ENEMY);
    expect(second).toEqual(first);
    expect(second.roundLogs).toEqual(first.roundLogs);
  });

  it('different seeds produce different round logs', () => {
    const serialized = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      serialized.add(JSON.stringify(runBattle(seed, PLAYER, ENEMY).roundLogs));
    }
    expect(serialized.size).toBeGreaterThan(1);
  });
});

describe('combatStat (D-05)', () => {
  it('sums base + iv for the 6 IV stats', () => {
    expect(combatStat(50, 5)).toBe(55);
    expect(combatStat(35, 3)).toBe(38);
    expect(combatStat(0, 0)).toBe(0);
  });
});

describe('turn order ladder (D-05)', () => {
  it('higher MOV acts first each round', () => {
    const result = runBattle(SEED, PLAYER, ENEMY);
    // enemy MOV 38 > player MOV 37 -> enemy opens round 1
    expect(result.roundLogs[0].attacker).toBe(ENEMY.heroId);
  });

  it('MOV tie breaks by AGI (higher AGI acts first)', () => {
    const enemyMovTie: CombatantInput = { ...ENEMY, iv: { ...ENEMY.iv, mov: 2 } };
    // enemy MOV 35+2=37 == player MOV 37; enemy AGI 43 < player AGI 50
    const result = runBattle(SEED, PLAYER, enemyMovTie);
    expect(result.roundLogs[0].attacker).toBe(PLAYER.heroId);
  });

  it('MOV+AGI full tie breaks to the player (attacker first)', () => {
    const enemyFullTie: CombatantInput = {
      ...ENEMY,
      base: { ...ENEMY.base, agi: 40 },
      iv: { ...ENEMY.iv, mov: 2, agi: 10 },
    };
    // enemy MOV 37 == player 37, enemy AGI 50 == player 50 -> player first
    const result = runBattle(SEED, PLAYER, enemyFullTie);
    expect(result.roundLogs[0].attacker).toBe(PLAYER.heroId);
  });
});

describe('getAttackType (D-05 class mapping)', () => {
  it('maps vanguard/cavalry/archer to STR', () => {
    expect(getAttackType('vanguard')).toBe('str');
    expect(getAttackType('cavalry')).toBe('str');
    expect(getAttackType('archer')).toBe('str');
  });

  it('maps spellcaster/schemer to INT', () => {
    expect(getAttackType('spellcaster')).toBe('int');
    expect(getAttackType('schemer')).toBe('int');
  });

  it('maps vu_co/thu_binh/cong_binh to MAX(STR,INT)', () => {
    expect(getAttackType('vu_co')).toBe('max');
    expect(getAttackType('thu_binh')).toBe('max');
    expect(getAttackType('cong_binh')).toBe('max');
  });
});

describe('damage floor + HP clamp (D-05)', () => {
  it('non-crit hits deal exactly 1 when atk <= def; hits never deal 0; HP never negative', () => {
    const result = runBattle(SEED, PLAYER, ENEMY);
    for (const turn of result.roundLogs) {
      expect(turn.defenderHpAfter).toBeGreaterThanOrEqual(0);
      if (turn.hit) expect(turn.dmg).toBeGreaterThanOrEqual(1);
    }
    // player STR atk 55 <= enemy STR def 64 -> every player non-crit hit floors at 1
    const playerNonCritHits = result.roundLogs.filter(
      (t) => t.attacker === PLAYER.heroId && t.hit && !t.crit,
    );
    expect(playerNonCritHits.length).toBeGreaterThan(0);
    for (const t of playerNonCritHits) expect(t.dmg).toBe(1);
  });

  it('starts the player at hpCurrent (HP is base-only, never IV-summed)', () => {
    const injuredPlayer: CombatantInput = { ...PLAYER, hpCurrent: 60 };
    const result = runBattle(SEED, injuredPlayer, ENEMY);
    // enemy (higher MOV) opens against the player -> first turn defender is player
    expect(result.roundLogs[0].defender).toBe(PLAYER.heroId);
    expect(result.roundLogs[0].defenderHpAfter).toBeLessThanOrEqual(60);
    expect(result.playerHpAfter).toBeLessThanOrEqual(60);
  });
});

describe('BATTLE_CONFIG (A9 drafts)', () => {
  it('exports the round cap and hit/crit constants', () => {
    expect(BATTLE_CONFIG.ROUND_CAP).toBe(20);
    expect(BATTLE_CONFIG.HIT_BASE).toBe(0.85);
    expect(BATTLE_CONFIG.HIT_AGI_FACTOR).toBe(0.003);
    expect(BATTLE_CONFIG.HIT_MIN).toBe(0.5);
    expect(BATTLE_CONFIG.HIT_MAX).toBe(0.99);
    expect(BATTLE_CONFIG.CRIT_BASE).toBe(0.05);
    expect(BATTLE_CONFIG.CRIT_AGI_FACTOR).toBe(0.001);
    expect(BATTLE_CONFIG.CRIT_MIN).toBe(0.02);
    expect(BATTLE_CONFIG.CRIT_MAX).toBe(0.3);
  });
});
