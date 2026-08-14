import { describe, it, expect } from 'vitest';
import { CHEMISTRY_POINTS, CHEMISTRY_TIERS } from '../sanguoChemistry.js';

/**
 * Chemistry constant sanity tests (11-02 Task 1, behavior 3).
 *
 * Contract context: EA FC-grounded chemistry (D-19) — links -> points ->
 * tier -> buff, bonus-only (0 links = no buff, no penalty). These tables are
 * HIDDEN mechanics (D-12): points and buff % NEVER render; only the tier
 * label (S/A/B/C/D) and link count reach a UI surface. Values are the
 * balance contract (flagged assumption A3); the 11-08 balance pass tunes.
 */

describe('CHEMISTRY_POINTS (D-19 hierarchy: family+spouse > faction > role)', () => {
  it('has exactly the 4 signed link types', () => {
    expect(Object.keys(CHEMISTRY_POINTS).sort()).toEqual(['faction', 'family', 'role', 'spouse']);
  });

  it('family + spouse are tier-1 strongest (3pt each)', () => {
    expect(CHEMISTRY_POINTS.family).toBe(3);
    expect(CHEMISTRY_POINTS.spouse).toBe(3);
  });

  it('faction is mid (2pt), role is weakest (1pt)', () => {
    expect(CHEMISTRY_POINTS.faction).toBe(2);
    expect(CHEMISTRY_POINTS.role).toBe(1);
  });

  it('hierarchy holds: family === spouse > faction > role', () => {
    expect(CHEMISTRY_POINTS.family).toBe(CHEMISTRY_POINTS.spouse);
    expect(CHEMISTRY_POINTS.family).toBeGreaterThan(CHEMISTRY_POINTS.faction);
    expect(CHEMISTRY_POINTS.faction).toBeGreaterThan(CHEMISTRY_POINTS.role);
  });
});

describe('CHEMISTRY_TIERS (S>=12 +10% ... D 1-2 +2%, 0 = bonus-only)', () => {
  it('thresholds are strictly descending (S first, 0 last)', () => {
    expect(CHEMISTRY_TIERS[0]!.min).toBe(12);
    expect(CHEMISTRY_TIERS[1]!.min).toBe(8);
    expect(CHEMISTRY_TIERS[2]!.min).toBe(5);
    expect(CHEMISTRY_TIERS[3]!.min).toBe(3);
    expect(CHEMISTRY_TIERS[4]!.min).toBe(1);
    expect(CHEMISTRY_TIERS[5]!.min).toBe(0);
    for (let i = 1; i < CHEMISTRY_TIERS.length; i++) {
      expect(CHEMISTRY_TIERS[i]!.min < CHEMISTRY_TIERS[i - 1]!.min).toBe(true);
    }
  });

  it('buffs are strictly ascending (S +10% ... D +2%, 0 -> +0%)', () => {
    expect(CHEMISTRY_TIERS[0]!.buff).toBeCloseTo(0.1, 10);
    expect(CHEMISTRY_TIERS[1]!.buff).toBeCloseTo(0.08, 10);
    expect(CHEMISTRY_TIERS[2]!.buff).toBeCloseTo(0.06, 10);
    expect(CHEMISTRY_TIERS[3]!.buff).toBeCloseTo(0.04, 10);
    expect(CHEMISTRY_TIERS[4]!.buff).toBeCloseTo(0.02, 10);
    expect(CHEMISTRY_TIERS[5]!.buff).toBe(0);
    for (let i = 1; i < CHEMISTRY_TIERS.length; i++) {
      expect(CHEMISTRY_TIERS[i]!.buff > CHEMISTRY_TIERS[i - 1]!.buff).toBe(true);
    }
  });

  it('tier labels are the UI-SPEC-locked set S/A/B/C/D + a null 0-tier (bonus-only)', () => {
    expect(CHEMISTRY_TIERS[0]!.label).toBe('S');
    expect(CHEMISTRY_TIERS[1]!.label).toBe('A');
    expect(CHEMISTRY_TIERS[2]!.label).toBe('B');
    expect(CHEMISTRY_TIERS[3]!.label).toBe('C');
    expect(CHEMISTRY_TIERS[4]!.label).toBe('D');
    expect(CHEMISTRY_TIERS[5]!.label).toBeNull();
  });

  it('is bonus-only: the 0-point entry carries buff 0, never a penalty', () => {
    expect(CHEMISTRY_TIERS[5]!.buff).toBe(0);
    // No negative buff exists anywhere in the table
    for (const tier of CHEMISTRY_TIERS) {
      expect(tier.buff).toBeGreaterThanOrEqual(0);
    }
  });
});
