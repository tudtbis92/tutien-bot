import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { REALM_CONFIG } from '../../constants/realms.js';
import { formatBalance } from '../../utils/format.js';

export interface LeaderboardEntry {
  rank: number;
  discordId: string;
  realmId: number;
  tuVi: bigint;
}

/**
 * Build a paginated leaderboard embed for /bxh command.
 *
 * @param entries     - Up to PAGE_SIZE (10) entries for this page; empty = no cultivators
 * @param page        - 0-indexed current page
 * @param totalPages  - Total page count (1 minimum for display purposes)
 * @param isGuild     - true = guild leaderboard title; false = global leaderboard title
 * @param t           - i18next TFunction bound to the user's locale
 * @param shardId     - Optional shard ID for embed footer
 */
export function buildLeaderboardEmbed(
  entries: LeaderboardEntry[],
  page: number,
  totalPages: number,
  isGuild: boolean,
  t: TFunction,
  shardId?: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(isGuild ? t('game:leaderboard.guild_title') : t('game:leaderboard.title'))
    .setFooter({
      text: `${embedFooter(shardId).text} • ${t('game:leaderboard.page', { current: page + 1, total: Math.max(totalPages, 1) })}`,
    });

  if (entries.length === 0) {
    embed.setDescription(t('game:leaderboard.empty'));
    return embed;
  }

  // Format each entry as a description line: #{rank} · {realmName} · {discordMention} · {tuVi}
  const lines = entries.map((entry) => {
    const realmTier = REALM_CONFIG[entry.realmId];
    const realmName = realmTier ? t(realmTier.i18nKey) : `?`;
    const mention = `<@${entry.discordId}>`;
    const tuViFormatted = formatBalance(entry.tuVi);
    return `**#${entry.rank}** · ${realmName} · ${mention} · ${tuViFormatted} tu vi`;
  });

  embed.setDescription(lines.join('\n'));

  return embed;
}
