import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Boss encounter embed (Phase 11, D-24/D-35) — the GOLD variant for a real
 * zone-general boss. Unlike the generic encounter embed (which renders the
 * boss_title/boss_body placeholders), this surface names the actual general
 * (D-24: the boss is a REAL heroes draw from the zone pool) and shows the
 * forced-legion contract (D-25, `encounter.boss_line`) at its fixed Lv50
 * (D-35).
 *
 * UI-SPEC color contract: GOLD is reserved for the boss variant (Phase 10 lock
 * carries verbatim). The rolled level (Lv50) and the named general are the
 * only boss signals rendered — the tier multiplier, base IVs and weight
 * distribution NEVER render (D-12/D-28 hidden mechanics).
 */
export interface SanguoBossEncounterEmbedData {
  /** The zone-general's per-locale display name (D-07 content-in-DB). */
  heroName: string;
  /** Pre-rendered hero emoji markup ('<a:name:id>') — name-only fallback when
   *  unknown (EMOJI_NOT_FOUND guard, map.ts:98 pattern). */
  heroEmoji?: string;
  /** Dominant zone name (per-locale) the general guards (D-24). */
  zoneName: string;
  shardId?: number;
}

export function buildSanguoBossEncounterEmbed(
  data: SanguoBossEncounterEmbedData,
  t: TFunction,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.GOLD) // theme.ts — GOLD reserved for the boss variant
    .setTitle(t('sanguo:encounter.boss_title'))
    .setDescription(
      t('sanguo:encounter.boss_line', {
        hero_emoji: data.heroEmoji ?? '',
        hero: data.heroName,
        zone: data.zoneName,
      }),
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
