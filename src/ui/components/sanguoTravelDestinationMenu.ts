import {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { TFunction } from 'i18next';
import type { SupportedLocale } from '../../i18n/index.js';
import type { AdjacentNode } from '../../services/sanguo/travelService.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';

/**
 * Destination picker for /sanguo travel (D-26) — the first StringSelectMenu in
 * the codebase. Renders the adjacent nodes (≤25, nearest first) with the node's
 * per-locale name (content-in-DB, D-07) and an emoji marker when the node has a
 * representative hero (map-content marker pattern, D-22). The select value is
 * the STABLE node code — names are display-only.
 */
export const DEST_MENU_ID = 'sanguo:travel:dest';

function pickName(node: AdjacentNode, locale: SupportedLocale): string {
  if (locale === 'en') return node.nameEn;
  if (locale === 'zh-cn') return node.nameZh ?? node.nameVi;
  return node.nameVi;
}

export function buildDestinationMenu(
  adjacent: AdjacentNode[],
  locale: SupportedLocale,
  t: TFunction,
): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(DEST_MENU_ID)
    .setPlaceholder(t('sanguo:travel.dest_placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      adjacent.slice(0, 25).map((n) => {
        const label = pickName(n, locale);
        const minutes = Math.max(1, Math.round(n.travelSeconds / 60));
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(n.code)
          .setDescription(t('sanguo:travel.eta_minutes', { count: minutes, n: minutes }));
        if (n.representativeHeroId) {
          try {
            // setEmoji('<a:name:id>') — Discord's emoji field (NOT the label).
            // discord.js resolves the animated markup via resolvePartialEmoji →
            // parseEmoji into { animated: true, name, id } (verified in the
            // installed discord.js source). Embedding markup in the label shows
            // the raw '<a:...>' text — labels are plain text (verified live
            // 2026-08-13). EMOJI_NOT_FOUND → name-only option.
            option.setEmoji(heroEmoji(n.representativeHeroId));
          } catch {
            // name-only (map.ts:98 guard pattern)
          }
        }
        return option;
      }),
    );
}
