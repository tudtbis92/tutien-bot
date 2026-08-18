import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { FILTER_ALL_VALUE } from './sanguoHeroesFactionMenu.js';

/**
 * Heroes IV-grade filter select (Phase 11 — SC5, UI-SPEC R-10).
 *
 * Value = an iv_grade.* KEY (the SAME grade function the collection render
 * uses — D-12: grade, NEVER raw IV) or the special 'filter_all' reset option.
 * The chosen value is validated server-side against the 5 known iv_grade keys
 * (T-11-07-05 — an unknown crafted value falls back to the full collection).
 * Each option sits in its OWN ActionRow together with the zone + faction rows.
 */
export const HEROES_IV_MENU_ID = 'sanguo:heroes:iv';

/** The iv_grade.* keys selectable in the filter (in display order). */
export const IV_GRADE_KEYS = [
  'iv_grade.gold',
  'iv_grade.ruby',
  'iv_grade.sapphire',
  'iv_grade.jade',
  'iv_grade.gray',
] as const;

export function buildSanguoHeroesIvMenu(t: TFunction): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(HEROES_IV_MENU_ID)
    .setPlaceholder(t('sanguo:heroes.iv_filter'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t('sanguo:heroes.filter_all'))
        .setValue(FILTER_ALL_VALUE),
    )
    .addOptions(
      IV_GRADE_KEYS.map((key) =>
        new StringSelectMenuOptionBuilder().setLabel(t(key)).setValue(key),
      ),
    );
}
