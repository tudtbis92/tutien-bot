import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-32 reroll SLOT picker — ONE slot at a time (normal / special).
 *
 * CustomId contract: `sanguo:reroll:slot:{userHeroId}` — the pressed copy id
 * rides the customId suffix (re-validated server-side on every press); the
 * CHOSEN slot ('normal' | 'special') rides `interaction.values[0]`. The cost
 * NEVER rides the payload — REROLL_COST resolves server-side.
 *
 * CR-09-01: the select lives in its OWN ActionRow (the copy-detail surface's
 * reroll-open state replaces the action row with this menu).
 */
/**
 * The copy-detail ACTION-ROW entry to the reroll flow: a button carrying
 * `sanguo:reroll:open:{userHeroId}` (label hero.reroll_button) that re-renders
 * the copy detail with the action row REPLACED by this slot menu (the
 * copy-detail surface stays at its 3-row budget — CR-09-01).
 */
export const REROLL_OPEN_PREFIX = 'sanguo:reroll:open';

export const REROLL_SLOT_PREFIX = 'sanguo:reroll:slot';

export function buildSanguoRerollSlotMenu(
  t: TFunction,
  opts: { userHeroId: number },
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${REROLL_SLOT_PREFIX}:${opts.userHeroId}`)
    .setPlaceholder(t('sanguo:reroll.select_slot'))
    .setMinValues(1)
    .setMaxValues(1);
  menu.addOptions(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('sanguo:skills.normal_label'))
      .setValue('normal'),
    new StringSelectMenuOptionBuilder()
      .setLabel(t('sanguo:skills.special_label'))
      .setValue('special'),
  );
  return menu;
}
