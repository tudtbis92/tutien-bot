import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { rollWildLevel } from '../encounterLevelService.js';
import { cryptoUniform } from '../encounterService.js';

/**
 * D-33 wild level band roll — Test 1 (11-06):
 * band < 600 → L1-10, < 900 → L11-20, < 999 → L21-30, else → L31-50, each
 * band then a uniform-within-band crypto.randomInt draw. The band comes from
 * the INJECTED rng (testable); the within-band draw defaults to crypto.
 */
describe('rollWildLevel — D-33 wild level band roll (L1-10 60 / L11-20 30 / L21-30 9.9 / L31-50 0.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('band rng 0.0 → L1-10 draw; an exact 0.6 rng lands at the L11-20 BAND boundary (band = rng×1000, < 600 vs < 900)', () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(3 as never);
    expect(rollWildLevel(() => 0.0)).toBe(3); // band 000 → L1-10 → within-band (1,11) draw = 3
    expect(rollWildLevel(() => 0.599)).toBe(3); // still below 600 → L1-10

    vi.spyOn(crypto, 'randomInt').mockReturnValue(16 as never);
    expect(rollWildLevel(() => 0.6)).toBe(16); // band 600 → L11-20 → within-band (11,21) draw = 16
    expect(crypto.randomInt).toHaveBeenLastCalledWith(11, 21);
  });

  it('band rngs map to the correct D-33 ranges (60/30/9.9/0.1), draws inside the band via crypto.randomInt', () => {
    // Band 0.5 → L1-10. randomInt(1,11) draw → mock 5.
    vi.spyOn(crypto, 'randomInt').mockReturnValue(5 as never);
    expect(rollWildLevel(() => 0.5)).toBe(5);
    expect(crypto.randomInt).toHaveBeenLastCalledWith(1, 11);

    // Band 0.8 → L11-20. randomInt(11,21) draw → mock 17.
    vi.spyOn(crypto, 'randomInt').mockReturnValue(17 as never);
    expect(rollWildLevel(() => 0.8)).toBe(17);
    expect(crypto.randomInt).toHaveBeenLastCalledWith(11, 21);

    // Band 0.999 → L31-50 (the 0.1% tail). randomInt(31,51) draw → mock 42.
    vi.spyOn(crypto, 'randomInt').mockReturnValue(42 as never);
    expect(rollWildLevel(() => 0.999)).toBe(42);
    expect(crypto.randomInt).toHaveBeenLastCalledWith(31, 51);
  });

  it('band rng 0.9 → L21-30 (the < 999 band) — the D-33 boundary just past 0.9', () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(27 as never);
    expect(rollWildLevel(() => 0.9)).toBe(27);
    expect(crypto.randomInt).toHaveBeenLastCalledWith(21, 31);
  });

  it('default rng is cryptoUniform (crypto-backed player-facing roll); the result is ALWAYS 1..50', () => {
    expect(typeof rollWildLevel).toBe('function');
    // Without injection the function must exist and the default draws ride crypto.
    vi.spyOn(crypto, 'randomInt').mockReturnValue(1 as never);
    expect(rollWildLevel()).toBe(1);
    for (let i = 0; i < 50; i++) {
      const lvl = rollWildLevel(cryptoUniform);
      expect(lvl).toBeGreaterThanOrEqual(1);
      expect(lvl).toBeLessThanOrEqual(50);
    }
  });
});