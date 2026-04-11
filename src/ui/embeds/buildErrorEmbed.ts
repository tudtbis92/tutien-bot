import { EmbedBuilder } from 'discord.js';
import { COLORS, embedFooter } from '../theme.js';
import { EMOJI } from '../../assets/emojis.js';

/**
 * Build a standardized error embed.
 * @param message - Localized error message (use t() before passing in)
 * @param shardId - Optional shard ID for footer
 */
export function buildErrorEmbed(message: string, shardId?: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.DANGER)
    .setDescription(`${EMOJI.ERROR} ${message}`)
    .setFooter(embedFooter(shardId))
    .setTimestamp();
}
