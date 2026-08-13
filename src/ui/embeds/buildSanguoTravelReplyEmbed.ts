import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * Travel reply embed (D-01, UI-SPEC color contract) — SEASON color, title +
 * destination/ETA/from fields, NO money field (time-only, D-01).
 *
 * The `state` drives the TITLE so each message clearly conveys its status
 * (CR-09-06): 'confirm' (destination preview → action needed), 'started'
 * (journey committed), 'status' (mid-journey check-in). A state-specific hint
 * is appended so the user knows the next step.
 */
export type SanguoTravelState = 'confirm' | 'started' | 'status';

export interface SanguoTravelReplyEmbedData {
  destinationName: string;
  fromNodeName: string;
  etaSeconds: number;
  state?: SanguoTravelState;
  shardId?: number;
}

/** Humanize a travel ETA: hours+minutes for >= 1h, minutes otherwise. */
export function humanizeEta(seconds: number, t: TFunction): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.max(0, Math.round((seconds % 3600) / 60));
    return t('sanguo:travel.eta_hours_minutes', { count: hours, h: hours, m: minutes });
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return t('sanguo:travel.eta_minutes', { count: minutes, n: minutes });
}

function stateTitleKey(state: SanguoTravelState): string {
  switch (state) {
    case 'confirm':
      return 'sanguo:travel.confirm_title';
    case 'status':
      return 'sanguo:travel.status_title';
    default:
      return 'sanguo:travel.started_title';
  }
}

function stateHintKey(state: SanguoTravelState): string | null {
  switch (state) {
    case 'confirm':
      return 'sanguo:travel.confirm_hint';
    case 'status':
      return 'sanguo:travel.status_hint';
    default:
      return null;
  }
}

export function buildSanguoTravelReplyEmbed(
  data: SanguoTravelReplyEmbedData,
  t: TFunction,
): EmbedBuilder {
  const state = data.state ?? 'started';
  const hintKey = stateHintKey(state);
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex
    .setTitle(t(stateTitleKey(state)))
    .addFields(
      { name: t('sanguo:travel.destination_label'), value: t('sanguo:travel.destination', { node: data.destinationName }), inline: true },
      { name: t('sanguo:travel.eta_label'), value: t('sanguo:travel.eta', { eta: humanizeEta(data.etaSeconds, t) }), inline: true },
      { name: t('sanguo:travel.from_label'), value: t('sanguo:travel.from', { from_node: data.fromNodeName }), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (hintKey) {
    embed.setDescription(t(hintKey));
  }
  return embed;
}
