import { EmbedBuilder } from 'discord.js';
import { COLORS, embedFooter } from '../theme.js';
import { EMOJI } from '../../assets/emojis.js';

/**
 * Build a standardized success embed.
 * @param title - Localized embed title
 * @param description - Localized description
 * @param shardId - Optional shard ID for footer
 */
export function buildSuccessEmbed(
  title: string,
  description: string,
  shardId?: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJI.SUCCESS} ${title}`)
    .setDescription(description)
    .setFooter(embedFooter(shardId))
    .setTimestamp();
}
