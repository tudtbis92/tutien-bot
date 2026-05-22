import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import type { FootballMatch } from '../../db/schema/footballMatches.js';

/**
 * Helper to get translated string or fallback
 */
function translate(t: TFunction | undefined, key: string, fallback: string, options?: Record<string, unknown>): string {
  if (t) {
    const result = t(key, options);
    if (typeof result === 'string') return result;
  }
  return fallback;
}

/**
 * Format timestamp nicely
 */
function formatTime(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
}

/**
 * Build a prediction embed for an upcoming match with interactive components
 */
export function buildPredictionEmbed(
  match: FootballMatch,
  shardId?: number,
  t?: TFunction,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  const home = match.homeTeamName;
  const away = match.awayTeamName;
  const league = match.leagueName;
  const kickoff = new Date(match.kickoffAt);

  const title = `⚽ ${home} vs ${away}`;
  
  // Format Odds info for the description
  const homeOddsStr = match.homeOdds ? `\`${match.homeOdds}\`` : 'N/A';
  const drawOddsStr = match.drawOdds ? `\`${match.drawOdds}\`` : 'N/A';
  const awayOddsStr = match.awayOdds ? `\`${match.awayOdds}\`` : 'N/A';

  const kickoffLabel = translate(t, 'football:embed.kickoff', 'Kickoff Time');
  const leagueLabel = translate(t, 'football:embed.league', 'League');
  const oddsLabel = translate(t, 'football:embed.odds', 'Match Odds');
  const homeLabel = translate(t, 'football:embed.home', 'Home');
  const drawLabel = translate(t, 'football:embed.draw', 'Draw');
  const awayLabel = translate(t, 'football:embed.away', 'Away');

  const description = [
    `🏆 **${leagueLabel}:** ${league}`,
    `📅 **${kickoffLabel}:** ${formatTime(kickoff)}`,
    ``,
    `📊 **${oddsLabel}:**`,
    `🏠 ${homeLabel} (${home}): ${homeOddsStr}`,
    `🤝 ${drawLabel}: ${drawOddsStr}`,
    `✈️ ${awayLabel} (${away}): ${awayOddsStr}`,
  ];

  if (match.overUnderLine) {
    // eslint-disable-next-line i18next/no-literal-string
    const ouLabel = translate(t, 'football:embed.over_under', 'Over/Under');
    description.push(`📈 **${ouLabel} (${match.overUnderLine}):** O \`${match.overOdds}\` / U \`${match.underOdds}\``);
  }

  if (match.homeSpreadLine) {
    const spreadLabel = translate(t, 'football:embed.spread', 'Spread');
    description.push(`🎯 **${spreadLabel}:** ${home} \`${match.homeSpreadLine}\` (\`${match.homeSpreadOdds}\`) / ${away} \`${match.awaySpreadLine}\` (\`${match.awaySpreadOdds}\`)`);
  }

  description.push(``);
  // eslint-disable-next-line i18next/no-literal-string
  description.push(`🔮 *${translate(t, 'football:embed.instruction', 'Select a result below to place your wager!')}*`);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description.join('\n'))
    .setImage('attachment://prediction.png')
    .setFooter(embedFooter(shardId))
    .setTimestamp(kickoff);

  // Components list
  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  // Row 1: StringSelectMenu for match result
  // eslint-disable-next-line i18next/no-literal-string
  const placeholder = translate(t, 'football:embed.result_placeholder', 'Choose match result...');
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`predict:result:${match.id}`)
    .setPlaceholder(placeholder);

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel(`${translate(t, 'football:embed.home_win_label', 'Home Win')} (${home})`)
      .setValue('home')
      .setDescription(`${translate(t, 'football:embed.odds_label', 'Odds')}: ${match.homeOdds || 'N/A'}`)
      .setEmoji('🏠'),
    new StringSelectMenuOptionBuilder()
      .setLabel(translate(t, 'football:embed.draw_label', 'Draw'))
      .setValue('draw')
      .setDescription(`${translate(t, 'football:embed.odds_label', 'Odds')}: ${match.drawOdds || 'N/A'}`)
      .setEmoji('🤝'),
    new StringSelectMenuOptionBuilder()
      .setLabel(`${translate(t, 'football:embed.away_win_label', 'Away Win')} (${away})`)
      .setValue('away')
      .setDescription(`${translate(t, 'football:embed.odds_label', 'Odds')}: ${match.awayOdds || 'N/A'}`)
      .setEmoji('✈️'),
  ];
  selectMenu.addOptions(options);

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  components.push(row1);

  // Row 2: Over/Under Buttons
  if (match.overUnderLine) {
    const row2 = new ActionRowBuilder<ButtonBuilder>();
    const overLabel = translate(t, 'football:embed.over_label', 'Over');
    const underLabel = translate(t, 'football:embed.under_label', 'Under');

    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`predict:over_under:${match.id}:over`)
        .setLabel(`${overLabel} ${match.overUnderLine} (${match.overOdds})`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📈'),
      new ButtonBuilder()
        .setCustomId(`predict:over_under:${match.id}:under`)
        .setLabel(`${underLabel} ${match.overUnderLine} (${match.underOdds})`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📉')
    );
    components.push(row2);
  }

  // Row 3: Spread Buttons
  if (match.homeSpreadLine && match.awaySpreadLine) {
    const row3 = new ActionRowBuilder<ButtonBuilder>();
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`predict:spread:${match.id}:home_spread`)
        .setLabel(`${home} ${match.homeSpreadLine} (${match.homeSpreadOdds})`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`predict:spread:${match.id}:away_spread`)
        .setLabel(`${away} ${match.awaySpreadLine} (${match.awaySpreadOdds})`)
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(row3);
  }

  return { embeds: [embed], components };
}

/**
 * Returns updated prediction embed with live score details
 */
export function buildLiveScoreUpdate(
  match: FootballMatch,
  shardId?: number,
  t?: TFunction,
): EmbedBuilder {
  const home = match.homeTeamName;
  const away = match.awayTeamName;
  const league = match.leagueName;
  const kickoff = new Date(match.kickoffAt);

  const title = `⚽ ${home} ${match.homeScore ?? 0} - ${match.awayScore ?? 0} ${away}`;
  
  const statusLabel = translate(t, 'football:embed.status', 'Status');
  const kickoffLabel = translate(t, 'football:embed.kickoff', 'Kickoff Time');
  const leagueLabel = translate(t, 'football:embed.league', 'League');
  const liveLabel = translate(t, 'football:embed.live', 'LIVE SCORE');

  const statusMap: Record<string, string> = {
    '1H': translate(t, 'football:status.1h', 'First Half'),
    'HT': translate(t, 'football:status.ht', 'Half Time'),
    '2H': translate(t, 'football:status.2h', 'Second Half'),
    'LIVE': translate(t, 'football:status.live', 'Live'),
    'ET': translate(t, 'football:status.et', 'Extra Time'),
    'P': translate(t, 'football:status.p', 'Penalty'),
    'FT': translate(t, 'football:status.ft', 'Finished'),
    'AET': translate(t, 'football:status.aet', 'Finished after Extra Time'),
    'PEN': translate(t, 'football:status.pen', 'Finished after Penalty'),
  };
  const displayStatus = statusMap[match.status] || match.status;

  const description = [
    `🏆 **${leagueLabel}:** ${league}`,
    `📅 **${kickoffLabel}:** ${formatTime(kickoff)}`,
    ``,
    `🔴 **${liveLabel}:**`,
    `🏟️ **${home}** \`${match.homeScore ?? 0}\` vs \`${match.awayScore ?? 0}\` **${away}**`,
    `⏱️ **${statusLabel}:** \`${displayStatus}\``,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(match.status === 'FT' || match.status === 'AET' || match.status === 'PEN' ? COLORS.SUCCESS : COLORS.GOLD)
    .setTitle(title)
    .setDescription(description)
    .setFooter(embedFooter(shardId))
    .setTimestamp(kickoff);
}
