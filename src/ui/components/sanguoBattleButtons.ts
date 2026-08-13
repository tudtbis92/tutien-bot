import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Battle entry buttons (D-01/D-10) — the sanguo:battle:* + sanguo:capture:*
 * customId contract, routed in interactionCreate.ts.
 *
 * D-01: the fight/skip row REPLACES the D-25 ack button on the encounter
 * embed — battle entry, not a "continue journey" acknowledgement.
 */
export const BATTLE_START_ID = 'sanguo:battle:start';
export const BATTLE_SKIP_ID = 'sanguo:battle:skip';
/** D-10: the 'Bắt' button on the battle-win row — opens the capture view. */
export const CAPTURE_OPEN_ID = 'sanguo:capture:open';

/** "Chiến đấu" — start the encounter battle (Primary, same row as skip). */
export function buildBattleStartButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(BATTLE_START_ID)
    .setLabel(t('sanguo:battle.fight_button'))
    .setStyle(ButtonStyle.Primary);
}

/** "Bỏ qua" — skip the encounter, travel resumes (D-18). */
export function buildBattleSkipButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(BATTLE_SKIP_ID)
    .setLabel(t('sanguo:battle.skip_button'))
    .setStyle(ButtonStyle.Secondary);
}

/** "Bắt" — battle win CTA that opens the capture view (D-10). */
export function buildCaptureOpenButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(CAPTURE_OPEN_ID)
    .setLabel(t('sanguo:capture.open_button'))
    .setStyle(ButtonStyle.Primary);
}
