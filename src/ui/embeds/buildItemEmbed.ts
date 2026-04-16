/**
 * Item result embed builder for gathering and crafting outcomes.
 *
 * Handles three result types:
 *  - 'gather': Standard material gathering (SUCCESS color)
 *  - 'craft': Standard crafting result (SUCCESS color)
 *  - 'unique_craft': Unique item creation (GOLD color, prominent display)
 *
 * Source: PLAN 02-07, CONTEXT.md D-26
 */

import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { EMOJI } from '../../assets/emojis.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ItemResultData {
  /** Type of item result */
  type: 'gather' | 'craft' | 'unique_craft';
  /** i18n key for the item name (e.g. 'game:items.unique.than_dan') */
  itemNameI18nKey: string;
  /** Item-specific emoji from the catalog (customEmoji field); falls back to tier badge if absent */
  itemEmoji?: string;
  /** Quantity of items received */
  quantity: number;
  /** Discord tag of the crafter for credit display (unique_craft only) */
  creatorTag?: string;
  /** Remaining linh thạch balance after fee deduction (gather only) */
  remainingBalance?: bigint;
  /** Optional shard ID for footer */
  shardId?: number;
}

// ── Builder ───────────────────────────────────────────────────────────────

/**
 * Build an embed for item result display after gathering or crafting.
 *
 * @param data - Item result data
 * @param t - i18next TFunction bound to the user's locale
 */
export function buildItemEmbed(data: ItemResultData, t: TFunction): EmbedBuilder {
  if (data.type === 'unique_craft') {
    return buildUniqueItemEmbed(data, t);
  }
  return buildStandardItemEmbed(data, t);
}

// ── Internal helpers ──────────────────────────────────────────────────────

function buildStandardItemEmbed(data: ItemResultData, t: TFunction): EmbedBuilder {
  const itemName = t(data.itemNameI18nKey);
  const isGather = data.type === 'gather';
  const displayEmoji = data.itemEmoji ?? EMOJI.SUCCESS;

  const title = isGather
    ? `${displayEmoji} ${t('game:gather.success', { amount: data.quantity, item: itemName })}`
    : `${displayEmoji} ${t('game:craft.success', { item: itemName })}`;

  const description = isGather
    ? null
    : `**${t(data.itemNameI18nKey)}** × ${data.quantity}`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(title)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (description !== null) {
    embed.setDescription(description);
  }

  if (isGather && data.remainingBalance !== undefined) {
    embed.addFields({
      name: t('game:gather.remaining_balance_label'),
      value: data.remainingBalance.toString(),
      inline: true,
    });
  }

  return embed;
}

function buildUniqueItemEmbed(data: ItemResultData, t: TFunction): EmbedBuilder {
  const itemName = t(data.itemNameI18nKey);
  const displayEmoji = data.itemEmoji ?? '✨';

  const lines: string[] = [
    `${displayEmoji} **${itemName}**`,
    '',
    `📜 *${t('game:craft.unique_pending_appraisal')}*`,
  ];

  if (data.creatorTag) {
    lines.push('', `🔨 **${data.creatorTag}**`);
  }

  return new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`✨ ${t('game:craft.unique_success', { name: itemName })}`)
    .setDescription(lines.join('\n'))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
