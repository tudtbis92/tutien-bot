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
  /** i18n key for the item name (e.g. 'game:items.linh_thao.ten_cay') */
  itemNameI18nKey: string;
  /** Quantity of items received */
  quantity: number;
  /** Whether this is a unique item (unique_craft only) */
  isUnique?: boolean;
  /** Custom name provided by the crafter (unique_craft only) */
  customName?: string;
  /** Custom emoji provided by the crafter (unique_craft only) */
  customEmoji?: string;
  /** Discord tag of the crafter for credit display (unique_craft only) */
  creatorTag?: string;
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

  const title = isGather
    ? `${EMOJI.SUCCESS} ${t('game:gather.success', { amount: data.quantity, item: itemName })}`
    : `${EMOJI.SUCCESS} ${t('game:craft.success', { item: itemName })}`;

  const description = isGather
    ? `**${t(data.itemNameI18nKey)}** × ${data.quantity}`
    : `**${t(data.itemNameI18nKey)}** × ${data.quantity}`;

  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(title)
    .setDescription(description)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}

function buildUniqueItemEmbed(data: ItemResultData, t: TFunction): EmbedBuilder {
  const displayName = data.customName ?? t(data.itemNameI18nKey);
  const emojiPrefix = data.customEmoji ? `${data.customEmoji} ` : '✨ ';

  const title = `${emojiPrefix}${t('game:craft.unique_success', { name: displayName })}`;

  const lines: string[] = [
    `**${emojiPrefix}${displayName}**`,
    '',
    `📜 *${t(data.itemNameI18nKey)}*`,
  ];

  if (data.creatorTag) {
    lines.push('', `🔨 **${data.creatorTag}**`);
  }

  return new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
