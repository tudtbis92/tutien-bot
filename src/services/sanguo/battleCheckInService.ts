import crypto from 'node:crypto';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userLegions } from '../../db/schema/userLegions.js';
import { userLegionSlots } from '../../db/schema/userLegions.js';
import { heroes } from '../../db/schema/heroes.js';
import { sanguoBattles } from '../../db/schema/sanguoBattles.js';
import { sanguoSkills } from '../../db/schema/sanguoSkills.js';
import { runBattle, runLegionBattle, type CombatantInput, type BattleResult, type LegionBattleInput, type LegionMainInput, type LegionBattleResult } from './battleEngine.js';
import { TIER_MULTIPLIERS, STAT_GAIN_PER_LEVEL } from '../../constants/sanguoProgression.js';
import { rollBossDrop } from './dropService.js';

/**
 * Battle entry orchestrator (Phase 10, TQC-10 — D-01/D-03/D-04/D-06/D-17/D-18).
 *
 * Single-writer rule (Pitfall 5, analog travelCheckInService.ts): each entry
 * runs in ONE FOR UPDATE transaction that locks the player's own rows
 * (player_travel_state + user_sanguo_state — P10-review F7), re-fetches the
 * pending encounter (F2, indexed — never re-roll), and performs every
 * read/write for that interaction inside the tx. Concurrent presses serialize
 * on the row lock; the second press finds the already-resolved state.
 *
 * CRYPTO MANDATE (ASVS V6, Pitfall 4): every player-facing draw rides
 * crypto.randomInt — the battle seed via crypto.randomInt(< 2^32) (D-06,
 * WR-01-corrected: pure-rand's xoroshiro128plus consumes seeds via `seed | 0`,
 * a 32-bit truncation, so a 2^48 draw silently wasted 16 bits of entropy —
 * the seed is now drawn in the RNG's native 2^32 space), the wild
 * IV via crypto.randomInt(0, 32) × 6 (D-03). pure-rand exists ONLY in
 * battleEngine.ts (the seeded in-battle PRNG); it never leaks into this file.
 *
 * REPLAY CONTRACT (D-06 / Pitfall 1): sanguo_battles.input stores BOTH full
 * CombatantInput snapshots ({ player, enemy }) exactly as passed to runBattle;
 * re-running runBattle(seed, input) reproduces the stored roundLogs (Test 8).
 *
 * Error convention: plain throw new Error('CODE') — matched by the command
 * layer via err.message (travel.ts:496-509 pattern).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BattleResolution = 'won' | 'lost' | 'skipped';

export interface BattleOutcome {
  resolution: BattleResolution;
  battleId: number;
  winner: 'player' | 'enemy';
  playerHpAfter: number;
  enemyHpAfter: number;
  roundLogs: unknown[];
}

export interface BattleDeps {
  /** Deterministic battle seed — defaults to crypto.randomInt(2 ** 32) (D-06). */
  seed?: number;
  /** Deterministic wild-IV draw — defaults to crypto.randomInt(0, 32) (D-03). */
  ivRoll?: () => number;
  /** Injected engine — defaults to runBattle (the 10-01 pure function). */
  runBattleFn?: typeof runBattle;
  /** Injected LEGION engine (D-24/D-25 boss routing) — defaults to runLegionBattle. */
  runLegionBattleFn?: typeof runLegionBattle;
  /** Deterministic boss IV draw (all-31, D-24/D-35) — defaults to 31. */
  bossIvRoll?: () => number;
  /** Injected guaranteed boss drop (D-14) — defaults to dropService.rollBossDrop. */
  rollBossDropFn?: (userId: number) => Promise<{ itemCode: string; quantity: number }>;
}

export interface SparBattleDeps extends BattleDeps {
  /** Deterministic spar opponent — defaults to a crypto index pick over the pool. */
  pickHeroId?: number;
}

function defaultIvRoll(): number {
  return crypto.randomInt(0, 32);
}

function defaultSeed(): number {
  // WR-01: pure-rand's xoroshiro128plus consumes the seed via `seed | 0` — a
  // 32-bit truncation. `crypto.randomInt(2 ** 32)` matches that consumption
  // exactly (full 2^32 entropy), instead of the previous 2^48 draw of which
  // only 32 bits ever reached the RNG state (D-06 contract corrected).
  return crypto.randomInt(2 ** 32);
}

/** Build the player CombatantInput from the active companion + heroes base.
 *  PLAN-FIX P0-3: the player main carries its per-copy skills (D-31) + mp, so
 *  solo battles resolve the skill/MP economy too (D-29/D-31 via resolveTurn). */
function playerInputFrom(joined: { uh: typeof userHeroes.$inferSelect; h: typeof heroes.$inferSelect }): CombatantInput {
  return {
    heroId: joined.h.heroId,
    base: {
      str: joined.h.str,
      agi: joined.h.agi,
      int: joined.h.int,
      mov: joined.h.mov,
      lea: joined.h.lea,
      cha: joined.h.cha,
      hp: joined.h.hp,
      mp: joined.h.mp,
    },
    iv: {
      str: joined.uh.ivStr,
      agi: joined.uh.ivAgi,
      int: joined.uh.ivInt,
      mov: joined.uh.ivMov,
      lea: joined.uh.ivLea,
      cha: joined.uh.ivCha,
    },
    hpCurrent: joined.uh.hpCurrent,
    class: joined.h.class,
    isPlayer: true,
    level: joined.uh.level, // D-08: the companion's level
    mpCurrent: joined.h.mp, // D-29 A6: per-battle MP snapshot from base mp
  };
}

/** Roll the wild IV (D-03) — 6 uniform crypto draws in [0, 31]. */
function rollWildIv(ivRoll: () => number): CombatantInput['iv'] {
  return {
    str: ivRoll(),
    agi: ivRoll(),
    int: ivRoll(),
    mov: ivRoll(),
    lea: ivRoll(),
    cha: ivRoll(),
  };
}

/**
 * Resolve the active companion (user_sanguo_state, FOR UPDATE) and gate HP.
 * @throws Error('NO_ACTIVE_HERO') when no companion is set / row missing.
 * @throws Error('HERO_FAINTED') when the companion is at 0 HP (D-04 block).
 */
async function readActiveCompanion(tx: Tx, userId: number): Promise<{
  uh: typeof userHeroes.$inferSelect;
  h: typeof heroes.$inferSelect;
}> {
  const [state] = await tx
    .select()
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .for('update');
  if (!state || state.activeHeroId == null) throw new Error('NO_ACTIVE_HERO');

  const [joined] = await tx
    .select({ uh: userHeroes, h: heroes })
    .from(userHeroes)
    .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
    .where(eq(userHeroes.id, state.activeHeroId))
    .limit(1);
  if (!joined) throw new Error('NO_ACTIVE_HERO');
  if (joined.uh.hpCurrent <= 0) throw new Error('HERO_FAINTED');
  return joined;
}

/** Build the wild (enemy) CombatantInput — the real heroes row (D-24: bosses
 *  route to the legion path, never here), carrying the spawn-rolled level +
 *  skills (PLAN-FIX P0-3, D-31/D-33). */
async function buildEnemyInput(tx: Tx, encounter: typeof encounterRuns.$inferSelect, wildIv: CombatantInput['iv']): Promise<CombatantInput> {
  if (encounter.heroId == null) throw new Error('NO_WILD_HERO');
  const [wildHero] = await tx.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
  if (!wildHero) throw new Error('NO_WILD_HERO');
  const skills = await resolveSkillSnapshot(tx, encounter.skillNormalId, encounter.skillSpecialId);
  return {
    heroId: wildHero.heroId,
    base: {
      str: wildHero.str,
      agi: wildHero.agi,
      int: wildHero.int,
      mov: wildHero.mov,
      lea: wildHero.lea,
      cha: wildHero.cha,
      hp: wildHero.hp,
      mp: wildHero.mp,
    },
    iv: wildIv,
    hpCurrent: wildHero.hp,
    class: wildHero.class,
    isPlayer: false,
    level: encounter.level, // D-33: the spawn-rolled wild level — eff() adds the term
    mpCurrent: wildHero.mp, // D-29 A6: per-battle MP snapshot from base mp
    skillNormal: skills.skillNormal, // P0-3: the wild enemy's rolled skills
    skillSpecial: skills.skillSpecial,
  };
}

/** Resolve a skill snapshot pair from DB ids → the engine's {id, mp*}/${id} shape.
 *  Skills are resolved from the snapshot (never a live read in the engine —
 *  Pitfall 6); this helper reads the catalog ONCE at battle entry. */
async function resolveSkillSnapshot(
  tx: Tx,
  normalId: number | null,
  specialId: number | null,
): Promise<{ skillNormal: CombatantInput['skillNormal']; skillSpecial: CombatantInput['skillSpecial'] }> {
  const ids = [normalId, specialId].filter((id): id is number => id != null);
  if (ids.length === 0) return { skillNormal: null, skillSpecial: null };
  const skills = await tx
    .select()
    .from(sanguoSkills)
    .where(inArray(sanguoSkills.id, ids))
    .limit(2);
  const normal = skills.find((s) => s.id === normalId);
  const special = skills.find((s) => s.id === specialId);
  return {
    skillNormal: normal ? { id: String(normal.id), mpGain: normal.mpGain } : null,
    skillSpecial: special
      ? { id: String(special.id), mpCost: special.mpCost, effectType: special.effectType as 'damage' | 'attack_up' | 'hp_regen' | 'mp_regen', effectValue: special.effectValue }
      : null,
  };
}

/** Store the D-06 replay record — full input snapshot + result, one row. */
async function storeBattle(
  tx: Tx,
  params: {
    userId: number;
    type: 'encounter' | 'spar';
    encounterId: number | null;
    seed: number;
    player: CombatantInput;
    enemy: CombatantInput;
    result: BattleResult;
  },
): Promise<number> {
  const [battle] = await tx
    .insert(sanguoBattles)
    .values({
      userId: params.userId,
      status: 'completed',
      type: params.type,
      encounterId: params.encounterId,
      seed: params.seed,
      input: { player: params.player, enemy: params.enemy },
      roundLogs: params.result.roundLogs,
      result: params.result as unknown as Record<string, unknown>,
      resolvedAt: new Date(),
    })
    .returning({ id: sanguoBattles.id });
  return battle!.id;
}

/** Store a LEGION battle replay (Pitfall 6 — the FULL legion input snapshot is
 *  stored so sanguo_battles.input jsonb is replay-faithful for runLegionBattle). */
async function storeLegionBattle(
  tx: Tx,
  params: {
    userId: number;
    encounterId: number;
    seed: number;
    input: LegionBattleInput;
    result: LegionBattleResult;
  },
): Promise<number> {
  const [battle] = await tx
    .insert(sanguoBattles)
    .values({
      userId: params.userId,
      status: 'completed',
      type: 'encounter',
      encounterId: params.encounterId,
      seed: params.seed,
      input: { legion: params.input } as unknown as Record<string, unknown>,
      roundLogs: params.result.roundLogs,
      result: params.result as unknown as Record<string, unknown>,
      resolvedAt: new Date(),
    })
    .returning({ id: sanguoBattles.id });
  return battle!.id;
}

/** Legion slot join row shape (user_legion_slots ⋈ user_heroes ⋈ heroes). */
interface LegionJoined {
  slotOrder: number;
  uh: typeof userHeroes.$inferSelect;
  h: typeof heroes.$inferSelect;
}

/**
 * D-25 build the LEGION battle input for a boss encounter (forced 3v1):
 * - mains[3]: the player's active legion MAIN slots — EACH main's base stats
 *   × TIER_MULTIPLIERS[userHeroes.tier] (PLAN-FIX P0-2 — the D-07 evolution
 *   term baked in, like the boss), then buffed via chemistry (D-19), + level +
 *   skillIds. The mains' final CombatantInput is pre-baked (Pitfall 6).
 * - supports[9]: each support's `lea` is the EFFECTIVE LEA = base.lea + IV.lea
 *   + (level−1)×STAT_GAIN_PER_LEVEL (PLAN-FIX P2-2), + the D-18 special.
 * - boss: the encounter's REAL zone-general at t2 base × IV all-31 × L50
 *   (D-24/D-35) with its rolled skills (D-31).
 * Returns mains=[] when no legion is assembled (→ legion.not_assembled).
 */
async function buildLegionInput(
  tx: Tx,
  userId: number,
  encounter: typeof encounterRuns.$inferSelect,
  bossIvRoll: () => number,
): Promise<LegionBattleInput> {
  // Read the persisted active legion (user_legions + user_legion_slots).
  const [legion] = await tx.select().from(userLegions).where(eq(userLegions.userId, userId)).limit(1);
  const slots = legion
    ? await tx
        .select({ slotOrder: userLegionSlots.slotOrder, uh: userHeroes, h: heroes })
        .from(userLegionSlots)
        .innerJoin(userHeroes, eq(userLegionSlots.userHeroId, userHeroes.id))
        .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
        .where(eq(userLegionSlots.userId, userId))
        .orderBy(userLegionSlots.slotOrder)
        .limit(12)
    : [];
  if (slots.length === 0) return { mains: [], supports: [], boss: unassignedBoss() };

  const joined = slots as unknown as LegionJoined[];
  const mains = joined.slice(0, 3);
  const supportRows = joined.slice(3, 12).filter((s) => s !== undefined);

  // Resolve skill snapshots for the mains' copies (D-31).
  const mainsInput: LegionMainInput[] = [];
  for (const main of mains) {
    const skills = await resolveSkillSnapshot(tx, main.uh.skillNormalId, main.uh.skillSpecialId);
    const buffed = bakeMain(main);
    mainsInput.push({ ...buffed, skillNormal: skills.skillNormal, skillSpecial: skills.skillSpecial });
  }

  // Supports: effective LEA (P2-2) + the support's special (D-18).
  const supportsInput = await buildSupports(tx, supportRows.map((s) => s as LegionJoined));

  // Boss: the real zone-general (encounter.heroId) at t2 × IV31 × L50 + skills.
  const boss = await buildBossInput(tx, encounter, bossIvRoll);

  return { mains: mainsInput, supports: supportsInput, boss };
}

/** Build a single main's CombatantInput with tier × chemistry-buff baked in
 *  (PLAN-FIX P0-2 — D-07 evolution term). HP/MP stay base×tier. WR-01: the
 *  input carries `userHeroId` (the owning userHeroes copy id) so the caller
 *  can write each main's HP back to its OWN copy after the battle. */
function bakeMain(main: LegionJoined): LegionMainInput {
  const tier = main.uh.tier;
  const mult = TIER_MULTIPLIERS[tier] ?? 1;
  const base = {
    str: Math.round(main.h.str * mult),
    agi: Math.round(main.h.agi * mult),
    int: Math.round(main.h.int * mult),
    mov: Math.round(main.h.mov * mult),
    lea: Math.round(main.h.lea * mult),
    cha: Math.round(main.h.cha * mult),
    hp: Math.round(main.h.hp * mult),
    mp: Math.round(main.h.mp * mult),
  };
  return {
    heroId: main.h.heroId,
    userHeroId: main.uh.id, // WR-01: the copy id — HP write-back keys on this
    base,
    iv: {
      str: main.uh.ivStr,
      agi: main.uh.ivAgi,
      int: main.uh.ivInt,
      mov: main.uh.ivMov,
      lea: main.uh.ivLea,
      cha: main.uh.ivCha,
    },
    hpCurrent: main.uh.hpCurrent, // persist the copy's current HP
    class: main.h.class,
    isPlayer: true,
    level: main.uh.level,
    mpCurrent: base.mp,
    skillNormal: null,
    skillSpecial: null,
  };
}

/** Placeholder boss for the no-legion early return (never fights). */
function unassignedBoss(): CombatantInput {
  return {
    heroId: 'unassigned', base: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0, hp: 1, mp: 1 },
    iv: { str: 0, agi: 0, int: 0, mov: 0, lea: 0, cha: 0 }, hpCurrent: 1, class: 'vanguard', isPlayer: false, level: 1,
  };
}

/** Build the supports (effective LEA per P2-2 + the D-18 special). */
async function buildSupports(tx: Tx, supportRows: LegionJoined[]): Promise<LegionBattleInput['supports']> {
  const out: LegionBattleInput['supports'] = [];
  if (supportRows.length === 0) return out;
  const specials = await fetchSupportSpecials(tx);
  for (const s of supportRows) {
    const effectiveLea = s.h.lea + s.uh.ivLea + (s.uh.level - 1) * STAT_GAIN_PER_LEVEL; // P2-2
    if (s.uh.skillSpecialId == null) continue; // no special → no buff (D-17)
    const special = specials.find((sk) => sk.id === s.uh.skillSpecialId);
    if (!special) continue;
    out.push({
      heroId: s.h.heroId,
      class: s.h.class,
      lea: effectiveLea,
      special: { id: String(special.id), effectType: special.effectType as 'damage' | 'attack_up' | 'hp_regen' | 'mp_regen', effectValue: special.effectValue },
    });
  }
  return out;
}

/** Read the sanguo_skills specials (the D-18 effect resolution source). */
async function fetchSupportSpecials(tx: Tx): Promise<Array<{ id: number; effectType: string; effectValue: number }>> {
  return tx.select({ id: sanguoSkills.id, effectType: sanguoSkills.effectType, effectValue: sanguoSkills.effectValue }).from(sanguoSkills);
}

/** Build the boss enemy CombatantInput — the encounter's REAL zone-general at
 *  t2 base × IV all-31 × L50 (D-24/D-35) + its rolled skills (D-31). */
async function buildBossInput(
  tx: Tx,
  encounter: typeof encounterRuns.$inferSelect,
  bossIvRoll: () => number,
): Promise<CombatantInput> {
  // D-24: a boss encounter ALWAYS carries a real zone-general heroes row
  // (hero_id non-null). Guard here — never `eq(heroes.id, null)`.
  if (encounter.heroId == null) throw new Error('NO_WILD_HERO');
  const [general] = await tx.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
  if (!general) throw new Error('NO_WILD_HERO');
  const mult = TIER_MULTIPLIERS[2]; // t2 base (D-24/D-35)
  const iv = {
    str: bossIvRoll(),
    agi: bossIvRoll(),
    int: bossIvRoll(),
    mov: bossIvRoll(),
    lea: bossIvRoll(),
    cha: bossIvRoll(),
  };
  const skills = await resolveSkillSnapshot(tx, encounter.skillNormalId, encounter.skillSpecialId);
  return {
    heroId: general.heroId,
    base: {
      str: Math.round(general.str * mult),
      agi: Math.round(general.agi * mult),
      int: Math.round(general.int * mult),
      mov: Math.round(general.mov * mult),
      lea: Math.round(general.lea * mult),
      cha: Math.round(general.cha * mult),
      hp: Math.round(general.hp * mult),
      mp: Math.round(general.mp * mult),
    },
    iv,
    hpCurrent: Math.round(general.hp * mult),
    class: general.class,
    isPlayer: false,
    level: 50, // D-35: fixed L50
    mpCurrent: Math.round(general.mp * mult),
    skillNormal: skills.skillNormal,
    skillSpecial: skills.skillSpecial,
  };
}

/** Persist each legion main's OWN remaining HP after the battle (D-25 — the
 *  only hp write site; the engine's playerHpAfter is the sum of the mains'
 *  remaining HP).
 *
 *  WR-01: the mains' HP is written back per copy id (`userHeroId` — the owning
 *  userHeroes copy, carried through LegionMainInput), aligned to the engine's
 *  `result.mainHpAfter[i]` — NEVER a per-survivor average. This preserves the
 *  D-04 fainted state (a main that fell to 0 HP stays fainted instead of being
 *  resurrected by a positive share) and does not clamp full-HP survivors down. */
async function writeLegionHpBack(
  tx: Tx,
  input: LegionBattleInput,
  result: LegionBattleResult,
): Promise<void> {
  for (let i = 0; i < input.mains.length; i++) {
    const main = input.mains[i];
    // WR-01: write keyed by the copy id carried on the input (never re-resolved
    // by species heroId — duplicates make that ambiguous). Skip mains that lack
    // a copy id (defensive; the built legion always carries one) or lack a
    // per-main HP entry.
    if (main.userHeroId == null) continue;
    const hpAfter = result.mainHpAfter?.[i];
    if (hpAfter === undefined) continue;
    await tx
      .update(userHeroes)
      .set({ hpCurrent: hpAfter })
      .where(eq(userHeroes.id, main.userHeroId));
  }
}

/**
 * D-01 encounter battle entry: pending encounter → active-companion HP gate →
 * wild IV roll (crypto) → battle seed (crypto) → runBattle (10-01) → replay
 * record → HP write-back → resolution (won = capture window stays open,
 * lost = 'escaped' + travel resumes). A BOSS encounter routes to the forced
 * legion battle (D-24/D-25) — see buildLegionInput.
 */
export async function startEncounterBattle(userId: number, deps: BattleDeps = {}): Promise<BattleOutcome> {

  const ivRoll = deps.ivRoll ?? defaultIvRoll;
  const seed = deps.seed ?? defaultSeed();
  const runBattleFn = deps.runBattleFn ?? runBattle;

  return db.transaction(async (tx) => {
    // 1. Single-writer lock on the player's journey (Pitfall 5 / F7).
    const [row] = await tx
      .select()
      .from(playerTravelState)
      .where(eq(playerTravelState.userId, userId))
      .for('update');
    if (!row || !row.encounterActive) throw new Error('NO_PENDING_ENCOUNTER');

    // 2. F2 pending re-fetch (indexed) — the battle consumes the LATEST hit.
    const [encounter] = await tx
      .select()
      .from(encounterRuns)
      .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
      .orderBy(desc(encounterRuns.id))
      .limit(1);
    if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');

    // 2b. CR-02 ALREADY-FOUGHT GUARD (D-20 single-battle model): a completed
    //     encounter battle for this pending encounter means the capture window
    //     is already open (win) or the encounter already resolved (loss — but
    //     then it would not be 'pending'). Stale fight buttons from earlier
    //     check-in embeds legitimately remain live in chat; re-running the
    //     battle would re-roll the wild IV for free, reset the enemy to full
    //     HP (breaking the D-20 single-battle economy), and a re-battle loss
    //     would destroy the open capture window / faint the companion.
    //     → BATTLE_ALREADY_FOUGHT; the UI routes to the capture view.
    const [existingBattle] = await tx
      .select()
      .from(sanguoBattles)
      .where(and(eq(sanguoBattles.encounterId, encounter.id), eq(sanguoBattles.type, 'encounter')))
      .limit(1);
    if (existingBattle) throw new Error('BATTLE_ALREADY_FOUGHT');

    // 3. Active companion + HP gate (D-04). For the boss (forced-legion) the
    //    companion read also returns the player's active hero copy — the mains
    //    come from the legion, but the D-04 fainted gate still applies to the
    //    active companion (D-04 blocks battle entry on a fainted companion).
    const active = await readActiveCompanion(tx, userId);

    // P0-3: resolve the player active-companion skills (D-31) so SOLO battles
    // exercise the shared MP/skill resolution too (D-29/D-31 via resolveTurn).
    const playerSkills = await resolveSkillSnapshot(tx, active.uh.skillNormalId, active.uh.skillSpecialId);
    const playerInput = playerInputFrom(active);
    playerInput.skillNormal = playerSkills.skillNormal;
    playerInput.skillSpecial = playerSkills.skillSpecial;

    // 4. Boss vs wild routing (D-23/D-24/D-25): a BOSS encounter forces the
    //    legion battle (runLegionBattle); a WILD encounter stays the SOLO
    //    runBattle (with the P0-3 level/skill carry).
    if (encounter.encounterType === 'boss') {
      const bossSeed = deps.seed ?? defaultSeed();
      const runLegionBattleFn = deps.runLegionBattleFn ?? runLegionBattle;
      const bossIvRoll = deps.bossIvRoll ?? (() => 31);
      const rollBossDropFn = deps.rollBossDropFn ?? rollBossDrop;

      const legionInput = await buildLegionInput(tx, userId, encounter, bossIvRoll);
      if (legionInput.mains.length === 0) throw new Error('legion.not_assembled');
      const result = runLegionBattleFn(bossSeed, legionInput);

      const battleId = await storeLegionBattle(tx, {
        userId,
        encounterId: encounter.id,
        seed: bossSeed,
        input: legionInput,
        result,
      });

      // HP write-back: the mains' HP persist per-combatant (sum = playerHpAfter).
      await writeLegionHpBack(tx, legionInput, result);

      if (result.winner === 'enemy') {
        // D-25 LOSS → the boss departs, travel resumes.
        await tx
          .update(encounterRuns)
          .set({ status: 'escaped', pityCount: 0 })
          .where(eq(encounterRuns.id, encounter.id));
        await tx
          .update(playerTravelState)
          .set({ encounterActive: false, updatedAt: new Date() })
          .where(eq(playerTravelState.userId, userId));
      } else {
        // D-25 WIN → guaranteed item drop (D-14) + capture window stays open.
        await rollBossDropFn(userId);
      }

      return {
        resolution: result.winner === 'player' ? 'won' : 'lost',
        battleId,
        winner: result.winner,
        playerHpAfter: result.playerHpAfter,
        enemyHpAfter: result.enemyHpAfter,
        roundLogs: result.roundLogs,
      };
    }

    // 4b. Wild (solo) path — D-23.
    const wildIv = rollWildIv(ivRoll);
    const enemyInput = await buildEnemyInput(tx, encounter, wildIv);
    const result = runBattleFn(seed, playerInput, enemyInput);

    // 5. Replay record (D-06 / Pitfall 1).
    const battleId = await storeBattle(tx, {
      userId,
      type: 'encounter',
      encounterId: encounter.id,
      seed,
      player: playerInput,
      enemy: enemyInput,
      result,
    });

    // 6. HP write-back — encounter battles persist the engine's playerHpAfter
    //    (0 = fainted, D-04). The ONLY hp_current write site in this service.
    await tx
      .update(userHeroes)
      .set({ hpCurrent: result.playerHpAfter })
      .where(eq(userHeroes.id, active.uh.id));

    // 7. Resolution: won → encounter stays 'pending' (capture window opens,
    //    D-10); lost → 'escaped' + travel resumes (encounterActive cleared,
    //    updatedAt pinned — Pitfall 7).
    if (result.winner === 'enemy') {
      await tx
        .update(encounterRuns)
        .set({ status: 'escaped', pityCount: 0 }) // IN-04: pity resets on terminal resolution
        .where(eq(encounterRuns.id, encounter.id));
      await tx
        .update(playerTravelState)
        .set({ encounterActive: false, updatedAt: new Date() })
        .where(eq(playerTravelState.userId, userId));
    }

    return {
      resolution: result.winner === 'player' ? 'won' : 'lost',
      battleId,
      winner: result.winner,
      playerHpAfter: result.playerHpAfter,
      enemyHpAfter: result.enemyHpAfter,
      roundLogs: result.roundLogs,
    };
  });
}

/**
 * D-17 spar battle: free practice vs a random real hero. Same engine, same
 * replay record (type 'spar', encounter_id NULL) — but NEVER writes HP back,
 * never charges a fee, and grants no reward. Blocked on a fainted companion
 * (same HERO_FAINTED gate as D-04).
 */
export async function startSparBattle(userId: number, deps: SparBattleDeps = {}): Promise<BattleOutcome> {
  const ivRoll = deps.ivRoll ?? defaultIvRoll;
  const seed = deps.seed ?? defaultSeed();
  const runBattleFn = deps.runBattleFn ?? runBattle;

  return db.transaction(async (tx) => {
    // Active-companion gate — identical block to D-04 (D-17).
    const active = await readActiveCompanion(tx, userId);

    // Random real hero pool (crypto index pick — keep the crypto discipline).
    const pool = await tx.select().from(heroes).limit(500);
    if (pool.length === 0) throw new Error('NO_SPAR_POOL');
    let foe = pool[0]!;
    if (deps.pickHeroId != null) {
      foe = pool.find((h) => h.id === deps.pickHeroId) ?? pool[0]!;
    } else {
      foe = pool[crypto.randomInt(0, pool.length)]!;
    }

    const wildIv = rollWildIv(ivRoll);
    const playerInput = playerInputFrom(active);
    const enemyInput: CombatantInput = {
      heroId: foe.heroId,
      base: {
        str: foe.str,
        agi: foe.agi,
        int: foe.int,
        mov: foe.mov,
        lea: foe.lea,
        cha: foe.cha,
        hp: foe.hp,
        mp: foe.mp,
      },
      iv: wildIv,
      hpCurrent: foe.hp,
      class: foe.class,
      isPlayer: false,
    };

    const result = runBattleFn(seed, playerInput, enemyInput);
    const battleId = await storeBattle(tx, {
      userId,
      type: 'spar',
      encounterId: null,
      seed,
      player: playerInput,
      enemy: enemyInput,
      result,
    });

    // D-17 hard rule: NO hp_current write, NO fee, no resolution state change.
    return {
      resolution: result.winner === 'player' ? 'won' : 'lost',
      battleId,
      winner: result.winner,
      playerHpAfter: result.playerHpAfter,
      enemyHpAfter: result.enemyHpAfter,
      roundLogs: result.roundLogs,
    };
  });
}

/**
 * D-18 retreat/skip: resolve the pending encounter as 'skipped' and clear
 * encounterActive (updatedAt pinned so the next check-in counts from resume).
 * The encounter cap is NOT touched — it counts roll hits, not resolutions.
 */
export async function skipEncounter(userId: number): Promise<void> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(playerTravelState)
      .where(eq(playerTravelState.userId, userId))
      .for('update');
    if (!row || !row.encounterActive) throw new Error('NO_PENDING_ENCOUNTER');

    const [pending] = await tx
      .select()
      .from(encounterRuns)
      .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
      .orderBy(desc(encounterRuns.id))
      .limit(1);
    if (!pending) throw new Error('NO_PENDING_ENCOUNTER');

    await tx
      .update(encounterRuns)
      .set({ status: 'skipped', pityCount: 0 }) // IN-04: pity resets on retreat
      .where(eq(encounterRuns.id, pending.id));
    await tx
      .update(playerTravelState)
      .set({ encounterActive: false, updatedAt: new Date() })
      .where(eq(playerTravelState.userId, userId));
  });
}
