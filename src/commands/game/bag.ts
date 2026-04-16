/**
 * /bag — View character inventory (paginated).
 *
 * Shows all items in the character's inventory with quantities.
 * 8 items per page; ◀/▶ navigation buttons.
 *
 * Phase 02.1 — pulled forward from Phase 3 scope because the craft loop
 * requires inventory visibility.
 */

/* eslint-disable i18next/no-literal-string -- Discord API static strings */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { TFunction } from 'i18next';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { characterItems } from '../../db/schema/character_items.js';
import { items } from '../../db/schema/items.js';
import { COLORS, embedFooter } from '../../ui/theme.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

export const ITEMS_PER_PAGE = 8;

export const data = new SlashCommandBuilder()
  .setName('bag')
  .setDescription('Xem vật phẩm trong túi đồ')
  .setDescriptionLocalizations({
    'en-US': 'View items in your inventory',
    'zh-CN': '查看背包中的物品',
  })
  .addIntegerOption((opt) =>
    opt
      .setName('page')
      .setDescription('Trang (mặc định 1)')
      .setDescriptionLocalizations({
        'en-US': 'Page (default 1)',
        'zh-CN': '页码（默认1）',
      })
      .setRequired(false)
      .setMinValue(1),
  );
/* eslint-enable i18next/no-literal-string */

// ── Shared page builder (also used by interactionCreate button handler) ───

export interface BagPageResult {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
}

export async function buildBagPage(
  characterId: number,
  page: number,
  t: TFunction,
  shardId: number | undefined,
): Promise<BagPageResult | null> {
  // Fetch all inventory item ids + quantities (ordered by item id for stable paging)
  const allRows = await db
    .select({ itemId: characterItems.itemId, quantity: characterItems.quantity })
    .from(characterItems)
    .where(eq(characterItems.characterId, characterId))
    .orderBy(asc(characterItems.itemId));

  if (allRows.length === 0) {
    return null; // caller shows empty message
  }

  const totalPages = Math.ceil(allRows.length / ITEMS_PER_PAGE);
  const clampedPage = Math.min(page, totalPages);
  const pageRows = allRows.slice((clampedPage - 1) * ITEMS_PER_PAGE, clampedPage * ITEMS_PER_PAGE);

  // Fetch item names for this page
  const pageItemIds = pageRows.map((r) => r.itemId);
  const itemRows = await db
    .select({ id: items.id, nameI18nKey: items.nameI18nKey, tier: items.tier, emoji: items.customEmoji })
    .from(items)
    .where(pageItemIds.length === 1 ? eq(items.id, pageItemIds[0]!) : inArray(items.id, pageItemIds));

  const itemMap = new Map(itemRows.map((r) => [r.id, r]));

  const TIER_BADGE: Record<number, string> = { 1: '⬜', 2: '🟩', 3: '🟦', 4: '🟪', 5: '🟧', 6: '🔴' };

  const lines = pageRows.map((row) => {
    const item = itemMap.get(row.itemId);
    const name = item ? t(item.nameI18nKey) : t('game:items.unknown');
    const badge = item
      ? (item.emoji ?? TIER_BADGE[item.tier] ?? '⬛')
      : '⬛';
    return `${badge} **${name}** × ${row.quantity}`;
  });

  const footerText = `${embedFooter(shardId).text} • ${t('game:leaderboard.page', { current: clampedPage, total: totalPages })}`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`🎒 ${t('game:bag.title')}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: footerText })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bag_prev_${clampedPage}_${characterId}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage <= 1),
    new ButtonBuilder()
      .setCustomId(`bag_next_${clampedPage}_${characterId}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage >= totalPages),
  );

  return { embed, row };
}

// ── Execute ───────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  const page = Math.max(1, interaction.options.getInteger('page') ?? 1);
  const result = await buildBagPage(char.id, page, t, shardId);

  if (!result) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:bag.empty'), shardId)],
    });
    return;
  }

  await interaction.editReply({ embeds: [result.embed], components: [result.row] });
}
