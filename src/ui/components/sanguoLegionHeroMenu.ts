import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Legion hero-pick select (Phase 11 — D-20 strict class-match, UI-SPEC R-10
 * row 3).
 *
 * CustomId contract: `sanguo:legion:hero:{slotIndex}` — the SLOT rides the
 * customId SUFFIX (so the menu knows which slot's class-filtered heroes to
 * show); the CHOSEN copy (a userHeroId) rides `interaction.values[0]`. The
 * pressed userHeroId is re-validated server-side (ownership + class-match,
 * V4/D-20) inside the handler — never trusted on its own.
 *
 * Paging: the menu is paged at 25 (Discord select limit); the caller slices
 * the class-matched hero list before calling. Each option's value is a
 * userHeroId (copy-level identity). The option emoji is the hero's animated
 * emoji via setEmoji (CR-09-02 — never in the label text). Own ActionRow.
 */
export const LEGION_HERO_PREFIX = 'sanguo:legion:hero';

export interface SanguoLegionHeroOption {
  /** The userHeroes.id of the copy (the select VALUE). */
  userHeroId: number;
  /** Rendered option label (legion.hero_option). */
  label: string;
  /** heroEmoji markup — name-only rendering when undefined. */
  emoji?: string;
}

export function buildSanguoLegionHeroMenu(
  t: TFunction,
  slotIndex: number,
  options: SanguoLegionHeroOption[],
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${LEGION_HERO_PREFIX}:${slotIndex}`)
    .setPlaceholder(t('sanguo:legion.hero_pick', { slot: String(slotIndex + 1) }))
    .setMinValues(1)
    .setMaxValues(1);
  for (const opt of options) {
    const builder = new StringSelectMenuOptionBuilder()
      .setLabel(opt.label)
      .setValue(String(opt.userHeroId));
    if (opt.emoji) builder.setEmoji(opt.emoji);
    menu.addOptions(builder);
  }
  return menu;
}
