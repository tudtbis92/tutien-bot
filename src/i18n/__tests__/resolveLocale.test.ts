import { describe, it, expect } from 'vitest';
import { resolveLocale } from '../index.js';

describe('resolveLocale', () => {
  it('returns stored locale when present', () => {
    expect(resolveLocale('en', 'zh')).toBe('en');
  });

  it('falls back to interaction locale when stored is null', () => {
    expect(resolveLocale(null, 'en-US')).toBe('en');
  });

  it('normalizes zh-TW to zh-cn', () => {
    expect(resolveLocale(null, 'zh-TW')).toBe('zh-cn');
  });

  it('falls back to vi for unsupported locale', () => {
    expect(resolveLocale(null, 'fr')).toBe('vi');
  });

  it('falls back to vi when both are null', () => {
    expect(resolveLocale(null, null)).toBe('vi');
  });
});
