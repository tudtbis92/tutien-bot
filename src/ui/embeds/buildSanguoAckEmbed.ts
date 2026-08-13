import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { humanizeEta } from './buildSanguoTravelReplyEmbed.js';

/**
 * Encounter ack result embed (D-25) — returned INLINE after pressing the
 * "Tiếp tục hành trình" button so the user sees the outcome instead of the
 * stale encounter embed. SEASON color per the UI-SPEC contract; the remaining
 * ETA comes from the row's pause-aware travel_seconds_remaining.
 */
export interface SanguoAckEmbedData {
  destinationName: string;
  remainingSeconds: number;
  shardId?: number;
}

export function buildSanguoAckEmbed(
  data: SanguoAckEmbedData,
  t: TFunction,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:ack.title'))
    .setDescription(
      t('sanguo:ack.body', {
        node: data.destinationName,
        eta: humanizeEta(data.remainingSeconds, t),
      }),
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
