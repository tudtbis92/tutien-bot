import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  positionFraction,
  shouldRoll,
  shouldRollBoss,
  pickEncounterHero,
  capHit,
  cryptoUniform,
  type ZoneRate,
} from '../encounterService.js';

/**
 * D-15 blend fixture. heroId 2 appears in BOTH pools at rate 1.0 — it is the
 * shared hero that must accumulate rate×(1−pos) + rate×pos and be attributed
 * to the pos-dominant zone (B6 fix). heroId 4 is shared at equal rates 1.0
 * for the B6 dominant-zone flip test (A when pos<0.5, B when pos>0.5).
 */
const POOL_A: ZoneRate[] = [
  { heroId: 1, zone: 'trung_nguyen', rate: 1.0 },
  { heroId: 2, zone: 'trung_nguyen', rate: 1.0 },
  { heroId: 4, zone: 'trung_nguyen', rate: 1.0 },
];
const POOL_B: ZoneRate[] = [
  { heroId: 3, zone: 'du_chau', rate: 1.0 },
  { heroId: 2, zone: 'du_chau', rate: 1.0 },
  { heroId: 4, zone: 'du_chau', rate: 1.0 },
];

describe('positionFraction (D-15 position math)', () => {
  it('T1: 0 at departure (remaining=total), 1 at arrival (remaining=0), 0.5 mid-hop', () => {
    expect(positionFraction(900, 900)).toBe(0); // departure
    expect(positionFraction(0, 900)).toBe(1); // arrival
    expect(positionFraction(450, 900)).toBe(0.5); // mid-hop
  });

  it('T1b: clamps out-of-range inputs; total<=0 → 0', () => {
    expect(positionFraction(2000, 900)).toBe(0); // negative fraction → clamp 0
    expect(positionFraction(-100, 900)).toBe(1); // >1 → clamp 1
    expect(positionFraction(300, 0)).toBe(0); // missing edge / total 0
    expect(positionFraction(300, -5)).toBe(0);
  });
});

describe('pickEncounterHero — D-15 position-blended weighted pick', () => {
  it('T2: pos=0 returns ONLY zone-A heroes (zone-B weights × 0)', () => {
    // Weights at pos=0: hero1=1.0, hero2=1.0(+0), hero4=1.0(+0), hero3=0. total=3.0
    const low = pickEncounterHero(POOL_A, POOL_B, 0, () => 0.1); // roll=0.3 → hero1
    expect(low.heroId).toBe(1);
    expect(low.zone).toBe('trung_nguyen');
    const high = pickEncounterHero(POOL_A, POOL_B, 0, () => 0.9); // roll=2.7 → hero4
    expect(high.zone).toBe('trung_nguyen'); // never a du_chau hero at pos=0
    expect([1, 2, 4]).toContain(high.heroId);
  });

  it('T2b: pos=1 returns ONLY zone-B heroes (zone-A weights × 0)', () => {
    const low = pickEncounterHero(POOL_A, POOL_B, 1, () => 0.1); // roll=0.2 → hero3
    expect(low.heroId).toBe(3);
    expect(low.zone).toBe('du_chau');
    const high = pickEncounterHero(POOL_A, POOL_B, 1, () => 0.9); // roll=1.8 → hero2
    expect(high.zone).toBe('du_chau'); // never a trung_nguyen hero at pos=1
  });

  it('T3: shared hero accumulates rate×(1−pos)+rate×pos; cumulative walk respects ratios', () => {
    // At pos=0.5: hero1=0.5, hero2=1.0 (0.5+0.5), hero3=0.5, hero4=1.0. total=3.0
    // rng=0.3 → roll=0.9 → walk: hero1(0.5)→0.4, hero2(1.0)→0.4-1.0<=0 → hero2.
    // hero2 was reachable ONLY because its weight accumulated from both pools.
    const pick = pickEncounterHero(POOL_A, POOL_B, 0.5, () => 0.3);
    expect(pick.heroId).toBe(2);
    // rng=0.1 → roll=0.3 → hero1 (first band)
    expect(pickEncounterHero(POOL_A, POOL_B, 0.5, () => 0.1).heroId).toBe(1);
    // rng=0.7 → roll=2.1 → walk: h1(0.5)→1.6, h2(1.0)→0.6, h3(0.5)→0.1, h4(1.0)→≤0 → hero4
    expect(pickEncounterHero(POOL_A, POOL_B, 0.5, () => 0.7).heroId).toBe(4);
  });

  it('T4 (B6 fix): hero in BOTH pools returns the pos-dominant zone — NOT a loop-order overwrite', () => {
    // hero4 rate 1.0 in both pools: rateA·(1−pos) vs rateB·pos.
    // pos=0.4 → A-side 0.6 >= B-side 0.4 → trung_nguyen (dominant A).
    expect(pickEncounterHero(POOL_A, POOL_B, 0.4, () => 0.5).zone).toBe('trung_nguyen');
    // pos=0.6 → A-side 0.4 < B-side 0.6 → du_chau (dominant B) — a naive
    // loop-order overwrite would return trung_nguyen here.
    expect(pickEncounterHero(POOL_A, POOL_B, 0.6, () => 0.5).zone).toBe('du_chau');
  });

  it('smoke: default cryptoUniform path returns a union hero with a valid zone', () => {
    const pick = pickEncounterHero(POOL_A, POOL_B, 0.5);
    expect([1, 2, 3, 4]).toContain(pick.heroId);
    expect(['trung_nguyen', 'du_chau']).toContain(pick.zone);
  });
});

describe('shouldRoll / shouldRollBoss (D-10/D-14 thresholds)', () => {
  it('T5: shouldRoll(0.35, rng) rolls true when rng()<0.35, false otherwise', () => {
    expect(shouldRoll(0.35, () => 0.2)).toBe(true);
    expect(shouldRoll(0.35, () => 0.35)).toBe(false); // strict <
    expect(shouldRoll(0.35, () => 0.9)).toBe(false);
  });

  it('T5b: shouldRollBoss(0.07, rng) likewise (boss sub-roll 7%)', () => {
    expect(shouldRollBoss(0.07, () => 0.05)).toBe(true);
    expect(shouldRollBoss(0.07, () => 0.07)).toBe(false); // strict <
    expect(shouldRollBoss(0.07, () => 0.5)).toBe(false);
  });
});

describe('capHit (D-13 sliding-window predicate)', () => {
  it('T6: windowCount >= limit → true (20/hr default)', () => {
    expect(capHit(0)).toBe(false);
    expect(capHit(19)).toBe(false);
    expect(capHit(20)).toBe(true);
    expect(capHit(25)).toBe(true);
    expect(capHit(19, 20)).toBe(false);
    expect(capHit(3, 3)).toBe(true);
  });
});

describe('crypto RNG mandate (milestone V6 — never the predictable global PRNG)', () => {
  it('T7: cryptoUniform draws in [0,1) and the module never calls Math.random', () => {
    const u = cryptoUniform();
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);

    const source = readFileSync(new URL('../encounterService.ts', import.meta.url), 'utf-8');
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).toMatch(/crypto\.randomInt/);
  });
});
