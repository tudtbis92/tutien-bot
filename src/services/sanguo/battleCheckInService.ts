import crypto from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { heroes } from '../../db/schema/heroes.js';
import { sanguoBattles } from '../../db/schema/sanguoBattles.js';
import { runBattle, type CombatantInput, type BattleResult } from './battleEngine.js';
import { bossTemplateFor } from '../../constants/sanguoBoss.js';

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
 * crypto.randomInt — the battle seed via crypto.randomInt(< 2^48) (D-06,
 * P10-review F5: safe JS integer for the mode:'number' seed column), the wild
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
  /** Deterministic battle seed — defaults to crypto.randomInt(2 ** 48) (D-06). */
  seed?: number;
  /** Deterministic wild-IV draw — defaults to crypto.randomInt(0, 32) (D-03). */
  ivRoll?: () => number;
  /** Injected engine — defaults to runBattle (the 10-01 pure function). */
  runBattleFn?: typeof runBattle;
}

export interface SparBattleDeps extends BattleDeps {
  /** Deterministic spar opponent — defaults to a crypto index pick over the pool. */
  pickHeroId?: number;
}

function defaultIvRoll(): number {
  return crypto.randomInt(0, 32);
}

function defaultSeed(): number {
  return crypto.randomInt(2 ** 48);
}

/** Build the player CombatantInput from the active companion + heroes base. */
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

/** Build the wild (enemy) CombatantInput — heroes row or boss template (A3). */
async function buildEnemyInput(tx: Tx, encounter: typeof encounterRuns.$inferSelect, wildIv: CombatantInput['iv']): Promise<CombatantInput> {
  if (encounter.encounterType === 'boss') {
    const tpl = bossTemplateFor(encounter.zone);
    return {
      heroId: 'boss:' + encounter.zone,
      base: {
        str: tpl.str,
        agi: tpl.agi,
        int: tpl.int,
        mov: tpl.mov,
        lea: tpl.lea,
        cha: tpl.cha,
        hp: tpl.hp,
        mp: tpl.mp,
      },
      iv: wildIv,
      hpCurrent: tpl.hp,
      class: 'vanguard',
      isPlayer: false,
    };
  }
  if (encounter.heroId == null) throw new Error('NO_WILD_HERO');
  const [wildHero] = await tx.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
  if (!wildHero) throw new Error('NO_WILD_HERO');
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

/**
 * D-01 encounter battle entry: pending encounter → active-companion HP gate →
 * wild IV roll (crypto) → battle seed (crypto) → runBattle (10-01) → replay
 * record → HP write-back → resolution (won = capture window stays open,
 * lost = 'escaped' + travel resumes).
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

    // 3. Active companion + HP gate (D-04).
    const active = await readActiveCompanion(tx, userId);

    // 4. Wild stats + IV (D-03), then the engine.
    const wildIv = rollWildIv(ivRoll);
    const playerInput = playerInputFrom(active);
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
        .set({ status: 'escaped' })
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
      .set({ status: 'skipped' })
      .where(eq(encounterRuns.id, pending.id));
    await tx
      .update(playerTravelState)
      .set({ encounterActive: false, updatedAt: new Date() })
      .where(eq(playerTravelState.userId, userId));
  });
}
