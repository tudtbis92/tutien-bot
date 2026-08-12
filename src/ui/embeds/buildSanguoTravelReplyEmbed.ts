import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Travel confirmation / status reply embed (D-01, UI-SPEC color contract).
 * SEASON color, title + destination/ETA/from fields — NO money field: travel
 * is time-only, wallet never involved (D-01).
 */
export interface SanguoTravelReplyEmbedData {
  destinationName: string;
  fromNodeName: string;
  etaSeconds: number;
  shardId?: number;
}

/** Humanize a travel ETA: hours+minutes for >= 1h, minutes otherwise. */
export function humanizeEta(seconds: number, t: TFunction): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.max(0, Math.round((seconds % 3600) / 60));
    return t('sanguo:travel.eta_hours_minutes', { count: hours, h: hours, m: minutes });
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t('sanguo:travel.eta_minutes', { count: minutes, n: minutes });
}

export function buildSanguoTravelReplyEmbed(
  data: SanguoTravelReplyEmbedData,
  t: TFunction,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex
    .setTitle(t('sanguo:travel.started_title'))
    .addFields(
      { name: t('sanguo:travel.destination_label'), value: t('sanguo:travel.destination', { node: data.destinationName }), inline: true },
      { name: t('sanguo:travel.eta_label'), value: t('sanguo:travel.eta', { eta: humanizeEta(data.etaSeconds, t) }), inline: true },
      { name: t('sanguo:travel.from_label'), value: t('sanguo:travel.from', { from_node: data.fromNodeName }), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
