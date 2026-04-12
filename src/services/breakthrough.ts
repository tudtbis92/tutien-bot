/**
 * Breakthrough progression service — pure business logic.
 *
 * No discord.js dependencies. Fully unit-testable.
 *
 * Implements D-15 through D-18 from CONTEXT.md:
 * - D-15: Failure risk only at major realm transitions
 * - D-16: Exact failure probability table
 * - D-17: Penalty = 50% of tu vi above entry threshold; never drops below threshold
 * - D-18: No retry cooldown
 *
 * Threat mitigations (threat_model):
 * - T-02-BT-01: tu_vi underflow — applyBreakthroughFailure uses WHERE guard
 * - T-02-BT-02: realm_id overflow — canAttemptBreakthrough checks realmId >= 41
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { characters } from '../db/schema/characters.js';
import { REALM_CONFIG } from '../constants/realms.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type BreakthroughCheck =
  | { allowed: true }
  | { allowed: false; reason: 'max_realm' }
  | { allowed: false; reason: 'insufficient_tuvi'; required: number; current: bigint };

export type BreakthroughResult =
  | { outcome: 'success'; newRealmId: number }
  | { outcome: 'fail'; penaltyAmount: bigint };

// ── Pure functions (no DB — testable in isolation) ──────────────────────────

/**
 * Check whether a character is eligible to attempt breakthrough.
 *
 * @returns `{ allowed: true }` or a typed denial reason.
 */
export function canAttemptBreakthrough(
  char: { realmId: number; tuVi: bigint },
): BreakthroughCheck {
  // T-02-BT-02: Guard against realm_id at or beyond max tier (41)
  if (char.realmId >= 41) {
    return { allowed: false, reason: 'max_realm' };
  }

  const currentTier = REALM_CONFIG[char.realmId];
  if (!currentTier) {
    // Defensive: unknown realm ID
    return { allowed: false, reason: 'max_realm' };
  }

  const { tuViRequired, entryThreshold } = currentTier;

  // Infinity tuViRequired also means max tier — already handled above, but double-check
  if (!isFinite(tuViRequired)) {
    return { allowed: false, reason: 'max_realm' };
  }

  // tuVi is CUMULATIVE (never resets on breakthrough).
  // Advancement requires reaching the ABSOLUTE threshold: entryThreshold + tuViRequired.
  // tuViRequired alone is the INCREMENTAL amount above entryThreshold — never compare directly.
  const requiredAbsolute = entryThreshold + tuViRequired;

  if (char.tuVi < BigInt(requiredAbsolute)) {
    return {
      allowed: false,
      reason: 'insufficient_tuvi',
      required: requiredAbsolute,
      current: char.tuVi,
    };
  }

  return { allowed: true };
}

/**
 * Roll a breakthrough attempt. Assumes `canAttemptBreakthrough` already passed.
 *
 * Tier-within-realm (isMajorBoundary === false): failureChance === 0, always succeeds.
 * Major boundary with failureChance === 0 (LK→TC): always succeeds.
 * Major boundary with failureChance > 0: probabilistic.
 *
 * Failure penalty: 50% of (tuVi - entryThreshold), rounded down via integer division.
 * Never negative — clamped to 0n if tuVi <= entryThreshold.
 */
export function rollBreakthrough(
  char: { realmId: number; tuVi: bigint },
): BreakthroughResult {
  const currentTier = REALM_CONFIG[char.realmId]!;
  const failChance = currentTier.isMajorBoundary ? currentTier.failureChance : 0;
  const roll = Math.random();

  if (roll < failChance) {
    // Failure: penalty = floor(50% of excess above entryThreshold)
    const entryThreshold = BigInt(currentTier.entryThreshold);
    const excess = char.tuVi > entryThreshold ? char.tuVi - entryThreshold : 0n;
    const penaltyAmount = excess / 2n; // BigInt division truncates (floor)
    return { outcome: 'fail', penaltyAmount };
  }

  return { outcome: 'success', newRealmId: char.realmId + 1 };
}

// ── DB write functions ──────────────────────────────────────────────────────

/**
 * Apply a successful breakthrough: advance realm_id by 1.
 *
 * @param characterId - DB primary key
 * @param newRealmId  - Must equal character.realmId + 1
 */
export async function applyBreakthroughSuccess(
  characterId: number,
  newRealmId: number,
): Promise<void> {
  await db
    .update(characters)
    .set({ realmId: newRealmId })
    .where(eq(characters.id, characterId));
}

/**
 * Apply breakthrough failure: deduct tu vi penalty.
 *
 * Uses a DB-side guard to prevent tu_vi going below 0 even if penalty is
 * mis-calculated (T-02-BT-01 mitigation).
 *
 * If `tu_vi - penaltyAmount < 0`, the update clamps to 0 (GREATEST guard).
 *
 * @param characterId   - DB primary key
 * @param penaltyAmount - Must be non-negative
 */
export async function applyBreakthroughFailure(
  characterId: number,
  penaltyAmount: bigint,
): Promise<void> {
  // GREATEST ensures tu_vi never goes negative, even if caller passes wrong value
  await db
    .update(characters)
    .set({
      tuVi: sql`GREATEST(${characters.tuVi} - ${penaltyAmount}::bigint, 0)`,
    })
    .where(eq(characters.id, characterId));
}
