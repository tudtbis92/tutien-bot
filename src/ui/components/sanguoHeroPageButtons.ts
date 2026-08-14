import { ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * D-04 copy-list page buttons — paging for the copy selector beyond 25 copies.
 *
 * CustomId contract: `sanguo:hero:page:{dir}:{offset}:{targetUhId}` — the
 * UI-SPEC `sanguo:hero:page:{dir}:{offset}` shape EXTENDED with the target
 * copy id so the handler can (a) re-derive which species' copies to page and
 * (b) keep the action buttons targeting the SAME copy across page flips.
 * `dir` = prev|next; `offset` = the CURRENT page start (the handler moves it).
 * The offset NEVER carries a cost — it is a pure navigation index.
 *
 * Emoji-only buttons (⬅️/➡️ — UI-SPEC checker flag #2 accepted: no text-label
 * fallback, the page counter renders in the copy-list field).
 *
 * CR-09-01: the page buttons live in their OWN ActionRow.
 */
export const COPY_PAGE_PREFIX = 'sanguo:hero:page';

export function buildSanguoHeroPageButtons(
  offset: number,
  targetUhId: number,
): ButtonBuilder[] {
  return [
    new ButtonBuilder()
      .setCustomId(`${COPY_PAGE_PREFIX}:prev:${offset}:${targetUhId}`)
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${COPY_PAGE_PREFIX}:next:${offset}:${targetUhId}`)
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary),
  ];
}
