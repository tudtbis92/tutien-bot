import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Bag use buttons (D-13) — ONE "Dùng" button per USEABLE item, bounded by the
 * ≤3-item catalog (D-11). customId contract: `sanguo:bag:use:{itemCode}` —
 * the item code ONLY (the effect resolves server-side in the bag tx).
 *
 * The command layer decides WHICH items render a button: healing items render
 * the use button (targets the active companion); the booster renders the
 * convert.booster_hint instead (it applies at the CONVERSION site, D-12/D-13
 * — never an apply site here); capture keys render NO button (they gate the
 * T4/T5 capture buttons in sanguoCapture.ts).
 */
export const BAG_USE_PREFIX = 'sanguo:bag:use';

export function buildBagUseButtons(
  t: TFunction,
  rows: { itemCode: string }[],
): ButtonBuilder[] {
  return rows.map(({ itemCode }) =>
    new ButtonBuilder()
      .setCustomId(`${BAG_USE_PREFIX}:${itemCode}`)
      .setLabel(t('sanguo:bag.use_button'))
      .setStyle(ButtonStyle.Primary),
  );
}
