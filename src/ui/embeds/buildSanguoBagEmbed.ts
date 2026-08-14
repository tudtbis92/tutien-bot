import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * /sanguo bag embed (D-13) — SEASON color, `🎒 Túi đồ ({{count}})` title.
 *
 * One `bag.line` per owned row — `{{emoji}} {{name}} ×{{qty}}` — from the
 * ≤3-item catalog-bound inventory (D-11). The bag NEVER renders a blank
 * surface: an empty bag renders `bag.empty` (with the next-step copy —
 * /sanguo shop or boss thường, UI-SPEC covered row). An owned booster renders
 * the `convert.booster_hint` line (D-13: the booster applies at the conversion
 * site, not here).
 *
 * All rows are pre-rendered at the command layer (per-locale names); this
 * builder stays dumb.
 */
export interface SanguoBagRow {
  emoji: string | null;
  name: string;
  quantity: number;
}

export interface SanguoBagEmbedData {
  count: number;
  rows: SanguoBagRow[];
  /** Owned booster → the convert.booster_hint line (D-13, not an apply site). */
  boosterHint?: boolean;
  shardId?: number;
}

export function buildSanguoBagEmbed(data: SanguoBagEmbedData, t: TFunction): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:bag.title', { count: data.count }))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (data.rows.length === 0) {
    embed.setDescription(t('sanguo:bag.empty'));
    return embed;
  }

  const lines = data.rows.map((row) =>
    t('sanguo:bag.line', {
      emoji: row.emoji ?? '',
      name: row.name,
      qty: row.quantity,
    }),
  );
  if (data.boosterHint) {
    lines.push(t('sanguo:convert.booster_hint'));
  }
  embed.setDescription(lines.join('\n'));
  return embed;
}
