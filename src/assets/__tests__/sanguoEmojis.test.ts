import { describe, it, expect } from 'vitest';
import { heroEmoji, assertEmojiApplicationId, SANSUO_EMOJIS, type SanguoTier } from '../sanguoEmojis.js';

describe('heroEmoji', () => {
  it('returns renderable Discord markup <:name:id> — never a bare ID (SC3)', () => {
    // Discord renders custom/app emoji ONLY via <:name:id> markup; a bare ID would render as literal text.
    expect(heroEmoji('abt', 0)).toBe('<:abt_t0:1536202064185524378>');
  });

  it('supports tier + star variants, falls back to hero t0, throws for unknown hero', () => {
    // Tier 3 star variant — name = registry key, id = registry value
    expect(heroEmoji('abt', 3, true)).toBe(`<:abt_t3_star:${SANSUO_EMOJIS.abt_t3_star}>`);

    // Missing tier variant (tier 5 does not exist) → falls back to the hero's t0 entry
    expect(heroEmoji('abt', 5 as SanguoTier)).toBe('<:abt_t0:1536202064185524378>');

    // Unknown hero (no prefix in registry) → throws — never '' or a raw literal
    expect(() => heroEmoji('no_such_hero')).toThrow('EMOJI_NOT_FOUND:no_such_hero');
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
