import crypto from 'node:crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { sanguoBattles } from '../../db/schema/sanguoBattles.js';
import { heroes } from '../../db/schema/heroes.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { captureAttempts } from '../../db/schema/captureAttempts.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { deductBalance } from '../wallet.js';
import { cryptoUniform } from './encounterService.js';
import {
  CAPTURE_TIERS,
  CAPTURE_BASE_BY_RARITY,
  FLEE_RATE_BY_RARITY,
  PITY_INCREMENT,
  PITY_CAP_BY_RARITY,
  hpFactor,
} from '../../constants/sanguoCapture.js';

/**
 * Server-authoritative capture service (Phase 10, TQC-11 — D-10/D-11).
 *
 * CRYPTO MANDATE (ASVS V6 / Pitfall 4): every player-facing draw here rides
 * crypto — the capture roll and the flee roll via cryptoUniform() (crypto
 * randomInt-based), the capture IV via crypto.randomInt(0, 32) × 6. pure-rand
 * exists ONLY in battleEngine.ts; it never leaks into this file.
 *
 * SINGLE-WRITER (Pitfall 3 / double-spend): every attempt runs in ONE FOR
 * UPDATE transaction that locks the pending encounter row first. Two
 * concurrent tier presses serialize on that lock; the second press re-fetches
 * and finds no pending row → NO_PENDING_ENCOUNTER. Success additionally
 * WHERE-guards the transition via the locked row's state (status never leaves
 * 'pending' except through this tx).
 *
 * SERVER-AUTHORITATIVE STATE (Pitfall 2 / T-10-05-04): chance, pity, wild HP
 * and rarity all resolve INSIDE the tx from LOCKED rows (encounter_runs,
 * the latest sanguo_battles snapshot, heroes, CAPTURE_TIERS) — nothing from
 * the interaction payload is trusted. The displayed % is floor(chance×100)
 * at the UI layer; the roll rides the EXACT chance, and the audit row stores
 * BOTH exact values (SC2 checkable).
 *
 * AUDIT (TQC-11 / SC2 / T-10-05-05 repudiation): every attempt — success,
 * fail, and flee — inserts exactly one capture_attempts row with tier, fee,
 * displayedChance, roll, outcome, pityBefore. The wallet fee (D-03) shares
 * the same tx: a ledger row per fee, INSUFFICIENT_BALANCE rolls everything
 * back (no audit row for a rollback).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * D-10/D-11 capture chance: `base(rarity) × hpFactor × tierMultiplier +
 * min(pity×PITY_INCREMENT, PITY_CAP_BY_RARITY[rarity])`, clamped to [0,1]
 * AFTER pity (strict bounds — the roll compares against this exact value).
 * `pity` is the per-encounter FAILURE COUNT (encounter_runs.pity_count);
 * each failed attempt adds PITY_INCREMENT (5pp) to the NEXT attempt's chance
 * (D-11 — the Task-3 test pins chance2 − chance1 === PITY_INCREMENT for pity
 * 0 → 1). The pity term is CAP-BOUND per rarity (CR-01 amendment): pity
 * grinding can never drive the chance to 1.0 for a rare hero
 * (PITY_CAP_BY_RARITY — 0.80 / 0.75 / 0.70 / 0.65 / 0.60). hpFactor
 * (Pokemon-standard) is lower when the wild hero has more HP — battle
 * performance directly feeds capture odds (Pitfall 5).
 */
export function captureChance(params: {
  rarity: number;
  hpMax: number;
  hpCurrent: number;
  tierMultiplier: number;
  pity: number;
}): number {
  const base = CAPTURE_BASE_BY_RARITY[params.rarity] ?? 0;
  const pityCap = PITY_CAP_BY_RARITY[params.rarity] ?? 0.8;
  const pityTerm = Math.min(params.pity * PITY_INCREMENT, pityCap);
  const raw = base * hpFactor(params.hpMax, params.hpCurrent) * params.tierMultiplier + pityTerm;
  return Math.min(1, Math.max(0, raw));
}

export interface CaptureAttemptResult {
  success: boolean;
  chance: number;
  roll: number;
  outcome: 'success' | 'fail' | 'flee';
  tier: number;
  fee: bigint;
  pityBefore: number;
  balanceAfter: bigint;
  userHeroId?: number;
}

export interface CaptureDeps {
  /** Capture roll in [0,1) — defaults to cryptoUniform. */
  roll?: () => number;
  /** Flee roll in [0,1) — defaults to cryptoUniform. */
  fleeRoll?: () => number;
  /** Capture IV draw in [0,31] — defaults to crypto.randomInt(0, 32). */
  ivRoll?: () => number;
  /** Boss capture TIER roll in [0,1) — D-28 t0 95 / t1 4.98 / t2 0.02.
   *  Defaults to cryptoUniform (crypto player-facing). Inject for deterministic
   *  boundary tests; NEVER rendered (D-12). */
  tierRoll?: () => number;
}

/** Shape of the stored D-06 input snapshot (battleCheckInService writes it). */
type StoredInputShape = { enemy?: { base?: { hp?: number } } };
type StoredResultShape = { enemyHpAfter?: number };

/** Wild rarity — heroes row, or 5 for a boss (D-13 low rate, high rarity).
 *  PLAN-FIX P1-2: rarity stays keyed on `encounterType === 'boss'` — after the
 *  D-24 redesign the boss carries a REAL heroId with a REAL rarity (1-5);
 *  keying on heroId would silently move the boss base chance off the signed
 *  rarity-5 10% (D-26 violation). The boss base is ALWAYS CAPTURE_BASE_BY_RARITY[5]. */
async function wildRarity(tx: Tx, encounter: typeof encounterRuns.$inferSelect): Promise<{ rarity: number; heroBaseHp: number }> {
  if (encounter.encounterType === 'boss') {
    // Boss rarity is a constant — the capture-fee model is the signed rarity-5
    // 10% base (D-26), independent of the zone general's real rarity (P1-2).
    return { rarity: 5, heroBaseHp: 0 };
  }
  // Wild path — the wild encounter ALWAYS carries a real heroes row (D-33);
  // guard the nullable hero_id before reading the heroes row.
  if (encounter.heroId == null) throw new Error('NO_WILD_HERO');
  const [wildHero] = await tx.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
  if (!wildHero) throw new Error('NO_WILD_HERO');
  return { rarity: wildHero.rarity, heroBaseHp: wildHero.hp };
}

/**
 * One capture attempt — the single-writer transaction (D-10/D-11, TQC-11).
 * Fee (D-03) → exact-chance roll → pity/flee → audit → IV insert on success.
 */
export async function attemptCapture(
  userId: number,
  tier: number,
  deps: CaptureDeps = {},
): Promise<CaptureAttemptResult> {
  const rollFn = deps.roll ?? cryptoUniform;
  const fleeFn = deps.fleeRoll ?? cryptoUniform;
  const ivFn = deps.ivRoll ?? (() => crypto.randomInt(0, 32));
  const tierFn = deps.tierRoll ?? cryptoUniform;

  return db.transaction(async (tx) => {
    // 1. F2 pending re-fetch with FOR UPDATE — the lock IS the double-spend
    //    defense (Pitfall 3): concurrent presses serialize; the second finds
    //    no pending row here (or after the state transition).
    const [encounter] = await tx
      .select()
      .from(encounterRuns)
      .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
      .orderBy(desc(encounterRuns.id))
      .limit(1)
      .for('update');
    if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');

    // 2. Tier resolved server-side (anti-tamper — the customId carries only
    //    the tier number; fee + multiplier come from CAPTURE_TIERS, D-09).
    const cfg = CAPTURE_TIERS.find((t) => t.tier === tier);
    if (!cfg) throw new Error('INVALID_TIER');
    if (cfg.requiresItem != null) throw new Error('TIER_LOCKED');

    // 2b. Boss-capture guard is GONE (adopt-d24 / D-24 one-way supersession):
    //     a boss encounter now carries a REAL heroes row (hero_id non-null), so
    //     the boss is capturable like any hero — the old unavailable-guard is removed.
    const isBoss = encounter.encounterType === 'boss';

    // 2c. CR-01 WON-BATTLE PRECONDITION (D-10): the capture window opens ONLY
    //     on a player win. The UI gates capture behind the win row, but the
    //     router dispatches ANY crafted `sanguo:capture:tier:{n}` customId to
    //     this tx — so the server re-verifies a completed player-won encounter
    //     battle exists BEFORE the fee is charged. Without a won battle there
    //     is no capture; missing/defeat → CAPTURE_NOT_AVAILABLE, the whole tx
    //     rolls back (no fee, no audit row). The SAME row is the HP snapshot
    //     source below (one read).
    const [battle] = await tx
      .select()
      .from(sanguoBattles)
      .where(and(eq(sanguoBattles.encounterId, encounter.id), eq(sanguoBattles.type, 'encounter')))
      .orderBy(desc(sanguoBattles.id))
      .limit(1);
    const storedResult = (battle?.result ?? {}) as StoredResultShape & { winner?: string };
    if (!battle || storedResult.winner !== 'player') throw new Error('CAPTURE_NOT_AVAILABLE');

    // 3. Wild state from LOCKED rows — HP from the battle snapshot (Pitfall 2:
    //    recompute from the locked row, never the interaction payload). The
    //    snapshot is REQUIRED (WR-03 fail-loud): a missing/drifted row shape
    //    must not silently collapse the chance to pity-only while still
    //    charging the fee — NO_BATTLE_SNAPSHOT throws before the fee.
    const input = (battle.input ?? {}) as StoredInputShape;
    const result = (battle.result ?? {}) as StoredResultShape;
    const hpMax = input.enemy?.base?.hp;
    const hpCurrent = result.enemyHpAfter;
    if (hpMax == null || hpCurrent == null) throw new Error('NO_BATTLE_SNAPSHOT');
    const { rarity, heroBaseHp } = await wildRarity(tx, encounter);

    // 4. Chance recomputed INSIDE the tx from locked state (clamped [0,1]).
    const chance = captureChance({
      rarity,
      hpMax,
      hpCurrent,
      tierMultiplier: cfg.multiplier,
      pity: encounter.pityCount,
    });

    // 5. Fee via the wallet — WHERE-guarded UPDATE + ledger row in this tx
    //    (D-03, SC1). INSUFFICIENT_BALANCE throws → the whole tx rolls back.
    const balanceAfter = await deductBalance(tx, userId, cfg.fee, {
      reason: 'sanguo_capture_t' + tier,
      metadata: { encounterId: encounter.id, tier, chance },
    });

    // 6. The exact-chance roll (Pitfall 2: roll against the exact chance;
    //    the UI displays floor(chance×100) only).
    const roll = rollFn();
    const success = roll < chance;

    const pityBefore = encounter.pityCount;
    let outcome: 'success' | 'fail' | 'flee' = 'fail';
    let userHeroId: number | undefined;

    if (success) {
      outcome = 'success';
      // 7a. Capture: 6× crypto IV roll → user_heroes insert. The copy is a
      //     FRESH roll per D-28/D-36:
      //       - wild: KEEPS the spawn-rolled encounter level (P1-1, D-34) + the
      //         spawn skills (D-31) — NOT the hardcoded level 1.
      //       - boss: RANDOM tier roll (t0 95 / t1 4.98 / t2 0.02, D-28) +
      //         FIXED level 20 (D-36) + skills from encounter_runs (D-31).
      //     tier/level/skills are written to user_heroes (single source, D-10).
      const iv = {
        str: ivFn(),
        agi: ivFn(),
        int: ivFn(),
        mov: ivFn(),
        lea: ivFn(),
        cha: ivFn(),
      };
      const capturedLevel = isBoss ? 20 : encounter.level;
      const capturedTier = isBoss ? (tierFn() < 0.95 ? 0 : tierFn() < 0.9998 ? 1 : 2) : 0;
      // D-24/D-33: both the wild and boss capture paths carry a REAL heroes
      // row (hero_id non-null) — guard the nullable column before the NOT NULL
      // user_heroes insert (userHeroes.heroId).
      if (encounter.heroId == null) throw new Error('NO_WILD_HERO');
      const capturedHeroId = encounter.heroId;
      const [uh] = await tx
        .insert(userHeroes)
        .values({
          userId,
          heroId: capturedHeroId,
          level: capturedLevel,
          ivStr: iv.str,
          ivAgi: iv.agi,
          ivInt: iv.int,
          ivMov: iv.mov,
          ivLea: iv.lea,
          ivCha: iv.cha,
          hpCurrent: heroBaseHp,
          capturedZone: encounter.zone,
          tier: capturedTier,
          skillNormalId: encounter.skillNormalId,
          skillSpecialId: encounter.skillSpecialId,
        })
        .returning({ id: userHeroes.id });
      userHeroId = uh?.id;

      await tx
        .update(encounterRuns)
        .set({ status: 'captured', pityCount: 0 }) // IN-04: pity resets on success
        .where(eq(encounterRuns.id, encounter.id));
      await tx
        .update(playerTravelState)
        .set({ encounterActive: false, updatedAt: new Date() })
        .where(eq(playerTravelState.userId, userId));
    } else {
      // 7b. Fail: pity increments for the NEXT attempt (D-11), then the flee
      //     roll fires ONCE per attempt (D-10).
      await tx
        .update(encounterRuns)
        .set({ pityCount: sql`${encounterRuns.pityCount} + 1` })
        .where(eq(encounterRuns.id, encounter.id));

      const fleeRoll = fleeFn();
      if (fleeRoll < FLEE_RATE_BY_RARITY[rarity]) {
        outcome = 'flee';
        await tx
          .update(encounterRuns)
          .set({ status: 'fled', pityCount: 0 }) // IN-04: pity resets on flee
          .where(eq(encounterRuns.id, encounter.id));
        await tx
          .update(playerTravelState)
          .set({ encounterActive: false, updatedAt: new Date() })
          .where(eq(playerTravelState.userId, userId));
      }
      // No flee → the encounter stays 'pending' — retry open (fee per attempt).
    }

    // 8. EVERY attempt → one audit row with the EXACT chance and roll
    //    (TQC-11/SC2 — the single insert site covering success/fail/flee).
    await tx.insert(captureAttempts).values({
      userId,
      encounterId: encounter.id,
      tier,
      fee: cfg.fee,
      displayedChance: chance,
      roll,
      outcome,
      pityBefore,
    });

    return {
      success,
      chance,
      roll,
      outcome,
      tier,
      fee: cfg.fee,
      pityBefore,
      balanceAfter,
      userHeroId,
    };
  });
}
