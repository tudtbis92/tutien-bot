/**
 * Tests for breakthrough service business logic.
 * All tests use pure functions — no Discord.js or DB dependencies.
 *
 * TDD RED phase: these tests are written before the implementation.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  canAttemptBreakthrough,
  rollBreakthrough,
  type BreakthroughCheck,
  type BreakthroughResult,
} from '../breakthrough.js';

// ── canAttemptBreakthrough ──────────────────────────────────────────────────

describe('canAttemptBreakthrough', () => {
  it('returns max_realm when realmId is 41 (Đại La Tiên Hậu Kỳ)', () => {
    const result = canAttemptBreakthrough({ realmId: 41, tuVi: 9_999_999_999n });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('max_realm');
    }
  });

  it('returns max_realm when realmId exceeds 41 (defensive guard)', () => {
    const result = canAttemptBreakthrough({ realmId: 42, tuVi: 0n });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('max_realm');
    }
  });

  it('returns insufficient_tuvi when tuVi is below required amount', () => {
    // realmId 0 (Luyện Khí Tầng Một) requires 1,000 tu vi
    const result = canAttemptBreakthrough({ realmId: 0, tuVi: 500n });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('insufficient_tuvi');
      if (result.reason === 'insufficient_tuvi') {
        expect(result.required).toBe(1_000);
        expect(result.current).toBe(500n);
      }
    }
  });

  it('returns insufficient_tuvi with correct required amount for realm 8 (LK Tầng Chín → TC)', () => {
    // realmId 8 requires 22,000 tu vi to advance
    const result = canAttemptBreakthrough({ realmId: 8, tuVi: 100n });
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.reason === 'insufficient_tuvi') {
      expect(result.required).toBe(22_000);
    }
  });

  it('returns allowed: true when tuVi equals required amount (exact)', () => {
    // realmId 0 requires exactly 1,000 tu vi
    const result = canAttemptBreakthrough({ realmId: 0, tuVi: 1_000n });
    expect(result.allowed).toBe(true);
  });

  it('returns allowed: true when tuVi exceeds required amount', () => {
    const result = canAttemptBreakthrough({ realmId: 0, tuVi: 5_000n });
    expect(result.allowed).toBe(true);
  });

  it('returns allowed: true for realm 11 (TC Hậu Kỳ → KD) with sufficient tuVi', () => {
    // realmId 11 requires 78,000 tu vi
    const result = canAttemptBreakthrough({ realmId: 11, tuVi: 78_000n });
    expect(result.allowed).toBe(true);
  });
});

// ── rollBreakthrough ────────────────────────────────────────────────────────

describe('rollBreakthrough', () => {
  it('always succeeds for non-boundary tiers (run 50 rolls on realm 0)', () => {
    // realm_id 0: Luyện Khí Tầng Một — isMajorBoundary=false, failureChance=0
    for (let i = 0; i < 50; i++) {
      const result = rollBreakthrough({ realmId: 0, tuVi: 5_000n });
      expect(result.outcome).toBe('success');
      if (result.outcome === 'success') {
        expect(result.newRealmId).toBe(1);
      }
    }
  });

  it('always succeeds for realm 9 (TC Sơ Kỳ → Trung Kỳ) — non-boundary', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollBreakthrough({ realmId: 9, tuVi: 200_000n });
      expect(result.outcome).toBe('success');
    }
  });

  it('always succeeds at LK→TC boundary (realm 8, failureChance=0%)', () => {
    // realm_id 8: Luyện Khí Tầng Chín — isMajorBoundary=true, failureChance=0
    for (let i = 0; i < 50; i++) {
      const result = rollBreakthrough({ realmId: 8, tuVi: 100_000n });
      expect(result.outcome).toBe('success');
      if (result.outcome === 'success') {
        expect(result.newRealmId).toBe(9);
      }
    }
  });

  it('success returns correct newRealmId (realmId + 1)', () => {
    // Mock Math.random to always succeed (return 1.0 → never fails)
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollBreakthrough({ realmId: 11, tuVi: 500_000n });
    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.newRealmId).toBe(12);
    }
    mockRandom.mockRestore();
  });

  it('fail returns penaltyAmount = floor(50% of excess above entry threshold)', () => {
    // realm_id 11: TC Hậu Kỳ, entryThreshold = 1,000 + 1,500 + 2,200 + ... + 78,000 cumulative
    // entryThreshold for realm 11 = sum of TU_VI_TO_ADVANCE[0..10]
    // TU_VI_TO_ADVANCE: [1000,1500,2200,3200,4700,7000,10000,15000,22000,35000,52000,78000,...]
    // Threshold[0]=0, [1]=1000, [2]=2500, [3]=4700, [4]=7900, [5]=12600, [6]=19600, [7]=29600,
    // [8]=44600, [9]=66600, [10]=101600, [11]=153600
    // So entryThreshold for realm 11 = 153,600
    const REALM_11_ENTRY_THRESHOLD = 153_600;
    const tuVi = 200_000n; // excess = 200,000 - 153,600 = 46,400; penalty = floor(46400/2) = 23,200
    const expectedPenalty = 23_200n;

    // Force fail: Math.random returns 0.0 (always fails for failureChance > 0)
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const result = rollBreakthrough({ realmId: 11, tuVi });
    expect(result.outcome).toBe('fail');
    if (result.outcome === 'fail') {
      expect(result.penaltyAmount).toBe(expectedPenalty);
    }
    mockRandom.mockRestore();
  });

  it('penalty is 0 when tuVi equals entry threshold (no excess)', () => {
    // realm_id 11 entry threshold = 153,600
    const tuVi = 153_600n;
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const result = rollBreakthrough({ realmId: 11, tuVi });
    expect(result.outcome).toBe('fail');
    if (result.outcome === 'fail') {
      expect(result.penaltyAmount).toBe(0n);
    }
    mockRandom.mockRestore();
  });

  it('penalty is never negative (tuVi below entry threshold - defensive)', () => {
    // If somehow tuVi < entryThreshold, excess = negative → penalty = 0
    const tuVi = 100_000n; // below realm_11 entry threshold of 153,600
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const result = rollBreakthrough({ realmId: 11, tuVi });
    expect(result.outcome).toBe('fail');
    if (result.outcome === 'fail') {
      expect(result.penaltyAmount).toBeGreaterThanOrEqual(0n);
    }
    mockRandom.mockRestore();
  });
});
