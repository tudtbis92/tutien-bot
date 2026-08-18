import { describe, it, expect } from 'vitest';
import {
  combatStat,
  getAttackType,
  runBattle,
  runLegionBattle,
  BATTLE_CONFIG,
  type CombatantInput,
  type LegionBattleInput,
} from '../battleEngine.js';
import { STAT_GAIN_PER_LEVEL } from '../../../constants/sanguoProgression.js';

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

/**
 * Phase 11 (11-05) legion fixtures — 3 mains + 1 boss. The mains' STR atk
 * (100) exceeds the boss's STR def (50) so damage is not floored at 1; the
 * boss's atk (50) equals the mains' def (50) so the boss deals the 1-dmg floor;
 * boss HP is huge so the battle always reaches the round cap in the cap tests.
 */
const LEGION_MAIN_A: CombatantInput & { level: number } = {
  heroId: 'main-a',
  base: { str: 100, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 2000, mp: 50 },
  iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
  hpCurrent: 2000,
  class: 'vanguard',
  isPlayer: true,
  level: 1,
};

const LEGION_MAIN_B: CombatantInput & { level: number } = {
  ...LEGION_MAIN_A,
  heroId: 'main-b',
  base: { ...LEGION_MAIN_A.base, agi: 45, mov: 40 },
};

const LEGION_MAIN_C: CombatantInput & { level: number } = {
  ...LEGION_MAIN_A,
  heroId: 'main-c',
  base: { ...LEGION_MAIN_A.base, agi: 50, mov: 45 },
};

const LEGION_BOSS: CombatantInput = {
  heroId: 'legion-boss',
  base: { str: 50, agi: 40, int: 30, mov: 35, lea: 20, cha: 20, hp: 100000, mp: 50 },
  iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 },
  hpCurrent: 100000,
  class: 'vanguard',
  isPlayer: false,
};

const LEGION_INPUT: LegionBattleInput = {
  mains: [LEGION_MAIN_A, LEGION_MAIN_B, LEGION_MAIN_C],
  supports: [],
  boss: LEGION_BOSS,
};

const LEGION_SEED = 12345;

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

// ================= Phase 11 (11-05): legion + MP/skills + level =================

describe('legion battle (D-17) replay contract (D-06)', () => {
  it('runLegionBattle(seed, input) twice deep-equals itself', () => {
    const first = runLegionBattle(LEGION_SEED, LEGION_INPUT);
    const second = runLegionBattle(LEGION_SEED, LEGION_INPUT);
    expect(second).toEqual(first);
    expect(second.roundLogs).toEqual(first.roundLogs);
  });

  it('different seeds produce different legion round logs', () => {
    const serialized = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      serialized.add(JSON.stringify(runLegionBattle(seed, LEGION_INPUT).roundLogs));
    }
    expect(serialized.size).toBeGreaterThan(1);
  });

  it('the mains act in MOV desc order (main-c MOV 45 first, then B 40, then A 35)', () => {
    const result = runLegionBattle(LEGION_SEED, LEGION_INPUT);
    // three mains -> the first three player-side entries are main-c, main-b, main-a
    const mains = result.roundLogs.filter((t) => t.attacker.startsWith('main-'));
    expect(mains[0].attacker).toBe('main-c');
    expect(mains[1].attacker).toBe('main-b');
    expect(mains[2].attacker).toBe('main-a');
  });

  it('a side that starts at 0 HP loses immediately (D-04 fainted guard)', () => {
    const deadBoss: LegionBattleInput = { ...LEGION_INPUT, boss: { ...LEGION_BOSS, hpCurrent: 0 } };
    const r = runLegionBattle(LEGION_SEED, deadBoss);
    expect(r.rounds).toBe(0);
    expect(r.winner).toBe('player');
  });

  it('WR-01: mainHpAfter carries each main\'s OWN remaining HP (sum === playerHpAfter; never an average)', () => {
    const result = runLegionBattle(LEGION_SEED, LEGION_INPUT);
    expect(result.mainHpAfter).toHaveLength(LEGION_INPUT.mains.length);
    const sum = result.mainHpAfter.reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.playerHpAfter);
    // Each main's remaining HP is clamped to its own start HP — a fainted main
    // is NEVER resurrected by an averaged positive share (WR-01 regression).
    for (let i = 0; i < LEGION_INPUT.mains.length; i++) {
      expect(result.mainHpAfter[i]).toBeGreaterThanOrEqual(0);
      expect(result.mainHpAfter[i]).toBeLessThanOrEqual(LEGION_INPUT.mains[i].hpCurrent);
    }
  });
});

describe('legion round cap (D-05)', () => {
  it('resolves at exactly ROUND_CAP with winner = higher total damage', () => {
    const result = runLegionBattle(LEGION_SEED, LEGION_INPUT);
    expect(result.rounds).toBe(20);
    expect(result.roundLogs.length).toBeLessThanOrEqual(20 * 4); // 3 mains + boss
    // 3 mains out-damage the 1-dmg-floor boss across the full battle
    expect(result.totalDamagePlayer).toBeGreaterThan(result.totalDamageEnemy);
    expect(result.winner).toBe('player');
    // HP bookkeeping: boss HP never rises above its start, mains stay >= 0
    for (const turn of result.roundLogs) expect(turn.defenderHpAfter).toBeGreaterThanOrEqual(0);
  });
});

describe('support effects (D-18)', () => {
  // Single main with a high-LEA vu_co support carrying the attack_up special.
  // Unbuffed: atk 100 vs boss def 50 -> dmg 50. Buffed (+20% atk, effectValue
  // 20): atk 120 -> dmg 70. Seed 2 verified: the support triggers at round 7
  // and the buffed main lands a 70-dmg non-crit hit (deterministic per seed).
  const buffedInput: LegionBattleInput = {
    mains: [LEGION_MAIN_A],
    supports: [
      {
        heroId: 's1',
        class: 'vu_co',
        lea: 60, // triggerChance = clamp(0.15 x (1 + 1.0), 0.05, 0.35) = 0.30
        special: { id: 'vu_co_attack_up', effectType: 'attack_up', effectValue: 20 },
      },
    ],
    boss: LEGION_BOSS,
  };

  it('a high-LEA support triggers its attack_up buff within a seeded battle', () => {
    const seed = 2; // verified: trigger at round 7 -> buffed hit dmg 70
    const result = runLegionBattle(seed, buffedInput);
    const buffedHit = result.roundLogs.find(
      (t) => t.attacker === 'main-a' && t.hit && !t.crit && t.dmg === 70,
    );
    expect(buffedHit).toBeDefined();
    // replay determinism at this seed
    expect(runLegionBattle(seed, buffedInput)).toEqual(result);
  });

  it('the attack_up buff is one-turn: buffed AND unbuffed hits coexist in one run', () => {
    const seed = 2;
    const result = runLegionBattle(seed, buffedInput);
    const playerHits = result.roundLogs.filter((t) => t.attacker === 'main-a' && t.hit);
    // buffed (dmg 70 / crit 140) and unbuffed (dmg 50 / crit 100) both appear
    // -> the +20% atk applies to a single action, never the whole battle
    expect(playerHits.some((t) => t.dmg === 70 || t.dmg === 140)).toBe(true);
    expect(playerHits.some((t) => t.dmg === 50 || t.dmg === 100)).toBe(true);
  });
});

describe('level term (D-08)', () => {
  it('a L50 main deals (L-1) x STAT_GAIN_PER_LEVEL more per hit than the L1 main', () => {
    const inputFor = (level: number): LegionBattleInput => ({
      mains: [{ ...LEGION_MAIN_A, level }],
      supports: [],
      boss: LEGION_BOSS,
    });
    const r1 = runLegionBattle(LEGION_SEED, inputFor(1));
    const r50 = runLegionBattle(LEGION_SEED, inputFor(50));
    // Non-crit hits: L1 max(100-50,1) = 50; L50 max(100+98-50,1) = 148 — the
    // levelGain (49 levels x 2) on STR. (AGI/MOV also gain the level term, so
    // hit/crit patterns legitimately diverge between the two runs.)
    const l1Hit = r1.roundLogs.find((t) => t.attacker === 'main-a' && t.hit && !t.crit);
    const l50Hit = r50.roundLogs.find((t) => t.attacker === 'main-a' && t.hit && !t.crit);
    expect(l1Hit!.dmg).toBe(50);
    expect(l50Hit!.dmg).toBe(148);
    expect(l50Hit!.dmg - l1Hit!.dmg).toBe(49 * STAT_GAIN_PER_LEVEL);
    expect(r50.totalDamagePlayer).toBeGreaterThan(r1.totalDamagePlayer);
  });
});

describe('MP economy (D-29 / PLAN-FIX P0-3)', () => {
  it('skill fields ABSENT -> legacy turns carry ONLY the 7 Phase 10 keys (byte-identical shape)', () => {
    const legacy = runBattle(SEED, PLAYER, ENEMY);
    for (const turn of legacy.roundLogs) {
      expect(Object.keys(turn).sort()).toEqual([
        'attacker',
        'crit',
        'defender',
        'defenderHpAfter',
        'dmg',
        'hit',
        'round',
      ]);
    }
  });

  it('a hero with insufficient MP falls back to a normal attack and gains MP', () => {
    const starved: CombatantInput = {
      ...PLAYER,
      mpCurrent: 10, // below the 25-cost special
      skillNormal: { id: 'n', mpGain: 12 },
      skillSpecial: { id: 's', mpCost: 25, effectType: 'damage', effectValue: 150 },
    };
    const result = runBattle(SEED, starved, ENEMY);
    const first = result.roundLogs.find((t) => t.attacker === PLAYER.heroId)!;
    expect(first.action).toBe('normal');
    expect(first.mpFallback).toBe(true); // intended special, insufficient MP
    expect(first.attackerMpAfter).toBe(22); // 10 + 12 (skillNormal.mpGain)
  });

  it('with sufficient MP the SAME runBattle resolves specials then the fallback (P0-3)', () => {
    const skilledPlayer: CombatantInput = {
      ...PLAYER,
      mpCurrent: 50,
      skillNormal: { id: 'n', mpGain: 12 },
      skillSpecial: { id: 's', mpCost: 25, effectType: 'damage', effectValue: 150 },
    };
    const result = runBattle(SEED, skilledPlayer, ENEMY);
    const playerTurns = result.roundLogs.filter((t) => t.attacker === PLAYER.heroId);
    expect(playerTurns.length).toBeGreaterThan(2);
    // MP bookkeeping is deterministic (independent of hit/miss):
    // special (50-25=25), special (25-25=0), then insufficient-MP fallback (0+12=12)
    expect(playerTurns[0].action).toBe('special');
    expect(playerTurns[0].attackerMpAfter).toBe(25);
    expect(playerTurns[1].action).toBe('special');
    expect(playerTurns[1].attackerMpAfter).toBe(0);
    expect(playerTurns[2].action).toBe('normal');
    expect(playerTurns[2].mpFallback).toBe(true);
    expect(playerTurns[2].attackerMpAfter).toBe(12);
    // the special multiplier shows up in the damage: base non-crit 1 -> round(1 x 1.5) = 2
    const specialHit = result.roundLogs.find(
      (t) => t.attacker === PLAYER.heroId && t.action === 'special' && t.hit && !t.crit,
    );
    expect(specialHit).toBeDefined();
    expect(specialHit!.dmg).toBe(2);
  });

  it('the boss resolves its own rolled skills/MP when present (D-31)', () => {
    const skilledBoss: CombatantInput = {
      ...ENEMY,
      mpCurrent: 50,
      skillNormal: { id: 'n', mpGain: 12 },
      skillSpecial: { id: 's', mpCost: 25, effectType: 'damage', effectValue: 150 },
    };
    const result = runBattle(SEED, PLAYER, skilledBoss);
    const first = result.roundLogs.find((t) => t.attacker === ENEMY.heroId)!;
    expect(first.action).toBe('special'); // enemy MOV 38 > player 37 -> acts first
    expect(first.attackerMpAfter).toBe(25);
    // the player's turns stay legacy (no skill fields -> no MP keys)
    const playerTurn = result.roundLogs.find((t) => t.attacker === PLAYER.heroId)!;
    expect(playerTurn.action).toBeUndefined();
    expect(playerTurn.attackerMpAfter).toBeUndefined();
  });
});
