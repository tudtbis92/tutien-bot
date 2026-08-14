import { EmbedBuilder } from 'discord.js';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Shared progression-result embed (convert / level / evolve / reroll) — the
 * single result surface for every hồn ngọc action on the copy selector.
 *
 * D-12 structural rule: the data interface carries VISIBLE fields only —
 * pre-rendered title + body lines. No raw IV, no base stats, no tier
 * multipliers, no cost curve values ever reach this builder (the command
 * layer renders all copy through t(); the builder stays dumb).
 *
 * Colors ONLY from theme.ts COLORS: SUCCESS for convert/level/evolve/reroll
 * done states, DANGER for insufficient/blocked states.
 */
export interface SanguoProgressionResultData {
  state: 'success' | 'error';
  /** Pre-rendered title (e.g. convert.title with the hero name). */
  title: string;
  /** Pre-rendered body lines (e.g. convert.done + booster hint). */
  lines: string[];
  shardId?: number;
}

export function buildSanguoProgressionResultEmbed(
  data: SanguoProgressionResultData,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(data.state === 'success' ? COLORS.SUCCESS : COLORS.DANGER)
    .setTitle(data.title)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
  if (data.lines.length > 0) {
    embed.setDescription(data.lines.join('\n'));
  }
  return embed;
}
