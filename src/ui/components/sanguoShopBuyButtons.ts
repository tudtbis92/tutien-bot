import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Shop buy buttons — ONE button per PURCHASABLE row (items + formations,
 * D-21). The label renders the price (`shop.buy_button` — `Mua ({{price}} 💎)`)
 * for DISPLAY; the customId carries ONLY the code.
 *
 * ANTI-TAMPER (T-11-04-01 / UI-SPEC / Pitfall 3 Phase 10 carry): the customId
 * is `sanguo:shop:buy:{itemCode}` — the price NEVER rides the payload. The
 * price SHOWN comes from the passed `price` string (rendered from
 * sanguo_items.price_linh / formations.base_price at render time); the price
 * CHARGED resolves server-side inside the shop tx (same config,
 * server-authoritative).
 *
 * capture_key rows render NO button — the locked line `shop.capture_key_locked`
 * (D-15 shown-not-sold).
 */
export const SHOP_BUY_PREFIX = 'sanguo:shop:buy';

export function buildShopBuyButtons(
  t: TFunction,
  rows: { code: string; price: string }[],
): ButtonBuilder[] {
  return rows.map(({ code, price }) =>
    new ButtonBuilder()
      .setCustomId(`${SHOP_BUY_PREFIX}:${code}`)
      .setLabel(t('sanguo:shop.buy_button', { price }))
      .setStyle(ButtonStyle.Primary),
  );
}
