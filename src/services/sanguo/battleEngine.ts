import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformFloat64 } from 'pure-rand/distribution/uniformFloat64';

/**
 * Seeded, replayable battle engine (Phase 10, TQC-10 — D-05/D-06).
 *
 * D-05 FORMULA CONTRACT (locked): combatStat = base + IV; HP/MP base-only
 * (IV never adds HP); turn order = MOV desc, tie -> AGI desc, still tie ->
 * the player (isPlayer) acts first; attack type by class — STR for
 * vanguard/cavalry/archer, INT for spellcaster/schemer, MAX(STR,INT) for
 * vu_co/thu_binh/cong_binh (both atk AND def use the same stat pair);
 * damage = max(atk − def, 1); hit/crit derive from AGI (attacker AGI
 * raises both, defender AGI lowers both); crit doubles damage; round cap
 * 20 -> winner = higher total damage dealt, tie -> higher remaining HP%,
 * full tie -> the player (documented; mirrors 'attacker first').
 *
 * D-06 REPLAY MODEL: runBattle(seed, input) is a synchronous, I/O-free,
 * entropy-free pure function. Replay = re-run with the stored seed + full
 * stat snapshot and assert identical roundLogs (sanguo_battles.input jsonb
 * must contain both heroes' full base+IV+hpCurrent — Pitfall 1). The ONLY
 * randomness source is the seeded xoroshiro128plus rng threaded through
 * the whole battle via uniformFloat64(rng) in [0,1).
 *
 * PURE-MODULE CONTRACT (analog: encounterService.ts): no db/redis/discord
 * imports, no Math.random, no Date/now/global state — the engine executes
 * no I/O and trusts nothing external; callers (10-05 battleCheckInService)
 * own crypto seed generation and never leak the seeded rng outside.
 *
 * FLAGGED ASSUMPTION (round-cap boundary): the engine runs AT MOST 20
 * rounds; if a combatant reaches 0 HP at any point (including exactly on
 * round 20's first action), the battle ends immediately with the other
 * side the winner; the cap is never exceeded. All damage/HP values are
 * integers; crit is exactly x2; rolls are strict `roll < chance`.
 */

/** Full stat snapshot of one combatant — the D-06 input shape stored in
 * sanguo_battles.input jsonb. `class` is the formation-position enum from
 * heroes.ts (8 values). `isPlayer` drives tie-breaks and the winner side. */
export interface CombatantInput {
  heroId: string;
  base: {
    str: number;
    agi: number;
    int: number;
    mov: number;
    lea: number;
    cha: number;
    hp: number;
    mp: number;
  };
  iv: {
    str: number;
    agi: number;
    int: number;
    mov: number;
    lea: number;
    cha: number;
  };
  /** May be less than base.hp for the player (D-04 persistence), never more. */
  hpCurrent: number;
  class:
    | 'vanguard'
    | 'cavalry'
    | 'archer'
    | 'spellcaster'
    | 'schemer'
    | 'vu_co'
    | 'thu_binh'
    | 'cong_binh';
  isPlayer: boolean;
}

/** One action's record — attacker/defender are heroId strings; dmg 0 on miss. */
export interface TurnLog {
  round: number;
  attacker: string;
  defender: string;
  hit: boolean;
  crit: boolean;
  dmg: number;
  defenderHpAfter: number;
}

/** Winner is the SIDE (isPlayer flag), not the heroId. */
export interface BattleResult {
  roundLogs: TurnLog[];
  winner: 'player' | 'enemy';
  rounds: number;
  totalDamagePlayer: number;
  totalDamageEnemy: number;
  playerHpAfter: number;
  enemyHpAfter: number;
}

/** D-05 locked: every effective stat is base + IV (6 IV stats only). */
export function combatStat(base: number, iv: number): number {
  return base + iv;
}

/** D-05 class -> attack/defend stat pair mapping. */
export function getAttackType(cls: CombatantInput['class']): 'str' | 'int' | 'max' {
  switch (cls) {
    case 'vanguard':
    case 'cavalry':
    case 'archer':
      return 'str';
    case 'spellcaster':
    case 'schemer':
      return 'int';
    case 'vu_co':
    case 'thu_binh':
    case 'cong_binh':
      return 'max';
  }
}

/** A9 draft constants — exported for the 10-04 balance pass to re-sanitize
 * against the seeded AGI spread before capture balancing. */
export const BATTLE_CONFIG = {
  ROUND_CAP: 20,
  HIT_BASE: 0.85,
  HIT_AGI_FACTOR: 0.003,
  HIT_MIN: 0.5,
  HIT_MAX: 0.99,
  CRIT_BASE: 0.05,
  CRIT_AGI_FACTOR: 0.001,
  CRIT_MIN: 0.02,
  CRIT_MAX: 0.3,
} as const;

/** Effective stat: base + IV for the 6 IV stats (D-05). */
function eff(c: CombatantInput, key: 'str' | 'agi' | 'int' | 'mov' | 'lea' | 'cha'): number {
  return combatStat(c.base[key], c.iv[key]);
}

/** Effective atk/def for the attacker's stat pair (D-05 class mapping). */
function statPair(c: CombatantInput, type: 'str' | 'int' | 'max'): number {
  if (type === 'str') return eff(c, 'str');
  if (type === 'int') return eff(c, 'int');
  return Math.max(eff(c, 'str'), eff(c, 'int'));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** D-05 turn-order comparator: MOV desc -> AGI desc -> player (isPlayer) first. */
function compareCombatants(a: CombatantInput, b: CombatantInput): number {
  const movDiff = eff(b, 'mov') - eff(a, 'mov');
  if (movDiff !== 0) return movDiff;
  const agiDiff = eff(b, 'agi') - eff(a, 'agi');
  if (agiDiff !== 0) return agiDiff;
  if (a.isPlayer && !b.isPlayer) return -1;
  if (!a.isPlayer && b.isPlayer) return 1;
  return 0;
}

/** Round-cap resolution (D-05): higher total damage -> higher remaining HP%
 * -> player on full tie (flagged assumption, documented in header). */
function resolveCap(
  totalDamagePlayer: number,
  totalDamageEnemy: number,
  playerHp: number,
  enemyHp: number,
  player: CombatantInput,
  enemy: CombatantInput,
): 'player' | 'enemy' {
  if (totalDamagePlayer > totalDamageEnemy) return 'player';
  if (totalDamageEnemy > totalDamagePlayer) return 'enemy';
  const playerFraction = playerHp / player.base.hp;
  const enemyFraction = enemyHp / enemy.base.hp;
  return playerFraction >= enemyFraction ? 'player' : 'enemy';
}

/**
 * Run a deterministic battle from a fixed seed + both heroes' full stat
 * snapshots. Synchronous, I/O-free, entropy-free — replay contract D-06.
 *
 * @param seed   battle seed (crypto.randomInt(< 2^32) at battle start, per
 *               D-06 — pure-rand's xoroshiro128plus consumes seeds via a
 *               32-bit truncation, so the seed lives in its native 2^32 space)
 * @param player player-side CombatantInput (isPlayer: true)
 * @param enemy  enemy-side CombatantInput (isPlayer: false)
 */
export function runBattle(seed: number, player: CombatantInput, enemy: CombatantInput): BattleResult {
  const rng = xoroshiro128plus(seed);
  const roundLogs: TurnLog[] = [];
  let playerHp = player.hpCurrent;
  let enemyHp = enemy.hpCurrent;
  let totalDamagePlayer = 0;
  let totalDamageEnemy = 0;

  // A combatant that starts at 0 HP loses immediately (D-04 fainted guard).
  if (playerHp <= 0 || enemyHp <= 0) {
    return {
      roundLogs,
      winner: playerHp <= 0 ? 'enemy' : 'player',
      rounds: 0,
      totalDamagePlayer,
      totalDamageEnemy,
      playerHpAfter: playerHp,
      enemyHpAfter: enemyHp,
    };
  }

  let winner: 'player' | 'enemy' | null = null;
  let rounds = 0;

  for (let round = 1; round <= BATTLE_CONFIG.ROUND_CAP && winner === null; round++) {
    rounds = round;
    const order = [player, enemy].sort(compareCombatants);
    for (const attacker of order) {
      const defender = attacker === player ? enemy : player;
      const defenderHp = attacker.isPlayer ? enemyHp : playerHp;
      // Battle already ended on the action that killed — no further action.
      if (defenderHp <= 0) break;

      const atkType = getAttackType(attacker.class);
      const atk = statPair(attacker, atkType);
      const def = statPair(defender, atkType);
      const agiA = eff(attacker, 'agi');
      const agiD = eff(defender, 'agi');
      const hitChance = clamp(
        BATTLE_CONFIG.HIT_BASE + (agiA - agiD) * BATTLE_CONFIG.HIT_AGI_FACTOR,
        BATTLE_CONFIG.HIT_MIN,
        BATTLE_CONFIG.HIT_MAX,
      );
      const hit = uniformFloat64(rng) < hitChance;
      let crit = false;
      let dmg = 0;
      if (hit) {
        const critChance = clamp(
          BATTLE_CONFIG.CRIT_BASE + (agiA - agiD) * BATTLE_CONFIG.CRIT_AGI_FACTOR,
          BATTLE_CONFIG.CRIT_MIN,
          BATTLE_CONFIG.CRIT_MAX,
        );
        crit = uniformFloat64(rng) < critChance;
        dmg = Math.max(atk - def, 1) * (crit ? 2 : 1);
      }
      const hpAfter = Math.max(0, defenderHp - dmg);
      roundLogs.push({
        round,
        attacker: attacker.heroId,
        defender: defender.heroId,
        hit,
        crit,
        dmg,
        defenderHpAfter: hpAfter,
      });
      if (attacker.isPlayer) {
        totalDamagePlayer += dmg;
        enemyHp = hpAfter;
      } else {
        totalDamageEnemy += dmg;
        playerHp = hpAfter;
      }
      if (hpAfter <= 0) {
        winner = attacker.isPlayer ? 'player' : 'enemy';
        break;
      }
    }
  }

  return {
    roundLogs,
    winner: winner ?? resolveCap(totalDamagePlayer, totalDamageEnemy, playerHp, enemyHp, player, enemy),
    rounds,
    totalDamagePlayer,
    totalDamageEnemy,
    playerHpAfter: playerHp,
    enemyHpAfter: enemyHp,
  };
}
