import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Capture embed (D-09/D-10/D-12/D-18) — the capture VIEW plus the result
 * states (success/fail/flee/retreat).
 *
 * D-12 hidden-mechanics hard rule: the view renders THE SINGLE mechanic
 * number — floor(chance×100)% via capture.chance. No flee %, no pity counter,
 * no multipliers, no rarity number. Tier fees render in the BUTTON labels
 * (never the embed body) per the UI-SPEC copywriting contract.
 *
 * Colors (UI-SPEC): view = SEASON (GOLD for boss), success = SUCCESS,
 * fail = WARNING (setback — retry open, never DANGER), flee = DANGER,
 * retreat = NEUTRAL. Every embed has embedFooter(shardId) + setTimestamp().
 */
export type SanguoCaptureState = 'view' | 'success' | 'fail' | 'flee' | 'retreat';

export interface SanguoCaptureEmbedData {
  /** Wild hero per-locale display name (boss → zone name). */
  heroName: string;
  /** Pre-rendered hero emoji markup ('<a:name:id>') — hero encounters only. */
  heroEmoji?: string;
  /** floor(chance×100) — THE single mechanic number. Rendered in 'view' only. */
  percent: number;
  state: SanguoCaptureState;
  /** D-13: boss capture view renders GOLD (phase-10 capture guarded server-side). */
  boss: boolean;
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
        .setDescription(t('sanguo:capture.chance', { percent: data.percent }));
      break;
    case 'success':
      embed.setTitle(
        t('sanguo:capture.success_title', { hero_emoji: heroEmoji, hero: data.heroName }),
      );
      break;
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
