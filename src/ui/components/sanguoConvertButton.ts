import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * D-03 dupe-conversion button — consumes the SELECTED duplicate copy for
 * per-hero hồn ngọc (flat-by-tier x booster, atomic in the tx).
 *
 * CustomId contract: `sanguo:convert:go:{userHeroId}` — carries ONLY the
 * copy id. The YIELD NEVER rides the customId (anti-tamper, T-11-03-03): the
 * label's amount comes from TIER_VALUE[copy.tier] x booster at render time;
 * the yield CHARGED is computed inside the conversion tx from the same
 * server-side constants.
 *
 * Secondary style = destructive-class (the copy is permanently consumed —
 * UI-SPEC copy rule); the result embed states the consequence.
 *
 * Disabled state (user amendment 2026-08-14): the ACTIVE companion is NEVER
 * convertible — the button renders DISABLED on the companion copy (the same
 * hard block the service enforces as ACTIVE_COMPANION), so a guaranteed-error
 * press is not offered.
 */
export const CONVERT_PREFIX = 'sanguo:convert:go';

export function buildSanguoConvertButton(
  t: TFunction,
  opts: { userHeroId: number; amount: number; disabled?: boolean },
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${CONVERT_PREFIX}:${opts.userHeroId}`)
    .setLabel(t('sanguo:convert.button', { amount: opts.amount }))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(opts.disabled ?? false);
}
