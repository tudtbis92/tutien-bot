import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TFunction } from 'i18next';

/**
 * Capture tier buttons (D-09/D-10/D-18) — the sanguo:capture:* customId
 * contract for the capture view.
 *
 * ANTI-TAMPER (UI-SPEC / Pitfall 3 / T-10-06-01): the customId carries ONLY
 * the tier number (`sanguo:capture:tier:{n}`) — the cost NEVER rides the
 * customId or the payload. The cost shown in the label comes from the passed
 * `tiers` (rendered from CAPTURE_TIERS at render time); the cost CHARGED comes
 * from CAPTURE_TIERS inside the capture tx (same config, server-authoritative).
 *
 * ROW BUDGET (UI-SPEC overflow contract, T-10-06-05): exactly the ACTIVE tiers
 * (Phase 10: 1-3 — `requiresItem === null`) + 1 retreat button in ONE
 * ActionRow (4 ≤ 5). Retry SWAPS the row content (retry + retreat), never
 * appends a 5th component.
 */
export const CAPTURE_TIER_PREFIX = 'sanguo:capture:tier';
export const CAPTURE_RETRY_ID = 'sanguo:capture:retry';
export const CAPTURE_RETREAT_ID = 'sanguo:capture:retreat';

/**
 * The 3 active tier buttons (one per tier). `fee` is the DISPLAY string from
 * CAPTURE_TIERS (`String(fee)` - never a raw bigint in the label).
 */
export function buildCaptureTierButtons(
  t: TFunction,
  tiers: { tier: number; fee: string }[],
): ButtonBuilder[] {
  return tiers.map(({ tier, fee }) =>
    new ButtonBuilder()
      .setCustomId(`${CAPTURE_TIER_PREFIX}:${tier}`)
      .setLabel(t('sanguo:capture.tier_button', { tier, fee }))
      .setStyle(ButtonStyle.Primary),
  );
}

/** "Bắt lại" — re-render the capture view after a failed attempt (new fee). */
export function buildCaptureRetryButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(CAPTURE_RETRY_ID)
    .setLabel(t('sanguo:capture.retry_button'))
    .setStyle(ButtonStyle.Primary);
}

/** "Bỏ qua" — retreat, travel resumes (D-18); rendered on every capture view. */
export function buildCaptureRetreatButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(CAPTURE_RETREAT_ID)
    .setLabel(t('sanguo:capture.retreat_button'))
    .setStyle(ButtonStyle.Secondary);
}
