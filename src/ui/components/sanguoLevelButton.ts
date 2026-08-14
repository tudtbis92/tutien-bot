import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-05 explicit leveling button — one level per press, hồn ngọc charged from
 * the per-hero pool on press (never passive).
 *
 * CustomId contract: `sanguo:level:go:{userHeroId}` — carries ONLY the copy
 * id. The COST NEVER rides the customId (anti-tamper, T-11-03-03): the label
 * amount comes from LEVEL_COST(copy.level) at render time; the CHARGED cost
 * is the same server-side constant resolved inside the tx.
 *
 * Disabled states (D-01/D-05): the button renders DISABLED when the copy is
 * at MAX_LEVEL (label level.max) or the pool is below the next cost (label
 * level.insufficient) — a guaranteed-error press is never offered.
 */
export const LEVEL_PREFIX = 'sanguo:level:go';

export function buildSanguoLevelButton(
  t: TFunction,
  opts: { userHeroId: number; cost: number; disabled?: boolean; label?: string },
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${LEVEL_PREFIX}:${opts.userHeroId}`)
    .setLabel(opts.label ?? t('sanguo:level.button', { cost: opts.cost }))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(opts.disabled ?? false);
}
