/**
 * Realm utility functions for TuTien Bot.
 *
 * Provides lookups from realm_id into REALM_CONFIG and helper functions
 * used by breakthrough logic, profile display, and leaderboard.
 *
 * Source: RESEARCH.md "Pattern 3: Breakthrough Command", CONTEXT.md D-11..D-14
 */

import { REALM_CONFIG, TU_VI_TO_ADVANCE, MAJOR_REALM_PREFIXES, type RealmTier } from '../constants/realms.js';

/**
 * Get full RealmTier metadata for a given realm_id.
 * @throws RangeError if realmId is out of 0–41 bounds
 */
export function getRealmTier(realmId: number): RealmTier {
  if (realmId < 0 || realmId > 41 || !Number.isInteger(realmId)) {
    throw new RangeError(`Invalid realm_id: ${realmId}. Must be integer 0–41.`);
  }
  const tier = REALM_CONFIG[realmId];
  if (!tier) {
    throw new RangeError(`REALM_CONFIG missing entry for realm_id ${realmId}`);
  }
  return tier;
}

/**
 * Get the i18n key prefix for a major realm (for heading display).
 * Returns the prefix used in i18n keys, e.g., 'luyen_khi', 'truc_co'.
 * @param majorRealmIndex 0–11
 */
export function getMajorRealmI18nPrefix(majorRealmIndex: number): string {
  if (majorRealmIndex < 0 || majorRealmIndex >= MAJOR_REALM_PREFIXES.length) {
    throw new RangeError(`Invalid majorRealmIndex: ${majorRealmIndex}. Must be 0–11.`);
  }
  return MAJOR_REALM_PREFIXES[majorRealmIndex]!;
}

/**
 * Check if a realm_id is a major realm boundary (Hậu Kỳ tier that gates next major realm).
 * Major boundaries: realm_ids 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38
 */
export function isMajorBoundary(realmId: number): boolean {
  return getRealmTier(realmId).isMajorBoundary;
}

/**
 * Get the cumulative tu vi needed to REACH a given realm tier.
 * Used for failure penalty calculation: penalty = 50% of (currentTuVi - entryThreshold)
 */
export function getEntryThreshold(realmId: number): number {
  return getRealmTier(realmId).entryThreshold;
}

/**
 * Compute gathering yield: number of material items granted.
 *
 * Formula: floor((realmFactor + profFactor) / tierPenalty), minimum 1
 * - realmFactor: increases by 1 for every 3 realm tiers
 * - profFactor: 1.5× profession level (minimum 1)
 * - tierPenalty: 2× per material tier (higher tier = fewer drops)
 *
 * Source: RESEARCH.md "Gathering Yield Formula"
 *
 * @param realmId character's current realm (0–41)
 * @param profLevel character's profession level in the relevant profession
 * @param materialTier material rarity tier (0=common, 1=uncommon, 2=rare, 3=epic)
 */
export function computeGatheringYield(
  realmId: number,
  profLevel: number,
  materialTier: number,
): number {
  const realmFactor = Math.max(1, Math.floor(realmId / 3) + 1);
  const profFactor = Math.max(1, Math.floor(profLevel * 1.5));
  const tierPenalty = Math.max(1, materialTier * 2);
  return Math.max(1, Math.floor((realmFactor + profFactor) / tierPenalty));
}

/**
 * Get the total tu vi required to advance from realm_id 0 to a target realm.
 * Equivalent to entryThreshold but calculated directly from TU_VI_TO_ADVANCE.
 */
export function getTotalTuViToReach(targetRealmId: number): number {
  if (targetRealmId <= 0) return 0;
  let total = 0;
  for (let i = 0; i < targetRealmId && i < TU_VI_TO_ADVANCE.length; i++) {
    const cost = TU_VI_TO_ADVANCE[i];
    if (cost === Infinity || cost === undefined) break;
    total += cost;
  }
  return total;
}
