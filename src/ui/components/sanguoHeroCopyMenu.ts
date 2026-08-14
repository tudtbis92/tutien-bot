import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-04 copy selector menu — the interaction surface every progression action
 * (convert/level/evolve/reroll) shares.
 *
 * CustomId contract: the select's customId is STATIC (`sanguo:hero:copy`);
 * the CHOSEN copy rides `interaction.values[0]` (a userHeroId). The pressed
 * userHeroId is re-validated server-side (ownership re-gate) on every press —
 * never trusted on its own (anti-tamper, T-11-03-04).
 *
 * Paging: the menu is paged at 25 (Discord select limit, D-04); the caller
 * slices the copy list before calling. Each option's value is a userHeroId
 * (copy-level identity). The option emoji is the hero's animated emoji via
 * `setEmoji` (CR-09-02 — NEVER in the label text).
 *
 * CR-09-01: the menu lives in its OWN ActionRow — never shares a row with
 * buttons.
 */
export const COPY_MENU_ID = 'sanguo:hero:copy';

export interface SanguoHeroCopyOption {
  /** The userHeroes.id of the copy (the select VALUE). */
  userHeroId: number;
  /** Rendered option label (hero.copy_option — #{{i}} — Lv{{level}} • {{grade}}). */
  label: string;
  /** heroEmoji markup — name-only rendering when undefined (EMOJI_NOT_FOUND). */
  emoji?: string;
}

export function buildSanguoHeroCopyMenu(
  t: TFunction,
  options: SanguoHeroCopyOption[],
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(COPY_MENU_ID)
    .setPlaceholder(t('sanguo:hero.copy_select'))
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
