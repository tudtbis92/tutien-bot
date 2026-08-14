import { describe, it, expect } from 'vitest';
import {
  CAPTURE_TIERS,
  CAPTURE_BASE_BY_RARITY,
  FLEE_RATE_BY_RARITY,
  PITY_INCREMENT,
  PITY_CAP_BY_RARITY,
  RARITY_DISTRIBUTION,
  hpFactor,
} from '../sanguoCapture.js';

/**
 * Capture constant sanity tests (10-03 Task 2, behaviors 1-4).
 *
 * Contract context: the values under test are the D-20 economy contract
 * (docs/economy-budget.md RE-SIGN 2026-08-13) — CAPTURE_TIERS is the ONLY
 * server-side fee source (anti-tamper: the fee never rides a customId). The
 * hidden-mechanics rule (D-12) means these tables are never rendered; this
 * test file is the only consumer outside the capture/battle services.
 */

describe('CAPTURE_TIERS (D-09 5-tier model)', () => {
  it('has exactly 5 tiers', () => {
    expect(CAPTURE_TIERS).toHaveLength(5);
  });

  it('fees are strictly ascending (bigint)', () => {
    for (let i = 1; i < CAPTURE_TIERS.length; i++) {
      expect(CAPTURE_TIERS[i]!.fee > CAPTURE_TIERS[i - 1]!.fee).toBe(true);
    }
  });

  it('multipliers are strictly ascending', () => {
    for (let i = 1; i < CAPTURE_TIERS.length; i++) {
      expect(CAPTURE_TIERS[i]!.multiplier > CAPTURE_TIERS[i - 1]!.multiplier).toBe(true);
    }
  });

  it('tiers 1-3 are fee-only (requiresItem null), tiers 4-5 are item-gated', () => {
    const tierByNumber = new Map(CAPTURE_TIERS.map((t) => [t.tier, t]));
    for (const tier of [1, 2, 3]) {
      expect(tierByNumber.get(tier)!.requiresItem).toBeNull();
    }
    for (const tier of [4, 5]) {
      expect(tierByNumber.get(tier)!.requiresItem).not.toBeNull();
    }
  });

  it('every tier fee is a non-negative bigint (matches users.balance)', () => {
    for (const tier of CAPTURE_TIERS) {
      expect(typeof tier.fee).toBe('bigint');
      expect(tier.fee >= 0n).toBe(true);
    }
  });
});

describe('CAPTURE_BASE_BY_RARITY + FLEE_RATE_BY_RARITY (D-08/D-10)', () => {
  it('both tables have exactly the 5 rarity keys 1-5', () => {
    expect(Object.keys(CAPTURE_BASE_BY_RARITY).sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(Object.keys(FLEE_RATE_BY_RARITY).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('base capture chance strictly decreases with rarity', () => {
    for (let rarity = 2; rarity <= 5; rarity++) {
      expect(CAPTURE_BASE_BY_RARITY[rarity]! < CAPTURE_BASE_BY_RARITY[rarity - 1]!).toBe(true);
    }
  });

  it('flee rate strictly increases with rarity (rarer flees more, D-10)', () => {
    for (let rarity = 2; rarity <= 5; rarity++) {
      expect(FLEE_RATE_BY_RARITY[rarity]! > FLEE_RATE_BY_RARITY[rarity - 1]!).toBe(true);
    }
  });

  it('all values are probabilities within [0, 1]', () => {
    for (const rarity of [1, 2, 3, 4, 5]) {
      expect(CAPTURE_BASE_BY_RARITY[rarity]!).toBeGreaterThanOrEqual(0);
      expect(CAPTURE_BASE_BY_RARITY[rarity]!).toBeLessThanOrEqual(1);
      expect(FLEE_RATE_BY_RARITY[rarity]!).toBeGreaterThanOrEqual(0);
      expect(FLEE_RATE_BY_RARITY[rarity]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('PITY_INCREMENT + RARITY_DISTRIBUTION (D-11/A1)', () => {
  it('PITY_INCREMENT is a small positive per-attempt increment (0, 0.25]', () => {
    expect(PITY_INCREMENT).toBeGreaterThan(0);
    expect(PITY_INCREMENT).toBeLessThanOrEqual(0.25);
  });

  it('RARITY_DISTRIBUTION is a percent-weight map summing to 100', () => {
    const total = Object.values(RARITY_DISTRIBUTION).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});

describe('PITY_CAP_BY_RARITY (CR-01 pity cap)', () => {
  it('has exactly the 5 rarity keys 1-5', () => {
    expect(Object.keys(PITY_CAP_BY_RARITY).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('starts at 0.80 for the lowest rarity and decreases 0.05 per tier (0.75/0.70/0.65/0.60)', () => {
    expect(PITY_CAP_BY_RARITY[1]).toBe(0.8);
    expect(PITY_CAP_BY_RARITY[2]).toBeCloseTo(0.75, 10);
    expect(PITY_CAP_BY_RARITY[3]).toBeCloseTo(0.7, 10);
    expect(PITY_CAP_BY_RARITY[4]).toBeCloseTo(0.65, 10);
    expect(PITY_CAP_BY_RARITY[5]).toBeCloseTo(0.6, 10);
    for (let rarity = 2; rarity <= 5; rarity++) {
      expect(PITY_CAP_BY_RARITY[rarity]! < PITY_CAP_BY_RARITY[rarity - 1]!).toBe(true);
    }
  });
});

describe('hpFactor (Pokemon-standard HP factor)', () => {
  it('full HP -> ~1/3 (hardest to capture)', () => {
    expect(hpFactor(100, 100)).toBeCloseTo(1 / 3, 3);
  });

  it('half HP -> ~2/3', () => {
    expect(hpFactor(100, 50)).toBeCloseTo(2 / 3, 3);
  });

  it('zero HP -> 1.0 (easiest to capture)', () => {
    expect(hpFactor(100, 0)).toBe(1);
  });

  it('is 0 for hpMax <= 0 (no captureable target)', () => {
    expect(hpFactor(0, 50)).toBe(0);
    expect(hpFactor(-10, 50)).toBe(0);
  });

  it('clamps to [0, 1] (hpCurrent beyond bounds)', () => {
    expect(hpFactor(100, 150)).toBe(0);
    expect(hpFactor(100, -50)).toBe(1);
  });
});
