import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Encounter result embed — returned INLINE by the check-in (D-23, no DM).
 * UI-SPEC color contract: SEASON (violet) for a normal hero encounter, GOLD
 * for the boss variant (D-14 rarity signal — GOLD reserved for boss only).
 * Node/hero/zone names come from DB per-locale columns (D-07 content-in-DB —
 * never i18n keys); heroEmoji markup is resolved at the call site with the
 * EMOJI_NOT_FOUND guard (map.ts:98 pattern) and passed in pre-rendered.
 */
export interface SanguoEncounterEmbedData {
  /** Destination node name (per-locale, D-07) — "trên đường đến {node}". */
  nodeName: string;
  /** Hero display name (per-locale) — normal encounters only. */
  heroName?: string;
  /** Pre-rendered hero emoji markup ('<a:name:id>') — normal encounters only;
   * omit when the emoji is unknown (EMOJI_NOT_FOUND → name-only, map.ts:98). */
  heroEmoji?: string;
  /** Dominant zone name (per-locale) — boss encounters only. */
  zoneName: string;
  /** D-14 boss flag — GOLD variant + boss copy when true. */
  boss: boolean;
  shardId?: number;
}

export function buildSanguoEncounterEmbed(
  data: SanguoEncounterEmbedData,
  t: TFunction,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(data.boss ? COLORS.GOLD : COLORS.SEASON) // theme.ts — never hardcode hex
    .setTitle(t(data.boss ? 'sanguo:encounter.boss_title' : 'sanguo:encounter.title'))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (data.boss) {
    embed.setDescription(t('sanguo:encounter.boss_body', { zone: data.zoneName }));
  } else {
    embed.setDescription(
      t('sanguo:encounter.body', {
        node: data.nodeName,
        hero_emoji: data.heroEmoji ?? '',
        hero: data.heroName ?? '',
      }),
    );
  }

  return embed;
}
