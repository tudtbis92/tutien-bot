import crypto from 'node:crypto';
import { cryptoUniform } from './encounterService.js';

/**
 * Wild encounter level service (Phase 11, D-33).
 *
 * D-33: wild heroes spawn at a RANDOM level with distribution
 * L1-10 = 60%, L11-20 = 30%, L21-30 = 9.9%, L31-50 = 0.1% ("30+" caps at
 * L50). Roll mechanics: a crypto-uniform band draw (band = floor(rng() ×
 * 1000)) then a uniform-within-band crypto.randomInt draw.
 *
 * CRYPTO RNG MANDATE (ASVS V6 / Pitfall 4): the default band draw rides
 * `cryptoUniform` (crypto.randomInt-based) and the within-band draws ride
 * `crypto.randomInt` — a player-facing roll. The `rng` parameter exists ONLY
 * so tests can inject deterministic band draws; production defaults to
 * crypto-backed (analog: encounterService.ts).
 *
 * Pure module contract (analog: encounterService.ts / chemistryService.ts):
 * no db/redis/discord imports, no Math.random — this module is pure math.
 */
export const WILD_LEVEL_BANDS = {
  L1_10_CUTOFF: 600, // 0 ‰..599‰ → L1-10 (60%)
  L11_20_CUTOFF: 900, // 600‰..899‰ → L11-20 (30%)
  L21_30_CUTOFF: 999, // 900‰..998‰ → L21-30 (9.9%)
  // 999‰ .. 1000‰ → L31-50 (0.1%)
} as const;

/**
 * D-33 band roll → level 1-50.
 * band = floor(rng() × 1000); band < 600 → crypto.randomInt(1, 11);
 * < 900 → crypto.randomInt(11, 21); < 999 → crypto.randomInt(21, 31);
 * else → crypto.randomInt(31, 51) (the 0.1% tail).
 */
export function rollWildLevel(rng: () => number = cryptoUniform): number {
  const band = Math.floor(rng() * 1000);
  if (band < WILD_LEVEL_BANDS.L1_10_CUTOFF) return crypto.randomInt(1, 11);
  if (band < WILD_LEVEL_BANDS.L11_20_CUTOFF) return crypto.randomInt(11, 21);
  if (band < WILD_LEVEL_BANDS.L21_30_CUTOFF) return crypto.randomInt(21, 31);
  return crypto.randomInt(31, 51);
}