import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Legion formation select (Phase 11 — D-21/D-22, UI-SPEC R-10 row 1).
 *
 * CustomId contract: the select's customId is STATIC (`sanguo:legion:formation`);
 * the CHOSEN formation rides `interaction.values[0]` (a formationId). The
 * pressed formationId is re-validated server-side (ownership re-gate, V4)
 * inside the handler before any write.
 *
 * Each option = an OWNED formation (listOwnedFormations); the emoji rides
 * option.setEmoji (CR-09-02 — never in the label text). Own ActionRow.
 */
export const LEGION_FORMATION_MENU_ID = 'sanguo:legion:formation';

export interface LegionFormationOption {
  formationId: number;
  label: string;
  emoji?: string;
}

export function buildSanguoLegionFormationMenu(
  t: TFunction,
  options: LegionFormationOption[],
): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(LEGION_FORMATION_MENU_ID)
    .setPlaceholder(t('sanguo:legion.formation_select'))
    .setMinValues(1)
    .setMaxValues(1);
  for (const opt of options) {
    const builder = new StringSelectMenuOptionBuilder()
      .setLabel(opt.label)
      .setValue(String(opt.formationId));
    if (opt.emoji) builder.setEmoji(opt.emoji);
    menu.addOptions(builder);
  }
  return menu;
}
