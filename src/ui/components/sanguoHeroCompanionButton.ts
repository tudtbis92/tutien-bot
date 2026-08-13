import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Companion switch button on the /sanguo hero detail (Phase 10 D-16 — TQC-13).
 *
 * customId `sanguo:hero:companion:{heroId}` — the userHeroes.id of the owned
 * copy. DISABLED when the hero is already the active companion (D-16); the
 * handler re-validates ownership + the already-active no-op inside its FOR
 * UPDATE tx regardless (defense in depth, T-10-07-03/06).
 */
export const COMPANION_PREFIX = 'sanguo:hero:companion';

export function buildCompanionButton(
  t: TFunction,
  heroId: number,
  disabled = false,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${COMPANION_PREFIX}:${heroId}`)
    .setLabel(t('sanguo:hero.companion_button'))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}
