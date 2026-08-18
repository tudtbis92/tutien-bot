import { describe, it, expect } from 'vitest';
import {
  CHEMISTRY_POINTS,
  CHEMISTRY_LEVEL_THRESHOLDS,
  CHEMISTRY_STAT_BUFF,
} from '../sanguoChemistry.js';

/**
 * Chemistry constant sanity tests (11-02 Task 2 behavior, CR-11-09 revised).
 *
 * Contract context: EA FC-grounded chemistry (D-19) — position-gated pair
 * points -> chemistry LEVEL 0-3 -> ADDITIVE stat buff on STR/AGI/INT. These
 * tables are HIDDEN mechanics (D-12): points and buff NEVER render; only the
 * level label (Bậc 1/2/3) and the active link count reach a UI surface.
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

describe('CHEMISTRY_LEVEL_THRESHOLDS (CR-11-09 — 0/1/2/3, capped at 3)', () => {
  it('thresholds are 1-2 → L1, 3-4 → L2, 5+ → L3, 0 → none', () => {
    expect(CHEMISTRY_LEVEL_THRESHOLDS).toEqual([
      { min: 5, level: 3 },
      { min: 3, level: 2 },
      { min: 1, level: 1 },
      { min: 0, level: 0 },
    ]);
  });

  it('thresholds are strictly ascending by min (5 > 3 > 1 > 0)', () => {
    for (let i = 1; i < CHEMISTRY_LEVEL_THRESHOLDS.length; i++) {
      expect(CHEMISTRY_LEVEL_THRESHOLDS[i]!.min < CHEMISTRY_LEVEL_THRESHOLDS[i - 1]!.min).toBe(true);
    }
  });
});

describe('CHEMISTRY_STAT_BUFF (CR-11-09 — cumulative additive STR/AGI/INT)', () => {
  it('is L0 +0, L1 +2, L2 +7 (+2+5), L3 +17 (+2+5+10) — user-signed 2026-08-18', () => {
    expect(CHEMISTRY_STAT_BUFF[0]).toBe(0);
    expect(CHEMISTRY_STAT_BUFF[1]).toBe(2);
    expect(CHEMISTRY_STAT_BUFF[2]).toBe(7);
    expect(CHEMISTRY_STAT_BUFF[3]).toBe(17);
  });

  it('is strictly ascending (full chemistry = +17, never a penalty)', () => {
    for (let i = 1; i < CHEMISTRY_STAT_BUFF.length; i++) {
      expect(CHEMISTRY_STAT_BUFF[i]!).toBeGreaterThan(CHEMISTRY_STAT_BUFF[i - 1]!);
    }
  });
});
