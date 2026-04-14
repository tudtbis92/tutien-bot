/**
 * /gather — Gacha gathering command (Phase 02.1 refactor).
 *
 * Design decisions (CONTEXT.md):
 *  - D-01: Gather is gacha — spend linh thạch, receive random item from pool
 *  - D-02: Fee scales with major realm index
 *  - D-03: 1 expand pool — low tiers always available, high tiers gated by min_major_realm_index
 *  - D-04: 99.8% net loss invariant (EV negative at all fee thresholds)
 *  - D-05: No cooldown on gather
 *  - D-06: Multi-gather /gather amount:N (1–10)
 *  - D-11: Crafted items NEVER appear in gather pool
 *
 * Threat mitigations:
 *  - T-02-GATHER-03: fee deducted atomically with item grant in single transaction
 *  - T-02-GATHER-04: amount clamped 1–10 server-side; pool filtered by realm index server-side
 */

/* eslint-disable i18next/no-literal-string -- Discord API static strings */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { characterItems } from '../../db/schema/character_items.js';
import { gatherPoolItems } from '../../db/schema/gather_pool_items.js';
import { items } from '../../db/schema/items.js';
import { GATHER_FEES, getMajorRealmIndex } from '../../constants/gatherFees.js';
import { buildItemEmbed } from '../../ui/embeds/buildItemEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

// ── Command definition ────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('gather')
  .setDescription('Chi linh thạch để thu thập nguyên liệu ngẫu nhiên')
  .setDescriptionLocalizations({
    'en-US': 'Spend spirit stones to gather random materials',
    'zh-CN': '花费灵石随机采集原材料',
  })
  .addIntegerOption((opt) =>
    opt
      .setName('amount')
      .setDescription('Số lần thu thập (1–10)')
      .setDescriptionLocalizations({
        'en-US': 'Number of gather rolls (1–10)',
        'zh-CN': '采集次数（1–10）',
      })
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10),
  );
/* eslint-enable i18next/no-literal-string */

// ── Weighted random selection ─────────────────────────────────────────────

interface PoolEntry {
  itemId: number;
  weight: number;
}

/**
 * Select a random item from a weighted pool.
 * Returns null if pool is empty (should not happen in practice).
 */
function weightedRandom(pool: PoolEntry[]): number | null {
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const entry of pool) {
    rand -= entry.weight;
    if (rand <= 0) return entry.itemId;
  }

  // Fallback — floating point edge case
  return pool[pool.length - 1]!.itemId;
}

// ── Execute ───────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, user, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  // 1. Parse amount (default 1, clamped 1–10 by Discord but double-checked)
  const amount = Math.min(10, Math.max(1, interaction.options.getInteger('amount') ?? 1));

  // 2. Compute gather fee based on major realm index
  const majorRealmIndex = getMajorRealmIndex(char.realmId);
  const feePerRoll = GATHER_FEES[majorRealmIndex] ?? GATHER_FEES[GATHER_FEES.length - 1]!;
  const totalFee = feePerRoll * BigInt(amount);

  // 3. Check linh thạch balance (users.balance — NOT characters.tuVi)
  const userBalance = user?.balance ?? 0n;
  if (userBalance < totalFee) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          t('game:gather.insufficient_balance', {
            required: totalFee.toString(),
            current: userBalance.toString(),
          }),
          shardId,
        ),
      ],
    });
    return;
  }

  // 4. Load eligible pool entries for this realm index
  const pool = await db
    .select({
      itemId: gatherPoolItems.itemId,
      weight: gatherPoolItems.weight,
    })
    .from(gatherPoolItems)
    .where(
      and(
        eq(gatherPoolItems.isActive, true),
        sql`${gatherPoolItems.minMajorRealmIndex} <= ${majorRealmIndex}`,
      ),
    );

  if (pool.length === 0) {
    // Should never happen if seed ran correctly
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:gather.pool_empty'), shardId)],
    });
    return;
  }

  // 5. Roll N times and tally results
  const gainMap = new Map<number, number>(); // itemId → quantity gained
  for (let i = 0; i < amount; i++) {
    const itemId = weightedRandom(pool);
    if (itemId !== null) {
      gainMap.set(itemId, (gainMap.get(itemId) ?? 0) + 1);
    }
  }

  // 6. Atomic transaction: deduct linh thạch fee from users.balance + grant items
  try {
    await db.transaction(async (tx) => {
      // Deduct linh thạch from users.balance (NOT characters.tuVi)
      // The WHERE condition is the atomic race-condition guard.
      const deductResult = await tx
        .update(users)
        .set({ balance: sql`${users.balance} - ${totalFee}` })
        .where(
          and(
            eq(users.discordId, char.discordId),
            sql`${users.balance} >= ${totalFee}`, // race condition guard
          ),
        );

      if ((deductResult.rowCount ?? 0) === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Grant items
      for (const [itemId, quantity] of gainMap) {
        await tx
          .insert(characterItems)
          .values({ characterId: char.id, itemId, quantity })
          .onConflictDoUpdate({
            target: [characterItems.characterId, characterItems.itemId],
            set: { quantity: sql`${characterItems.quantity} + ${quantity}` },
          });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            t('game:gather.insufficient_balance', {
              required: totalFee.toString(),
              current: userBalance.toString(),
            }),
            shardId,
          ),
        ],
      });
      return;
    }
    throw err;
  }

  const remainingBalance = userBalance - totalFee;

  // 7. Fetch item names for display
  const gainEntries = [...gainMap.entries()];
  const itemIds = gainEntries.map(([id]) => id);
  const itemRows = await db
    .select({ id: items.id, nameI18nKey: items.nameI18nKey })
    .from(items)
    .where(inArray(items.id, itemIds));

  const idToKey = new Map(itemRows.map((r) => [r.id, r.nameI18nKey]));

  // 8. Build result embed
  if (amount === 1 && gainEntries.length === 1) {
    // Single gather — use standard item embed
    const [itemId, quantity] = gainEntries[0]!;
    const nameI18nKey = idToKey.get(itemId) ?? 'game:items.unknown';
    await interaction.editReply({
      embeds: [
        buildItemEmbed(
          { type: 'gather', itemNameI18nKey: nameI18nKey, quantity, remainingBalance, shardId },
          t,
        ),
      ],
    });
  } else {
    // Multi-gather — list all items received
    const lines = gainEntries.map(([itemId, qty]) => {
      const key = idToKey.get(itemId) ?? 'game:items.unknown';
      const name = t(key);
      return `• **${name}** × ${qty}`;
    });

    lines.push('');
    lines.push(`${t('game:gather.remaining_balance_label')}: **${remainingBalance.toString()}**`);

    const { EmbedBuilder } = await import('discord.js');
    const { COLORS, embedFooter } = await import('../../ui/theme.js');
    const { EMOJI } = await import('../../assets/emojis.js');

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle(`${EMOJI.SUCCESS} ${t('game:gather.multi_success', { amount, fee: totalFee.toString() })}`)
          .setDescription(lines.join('\n'))
          .setFooter(embedFooter(shardId))
          .setTimestamp(),
      ],
    });
  }
}
