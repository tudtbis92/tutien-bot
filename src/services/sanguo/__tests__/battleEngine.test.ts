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

/** Helper — walks the log and asserts HP bookkeeping is consistent: every
 * turn's defenderHpAfter equals max(0, hpBefore − dmg), and a miss leaves
 * the defender HP unchanged. */
function assertHpConsistent(result: ReturnType<typeof runBattle>, player: CombatantInput, enemy: CombatantInput): void {
  const hp = new Map<string, number>([
    [player.heroId, player.hpCurrent],
    [enemy.heroId, enemy.hpCurrent],
  ]);
  for (const turn of result.roundLogs) {
    const before = hp.get(turn.defender)!;
    if (turn.hit) {
      expect(turn.dmg).toBeGreaterThanOrEqual(1);
      expect(turn.defenderHpAfter).toBe(Math.max(0, before - turn.dmg));
    } else {
      expect(turn.dmg).toBe(0);
      expect(turn.defenderHpAfter).toBe(before); // miss: HP unchanged
    }
    hp.set(turn.defender, turn.defenderHpAfter);
  }
}

describe('round-cap resolution (D-05)', () => {
  // Tiny per-hit damage (atk−def = 1) vs huge HP -> both survive 20 rounds.
  const capPlayer: CombatantInput = {
    heroId: 'p-cap',
    base: { str: 20, agi: 150, int: 20, mov: 35, lea: 20, cha: 20, hp: 5000, mp: 50 },
    iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 5000,
    class: 'vanguard',
    isPlayer: true,
  };
  const capEnemy: CombatantInput = {
    heroId: 'e-cap',
    base: { str: 21, agi: 0, int: 20, mov: 35, lea: 20, cha: 20, hp: 5000, mp: 50 },
    iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 5000,
    class: 'vanguard',
    isPlayer: false,
  };

  it('ends at exactly ROUND_CAP with winner = higher total damage', () => {
    const seed = 100; // verified: 20 rounds, player 22 dmg > enemy 11 dmg
    const result = runBattle(seed, capPlayer, capEnemy);
    expect(result.rounds).toBe(20);
    expect(result.roundLogs.length).toBeLessThanOrEqual(20 * 2);
    expect(result.totalDamagePlayer).toBeGreaterThan(result.totalDamageEnemy);
    expect(result.winner).toBe('player');
    assertHpConsistent(result, capPlayer, capEnemy);
  });

  it('resolves a total-damage tie by higher remaining HP%', () => {
    // Mirror stats, different max HP (player 2000 vs enemy 1000), hpCurrent
    // = base.hp. Seed 111: damage tie 16/16, player HP% 99.2 > enemy 98.4.
    const tiePlayer: CombatantInput = {
      heroId: 'p-tie',
      base: { str: 20, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 2000, mp: 50 },
      iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
      hpCurrent: 2000,
      class: 'vanguard',
      isPlayer: true,
    };
    const tieEnemy: CombatantInput = {
      heroId: 'e-tie',
      base: { str: 20, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 1000, mp: 50 },
      iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
      hpCurrent: 1000,
      class: 'vanguard',
      isPlayer: false,
    };
    const seed = 111;
    const result = runBattle(seed, tiePlayer, tieEnemy);
    expect(result.rounds).toBe(20);
    expect(result.totalDamagePlayer).toBe(result.totalDamageEnemy);
    const playerFraction = result.playerHpAfter / tiePlayer.base.hp;
    const enemyFraction = result.enemyHpAfter / tieEnemy.base.hp;
    expect(playerFraction).toBeGreaterThan(enemyFraction);
    expect(result.winner).toBe('player');
    // replay determinism at this seed
    expect(runBattle(seed, tiePlayer, tieEnemy)).toEqual(result);
  });
});

describe('crit path (D-05: crit exactly x2)', () => {
  // Attacker AGI 300 (269 base + 31 iv) vs defender AGI 0 -> critChance
  // clamps at CRIT_MAX 0.3; hitChance clamps at HIT_MAX. atk−def = 40.
  const critPlayer: CombatantInput = {
    heroId: 'p-crit',
    base: { str: 90, agi: 269, int: 30, mov: 35, lea: 20, cha: 20, hp: 300, mp: 50 },
    iv: { str: 10, agi: 31, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 300,
    class: 'vanguard',
    isPlayer: true,
  };
  const critEnemy: CombatantInput = {
    heroId: 'e-crit',
    base: { str: 60, agi: 0, int: 30, mov: 35, lea: 20, cha: 20, hp: 300, mp: 50 },
    iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 300,
    class: 'vanguard',
    isPlayer: false,
  };

  it('records a crit turn whose dmg is exactly 2x the non-crit dmg on identical stats', () => {
    const seed = 102; // verified: 1 crit (80) and 1 non-crit hit (40)
    const result = runBattle(seed, critPlayer, critEnemy);
    const critTurn = result.roundLogs.find((t) => t.attacker === 'p-crit' && t.crit);
    const nonCritHit = result.roundLogs.find((t) => t.attacker === 'p-crit' && t.hit && !t.crit);
    expect(critTurn).toBeDefined();
    expect(nonCritHit).toBeDefined();
    expect(critTurn!.dmg).toBe(80); // 2 x (atk 100 - def 60)
    expect(nonCritHit!.dmg).toBe(40);
    expect(critTurn!.dmg).toBe(2 * nonCritHit!.dmg);
    assertHpConsistent(result, critPlayer, critEnemy);
  });
});

describe('miss path (D-05: miss = 0 damage)', () => {
  // Attacker AGI 0 vs defender AGI 121 -> hitChance clamps at HIT_MIN 0.5.
  const missPlayer: CombatantInput = {
    heroId: 'p-miss',
    base: { str: 50, agi: 0, int: 30, mov: 35, lea: 20, cha: 20, hp: 100, mp: 50 },
    iv: { str: 5, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 100,
    class: 'vanguard',
    isPlayer: true,
  };
  const missEnemy: CombatantInput = {
    heroId: 'e-miss',
    base: { str: 60, agi: 90, int: 30, mov: 35, lea: 20, cha: 20, hp: 80, mp: 50 },
    iv: { str: 4, agi: 31, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 80,
    class: 'vanguard',
    isPlayer: false,
  };

  it('produces miss turns (hit: false, dmg: 0) with defender HP unchanged', () => {
    const seed = 100; // verified: 6 miss turns for the low-AGI attacker
    const result = runBattle(seed, missPlayer, missEnemy);
    const missTurns = result.roundLogs.filter((t) => t.attacker === 'p-miss' && !t.hit);
    expect(missTurns.length).toBeGreaterThan(0);
    for (const turn of missTurns) {
      expect(turn.crit).toBe(false);
      expect(turn.dmg).toBe(0);
    }
    assertHpConsistent(result, missPlayer, missEnemy);
  });
});

describe('HP floor / lethal blow (D-05)', () => {
  // Enemy (MOV 63) acts first, its near-1.0 first roll misses; the player
  // then lands a 205-dmg blow killing the 30-HP enemy on round 1.
  const killPlayer: CombatantInput = {
    heroId: 'p-kill',
    base: { str: 200, agi: 90, int: 30, mov: 30, lea: 20, cha: 20, hp: 100, mp: 50 },
    iv: { str: 10, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 100,
    class: 'vanguard',
    isPlayer: true,
  };
  const killEnemy: CombatantInput = {
    heroId: 'e-kill',
    base: { str: 5, agi: 0, int: 30, mov: 60, lea: 20, cha: 20, hp: 30, mp: 50 },
    iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
    hpCurrent: 30,
    class: 'vanguard',
    isPlayer: false,
  };

  it('clamps defenderHpAfter to exactly 0 and ends the battle that round', () => {
    const seed = 100; // verified: rounds 1, player wins, final defenderHpAfter 0
    const result = runBattle(seed, killPlayer, killEnemy);
    expect(result.rounds).toBe(1);
    expect(result.winner).toBe('player');
    const last = result.roundLogs.at(-1)!;
    expect(last.defender).toBe('e-kill');
    expect(last.defenderHpAfter).toBe(0);
    expect(last.dmg).toBeGreaterThanOrEqual(30);
    for (const turn of result.roundLogs) expect(turn.defenderHpAfter).toBeGreaterThanOrEqual(0);
    assertHpConsistent(result, killPlayer, killEnemy);
  });
});

describe('replay determinism across the seed space (D-06)', () => {
  it('deep-equals roundLogs across a 25-seed sample and diverges between seeds', () => {
    const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
    const serialized = new Set<string>();
    for (const seed of seeds) {
      const a = runBattle(seed, PLAYER, ENEMY);
      const b = runBattle(seed, PLAYER, ENEMY);
      expect(b).toEqual(a);
      expect(b.roundLogs).toEqual(a.roundLogs);
      serialized.add(JSON.stringify(a.roundLogs));
    }
    // seed sensitivity: at least one turn line differs between min and max seeds
    const minLog = runBattle(seeds[0], PLAYER, ENEMY).roundLogs;
    const maxLog = runBattle(seeds[seeds.length - 1], PLAYER, ENEMY).roundLogs;
    expect(JSON.stringify(minLog)).not.toBe(JSON.stringify(maxLog));
    expect(serialized.size).toBeGreaterThan(1);
  });
});
