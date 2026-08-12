import crypto from 'node:crypto';

/**
 * Pure encounter roll engine (TQC-08, D-10/D-13/D-14/D-15/D-24).
 *
 * CRYPTO RNG MANDATE (milestone decision / ASVS V6): every player-facing roll
 * rides `crypto.randomInt` via `cryptoUniform()` — never the predictable
 * global PRNG. The `rng` parameter exists ONLY so tests can inject
 * deterministic draws; production defaults to crypto-backed.
 *
 * Locked D-15 formula (09-RESEARCH Pattern 3, lines 320-347): position
 * fraction `1 − (remaining/total)`; weight(hero) = rate(zoneA)·(1−pos) +
 * rate(zoneB)·pos, summed when the hero appears in both pools; weighted pick
 * via cumulative walk over `rng() * totalWeight`.
 *
 * B6 fix (dominant-zone attribution): a hero present in BOTH pools is
 * attributed to the pos-dominant contributing zone — zone A when
 * `rateA·(1−pos) >= rateB·pos`, else zone B. The research sketch's
 * `heroZone.set` loop-order overwrite is a known bug; this module implements
 * the corrected attribution.
 *
 * No db/redis imports — the check-in loop owns I/O (single-writer rule,
 * Pitfall 5); this module is pure math only (analog: oddsCalculator.ts).
 */

/** Shape of hero_zone_rates rows consumed by pickEncounterHero (F8: `rate`
 * arrives as a numeric(4,2) STRING from Drizzle — callers convert with
 * Number() before building ZoneRate[]). */
export interface ZoneRate {
  heroId: number;
  zone: string;
  rate: number;
}

/** The encounter the check-in records + displays (D-14: boss has heroId null). */
export interface EncounterRollResult {
  heroId: number | null;
  zone: string;
  boss: boolean;
}

/**
 * D-15 position fraction: 1 − (remaining/total), clamped to [0,1].
 * 0 at departure (remaining = total), 1 at arrival (remaining = 0).
 * total <= 0 (missing edge) → 0.
 */
export function positionFraction(remainingSeconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  const pos = 1 - remainingSeconds / totalSeconds;
  return Math.min(1, Math.max(0, pos));
}

/**
 * Crypto-backed uniform draw in [0, 1) — the ONLY default rng. Player-facing
 * rolls therefore always ride crypto.randomInt (milestone mandate).
 */
export function cryptoUniform(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}

/**
 * D-10 per-counted-minute zone encounter roll (default rate 0.35 — A7).
 * Rolls true when `rng() < encounterRate` (strict <; the boundary misses).
 */
export function shouldRoll(encounterRate: number, rng: () => number = cryptoUniform): boolean {
  return rng() < encounterRate;
}

/**
 * D-14 boss sub-roll replacing a successful hero roll (default 0.07 — A7).
 */
export function shouldRollBoss(bossRate: number, rng: () => number = cryptoUniform): boolean {
  return rng() < bossRate;
}

/**
 * D-15 position-blended weighted pick.
 *
 * Union of both pools; weight(hero) = rate(zoneA)·(1−pos) + rate(zoneB)·pos
 * (summed when the hero appears in both pools). Cumulative-walk selection with
 * `rng() * totalWeight` — crypto-backed by default.
 *
 * B6 fix: the returned `zone` is the pos-dominant CONTRIBUTING zone — a hero
 * in both pools is attributed to the pool with the higher blended weight
 * (zone A when `rateA·(1−pos) >= rateB·pos`, else zone B), NOT the last
 * loop-order write.
 *
 * @throws Error('EMPTY_ENCOUNTER_POOL') when both pools are empty — callers
 * (the check-in roll) guard with a warn-skip before calling.
 */
export function pickEncounterHero(
  poolA: ZoneRate[],
  poolB: ZoneRate[],
  pos: number,
  rng: () => number = cryptoUniform,
): { heroId: number; zone: string } {
  const weights = new Map<number, number>();
  const heroZone = new Map<number, string>();

  for (const { heroId, zone, rate } of poolA) {
    const w = rate * (1 - pos);
    weights.set(heroId, (weights.get(heroId) ?? 0) + w);
    if (!heroZone.has(heroId)) heroZone.set(heroId, zone);
  }
  for (const { heroId, zone, rate } of poolB) {
    const w = rate * pos;
    weights.set(heroId, (weights.get(heroId) ?? 0) + w);
    // B6: dominant-zone attribution — correct the zone only when the blended
    // weight came out B-dominant; never an unconditional loop-order overwrite.
    const rateA = poolA.find((r) => r.heroId === heroId)?.rate ?? 0;
    if (rateA * (1 - pos) < rate * pos) heroZone.set(heroId, zone);
  }

  if (weights.size === 0) throw new Error('EMPTY_ENCOUNTER_POOL');

  // Skip zero-weight entries (a hero absent from the pos-dominant pool) so the
  // cumulative walk can never select them — even at an exact roll of 0.
  const entries = [...weights.entries()].filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error('EMPTY_ENCOUNTER_POOL');

  const total = entries.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [heroId, w] of entries) {
    if ((roll -= w) <= 0) return { heroId, zone: heroZone.get(heroId)! };
  }
  const last = entries.at(-1)!;
  return { heroId: last[0], zone: heroZone.get(last[0])! };
}

/**
 * D-13 sliding-window cap predicate: the window is over the limit (default
 * ~20/hr) → the check-in's roll is silently skipped (no record, no embed,
 * travel continues — travel is never blocked by the cap).
 */
export function capHit(windowCount: number, limit: number = 20): boolean {
  return windowCount >= limit;
}
