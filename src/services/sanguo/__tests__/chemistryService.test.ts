import { describe, it, expect } from 'vitest';
import {
  mainChemistryPoints,
  chemistryTier,
  applyChemistryBuff,
  supportTriggerChance,
  type ChemistryLinkInput,
  type SupportLinkInput,
} from '../chemistryService.js';
import { CHEMISTRY_POINTS, CHEMISTRY_TIERS } from '../../../constants/sanguoChemistry.js';

/**
 * Pure chemistry contract tests (11-05 Task 2, D-19).
 *
 * FIRST-MATCH scoring (PLAN-FIX P1-3, locked): a single support contributes
 * the strongest SINGLE link it shares with the main — spouse/family 3 >
 * faction 2 > role 1, else 0 — never a sum of multiple link types. Max per
 * main = 9 supports x 3 = 27; the S/A/B/C/D thresholds are calibrated on this.
 *
 * Fixture main: faction 1 / role 'general' / family 10.
 */
const MAIN: ChemistryLinkInput = { factionId: 1, role: 'general', familyId: 10 };

const familySupport: SupportLinkInput = {
  factionId: 2,
  role: 'civil',
  familyId: 10, // exact family_id match (bloodline)
  spouseOfMain: false,
};
const factionSupport: SupportLinkInput = {
  factionId: 1, // exact faction match
  role: 'civil',
  familyId: null,
  spouseOfMain: false,
};
const roleSupport: SupportLinkInput = {
  factionId: 2,
  role: 'general', // exact role match
  familyId: null,
  spouseOfMain: false,
};
const noMatchSupport: SupportLinkInput = {
  factionId: 2,
  role: 'civil',
  familyId: null,
  spouseOfMain: false,
};

describe('mainChemistryPoints (D-19 / PLAN-FIX P1-3)', () => {
  it('scores 3 per family link, 2 per faction link, 1 per role link, 0 for no match — summed across supports', () => {
    // 3 (family) + 2 (faction) + 1 (role) + 0 (none) = 6 for a 4-support fixture
    expect(
      mainChemistryPoints(MAIN, [
        familySupport,
        factionSupport,
        roleSupport,
        noMatchSupport,
      ]),
    ).toBe(6);
  });

  it('scores a spouse support 3 (tier-1, equal to family — hero_relations type=spouse)', () => {
    const spouse: SupportLinkInput = {
      factionId: 1, // also same-faction — but spouse wins the first match
      role: 'general', // also same-role — spouse still wins
      familyId: null,
      spouseOfMain: true,
    };
    expect(mainChemistryPoints(MAIN, [spouse])).toBe(CHEMISTRY_POINTS.spouse);
  });

  it('PLAN-FIX P1-3: a support matching BOTH family AND faction scores 3, not 5 (first-match, never additive)', () => {
    const sameFamilyAndFaction: SupportLinkInput = {
      factionId: 1, // matches main's faction (2 points)
      role: 'civil',
      familyId: 10, // matches main's family (3 points)
      spouseOfMain: false,
    };
    expect(mainChemistryPoints(MAIN, [sameFamilyAndFaction])).toBe(3);
    expect(mainChemistryPoints(MAIN, [sameFamilyAndFaction])).not.toBe(5);
  });

  it('family outranks faction outranks role when all three match (strongest single link)', () => {
    const allThree: SupportLinkInput = {
      factionId: 1,
      role: 'general',
      familyId: 10,
      spouseOfMain: false,
    };
    expect(mainChemistryPoints(MAIN, [allThree])).toBe(CHEMISTRY_POINTS.family);
  });

  it('a main with familyId null never family-matches (bloodline must exist on both sides)', () => {
    const noFamilyMain: ChemistryLinkInput = { factionId: 1, role: 'general', familyId: null };
    expect(mainChemistryPoints(noFamilyMain, [familySupport])).toBe(0);
    expect(mainChemistryPoints(noFamilyMain, [factionSupport])).toBe(2);
  });

  it('empty supports -> 0 points', () => {
    expect(mainChemistryPoints(MAIN, [])).toBe(0);
  });

  it('maxes at 9 supports x 3 = 27 (the S-tier ceiling)', () => {
    const nineFamily = Array.from({ length: 9 }, (_, i): SupportLinkInput => ({
      ...familySupport,
      familyId: 10,
      role: i % 2 === 0 ? 'civil' : 'general',
      factionId: 2 + (i % 3),
    }));
    expect(mainChemistryPoints(MAIN, nineFamily)).toBe(27);
  });
});

describe('chemistryTier (D-19 threshold table)', () => {
  it('maps point sums to CHEMISTRY_TIERS labels/buffs (S 12+ .. D 1-2, 0 bonus-only)', () => {
    expect(chemistryTier(27)).toEqual({ label: 'S', buff: 0.1 }); // ceiling
    expect(chemistryTier(12)).toEqual({ label: 'S', buff: 0.1 });
    expect(chemistryTier(11)).toEqual({ label: 'A', buff: 0.08 });
    expect(chemistryTier(8)).toEqual({ label: 'A', buff: 0.08 });
    expect(chemistryTier(7)).toEqual({ label: 'B', buff: 0.06 });
    expect(chemistryTier(5)).toEqual({ label: 'B', buff: 0.06 });
    expect(chemistryTier(4)).toEqual({ label: 'C', buff: 0.04 });
    expect(chemistryTier(3)).toEqual({ label: 'C', buff: 0.04 });
    expect(chemistryTier(2)).toEqual({ label: 'D', buff: 0.02 });
    expect(chemistryTier(1)).toEqual({ label: 'D', buff: 0.02 });
    // bonus-only (EA FC 0-chemistry): no tier line, no penalty
    expect(chemistryTier(0)).toEqual({ label: null, buff: 0 });
  });

  it('walks the CHEMISTRY_TIERS constant (single source — thresholds never re-typed)', () => {
    // every row of the constant table is reachable through chemistryTier
    for (const row of CHEMISTRY_TIERS) {
      expect(chemistryTier(row.min)).toEqual({ label: row.label, buff: row.buff });
    }
  });
});

describe('applyChemistryBuff (multiplicative on the final combatStat)', () => {
  it('multiplies (base + IV + levelGain) x (1 + buff) and rounds to an integer', () => {
    const finalStat = 100; // e.g. base 80 + IV 10 + levelGain 10 (L6)
    expect(applyChemistryBuff(finalStat, chemistryTier(12).buff)).toBe(110); // S +10%
    expect(applyChemistryBuff(finalStat, chemistryTier(8).buff)).toBe(108); // A +8%
    expect(applyChemistryBuff(finalStat, chemistryTier(5).buff)).toBe(106); // B +6%
    expect(applyChemistryBuff(finalStat, chemistryTier(3).buff)).toBe(104); // C +4%
    expect(applyChemistryBuff(finalStat, chemistryTier(1).buff)).toBe(102); // D +2%
    expect(applyChemistryBuff(finalStat, chemistryTier(0).buff)).toBe(100); // 0 -> unchanged
  });

  it('rounds half-away-from-zero style (Math.round) and handles 0', () => {
    expect(applyChemistryBuff(5, 0.02)).toBe(5); // round(5.1) = 5
    expect(applyChemistryBuff(7, 0.08)).toBe(8); // round(7.56) = 8
    expect(applyChemistryBuff(0, 0.1)).toBe(0);
  });
});

describe('supportTriggerChance (D-18, LEA-driven)', () => {
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
