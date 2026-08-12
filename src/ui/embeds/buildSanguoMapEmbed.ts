import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Data required to render the /sanguo map embed.
 * Zone/node names come from DB per-locale columns (D-07) — never i18n keys.
 * Zone markers (with emoji) render in message CONTENT via '# ' headers (D-15)
 * because Discord render emoji larger there and headings don't work in embeds;
 * this embed carries current position + node list only.
 */
export interface SanguoMapEmbedData {
  /** From map_nodes.name_vi/en/zh — never from i18next */
  currentZoneName: string;
  /** Node names from DB per-locale columns */
  nodes: string[];
  shardId?: number;
}

export function buildSanguoMapEmbed(data: SanguoMapEmbedData, t: TFunction): EmbedBuilder {
  const nodesValue = data.nodes.join('\n');
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex (UI-SPEC)
    .setTitle(t('sanguo:map.title'))
    .addFields(
      { name: t('sanguo:map.current_position'), value: data.currentZoneName, inline: true },
      { name: t('sanguo:map.nodes'), value: nodesValue || t('sanguo:map.empty_hint'), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
