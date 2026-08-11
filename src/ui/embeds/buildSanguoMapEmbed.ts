import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';

/**
 * Data required to render the /sanguo map embed.
 * Zone/node names come from DB per-locale columns (D-07) — never i18n keys.
 * Emoji markers render via heroEmoji() only (D-15); colors from COLORS only.
 */
export interface SanguoMapEmbedData {
  /** From map_nodes.name_vi/en/zh — never from i18next */
  currentZoneName: string;
  /** heroId only; emoji via heroEmoji(). Absent heroId → label-only zone entry (D-07 null marker) */
  zones: { label: string; heroId?: string }[];
  /** Node names from DB per-locale columns */
  nodes: string[];
  shardId?: number;
}

export function buildSanguoMapEmbed(data: SanguoMapEmbedData, t: TFunction): EmbedBuilder {
  const zonesValue = data.zones
    .map((z) => (z.heroId ? `${heroEmoji(z.heroId)} ${z.label}` : z.label))
    .join('\n');
  const nodesValue = data.nodes.join('\n');
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex (UI-SPEC)
    .setTitle(t('sanguo:map.title'))
    .addFields(
      { name: t('sanguo:map.current_position'), value: data.currentZoneName, inline: true },
      { name: t('sanguo:map.zones'), value: zonesValue || t('sanguo:map.empty'), inline: false },
      { name: t('sanguo:map.nodes'), value: nodesValue || t('sanguo:map.empty_hint'), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
