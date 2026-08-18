import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Legion slot-pick select (Phase 11 — D-17/D-20, UI-SPEC R-10 row 2).
 *
 * CustomId contract: static (`sanguo:legion:slot`); the CHOSEN slot rides
 * `interaction.values[0]` (a slotIndex 0-11). The pressed slotIndex is
 * validated with the parseInt + isNaN guard + bounds 0-11 server-side.
 *
 * Options = the 12 formation slots (3 mains + 9 supports). Each option label
 * carries the slot's class label (`legion.main_slot/support_slot` + the class
 * name via `classes.*`) so the player knows what class fits. Own ActionRow.
 */
export const LEGION_SLOT_MENU_ID = 'sanguo:legion:slot';

export interface LegionSlotOption {
  /** slotOrder 0-11. */
  slotIndex: number;
  /** e.g. "Chủ lực 1 — Tiên phong". */
  label: string;
}

export function buildSanguoLegionSlotMenu(
  t: TFunction,
  options: LegionSlotOption[],
): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(LEGION_SLOT_MENU_ID)
    .setPlaceholder(t('sanguo:legion.slot_pick'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      options.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(String(opt.slotIndex)),
      ),
    );
}
