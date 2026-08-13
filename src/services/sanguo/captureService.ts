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
 * pity×PITY_INCREMENT`, clamped to [0,1] AFTER pity (strict bounds — the roll
 * compares against this exact value). `pity` is the per-encounter FAILURE
 * COUNT (encounter_runs.pity_count); each failed attempt adds PITY_INCREMENT
 * (5pp) to the NEXT attempt's chance (D-11 — the Task-3 test pins
 * chance2 − chance1 === PITY_INCREMENT for pity 0 → 1). hpFactor
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
  const raw = base * hpFactor(params.hpMax, params.hpCurrent) * params.tierMultiplier + params.pity * PITY_INCREMENT;
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
}

/** Shape of the stored D-06 input snapshot (battleCheckInService writes it). */
type StoredInputShape = { enemy?: { base?: { hp?: number } } };
type StoredResultShape = { enemyHpAfter?: number };

/** Wild rarity — heroes row, or 5 for a boss (D-13 low rate, high rarity). */
async function wildRarity(tx: Tx, encounter: typeof encounterRuns.$inferSelect): Promise<{ rarity: number; heroBaseHp: number }> {
  if (encounter.encounterType === 'boss' || encounter.heroId == null) {
    // Boss rarity is a constant (A3 boss templates are rarity 5).
    return { rarity: 5, heroBaseHp: 0 };
  }
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

    // 2b. Boss capture is not implementable in Phase 10: encounter_runs bosses
    //     have hero_id NULL (A3) and user_heroes.hero_id is NOT NULL, so a
    //     boss capture has no heroes row to grant. Guard BEFORE the fee so a
    //     boss press never charges for an impossible insert.
    if (encounter.heroId == null) throw new Error('BOSS_CAPTURE_UNAVAILABLE');

    // 3. Wild state from LOCKED rows — HP from the battle snapshot (Pitfall 2:
    //    recompute from the locked row, never the interaction payload).
    const [battle] = await tx
      .select()
      .from(sanguoBattles)
      .where(eq(sanguoBattles.encounterId, encounter.id))
      .orderBy(desc(sanguoBattles.id))
      .limit(1);
    const input = (battle?.input ?? {}) as StoredInputShape;
    const result = (battle?.result ?? {}) as StoredResultShape;
    const hpMax = input.enemy?.base?.hp ?? 0;
    const hpCurrent = result.enemyHpAfter ?? 0;
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
      // 7a. Capture: 6× crypto IV roll → user_heroes insert (full base HP,
      //     zone snapshot) → encounter 'captured' → travel resumes.
      const iv = {
        str: ivFn(),
        agi: ivFn(),
        int: ivFn(),
        mov: ivFn(),
        lea: ivFn(),
        cha: ivFn(),
      };
      const [uh] = await tx
        .insert(userHeroes)
        .values({
          userId,
          heroId: encounter.heroId,
          level: 1,
          ivStr: iv.str,
          ivAgi: iv.agi,
          ivInt: iv.int,
          ivMov: iv.mov,
          ivLea: iv.lea,
          ivCha: iv.cha,
          hpCurrent: heroBaseHp,
          capturedZone: encounter.zone,
        })
        .returning({ id: userHeroes.id });
      userHeroId = uh?.id;

      await tx.update(encounterRuns).set({ status: 'captured' }).where(eq(encounterRuns.id, encounter.id));
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
        await tx.update(encounterRuns).set({ status: 'fled' }).where(eq(encounterRuns.id, encounter.id));
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
