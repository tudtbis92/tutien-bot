import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Capture embed (D-09/D-10/D-12/D-18) — the capture VIEW plus the result
 * states (success/fail/flee/retreat), extended in Phase 11 (D-14/D-28/D-36)
 * for the boss variant: a guaranteed item drop line (`capture.item_drop`) and
 * the captured-copy reveal (`capture.captured_copy`) showing only the ROLLED
 * stars/grade/Lv20 — the t0/t1/t2 weight distribution NEVER renders (D-28).
 *
 * D-12 hidden-mechanics hard rule: the view renders THE SINGLE mechanic
 * number — floor(chance×100)% via capture.chance. No flee %, no pity counter,
 * no multipliers, no rarity number, no weight distribution. Tier fees render
 * in the BUTTON labels (never the embed body).
 *
 * Colors (UI-SPEC): view = SEASON (GOLD for boss), success = SUCCESS,
 * fail = WARNING (setback — retry open, never DANGER), flee = DANGER,
 * retreat = NEUTRAL. Every embed has embedFooter(shardId) + setTimestamp().
 */
export type SanguoCaptureState = 'view' | 'success' | 'fail' | 'flee' | 'retreat';

export interface SanguoCaptureItemDrop {
  /** Pre-rendered item emoji markup. */
  itemEmoji: string;
  /** Item per-locale display name (D-07 content-in-DB). */
  itemName: string;
  quantity: number;
}

export interface SanguoCapturedCopy {
  /** Pre-rendered hero emoji markup. */
  emoji: string;
  /** The captured boss name (per-locale). */
  name: string;
  /** IV stars (0-6) — the revealed grade, D-28. */
  stars: number;
  /** IV grade label (vi/en/zh) — resolved by the caller. */
  grade: string;
  /** The captured copy level — FIXED 20 for a boss (D-36). */
  level: number;
}

export interface SanguoCaptureEmbedData {
  /** Wild hero per-locale display name (boss → zone name). */
  heroName: string;
  /** Pre-rendered hero emoji markup ('<a:name:id>') — hero encounters only. */
  heroEmoji?: string;
  /** floor(chance×100) — THE single mechanic number. Required in 'view' only. */
  percent?: number;
  state: SanguoCaptureState;
  /** D-13: boss capture view renders GOLD (phase-10 capture guarded server-side). */
  boss: boolean;
  /** Phase 11 (D-14): the guaranteed item drop on a boss WIN — renders the
   *  capture.item_drop line in the success state. */
  itemDrop?: SanguoCaptureItemDrop;
  /** Phase 11 (D-28/D-36): the captured-copy reveal (stars/grade/Lv20) shown
   *  in the success state. The D-28 weights NEVER render. */
  capturedCopy?: SanguoCapturedCopy;
  shardId?: number;
}

function colorForState(state: SanguoCaptureState, boss: boolean): number {
  switch (state) {
    case 'view':
      return boss ? COLORS.GOLD : COLORS.SEASON; // D-13 boss = GOLD variant
    case 'success':
      return COLORS.SUCCESS;
    case 'fail':
      return COLORS.WARNING; // setback — retry open, never DANGER unless flee
    case 'flee':
      return COLORS.DANGER;
    case 'retreat':
      return COLORS.NEUTRAL;
  }
}

export function buildSanguoCaptureEmbed(
  data: SanguoCaptureEmbedData,
  t: TFunction,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(colorForState(data.state, data.boss)) // theme.ts — never hardcode hex
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  const heroEmoji = data.heroEmoji ?? '';

  switch (data.state) {
    case 'view':
      embed
        .setTitle(t('sanguo:capture.title', { hero_emoji: heroEmoji, hero: data.heroName }))
        .setDescription(t('sanguo:capture.chance', { percent: data.percent ?? 0 }));
      break;
    case 'success': {
      // Boss win → the guaranteed item drop (D-14) + the captured-copy reveal
      // (D-28/D-36) ride the success state; D-28 weights never render.
      const parts: string[] = [];
      if (data.itemDrop) {
        parts.push(
          t('sanguo:capture.item_drop', {
            item_emoji: data.itemDrop.itemEmoji,
            name: data.itemDrop.itemName,
            qty: data.itemDrop.quantity,
          }),
        );
      }
      if (data.capturedCopy) {
        parts.push(
          t('sanguo:capture.captured_copy', {
            emoji: data.capturedCopy.emoji,
            name: data.capturedCopy.name,
            stars: data.capturedCopy.stars,
            grade: data.capturedCopy.grade,
            level: data.capturedCopy.level,
          }),
        );
      }
      embed.setTitle(
        t('sanguo:capture.success_title', { hero_emoji: heroEmoji, hero: data.heroName }),
      );
      // Only set a description when there is actual content — an empty string
      // throws on EmbedBuilder.setDescription (shapeshift length >= 1). A plain
      // (non-boss) success has neither itemDrop nor capturedCopy → title only.
      if (parts.length > 0) {
        embed.setDescription(parts.join('\n'));
      }
      break;
    }
    case 'fail':
      embed
        .setTitle(t('sanguo:capture.fail_title'))
        .setDescription(t('sanguo:capture.fail_body'));
      break;
    case 'flee':
      embed.setTitle(t('sanguo:capture.flee_title', { hero: data.heroName }));
      break;
    case 'retreat':
      // D-18: no retreat_title key exists in the pinned capture.* set — the
      // view title + the retreat consequence body carry the state.
      embed
        .setTitle(t('sanguo:capture.title', { hero_emoji: heroEmoji, hero: data.heroName }))
        .setDescription(t('sanguo:capture.retreat_body', { hero: data.heroName }));
      break;
  }

  return embed;
}
