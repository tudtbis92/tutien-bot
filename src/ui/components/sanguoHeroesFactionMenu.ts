import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Heroes faction filter select (Phase 11 — SC5, UI-SPEC R-10).
 *
 * Value = the STABLE hero_factions.code (reference table, D-07) or the special
 * 'filter_all' reset option ('Tất cả'). The chosen value is validated
 * server-side against the heroFactions reference set (T-11-07-05 — an unknown
 * crafted value falls back to the full collection, never a crash). Each option
 * sits in its OWN ActionRow together with the zone + IV filter rows.
 */
export const HEROES_FACTION_MENU_ID = 'sanguo:heroes:faction';

/** The filter_all reset value — clears the faction filter. */
export const FILTER_ALL_VALUE = 'filter_all';

export interface HeroesFactionOption {
  code: string;
  label: string;
}

export function buildSanguoHeroesFactionMenu(
  t: TFunction,
  factions: HeroesFactionOption[],
): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(HEROES_FACTION_MENU_ID)
    .setPlaceholder(t('sanguo:heroes.faction_filter'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t('sanguo:heroes.filter_all'))
        .setValue(FILTER_ALL_VALUE),
    )
    .addOptions(
      factions.map((f) =>
        new StringSelectMenuOptionBuilder().setLabel(f.label).setValue(f.code),
      ),
    );
}
