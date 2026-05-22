import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { footballBets } from '../../db/schema/footballBets.js';
import { footballMatches } from '../../db/schema/footballMatches.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { COLORS, embedFooter, EMOJI } from '../../ui/theme.js';
import type { TFunction } from 'i18next';

/* eslint-disable i18next/no-literal-string -- slash commands name/description are static Discord API strings */
export const data = new SlashCommandBuilder()
  .setName('predictions')
  .setNameLocalizations({
    'en-US': 'predictions',
    'zh-CN': 'predictions',
  })
  .setDescription('Xem trạng thái các cược bóng đá và lịch sử dự đoán của bạn')
  .setDescriptionLocalizations({
    'en-US': 'View your active football predictions and betting history',
    'zh-CN': '查看您的活跃足球预测和投注历史',
  })
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setNameLocalizations({
        'en-US': 'status',
        'zh-CN': 'status',
      })
      .setDescription('Hiển thị các cược đang hoạt động (chờ kết quả)')
      .setDescriptionLocalizations({
        'en-US': 'Show your active pending predictions',
        'zh-CN': '显示您待处理的活跃预测',
      })
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('history')
      .setNameLocalizations({
        'en-US': 'history',
        'zh-CN': 'history',
      })
      .setDescription('Hiển thị lịch sử các cược đã có kết quả')
      .setDescriptionLocalizations({
        'en-US': 'Show your resolved prediction history',
        'zh-CN': '显示您已结算的预测历史',
      })
  );
/* eslint-enable i18next/no-literal-string */

/**
 * Build and fetch predictions history page
 */
export async function buildHistoryPage(
  userId: number,
  page: number,
  t: TFunction,
  shardId?: number,
): Promise<{ embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> }> {
  const PAGE_SIZE = 5;
  const safePage = Math.max(0, page);
  const offset = safePage * PAGE_SIZE;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(footballBets)
    .where(
      and(
        eq(footballBets.userId, userId),
        ne(footballBets.status, 'pending')
      )
    );

  const total = countResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePageCapped = Math.min(safePage, totalPages - 1);

  const resolved = await db
    .select({
      bet: footballBets,
      match: footballMatches,
    })
    .from(footballBets)
    .innerJoin(footballMatches, eq(footballBets.fixtureId, footballMatches.id))
    .where(
      and(
        eq(footballBets.userId, userId),
        ne(footballBets.status, 'pending')
      )
    )
    .orderBy(desc(footballBets.resolvedAt), desc(footballBets.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${t('football:predictions.history_title')} (${t('football:predictions.page', { current: safePageCapped + 1, total: totalPages })})`)
    .setFooter(embedFooter(shardId))
    .setTimestamp();

  if (resolved.length === 0) {
    embed.setDescription(t('football:predictions.no_history'));
    
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`pred_hist_prev_0_${userId}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`pred_hist_next_0_${userId}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    return { embed, row };
  }

  const lines = resolved.map(({ bet, match }) => {
    const outcomeEmoji = bet.status === 'won' ? '✅' : bet.status === 'lost' ? '❌' : '⚪';
    const statusText = t(`football:predictions.status.${bet.status}`);
    
    const matchName = `**${match.homeTeamName}** vs **${match.awayTeamName}**`;
    const scoreStr = match.homeScore !== null && match.awayScore !== null
      ? `(\`${match.homeScore} - ${match.awayScore}\`)`
      : '';
      
    let predictionStr = bet.prediction;
    if (bet.betType === 'result') {
      if (bet.prediction === 'home') {
        predictionStr = match.homeTeamName;
      } else if (bet.prediction === 'away') {
        predictionStr = match.awayTeamName;
      } else if (bet.prediction === 'draw') {
        predictionStr = t('football:embed.draw');
      }
    }

    const wager = `${Number(bet.wagerAmount).toLocaleString()} ${EMOJI.LINH_THACH}`;
    const payout = bet.potentialPayout ? `${Number(bet.potentialPayout).toLocaleString()} ${EMOJI.LINH_THACH}` : 'N/A';
    const resultStr = bet.status === 'won'
      ? `+${Number(bet.potentialPayout).toLocaleString()}`
      : bet.status === 'void' ? `+0` : `-${Number(bet.wagerAmount).toLocaleString()}`;

    return `${outcomeEmoji} ${matchName} ${scoreStr}\n` +
           ` 🔮 **${t('football:embed.odds_label')}:** ${predictionStr} (\`x${bet.oddsUsed}\` | ${statusText})\n` +
           ` 💎 **${t('football:embed.odds')}:** ${wager} → **${payout}** (${resultStr})\n`;
  });

  embed.setDescription(lines.join('\n'));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pred_hist_prev_${safePageCapped}_${userId}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageCapped === 0),
    new ButtonBuilder()
      .setCustomId(`pred_hist_next_${safePageCapped}_${userId}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageCapped >= totalPages - 1),
  );

  return { embed, row };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('football:predictions.not_registered'), shardId)],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'status') {
    const active = await db
      .select({
        bet: footballBets,
        match: footballMatches,
      })
      .from(footballBets)
      .innerJoin(footballMatches, eq(footballBets.fixtureId, footballMatches.id))
      .where(
        and(
          eq(footballBets.userId, char.userId),
          eq(footballBets.status, 'pending')
        )
      )
      .orderBy(desc(footballBets.createdAt));

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`${t('football:predictions.title')} — ${t('football:predictions.status.pending')}`)
      .setFooter(embedFooter(shardId));

    if (active.length === 0) {
      embed.setDescription(t('football:predictions.no_active_bets'));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const descriptionLines = active.map(({ bet, match }) => {
      const matchName = `**${match.homeTeamName}** vs **${match.awayTeamName}**`;
      
      let predictionStr = bet.prediction;
      if (bet.betType === 'result') {
        if (bet.prediction === 'home') {
          predictionStr = match.homeTeamName;
        } else if (bet.prediction === 'away') {
          predictionStr = match.awayTeamName;
        } else if (bet.prediction === 'draw') {
          predictionStr = t('football:embed.draw');
        }
      }

      const odds = bet.oddsUsed;
      const wager = `${Number(bet.wagerAmount).toLocaleString()} ${EMOJI.LINH_THACH}`;
      const payout = bet.potentialPayout ? `${Number(bet.potentialPayout).toLocaleString()} ${EMOJI.LINH_THACH}` : 'N/A';

      return `⚽ ${matchName}\n` +
             ` 🔮 **${t('football:embed.odds_label')}:** ${predictionStr} (\`x${odds}\`)\n` +
             ` 💎 **${t('football:embed.odds')}:** ${wager} → **${payout}**\n` +
             ` ⏰ <t:${Math.floor(new Date(match.kickoffAt).getTime() / 1000)}:R>\n`;
    });

    embed.setDescription(descriptionLines.join('\n'));
    await interaction.editReply({ embeds: [embed] });
  } else if (subcommand === 'history') {
    const { embed, row } = await buildHistoryPage(char.userId, 0, t, shardId);
    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}
