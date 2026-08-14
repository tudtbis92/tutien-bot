import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import type { ShopTab } from '../components/sanguoShopTabs.js';

/**
 * /sanguo shop embed (D-16) — tab-state-aware (💎 Linh thạch / 🎁 Sự kiện),
 * SEASON color.
 *
 * Linh thạch tab: sections `shop.section_items` (heal_pill + booster_x2) +
 * `shop.section_formations` (purchasable formations, D-21), one
 * `shop.item_line` per row — `{{emoji}} {{name}} — **{{price}}** 💎` (glyph +
 * bold number, never a color accent).
 *
 * Event tab: the LOCKED capture_key row (`shop.capture_key_locked` — D-15
 * shown-not-sold, no buy button) + `shop.event_empty` — never a blank surface
 * by construction (UI-SPEC covered row).
 *
 * All rows are pre-rendered at the command layer (per-locale names + price
 * strings); this builder stays dumb. D-12: prices/costs are spendable
 * resources — VISIBLE (mirrors Phase 10 fee display).
 */
export interface SanguoShopRow {
  emoji: string | null;
  name: string;
  price: string;
}

export interface SanguoShopEmbedData {
  tab: ShopTab;
  /** Purchasable items (sale_state 'sold') — heal_pill, booster_x2. */
  itemRows: SanguoShopRow[];
  /** Purchasable formations (base_price > 0) — D-21. */
  formationRows: SanguoShopRow[];
  /** Event tab: the locked capture_key row (D-15) — emoji + name. */
  captureKeyLocked?: { emoji: string | null; name: string };
  /** Defensive — the Linh thạch tab is never empty by catalog bound. */
  empty?: boolean;
  shardId?: number;
}

export function buildSanguoShopEmbed(data: SanguoShopEmbedData, t: TFunction): EmbedBuilder {
  const tabLabel = data.tab === 'linh' ? t('sanguo:shop.tab_linh') : t('sanguo:shop.tab_event');
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:shop.title', { tab: tabLabel }))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (data.empty) {
    embed.setDescription(t('sanguo:shop.empty'));
    return embed;
  }

  const lines: string[] = [];

  if (data.tab === 'linh') {
    if (data.itemRows.length > 0) {
      lines.push(`**${t('sanguo:shop.section_items')}**`);
      for (const row of data.itemRows) {
        lines.push(
          t('sanguo:shop.item_line', {
            emoji: row.emoji ?? '',
            name: row.name,
            price: row.price,
          }),
        );
      }
    }
    if (data.formationRows.length > 0) {
      lines.push(`**${t('sanguo:shop.section_formations')}**`);
      for (const row of data.formationRows) {
        lines.push(
          t('sanguo:shop.item_line', {
            emoji: row.emoji ?? '',
            name: row.name,
            price: row.price,
          }),
        );
      }
    }
  } else {
    // Event tab — the locked capture_key row (D-15, shown not sold) + the
    // empty note. Never a blank surface (UI-SPEC covered row).
    if (data.captureKeyLocked) {
      lines.push(
        `${data.captureKeyLocked.emoji ?? ''} ${data.captureKeyLocked.name} — ${t('sanguo:shop.capture_key_locked')}`,
      );
    }
    lines.push(t('sanguo:shop.event_empty'));
  }

  if (lines.length > 0) {
    embed.setDescription(lines.join('\n'));
  }
  return embed;
}
