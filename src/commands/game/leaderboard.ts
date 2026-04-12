import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { characters } from '../../db/schema/characters.js';
import { guildActivity } from '../../db/schema/guild_activity.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import {
  buildLeaderboardEmbed,
  type LeaderboardEntry,
} from '../../ui/embeds/buildLeaderboardEmbed.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Slash Command Definition ──────────────────────────────────────────────────

/* eslint-disable i18next/no-literal-string -- slash command descriptions are static Discord API strings, not runtime i18n */
export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Xem bảng xếp hạng tu tiên')
  .setDescriptionLocalizations({
    'en-US': 'View the cultivation leaderboard',
    'zh-CN': '查看修仙排行榜',
  })
  .addBooleanOption((option) =>
    option
      .setName('global')
      .setDescription('Xem bảng xếp hạng toàn server (không lọc theo server hiện tại)')
      .setDescriptionLocalizations({
        'en-US': 'View global leaderboard (all servers)',
        'zh-CN': '查看全局排行榜（所有服务器）',
      })
      .setRequired(false),
  );
/* eslint-enable i18next/no-literal-string */

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch one leaderboard page from DB.
 * - guild scope: innerJoin guildActivity, WHERE guildActivity.guildId = scope
 * - global scope: no join, all characters
 *
 * Returns raw rows; rank is computed from page offset.
 */
async function fetchPage(
  scope: string,
  page: number,
): Promise<{ discordId: string; realmId: number; tuVi: bigint }[]> {
  const offset = page * PAGE_SIZE;

  if (scope === 'global') {
    return db
      .select({
        discordId: characters.discordId,
        realmId: characters.realmId,
        tuVi: characters.tuVi,
      })
      .from(characters)
      .orderBy(sql`${characters.tuVi} DESC`)
      .limit(PAGE_SIZE)
      .offset(offset);
  }

  // Guild-specific: filter by guild_activity join
  return db
    .select({
      discordId: characters.discordId,
      realmId: characters.realmId,
      tuVi: characters.tuVi,
    })
    .from(characters)
    .innerJoin(guildActivity, eq(guildActivity.characterId, characters.id))
    .where(eq(guildActivity.guildId, scope))
    .orderBy(sql`${characters.tuVi} DESC`)
    .limit(PAGE_SIZE)
    .offset(offset);
}

/**
 * Count total entries for a given scope.
 * Used to determine total pages and whether ▶ should be disabled.
 */
async function countEntries(scope: string): Promise<number> {
  if (scope === 'global') {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(characters);
    return row?.count ?? 0;
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(characters)
    .innerJoin(guildActivity, eq(guildActivity.characterId, characters.id))
    .where(eq(guildActivity.guildId, scope));
  return row?.count ?? 0;
}

// ── Exported page builder — reused in interactionCreate button handler ─────────

/**
 * Build a complete leaderboard page: embed + pagination ActionRow.
 *
 * @param scope   - Discord guild snowflake ID or literal 'global'
 * @param page    - 0-indexed page number
 * @param t       - i18next TFunction bound to the user's locale
 * @param shardId - Optional shard ID for embed footer
 */
export async function buildLeaderboardPage(
  scope: string,
  page: number,
  t: TFunction,
  shardId?: number,
): Promise<{ embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> }> {
  const isGuild = scope !== 'global';

  // Validate page range (negative page guard — T-02-BXH-01)
  const safePage = Math.max(0, page);

  const [rows, total] = await Promise.all([
    fetchPage(scope, safePage),
    countEntries(scope),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePageCapped = Math.min(safePage, totalPages - 1);

  const entries: LeaderboardEntry[] = rows.map((row, idx) => ({
    rank: safePageCapped * PAGE_SIZE + idx + 1,
    discordId: row.discordId,
    realmId: row.realmId,
    tuVi: row.tuVi,
  }));

  const embed = buildLeaderboardEmbed(entries, safePageCapped, totalPages, isGuild, t, shardId);

  // Pagination buttons — customId encodes current page and scope for stateless resume
  const prevCustomId = `bxh_prev_${safePageCapped}_${scope}`;
  const nextCustomId = `bxh_next_${safePageCapped}_${scope}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(prevCustomId)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageCapped === 0),
    new ButtonBuilder()
      .setCustomId(nextCustomId)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageCapped >= totalPages - 1),
  );

  return { embed, row };
}

// ── Command execute ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const locale = resolveLocale(null, interaction.locale);
  const t = getT(locale);

  const isGlobal = interaction.options.getBoolean('global') ?? false;

  // Determine scope: guild snowflake or literal 'global'
  // Default to guild leaderboard; fallback to global if command used in DMs
  const scope = isGlobal || !interaction.guildId ? 'global' : interaction.guildId;

  const shardId = interaction.client.shard?.ids[0];

  const { embed, row } = await buildLeaderboardPage(scope, 0, t, shardId);

  await interaction.editReply({ embeds: [embed], components: [row] });
}
