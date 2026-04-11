import { describe, it, expect } from 'vitest';
import { formatBalance } from '../format.js';

describe('formatBalance', () => {
  it('formats zero', () => {
    expect(formatBalance(0n)).toBe('0');
  });

  it('formats small integers', () => {
    expect(formatBalance(1000n)).toBe('1,000');
  });

  it('formats large safe integer', () => {
    expect(formatBalance(1_234_567n)).toBe('1,234,567');
  });

  it('formats values above MAX_SAFE_INTEGER with manual separator', () => {
    // 10 quadrillion — above Number.MAX_SAFE_INTEGER
    expect(formatBalance(10_000_000_000_000_000n)).toBe('10,000,000,000,000,000');
  });
});
