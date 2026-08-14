import { describe, it, expect } from 'vitest';
import {
  LEVEL_COST,
  STAT_GAIN_PER_LEVEL,
  TIER_MULTIPLIERS,
  EVOLUTION_COSTS,
  REROLL_COST,
  MAX_LEVEL,
} from '../sanguoProgression.js';

/**
 * Progression constant sanity tests (11-02 Task 1, behaviors 1-2).
 *
 * Contract context: these values are the hidden balance contract (D-12 —
 * NEVER rendered; only spendable hồn ngọc costs reach a UI surface). The
 * per-level cost curve (D-05) is IDENTICAL across tiers by construction —
 * LEVEL_COST is a pure function of level, no tier argument exists. The
 * values are signed into the Phase 11 balance contract (RESEARCH Pattern 1,
 * flagged assumption A1/A2); the 11-08 balance pass re-sanitizes them.
 */

describe('LEVEL_COST (D-05 accelerating cost curve)', () => {
  it('formula: 1 + Math.floor((level-1)^2 / 200)', () => {
    // Curve anchors from the signed contract (A1):
    // L1→2 costs 1, L1→21 ≈ 27, L1→51 ≈ 264, L1→100 ≈ 1741
    expect(LEVEL_COST(1)).toBe(1);
    expect(LEVEL_COST(2)).toBe(1);
    expect(LEVEL_COST(21)).toBe(3);
    expect(LEVEL_COST(51)).toBe(13);
    expect(LEVEL_COST(100)).toBe(50);
  });

  it('cost is a pure function of level — identical across tiers (D-05)', () => {
    // The function has NO tier parameter: evolution never inflates leveling
    // cost. The same level always costs the same, for every tier.
    for (let level = 1; level <= 99; level++) {
      expect(LEVEL_COST(level)).toBe(1 + Math.floor((level - 1) ** 2 / 200));
    }
  });

  it('is strictly non-decreasing and positive', () => {
    let prev = 0;
    for (let level = 1; level <= 99; level++) {
      const cost = LEVEL_COST(level);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeGreaterThanOrEqual(prev);
      prev = cost;
    }
  });
});

describe('STAT_GAIN_PER_LEVEL + TIER_MULTIPLIERS (D-08/D-07)', () => {
  it('STAT_GAIN_PER_LEVEL is exactly 2 (flat gain on the 6 battle stats)', () => {
    expect(STAT_GAIN_PER_LEVEL).toBe(2);
  });

  it('TIER_MULTIPLIERS has exactly the 4 signed entries {0:1.0, 1:1.1, 2:1.25, 3:1.5}', () => {
    expect(Object.keys(TIER_MULTIPLIERS).sort()).toEqual(['0', '1', '2', '3']);
    expect(TIER_MULTIPLIERS[0]).toBe(1.0);
    expect(TIER_MULTIPLIERS[1]).toBe(1.1);
    expect(TIER_MULTIPLIERS[2]).toBe(1.25);
    expect(TIER_MULTIPLIERS[3]).toBe(1.5);
  });

  it('tier multipliers are strictly increasing (evolution is a boost)', () => {
    const values = Object.values(TIER_MULTIPLIERS);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]! > values[i - 1]!).toBe(true);
    }
  });
});

describe('EVOLUTION_COSTS + REROLL_COST + MAX_LEVEL (D-06/D-09/D-32/D-01)', () => {
  it('EVOLUTION_COSTS = {1:20, 2:50, 3:100} hồn ngọc to evolve INTO tier 1/2/3', () => {
    expect(EVOLUTION_COSTS[1]).toBe(20);
    expect(EVOLUTION_COSTS[2]).toBe(50);
    expect(EVOLUTION_COSTS[3]).toBe(100);
  });

  it('EVOLUTION_COSTS has exactly the 3 signed entries (t0->t1->t2->t3)', () => {
    expect(Object.keys(EVOLUTION_COSTS).sort()).toEqual(['1', '2', '3']);
  });

  it('REROLL_COST is exactly 10 hồn ngọc per slot (D-32)', () => {
    expect(REROLL_COST).toBe(10);
  });

  it('MAX_LEVEL is 100 (D-01)', () => {
    expect(MAX_LEVEL).toBe(100);
  });
});
