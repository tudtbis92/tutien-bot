import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-06 explicit evolution button — level-gated + hồn ngọc-charged tier bump
 * (L20→t1 / L50→t2; t3 gated by design, D-09).
 *
 * CustomId contract: `sanguo:evolve:go:{userHeroId}` — carries ONLY the copy
 * id. The COST NEVER rides the customId (anti-tamper, T-11-03-03): the label
 * amount comes from EVOLUTION_COSTS[copy.tier + 1] at render time; the CHARGED
 * cost is the same server-side constant resolved inside the tx.
 *
 * Disabled states (UI-SPEC): the button renders DISABLED until the level gate
 * (L20 for t0→t1, L50 for t1→t2 — label evolve.requirement), until the pool
 * covers the cost (label evolve.insufficient), or forever on a t2+ copy
 * (label evolve.t3_gated — L80+ AND an event item, unreachable in v3).
 */
export const EVOLVE_PREFIX = 'sanguo:evolve:go';

export function buildSanguoEvolveButton(
  t: TFunction,
  opts: { userHeroId: number; cost: number; disabled?: boolean; label?: string },
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${EVOLVE_PREFIX}:${opts.userHeroId}`)
    .setLabel(opts.label ?? t('sanguo:evolve.button', { cost: opts.cost }))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(opts.disabled ?? false);
}
