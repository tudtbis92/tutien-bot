import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { eq, asc, sql } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { sanguoItems } from '../../db/schema/sanguoItems.js';
import { formations } from '../../db/schema/formations.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoProgressionResultEmbed } from '../../ui/embeds/buildSanguoProgressionResultEmbed.js';
import { buildSanguoShopEmbed, type SanguoShopEmbedData, type SanguoShopRow } from '../../ui/embeds/buildSanguoShopEmbed.js';
import { SHOP_TAB_PREFIX, buildShopTabs, type ShopTab } from '../../ui/components/sanguoShopTabs.js';
import { SHOP_BUY_PREFIX, buildShopBuyButtons } from '../../ui/components/sanguoShopBuyButtons.js';
import { buyItem, buyFormation } from '../../services/sanguo/shopService.js';
import { logger } from '../../utils/logger.js';

/**
 * /sanguo shop command (Phase 11 — TQC-16, D-16/D-21).
 *
 * Multi-currency shop surface: TWO currency tabs (💎 Linh thạch / 🎁 Sự kiện)
 * in ONE ActionRow. The Linh thạch tab lists the purchasable items
 * (heal_pill 50💎, booster_x2 100💎 — sale_state 'sold') + the purchasable
 * formations (200-500💎, D-21) with a buy button per row; the Event tab shows
 * the LOCKED capture_key row (D-15 — shown, never sold for Linh thạch, no buy
 * button) + shop.event_empty.
 *
 * Buy presses route through shopService.buyItem / buyFormation — the wallet
 * sink (D-19): every price resolves server-side inside the tx; the customId
 * carries ONLY the code (anti-tamper, T-11-04-01). Results render SUCCESS
 * (shop.bought / shop.bought_formation) or DANGER (shop.insufficient /
 * shop.not_for_sale).
 *
 * Identity rule: every service call keys on users.id — NEVER char.id.
 */
/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const shopSubcommand = new SlashCommandSubcommandBuilder()
  .setName('shop')
  .setDescription('Mua vật phẩm và trận hình')
  .setDescriptionLocalizations({
    'en-US': 'Buy items and formations',
    'zh-CN': '购买物品和阵型',
  });
/* eslint-enable i18next/no-literal-string */

interface PerLocaleName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Per-locale name column (D-07 content-in-DB — never i18n keys). */
function pickName(row: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return row.nameEn;
  if (locale === 'zh-cn') return row.nameZh ?? row.nameVi;
  return row.nameVi;
}

/** A catalog row with its natural-key code (buy-button customId source). */
interface ShopCatalogRow extends SanguoShopRow {
  code: string;
}

/** Load the Linh thạch-tab rows: purchasable items + purchasable formations. */
async function loadShopRows(locale: SupportedLocale): Promise<{
  itemRows: ShopCatalogRow[];
  formationRows: ShopCatalogRow[];
  captureKey: SanguoShopRow | null;
}> {
  const itemRows = await db
    .select()
    .from(sanguoItems)
    .where(eq(sanguoItems.saleState, 'sold'))
    .orderBy(asc(sanguoItems.priceLinh)); // items section, price asc
  const formationRows = await db
    .select()
    .from(formations)
    .where(sql`${formations.basePrice} > 0`) // the starter is free, not purchasable
    .orderBy(asc(formations.basePrice));
  const [captureKey] = await db
    .select()
    .from(sanguoItems)
    .where(eq(sanguoItems.code, 'capture_key'))
    .limit(1);

  return {
    itemRows: itemRows.map((r) => ({
      code: r.code,
      emoji: r.emoji,
      name: pickName(r, locale),
      price: String(r.priceLinh),
    })),
    formationRows: formationRows.map((r) => ({
      code: r.code,
      emoji: r.emoji,
      name: pickName(r, locale),
      price: String(r.basePrice),
    })),
    captureKey: captureKey
      ? { emoji: captureKey.emoji, name: pickName(captureKey, locale), price: String(captureKey.priceLinh) }
      : null,
  };
}

/** Shared render — the tab row + (Linh tab) the buy-button row. */
async function renderShop(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: number,
  locale: SupportedLocale,
  t: TFunction,
  shardId: number | undefined,
  tab: ShopTab,
): Promise<void> {
  const { itemRows, formationRows, captureKey } = await loadShopRows(locale);

  const data: SanguoShopEmbedData = {
    tab,
    itemRows: itemRows.map(({ emoji, name, price }) => ({ emoji, name, price })),
    formationRows: formationRows.map(({ emoji, name, price }) => ({ emoji, name, price })),
    captureKeyLocked: captureKey ? { emoji: captureKey.emoji, name: captureKey.name } : undefined,
    shardId,
  };

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    // R-1: the two currency tabs in ONE ActionRow.
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...buildShopTabs(t, tab),
    ),
  ];

  // Buy buttons on the Linh thạch tab ONLY (capture_key renders none — D-15).
  if (tab === 'linh') {
    const buyable = [
      ...itemRows.map((r) => ({ code: r.code, price: r.price })),
      ...formationRows.map((r) => ({ code: r.code, price: r.price })),
    ];
    if (buyable.length > 0) {
      components.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          ...buildShopBuyButtons(t, buyable),
        ),
      );
    }
  }

  await interaction.editReply({ embeds: [buildSanguoShopEmbed(data, t)], components });
}

/**
 * /sanguo shop execute — NO deferReply (the parent 'sanguo' command owns it,
 * map.ts execute). Defaults to the 💎 Linh thạch tab.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
  if (!char || !user) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }
  try {
    await renderShop(interaction, user.id, locale, t, shardId, 'linh');
  } catch (err) {
    logger.error('ShopExecute', 'Error in /sanguo shop', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:shop.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Tab press (sanguo:shop:tab:{linh|event}) — re-renders the shop for the
 * chosen currency tab (D-16). The tab key is validated against the two known
 * values; anything else falls back to the Linh thạch tab (never a crash).
 */
export async function handleShopTabPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  try {
    const raw = interaction.customId.slice(SHOP_TAB_PREFIX.length + 1);
    const tab: ShopTab = raw === 'event' ? 'event' : 'linh';
    await renderShop(interaction, userId, locale, t, shardId, tab);
  } catch (err) {
    logger.error('ShopTabPress', 'Error in shop tab press', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:shop.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Buy press (sanguo:shop:buy:{code}) — dispatches to buyItem or buyFormation
 * (the code namespace distinguishes items from formations). The price is NEVER
 * in the customId; the pre-read only feeds the error copy (the tx re-resolves
 * authoritatively).
 */
export async function handleShopBuyPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const code = interaction.customId.slice(SHOP_BUY_PREFIX.length + 1);
  if (!code) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:shop.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    // Resolve the code namespace + the display price (for the error copy).
    const [formation] = await db
      .select()
      .from(formations)
      .where(eq(formations.code, code))
      .limit(1);

    if (formation) {
      const res = await buyFormation(userId, code);
      const name = pickName(res, locale);
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'success',
            title: t('sanguo:shop.title', { tab: t('sanguo:shop.tab_linh') }),
            lines: [t('sanguo:shop.bought_formation', { emoji: res.emoji ?? '', name, price: String(res.price) })],
            shardId,
          }),
        ],
        components: [],
      });
    } else {
      const res = await buyItem(userId, code);
      const name = pickName(res, locale);
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'success',
            title: t('sanguo:shop.title', { tab: t('sanguo:shop.tab_linh') }),
            lines: [t('sanguo:shop.bought', { emoji: res.emoji ?? '', name, qty: res.qty, price: String(res.price) })],
            shardId,
          }),
        ],
        components: [],
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      // Re-resolve the display price for the error copy (server-side).
      const [item] = await db
        .select()
        .from(sanguoItems)
        .where(eq(sanguoItems.code, code))
        .limit(1);
      const price = item ? String(item.priceLinh) : '';
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'error',
            title: t('sanguo:shop.title', { tab: t('sanguo:shop.tab_linh') }),
            lines: [t('sanguo:shop.insufficient', { price })],
            shardId,
          }),
        ],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'ITEM_NOT_FOR_SALE') {
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'error',
            title: t('sanguo:shop.title', { tab: t('sanguo:shop.tab_linh') }),
            lines: [t('sanguo:shop.not_for_sale')],
            shardId,
          }),
        ],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'ALREADY_OWNED') {
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'error',
            title: t('sanguo:shop.title', { tab: t('sanguo:shop.tab_linh') }),
            lines: [t('sanguo:shop.already_owned')],
            shardId,
          }),
        ],
        components: [],
      });
      return;
    }
    logger.error('ShopBuyPress', 'Error in shop buy press', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:shop.error'), shardId)],
      components: [],
    });
  }
}
