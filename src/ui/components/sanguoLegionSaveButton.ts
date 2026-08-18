import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Legion save button (Phase 11 — D-22, UI-SPEC R-10 row 4).
 *
 * CustomId: static exact-id `sanguo:legion:save` — carries NO payload (the
 * formation + slots resolve server-side from the persisted active legion).
 * Primary style; save is allowed with < 3 mains (R-11 — the incomplete
 * caution renders in the embed, never an artificial block).
 */
export const LEGION_SAVE_ID = 'sanguo:legion:save';

export function buildSanguoLegionSaveButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(LEGION_SAVE_ID)
    .setLabel(t('sanguo:legion.save_button'))
    .setStyle(ButtonStyle.Primary);
}
