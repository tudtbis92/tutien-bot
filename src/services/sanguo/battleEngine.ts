import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformFloat64 } from 'pure-rand/distribution/uniformFloat64';
import { STAT_GAIN_PER_LEVEL } from '../../constants/sanguoProgression.js';

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
 *
 * PHASE 11 (11-05 — D-17/D-29/D-18, PLAN-FIX P0-3):
 * - CombatantInput gains an OPTIONAL `level` (D-08): eff() = base + IV +
 *   (level-1) x STAT_GAIN_PER_LEVEL. Absent -> levelGain 0 -> the Phase 10
 *   formula, byte-identical.
 * - CombatantInput gains OPTIONAL MP/skill fields (D-29): `mpCurrent` +
 *   `skillNormal`/`skillSpecial`. `resolveTurn` is the SHARED turn-resolution
 *   helper used by BOTH runBattle (solo) and runLegionBattle (legion mains +
 *   boss): skill fields PRESENT -> the D-29 MP branch (normal attack gains
 *   +mpGain MP; a special consumes mpCost MP and multiplies damage by its
 *   effectValue/100; insufficient MP -> normal-attack fallback, the
 *   skills.no_mp UI line); skill fields ABSENT -> the exact Phase 10
 *   hit/crit/damage steps consuming the same rng draws in the same order
 *   (the Phase 10 replay contract holds byte-identically).
 * - runLegionBattle (D-17): 3 mains FIGHT + up to 9 supports BUFF ONLY (the
 *   supports never take a turn). Support specials trigger in-battle effects
 *   (D-18: attack_up / hp_regen / mp_regen) on a seeded LEA-driven chance.
 *   The support-trigger rolls ride the SAME xoroshiro128plus as hit/crit —
 *   support outcomes are part of the replay (RESEARCH OQ4); the snapshot
 *   (sanguo_battles.input) must carry the support loadouts + the mains'
 *   PRE-BAKED (chemistry-buffed) stats (Pitfall 6).
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
  /** Phase 11 (D-08): optional level — absent → levelGain 0 → Phase 10
   *  behavior unchanged (eff() = base + IV + (level-1) × STAT_GAIN_PER_LEVEL). */
  level?: number;
  /** Phase 11 (D-29): battle-start MP. Present (with skill fields) → the
   *  combatant participates in the MP economy; the engine never derives it
   *  from a DB — the snapshot carries exactly what the engine needs (Pitfall
   *  6). Per-battle resource (A6): callers snapshot base.mp at battle start. */
  mpCurrent?: number;
  /** Phase 11 (D-29): the 2-slot loadout's NORMAL skill — generates MP on
   *  normal attacks (+mpGain). Resolved by the snapshot, never a DB read. */
  skillNormal?: { id: string; mpGain: number } | null;
  /** Phase 11 (D-29): the 2-slot loadout's SPECIAL skill — consumes MP
   *  (mpCost) and multiplies damage by effectValue/100 ('damage' type);
   *  'attack_up'/'hp_regen'/'mp_regen' types are the SUPPORT-only effects
   *  (D-18) resolved by runLegionBattle. Resolved by the snapshot. */
  skillSpecial?: {
    id: string;
    mpCost: number;
    effectType: 'damage' | 'attack_up' | 'hp_regen' | 'mp_regen';
    effectValue: number;
  } | null;
}

/** One action's record — attacker/defender are heroId strings; dmg 0 on miss.
 *  The Phase 11 fields (attackerMpAfter/action/mpFallback) are set ONLY when
 *  the attacker carries MP/skill fields — legacy (Phase 10) turns omit them,
 *  so their serialized bytes are unchanged. */
export interface TurnLog {
  round: number;
  attacker: string;
  defender: string;
  hit: boolean;
  crit: boolean;
  dmg: number;
  defenderHpAfter: number;
  /** Phase 11 (D-29): attacker MP after this action — absent on legacy turns. */
  attackerMpAfter?: number;
  /** Phase 11 (D-29): 'special' when the special skill was used, 'normal' for
   *  a normal attack (incl. the insufficient-MP fallback) — absent on legacy
   *  turns. */
  action?: 'normal' | 'special';
  /** Phase 11 (D-29): true when an intended special fell back to a normal
   *  attack due to insufficient MP (the skills.no_mp UI line) — absent on
   *  legacy turns. */
  mpFallback?: boolean;
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

/** Phase 11 (D-17): the legion input snapshot — exactly the values passed to
 *  the engine, stored in sanguo_battles.input jsonb (Pitfall 6 replay
 *  contract). 3 mains FIGHT; up to 9 supports BUFF ONLY (never a turn, D-17).
 *  The mains' stats are PRE-BAKED (chemistry buff + level applied by the
 *  caller before this point); the supports' specials trigger in-battle effects
 *  on a seeded LEA-driven chance (D-18). Accepts 1-3 mains — incomplete
 *  legions fight with what they have (the 11-06 forced-legion routing
 *  guarantees >= 1 assembled main, never 0). */
export type LegionMainInput = CombatantInput & {
  level: number;
  /** WR-01 (Phase 11 review): the owning userHeroes copy id — lets the caller
   *  write each main's HP back to its OWN copy (never the species heroId, which
   *  is ambiguous when duplicates exist). The engine ignores it (no math
   *  impact); it rides the stored replay snapshot for faithfulness. */
  userHeroId?: number;
};

export interface LegionBattleInput {
  mains: Array<LegionMainInput>;
  supports: Array<{
    heroId: string;
    class: CombatantInput['class'];
    lea: number;
    special: { id: string; effectType: string; effectValue: number };
  }>;
  boss: CombatantInput;
}

/** Phase 11 (D-17): mirrors the runBattle result shape. playerHpAfter is the
 *  SUM of the mains' remaining HP; the round-cap tie-break HP% is
 *  (sum remaining / sum base HP) vs the boss's remaining fraction.
 *  WR-01: `mainHpAfter` carries each main's OWN remaining HP, aligned to the
 *  `mains` array order — the caller writes each copy's HP back by its copy id
 *  (playerHpAfter remains the faithful sum, so the D-05 formula and Phase 10
 *  replay contracts are untouched). */
export interface LegionBattleResult {
  roundLogs: TurnLog[];
  winner: 'player' | 'enemy';
  rounds: number;
  totalDamagePlayer: number;
  totalDamageEnemy: number;
  playerHpAfter: number;
  enemyHpAfter: number;
  /** WR-01: per-main remaining HP, in `mains` array order (0 = that main
   *  fainted). Sum === playerHpAfter. */
  mainHpAfter: number[];
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

/** Effective stat: base + IV + levelGain for the 6 IV stats (D-05 + D-08).
 *  levelGain = (level-1) × STAT_GAIN_PER_LEVEL; absent level → 0 → the Phase
 *  10 formula unchanged. */
function eff(c: CombatantInput, key: 'str' | 'agi' | 'int' | 'mov' | 'lea' | 'cha'): number {
  const levelGain = ((c.level ?? 1) - 1) * STAT_GAIN_PER_LEVEL;
  return c.base[key] + c.iv[key] + levelGain;
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

/** Phase 11 (D-29): true when the combatant participates in the MP economy —
 *  it carries any MP/skill field on its snapshot. */
function usesMpEconomy(c: CombatantInput): boolean {
  return c.mpCurrent !== undefined || c.skillNormal !== undefined || c.skillSpecial !== undefined;
}

/** D-18 support-effect trigger chance (LEA-driven) — the same formula the
 *  chemistry service exports canonically (11-05 Task 2); the engine keeps a
 *  private copy so it stays self-contained and replay-faithful. */
function supportTriggerChance(lea: number): number {
  return clamp(0.15 * (1 + (lea - 10) * 0.02), 0.05, 0.35);
}

/** Index of the living main with the lowest current HP — the boss's attack
 *  target and the hp_regen support target (deterministic, replay-faithful);
 *  ties → the lowest index. Returns -1 when no main is alive. */
function lowestHpMainIdx(mainHp: number[]): number {
  let idx = -1;
  let lowest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < mainHp.length; i++) {
    if (mainHp[i] <= 0) continue;
    if (mainHp[i] < lowest) {
      lowest = mainHp[i];
      idx = i;
    }
  }
  return idx;
}

/** Index of the living main with the lowest current MP — the mp_regen support
 *  target; ties → the lowest index. Returns -1 when no main is alive. */
function lowestMpMainIdx(mainMp: number[], mainHp: number[]): number {
  let idx = -1;
  let lowest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < mainMp.length; i++) {
    if (mainHp[i] <= 0) continue;
    if (mainMp[i] < lowest) {
      lowest = mainMp[i];
      idx = i;
    }
  }
  return idx;
}

/** Turn context passed by the caller into resolveTurn. */
interface TurnContext {
  /** Current HP of the defender (before this action) — drives defenderHpAfter. */
  defenderHp: number;
  /** Current MP of the attacker. The MP economy is active ONLY when the
   *  attacker carries skill/MP fields on its CombatantInput (P0-3); when
   *  inactive, the turn is byte-identical to the Phase 10 formula. */
  attackerMp?: number;
  /** Attack multiplier from a support attack_up buff (legion only, D-18). */
  atkMult?: number;
}

/** One resolved action, returned by the shared resolveTurn helper. */
interface TurnResolution {
  hit: boolean;
  crit: boolean;
  dmg: number;
  defenderHpAfter: number;
  attackerMpAfter?: number;
  action?: 'normal' | 'special';
  mpFallback?: boolean;
}

/**
 * SHARED turn-resolution helper (PLAN-FIX P0-3, D-29) — used by BOTH runBattle
 * (solo) and runLegionBattle (legion mains + boss). Performs the Phase 10
 * hit/crit/damage steps AND, when the attacker carries MP/skill fields, the
 * skill/MP branch:
 *   - special (MP >= skillSpecial.mpCost): consume mpCost, multiply the damage
 *     by effectValue/100 ('damage' type; seed convention 150 = x1.5), rounded.
 *   - normal (no special / insufficient MP): gain skillNormal.mpGain MP; an
 *     intended special that couldn't be afforded sets mpFallback (skills.no_mp
 *     UI line — the engine emits the outcome).
 * When the skill fields are ABSENT, the action consumes the SAME rng draws in
 * the SAME order (hit, then crit on hit) and returns the exact Phase 10 values
 * — the replay contract holds byte-identically (no MP fields leak onto the
 * legacy TurnLog).
 */
function resolveTurn(
  rng: ReturnType<typeof xoroshiro128plus>,
  attacker: CombatantInput,
  defender: CombatantInput,
  ctx: TurnContext,
): TurnResolution {
  const atkType = getAttackType(attacker.class);
  const atk = statPair(attacker, atkType) * (ctx.atkMult ?? 1);
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
  const defenderHpAfter = Math.max(0, ctx.defenderHp - dmg);

  // D-29/P0-3 skill/MP branch — active only when the attacker carries fields.
  let attackerMpAfter: number | undefined;
  let action: 'normal' | 'special' | undefined;
  let mpFallback: boolean | undefined;
  if (usesMpEconomy(attacker)) {
    let mp = ctx.attackerMp ?? attacker.mpCurrent ?? attacker.base.mp;
    if (attacker.skillSpecial && mp >= attacker.skillSpecial.mpCost) {
      mp -= attacker.skillSpecial.mpCost;
      action = 'special';
      dmg = Math.round(dmg * (attacker.skillSpecial.effectValue / 100));
    } else {
      if (attacker.skillSpecial) mpFallback = true; // intended special, insufficient MP
      mp += attacker.skillNormal?.mpGain ?? 0;
      action = 'normal';
    }
    attackerMpAfter = mp;
  }

  return {
    hit,
    crit,
    dmg,
    defenderHpAfter,
    attackerMpAfter,
    action,
    mpFallback,
  };
}

/** Builds a TurnLog entry from a resolved action — the Phase 11 optional
 *  fields are attached ONLY when present (legacy turns stay byte-identical). */
function buildTurnLog(
  round: number,
  attackerId: string,
  defenderId: string,
  res: TurnResolution,
): TurnLog {
  const log: TurnLog = {
    round,
    attacker: attackerId,
    defender: defenderId,
    hit: res.hit,
    crit: res.crit,
    dmg: res.dmg,
    defenderHpAfter: res.defenderHpAfter,
  };
  if (res.attackerMpAfter !== undefined) log.attackerMpAfter = res.attackerMpAfter;
  if (res.action !== undefined) log.action = res.action;
  if (res.mpFallback !== undefined) log.mpFallback = res.mpFallback;
  return log;
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
  // Phase 11 (D-29): per-battle MP trackers — active only when a combatant
  // carries skill/MP fields (P0-3); inactive sides never touch MP.
  const playerUsesMp = usesMpEconomy(player);
  const enemyUsesMp = usesMpEconomy(enemy);
  let playerMp = playerUsesMp ? (player.mpCurrent ?? player.base.mp) : 0;
  let enemyMp = enemyUsesMp ? (enemy.mpCurrent ?? enemy.base.mp) : 0;

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

      const res = resolveTurn(rng, attacker, defender, {
        defenderHp,
        attackerMp: attacker.isPlayer ? playerMp : enemyMp,
      });
      if (attacker.isPlayer) {
        playerMp = res.attackerMpAfter ?? playerMp;
      } else {
        enemyMp = res.attackerMpAfter ?? enemyMp;
      }
      roundLogs.push(buildTurnLog(round, attacker.heroId, defender.heroId, res));
      if (attacker.isPlayer) {
        totalDamagePlayer += res.dmg;
        enemyHp = res.defenderHpAfter;
      } else {
        totalDamageEnemy += res.dmg;
        playerHp = res.defenderHpAfter;
      }
      if (res.defenderHpAfter <= 0) {
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

/**
 * Run a deterministic LEGION battle from a fixed seed + the full legion input
 * snapshot (D-17/D-31 replay contract). Synchronous, I/O-free, entropy-free —
 * the ONLY randomness source is the seeded xoroshiro128plus threaded through
 * uniformFloat64 (D-06), INCLUDING the D-18 support-trigger rolls (OQ4).
 *
 * Round structure: (1) per round, per support, a seeded trigger roll
 * (clamp(0.15 x (1 + (lea-10) x 0.02), 0.05, 0.35)) → the support's special
 * effect applies to one main — attack_up (+effectValue% atk, 1 turn, target
 * picked by the same rng), hp_regen (heal effectValue% of the main's base HP),
 * mp_regen (+effectValue MP); damage-type specials apply nothing (a support
 * never attacks — D-17). (2) The 3 mains act in MOV desc → AGI desc order
 * (player-first tie) — each attacks the boss via resolveTurn (skills/MP
 * included). (3) The boss attacks the lowest-current-HP living main via
 * resolveTurn (its own rolled skills resolve if present on its CombatantInput).
 * Round cap 20 → winner by total damage, tie → remaining HP% (sum of the
 * mains' remaining / sum of their base HP vs the boss's remaining / base HP).
 *
 * IN-01 (documented behavior): `attack_up` is single-slot LAST-WINS within a
 * round. `atkBuff` holds ONE {mainIdx, mult} and each triggering attack_up
 * support OVERWRITES it, so if two supports both roll attack_up in the same
 * round only the LAST one's buff applies (to the target it picked with its own
 * rng draw; the earlier buff is silently discarded). Every attack_up trigger
 * still consumes its rng roll (replay-faithful) — only the applied-effect
 * count differs. This is deliberate: compounding multiple attack_up buffs in
 * one round is not part of the signed D-18 contract.
 */
export function runLegionBattle(seed: number, input: LegionBattleInput): LegionBattleResult {
  const rng = xoroshiro128plus(seed);
  const { mains, supports, boss } = input;
  const roundLogs: TurnLog[] = [];
  const mainHp = mains.map((m) => m.hpCurrent);
  const mainMp = mains.map((m) => (usesMpEconomy(m) ? (m.mpCurrent ?? m.base.mp) : 0));
  const bossUsesMp = usesMpEconomy(boss);
  let bossHp = boss.hpCurrent;
  let bossMp = bossUsesMp ? (boss.mpCurrent ?? boss.base.mp) : 0;
  let totalDamagePlayer = 0;
  let totalDamageEnemy = 0;

  // A side that starts at 0 HP loses immediately (D-04 fainted guard).
  if (bossHp <= 0 || mainHp.every((hp) => hp <= 0)) {
    return {
      roundLogs,
      winner: bossHp <= 0 ? 'player' : 'enemy',
      rounds: 0,
      totalDamagePlayer,
      totalDamageEnemy,
      playerHpAfter: mainHp.reduce((a, b) => a + b, 0),
      enemyHpAfter: bossHp,
      mainHpAfter: [...mainHp],
    };
  }

  let winner: 'player' | 'enemy' | null = null;
  let rounds = 0;

  for (let round = 1; round <= BATTLE_CONFIG.ROUND_CAP && winner === null; round++) {
    rounds = round;

    // (1) Support effects (D-18) — seeded trigger rolls, part of the replay.
    let atkBuff: { mainIdx: number; mult: number } | null = null;
    for (const support of supports) {
      if (uniformFloat64(rng) >= supportTriggerChance(support.lea)) continue;
      const effect = support.special;
      if (effect.effectType === 'attack_up') {
        const targetIdx = Math.floor(uniformFloat64(rng) * mains.length);
        atkBuff = { mainIdx: targetIdx, mult: 1 + effect.effectValue / 100 };
      } else if (effect.effectType === 'hp_regen') {
        const targetIdx = lowestHpMainIdx(mainHp);
        if (targetIdx !== -1) {
          const heal = Math.round((mains[targetIdx].base.hp * effect.effectValue) / 100);
          mainHp[targetIdx] = Math.min(mains[targetIdx].base.hp, mainHp[targetIdx] + heal);
        }
      } else if (effect.effectType === 'mp_regen') {
        const targetIdx = lowestMpMainIdx(mainMp, mainHp);
        if (targetIdx !== -1) mainMp[targetIdx] += effect.effectValue;
      }
      // damage / unknown effectTypes: the roll resolves (replay-faithful) but
      // a support never attacks (D-17) — no effect applied.
    }

    // (2) The mains act in MOV desc → AGI desc order (player-first tie) —
    //     each attacks the boss through the shared resolveTurn.
    const order = mains.map((_, i) => i).sort((a, b) => compareCombatants(mains[a], mains[b]));
    for (const mainIdx of order) {
      if (winner !== null) break;
      if (mainHp[mainIdx] <= 0) continue; // dead main — skips its action
      if (bossHp <= 0) break; // boss dead on a previous action this round
      const mult = atkBuff !== null && atkBuff.mainIdx === mainIdx ? atkBuff.mult : 1;
      const res = resolveTurn(rng, mains[mainIdx], boss, {
        defenderHp: bossHp,
        attackerMp: mainMp[mainIdx],
        atkMult: mult,
      });
      mainMp[mainIdx] = res.attackerMpAfter ?? mainMp[mainIdx];
      totalDamagePlayer += res.dmg;
      bossHp = res.defenderHpAfter;
      roundLogs.push(buildTurnLog(round, mains[mainIdx].heroId, boss.heroId, res));
      if (bossHp <= 0) winner = 'player';
    }

    // (3) The boss attacks the lowest-current-HP living main via resolveTurn
    //     (deterministic, replay-faithful; its own skills resolve if present).
    if (winner === null && bossHp > 0) {
      const targetIdx = lowestHpMainIdx(mainHp);
      if (targetIdx === -1) {
        winner = 'enemy'; // all mains dead
      } else {
        const res = resolveTurn(rng, boss, mains[targetIdx], {
          defenderHp: mainHp[targetIdx],
          attackerMp: bossMp,
        });
        bossMp = res.attackerMpAfter ?? bossMp;
        totalDamageEnemy += res.dmg;
        mainHp[targetIdx] = res.defenderHpAfter;
        roundLogs.push(buildTurnLog(round, boss.heroId, mains[targetIdx].heroId, res));
        if (mainHp.every((hp) => hp <= 0)) winner = 'enemy';
      }
    }
  }

  const playerHpAfter = mainHp.reduce((a, b) => a + b, 0);
  const playerMaxHp = mains.reduce((a, m) => a + m.base.hp, 0);
  let resolved: 'player' | 'enemy';
  if (winner !== null) {
    resolved = winner;
  } else if (totalDamagePlayer > totalDamageEnemy) {
    resolved = 'player';
  } else if (totalDamageEnemy > totalDamagePlayer) {
    resolved = 'enemy';
  } else {
    const playerFraction = playerMaxHp > 0 ? playerHpAfter / playerMaxHp : 0;
    const enemyFraction = boss.base.hp > 0 ? bossHp / boss.base.hp : 0;
    resolved = playerFraction >= enemyFraction ? 'player' : 'enemy';
  }

  return {
    roundLogs,
    winner: resolved,
    rounds,
    totalDamagePlayer,
    totalDamageEnemy,
    playerHpAfter,
    enemyHpAfter: bossHp,
    mainHpAfter: [...mainHp],
  };
}
