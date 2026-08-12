import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Travel buttons (D-25/D-26) — the shared customId contract for the
 * sanguo:travel:* component namespace, routed in interactionCreate.ts.
 */
export const START_BTN_ID = 'sanguo:travel:start';
export const ACK_BTN_ID = 'sanguo:travel:ack';

/**
 * "Bắt đầu hành trình" — the journey confirm gate (D-26). Disabled until a
 * destination is selected.
 *
 * F1: the selected destination travels with the press in the customId suffix
 * (`sanguo:travel:start:{code}`) because a ButtonInteraction carries no select
 * values and the message-snapshot StringSelectMenuComponent has no `.values` —
 * only StringSelectMenuInteraction does (context7-verified).
 */
export function buildStartButton(
  t: TFunction,
  disabled = true,
  destinationCode?: string,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(destinationCode ? `${START_BTN_ID}:${destinationCode}` : START_BTN_ID)
    .setLabel(t('sanguo:travel.start_button'))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

/**
 * "Tiếp tục hành trình" — the encounter ack button (D-25). Clears
 * encounterActive and resumes the travel clock; implemented in 09-03, defined
 * here for the shared customId contract.
 */
export function buildAckButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(ACK_BTN_ID)
    .setLabel(t('sanguo:travel.ack_button'))
    .setStyle(ButtonStyle.Secondary);
}
