import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Zone filter select for /sanguo heroes (Phase 10 D-15 — TQC-13).
 *
 * Value = the STABLE map_zones.code; label = the zone's per-locale name
 * (content-in-DB, D-07). The select sits in its OWN ActionRow (CR-09-01 —
 * verified live: a select menu and buttons in one row throw
 * COMPONENT_LAYOUT_WIDTH_EXCEEDED). Emoji would ride option.setEmoji, never
 * the label (CR-09-02/03) — map_zones carries no emoji, so options are
 * label-only here.
 */
export const ZONE_MENU_ID = 'sanguo:heroes:zone';

export interface ZoneFilterOption {
  code: string;
  label: string;
  emoji?: string;
}

export function buildZoneFilterMenu(
  t: TFunction,
  zones: ZoneFilterOption[],
): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(ZONE_MENU_ID)
    .setPlaceholder(t('sanguo:heroes.zone_filter'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      zones.map((zone) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(zone.label)
          .setValue(zone.code);
        if (zone.emoji) {
          try {
            option.setEmoji(zone.emoji);
          } catch {
            // name-only option (map.ts:98 guard pattern)
          }
        }
        return option;
      }),
    );
}
