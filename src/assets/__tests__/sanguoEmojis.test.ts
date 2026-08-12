import { describe, it, expect } from 'vitest';
import {
  heroEmoji,
  heroEmojiPrefix,
  assertEmojiApplicationId,
  SANSUO_EMOJIS,
  SANSUO_HERO_EMOJI_CODES,
  type SanguoTier,
} from '../sanguoEmojis.js';

describe('heroEmoji', () => {
  it('returns renderable Discord markup <a:name:id> — never a bare ID (SC3)', () => {
    // Sanguo emojis are ALL animated (GIF) — Discord renders animated emoji ONLY via
    // <a:name:id> markup; '<:name:id>' or a bare ID would render as literal text (SC3).
    expect(heroEmoji('abt', 0)).toBe('<a:abt_t0:1536202064185524378>');
  });

  it('supports tier + star variants, falls back to hero t0, throws for unknown hero', () => {
    // Tier 3 star variant — name = registry key, id = registry value
    expect(heroEmoji('abt', 3, true)).toBe(`<a:abt_t3_star:${SANSUO_EMOJIS.abt_t3_star}>`);

    // Missing tier variant (tier 5 does not exist) → falls back to the hero's t0 entry
    expect(heroEmoji('abt', 5 as SanguoTier)).toBe('<a:abt_t0:1536202064185524378>');

    // Unknown hero (no prefix in registry) → throws — never '' or a raw literal
    expect(() => heroEmoji('no_such_hero')).toThrow('EMOJI_NOT_FOUND:no_such_hero');
  });

  it('resolves a snake_case hero id (representative_hero_id space) through SANSUO_HERO_EMOJI_CODES (CR-01)', () => {
    // The seed writes map_nodes.representative_hero_id in the heroes.hero_id
    // (snake_case) space — e.g. dong_trac, cao_cao. heroEmoji() must resolve
    // these to their 3-letter emoji prefix and render markup, not throw.
    expect(heroEmoji('dong_trac')).toBe(`<a:dtr_t0:${SANSUO_EMOJIS.dtr_t0}>`);
    expect(heroEmoji('cao_cao', 1, true)).toBe(`<a:cao_t1_star:${SANSUO_EMOJIS.cao_t1_star}>`);
    expect(heroEmojiPrefix('dong_trac')).toBe('dtr');
    expect(heroEmojiPrefix('abt')).toBe('abt');
  });

  it('every hero id in SANSUO_HERO_EMOJI_CODES resolves to a real registry prefix (CR-01 coverage)', () => {
    const codes = SANSUO_HERO_EMOJI_CODES as Record<string, string>;
    const prefixes = Object.keys(codes);
    expect(prefixes.length).toBeGreaterThanOrEqual(132);
    for (const heroId of prefixes) {
      const prefix = codes[heroId]!;
      // The resolved key must exist in the registry — heroEmoji must never throw for a mapped hero
      expect(SANSUO_EMOJIS[`${prefix}_t0` as keyof typeof SANSUO_EMOJIS]).toBeDefined();
      expect(heroEmoji(heroId)).toMatch(/^<a:[a-z0-9_]+:\d{17,20}>$/);
    }
  });
});

describe('assertEmojiApplicationId', () => {
  it('returns true when registry applicationId equals client id', () => {
    expect(assertEmojiApplicationId('1381818375633899562', '1381818375633899562')).toBe(true);
  });

  it('returns false on any mismatch (pure function — explicit args, no env coupling)', () => {
    expect(assertEmojiApplicationId('a', 'b')).toBe(false);
    expect(assertEmojiApplicationId('1381818375633899562', '1234567890')).toBe(false);
  });
});
