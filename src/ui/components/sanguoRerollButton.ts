import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-32 reroll CONFIRM button — replaces the chosen slot's skill roll.
 *
 * CustomId contract: `sanguo:reroll:go:{userHeroId}:{slot}` — carries ONLY
 * the copy id + the slot ('normal' | 'special'). The COST NEVER rides the
 * customId (anti-tamper, T-11-03-03): the label's cost is the server-side
 * REROLL_COST resolved at the command layer and CHARGED inside the tx.
 *
 * Secondary style = destructive-class (the old skill roll is lost — UI-SPEC
 * copy rule); the result embed states the replacement (reroll.done).
 */
export const REROLL_GO_PREFIX = 'sanguo:reroll:go';

export function buildSanguoRerollButton(
  t: TFunction,
  opts: { userHeroId: number; slot: 'normal' | 'special'; cost: number },
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${REROLL_GO_PREFIX}:${opts.userHeroId}:${opts.slot}`)
    .setLabel(t('sanguo:reroll.button', { cost: opts.cost }))
    .setStyle(ButtonStyle.Secondary);
}
