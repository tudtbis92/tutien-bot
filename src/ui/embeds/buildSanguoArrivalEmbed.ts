import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Arrival result embed — returned INLINE by the check-in (D-23, no DM).
 * SEASON color per the UI-SPEC contract; node name comes from the DB
 * per-locale column (D-07 content-in-DB — never an i18n key).
 */
export interface SanguoArrivalEmbedData {
  nodeName: string;
  shardId?: number;
}

export function buildSanguoArrivalEmbed(
  data: SanguoArrivalEmbedData,
  t: TFunction,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex
    .setTitle(t('sanguo:arrival.title'))
    .setDescription(`${t('sanguo:arrival.body', { node: data.nodeName })}\n${t('sanguo:arrival.cta')}`)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
