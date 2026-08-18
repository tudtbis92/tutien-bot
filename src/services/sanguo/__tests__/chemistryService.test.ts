import { describe, it, expect } from 'vitest';
import {
  pairChemistryPoints,
  chemistryLevel,
  applyChemistryBuff,
  supportTriggerChance,
  type ChemistryLinkInput,
  type NeighborLinkInput,
} from '../chemistryService.js';
import { CHEMISTRY_POINTS } from '../../../constants/sanguoChemistry.js';

/**
 * Pure chemistry contract tests (CR-11-09 — the POSITION-BASED redesign).
 *
 * FIRST-MATCH pair scoring (PLAN-FIX P1-3, locked): a linked neighbor
 * contributes the strongest SINGLE relationship it shares with the hero —
 * spouse/family 3 > faction 2 > role 1, else 0 — never a sum. A hero's TOTAL
 * points = the sum over its ACTIVE linked neighbors (position-gated by the
 * formation's chemistry link graph); total points map to a LEVEL 0-3 (capped):
 * 1-2 → L1, 3-4 → L2, 5+ → L3. The buff is ADDITIVE on STR/AGI/INT:
 * L1 +2, L2 +7, L3 +17 (CHEMISTRY_STAT_BUFF[level]).
 *
 * Fixture hero: faction 1 / role 'general' / family 10.
 */
const HERO: ChemistryLinkInput = { factionId: 1, role: 'general', familyId: 10 };

const familyNeighbor: NeighborLinkInput = {
  factionId: 2,
  role: 'civil',
  familyId: 10, // exact family_id match (bloodline)
  spouseOfHero: false,
};
const factionNeighbor: NeighborLinkInput = {
  factionId: 1, // exact faction match
  role: 'civil',
  familyId: null,
  spouseOfHero: false,
};
const roleNeighbor: NeighborLinkInput = {
  factionId: 2,
  role: 'general', // exact role match
  familyId: null,
  spouseOfHero: false,
};
const noMatchNeighbor: NeighborLinkInput = {
  factionId: 2,
  role: 'civil',
  familyId: null,
  spouseOfHero: false,
};

describe('pairChemistryPoints (D-19 / PLAN-FIX P1-3, per-PAIR)', () => {
  it('scores 3 per family pair, 2 per faction pair, 1 per role pair, 0 for no match', () => {
    expect(pairChemistryPoints(HERO, familyNeighbor)).toBe(CHEMISTRY_POINTS.family);
    expect(pairChemistryPoints(HERO, factionNeighbor)).toBe(CHEMISTRY_POINTS.faction);
    expect(pairChemistryPoints(HERO, roleNeighbor)).toBe(CHEMISTRY_POINTS.role);
    expect(pairChemistryPoints(HERO, noMatchNeighbor)).toBe(0);
  });

  it('scores a spouse neighbor 3 (tier-1, equal to family — hero_relations type=spouse)', () => {
    const spouse: NeighborLinkInput = {
      factionId: 1, // also same-faction — but spouse wins the first match
      role: 'general', // also same-role — spouse still wins
      familyId: null,
      spouseOfHero: true,
    };
    expect(pairChemistryPoints(HERO, spouse)).toBe(CHEMISTRY_POINTS.spouse);
  });

  it('PLAN-FIX P1-3: a neighbor matching BOTH family AND faction scores 3, not 5 (first-match, never additive)', () => {
    const sameFamilyAndFaction: NeighborLinkInput = {
      factionId: 1,
      role: 'civil',
      familyId: 10,
      spouseOfHero: false,
    };
    expect(pairChemistryPoints(HERO, sameFamilyAndFaction)).toBe(3);
    expect(pairChemistryPoints(HERO, sameFamilyAndFaction)).not.toBe(5);
  });

  it('family outranks faction outranks role when all three match (strongest single link)', () => {
    const allThree: NeighborLinkInput = {
      factionId: 1,
      role: 'general',
      familyId: 10,
      spouseOfHero: false,
    };
    expect(pairChemistryPoints(HERO, allThree)).toBe(CHEMISTRY_POINTS.family);
  });

  it('a hero with familyId null never family-matches (bloodline must exist on both sides)', () => {
    const noFamilyHero: ChemistryLinkInput = { factionId: 1, role: 'general', familyId: null };
    expect(pairChemistryPoints(noFamilyHero, familyNeighbor)).toBe(0);
    expect(pairChemistryPoints(noFamilyHero, factionNeighbor)).toBe(2);
  });
});

describe('chemistryLevel (CR-11-09 threshold table — 0/1/2/3, capped)', () => {
  it('maps total points to levels: 1-2 → L1, 3-4 → L2, 5+ → L3, 0 → none', () => {
    expect(chemistryLevel(0)).toBe(0);
    expect(chemistryLevel(1)).toBe(1);
    expect(chemistryLevel(2)).toBe(1);
    expect(chemistryLevel(3)).toBe(2);
    expect(chemistryLevel(4)).toBe(2);
    expect(chemistryLevel(5)).toBe(3);
    expect(chemistryLevel(9)).toBe(3); // capped at 3 regardless of accumulation
    expect(chemistryLevel(100)).toBe(3);
  });

  it('the user example: faction(2) + faction(2) + role(1) = 5 points → level 3 (max)', () => {
    // link1 faction 2 + link2 faction 2 + link3 role 1 = 5 → L3 (the cap).
    const points =
      pairChemistryPoints(HERO, factionNeighbor) +
      pairChemistryPoints(HERO, factionNeighbor) +
      pairChemistryPoints(HERO, roleNeighbor);
    expect(points).toBe(5);
    expect(chemistryLevel(points)).toBe(3);
  });
});

describe('applyChemistryBuff (CR-11-09 additive on STR/AGI/INT)', () => {
  it('adds the cumulative stat buff per level: L0 +0, L1 +2, L2 +7, L3 +17', () => {
    const finalStat = 100;
    expect(applyChemistryBuff(finalStat, 0)).toBe(100);
    expect(applyChemistryBuff(finalStat, 1)).toBe(102);
    expect(applyChemistryBuff(finalStat, 2)).toBe(107);
    expect(applyChemistryBuff(finalStat, 3)).toBe(117);
  });

  it('full chemistry (3 levels) = +17 stat', () => {
    // The user-signed contract: chemistry 1 +2, chemistry 2 +5, chemistry 3
    // +10 → full 3 = +17.
    expect(applyChemistryBuff(0, 3)).toBe(17);
    expect(applyChemistryBuff(50, 3)).toBe(67);
  });
});

describe('supportTriggerChance (D-18, LEA-driven — unchanged)', () => {
  it('follows 0.15 x (1 + (lea - 10) x 0.02) at the locked anchors', () => {
    expect(supportTriggerChance(10)).toBeCloseTo(0.15, 10); // base
    expect(supportTriggerChance(40)).toBeCloseTo(0.24, 10); // +30 lea -> +60%
    expect(supportTriggerChance(60)).toBeCloseTo(0.30, 10); // +50 lea -> x2
  });

  it('clamps to [0.05, 0.35] at the extremes', () => {
    expect(supportTriggerChance(-100)).toBe(0.05);
    expect(supportTriggerChance(1)).toBeGreaterThanOrEqual(0.05);
    expect(supportTriggerChance(1000)).toBe(0.35);
    expect(supportTriggerChance(200)).toBeLessThanOrEqual(0.35);
  });
});
