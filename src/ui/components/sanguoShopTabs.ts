import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Shop currency tabs (D-16) — TWO toggle buttons in ONE ActionRow (R-1):
 * 💎 Linh thạch + 🎁 Sự kiện. The ACTIVE tab renders Primary, the inactive
 * Secondary; pressing re-renders the shop for the chosen currency tab.
 *
 * customId contract: `sanguo:shop:tab:{linh|event}` — the tab key only.
 */
export const SHOP_TAB_PREFIX = 'sanguo:shop:tab';
export type ShopTab = 'linh' | 'event';

export function buildShopTabs(t: TFunction, activeTab: ShopTab): ButtonBuilder[] {
  const linh = new ButtonBuilder()
    .setCustomId(`${SHOP_TAB_PREFIX}:linh`)
    .setLabel(t('sanguo:shop.tab_linh'))
    .setStyle(activeTab === 'linh' ? ButtonStyle.Primary : ButtonStyle.Secondary);
  const event = new ButtonBuilder()
    .setCustomId(`${SHOP_TAB_PREFIX}:event`)
    .setLabel(t('sanguo:shop.tab_event'))
    .setStyle(activeTab === 'event' ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return [linh, event];
}
