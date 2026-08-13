import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Starter picker buttons (Phase 10 D-14 — /sanguo heroes onboarding, TQC-13).
 *
 * Exactly 3 buttons per row (UI-SPEC zero-one-many): set 1 Tào Tháo / Lưu Bị /
 * Tôn Kiên on the first 3 empty-collection invocations, set 2 Trương Giác /
 * Viên Thiệu / Đổng Trác from the 4th (starterViews >= 3 — the rotation
 * counter lives in user_sanguo_state.starterViews). No 4th option ever exists
 * in set 1. The pick is the game's ONLY faucet (D-19): free, no wallet call.
 */
export const STARTER_PICK_PREFIX = 'sanguo:heroes:starter';

/** Set 1 — shown while starterViews < 3 (D-14). */
export const STARTER_SET_1 = ['cao_cao', 'liu_bei', 'sun_jian'] as const;

/** Set 2 — shown on the 4th+ empty invocation (starterViews >= 3, D-14). */
export const STARTER_SET_2 = ['truong_giac', 'yuan_shao', 'dong_trac'] as const;

export interface StarterHeroOption {
  heroId: string;
  name: string;
  emoji?: string;
}

/**
 * Build exactly 3 starter buttons (the caller passes set 1 or set 2 resolved
 * against the heroes catalog). customId `sanguo:heroes:starter:{heroId}`;
 * emoji via .setEmoji with the EMOJI_NOT_FOUND name-only guard (map.ts:98).
 */
export function buildStarterButtons(
  t: TFunction,
  heroes: StarterHeroOption[],
): ButtonBuilder[] {
  return heroes.map((hero) => {
    const button = new ButtonBuilder()
      .setCustomId(`${STARTER_PICK_PREFIX}:${hero.heroId}`)
      .setLabel(t('sanguo:heroes.starter_button', { name: hero.name }))
      .setStyle(ButtonStyle.Primary);
    if (hero.emoji) {
      try {
        button.setEmoji(hero.emoji);
      } catch {
        // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 guard pattern)
      }
    }
    return button;
  });
}
