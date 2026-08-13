import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { eq } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { heroes } from '../../db/schema/heroes.js';
import { mapNodes } from '../../db/schema/mapNodes.js';
import { mapZones } from '../../db/schema/mapZones.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import { resolveLocale, getT, type SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoTravelReplyEmbed } from '../../ui/embeds/buildSanguoTravelReplyEmbed.js';
import { buildSanguoAckEmbed } from '../../ui/embeds/buildSanguoAckEmbed.js';
import { buildSanguoEncounterEmbed } from '../../ui/embeds/buildSanguoEncounterEmbed.js';
import { buildDestinationMenu } from '../../ui/components/sanguoTravelDestinationMenu.js';
import { START_BTN_ID, buildStartButton, buildAckButton } from '../../ui/components/sanguoTravelButtons.js';
import {
  getCurrentPosition,
  getAdjacentNodes,
  startTravel,
  type AdjacentNode,
} from '../../services/sanguo/travelService.js';
import { checkInTravel, type CheckInEncounter } from '../../services/sanguo/travelCheckInService.js';
import { buildSanguoArrivalEmbed } from '../../ui/embeds/buildSanguoArrivalEmbed.js';
import { COLORS, embedFooter } from '../../ui/theme.js';
import { EMOJI } from '../../assets/emojis.js';

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const travelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('travel')
  .setDescription('Bắt đầu hành trình đến một địa danh')
  .setDescriptionLocalizations({
    'en-US': 'Start a journey to a landmark',
    'zh-CN': '开始前往一处地名的旅程',
  });
/* eslint-enable i18next/no-literal-string */

interface NodeName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Pick the node's per-locale name column (content-in-DB, D-07). */
function pickName(node: NodeName, locale: SupportedLocale): string {
  if (locale === 'en') return node.nameEn;
  if (locale === 'zh-cn') return node.nameZh ?? node.nameVi;
  return node.nameVi;
}

async function fetchNodeName(nodeId: number): Promise<NodeName | undefined> {
  const [row] = await db
    .select({ nameVi: mapNodes.nameVi, nameEn: mapNodes.nameEn, nameZh: mapNodes.nameZh })
    .from(mapNodes)
    .where(eq(mapNodes.id, nodeId))
    .limit(1);
  return row;
}

async function fetchNodeByCode(code: string): Promise<NodeName | undefined> {
  const [row] = await db
    .select({ nameVi: mapNodes.nameVi, nameEn: mapNodes.nameEn, nameZh: mapNodes.nameZh })
    .from(mapNodes)
    .where(eq(mapNodes.code, code))
    .limit(1);
  return row;
}

function buildPickEmbed(currentNodeName: string, t: TFunction, shardId?: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex
    .setTitle(t('sanguo:travel.pick_title'))
    .setDescription(t('sanguo:travel.pick_body', { node: currentNodeName }))
    .setFooter(embedFooter(shardId))
    .setTimestamp();
}

function buildNoRouteEmbed(t: TFunction, shardId?: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.DANGER)
    .setTitle(t('sanguo:travel.no_route_title'))
    .setDescription(`${EMOJI.ERROR} ${t('sanguo:travel.no_route_body')}`)
    .setFooter(embedFooter(shardId))
    .setTimestamp();
}

function buildTravelRow(
  adjacent: AdjacentNode[],
  locale: SupportedLocale,
  t: TFunction,
  disabled: boolean,
  destinationCode?: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  // Two SEPARATE action rows — a StringSelectMenu spans the full row width (5
  // units), so the Start button must live in its own row or Discord rejects the
  // payload with COMPONENT_LAYOUT_WIDTH_EXCEEDED (verified live 2026-08-13).
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildDestinationMenu(adjacent, locale, t),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildStartButton(t, disabled, destinationCode),
    ),
  ];
}

/**
 * Resolve the encounter embed display data (09-04 finalization): the
 * destination node name, the hero's per-locale name + heroEmoji markup (with
 * the EMOJI_NOT_FOUND name-only guard, map.ts:98 pattern), and — for boss
 * encounters — the dominant zone's per-locale name. All names come from DB
 * per-locale columns (D-07 content-in-DB, never i18n keys).
 */
interface EncounterDisplay {
  nodeName: string;
  heroName?: string;
  heroEmoji?: string;
  zoneName: string;
}

async function resolveEncounterDisplay(
  encounter: CheckInEncounter | undefined,
  userId: number,
  locale: SupportedLocale,
): Promise<EncounterDisplay> {
  // "Trên đường đến {node}" — the journey destination (toNode).
  const [travelRow] = await db
    .select({ toNodeId: playerTravelState.toNodeId })
    .from(playerTravelState)
    .where(eq(playerTravelState.userId, userId))
    .limit(1);
  let nodeName = '?';
  if (travelRow?.toNodeId != null) {
    const node = await fetchNodeName(travelRow.toNodeId);
    if (node) nodeName = pickName(node, locale);
  }

  let zoneName = '';
  if (encounter?.zone) {
    const [zoneRow] = await db
      .select({ nameVi: mapZones.nameVi, nameEn: mapZones.nameEn, nameZh: mapZones.nameZh })
      .from(mapZones)
      .where(eq(mapZones.code, encounter.zone))
      .limit(1);
    if (zoneRow) zoneName = pickName(zoneRow, locale);
  }

  if (!encounter || encounter.heroId == null || encounter.boss) {
    return { nodeName, zoneName }; // boss / unknown hero → name-only
  }

  const [heroRow] = await db
    .select({
      heroId: heroes.heroId,
      nameVi: heroes.nameVi,
      nameEn: heroes.nameEn,
      nameZh: heroes.nameZh,
    })
    .from(heroes)
    .where(eq(heroes.id, encounter.heroId))
    .limit(1);
  if (!heroRow) return { nodeName, zoneName };

  let heroEmojiMarkup: string | undefined;
  try {
    heroEmojiMarkup = heroEmoji(heroRow.heroId);
  } catch {
    // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 pattern)
  }
  return { nodeName, zoneName, heroName: pickName(heroRow, locale), heroEmoji: heroEmojiMarkup };
}

function buildAckRow(t: TFunction): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buildAckButton(t));
}

/**
 * Check-in dispatch (D-22/D-24/D-25/D-28) — full result routing inline in the
 * interaction (D-23): status → travel reply embed; arrived → arrival embed +
 * re-opened destination menu; encounter / encounterPending → encounter embed +
 * ack button (pending re-fetches the stored row, never re-rolls — F2).
 */
async function dispatchCheckIn(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: number,
  t: TFunction,
  locale: SupportedLocale,
  shardId: number | undefined,
): Promise<void> {
  const result = await checkInTravel(userId);

  switch (result.mode) {
    case 'start':
      // Unreachable on the check-in path — execute gates on traveling/encounterActive.
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
        components: [],
      });
      return;

    case 'status': {
      const [row] = await db
        .select({
          fromNodeId: playerTravelState.fromNodeId,
          toNodeId: playerTravelState.toNodeId,
        })
        .from(playerTravelState)
        .where(eq(playerTravelState.userId, userId))
        .limit(1);
      if (!row) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
          components: [],
        });
        return;
      }

      const [fromNode, toNode] = await Promise.all([
        row.fromNodeId !== null ? fetchNodeName(row.fromNodeId) : undefined,
        row.toNodeId !== null ? fetchNodeName(row.toNodeId) : undefined,
      ]);

      await interaction.editReply({
        embeds: [
          buildSanguoTravelReplyEmbed(
            {
              destinationName: toNode ? pickName(toNode, locale) : '?',
              fromNodeName: fromNode ? pickName(fromNode, locale) : '?',
              etaSeconds: result.remaining ?? 0, // status always carries remaining
              state: 'status', // CR-09-06: mid-journey title, not "started"
              shardId,
            },
            t,
          ),
        ],
        components: [], // CR-09-04: clear stale menu/button on the check-in path
      });
      return;
    }

    case 'arrived': {
      const pos = await getCurrentPosition(userId);
      const currentNode = await fetchNodeName(pos.nodeId);
      const adjacent = await getAdjacentNodes(pos.nodeId);
      const arrivalEmbed = buildSanguoArrivalEmbed(
        { nodeName: currentNode ? pickName(currentNode, locale) : pos.nodeCode, shardId },
        t,
      );
      if (adjacent.length === 0) {
        // Arrived at a dead end — arrival embed only, no menu (F6).
        await interaction.editReply({ embeds: [arrivalEmbed], components: [] });
        return;
      }
      // D-08/D-26: one hop per journey — re-open the picker at the arrived node.
      await interaction.editReply({
        embeds: [arrivalEmbed],
        components: buildTravelRow(adjacent, locale, t, true),
      });
      return;
    }

    case 'encounter':
    case 'encounterPending': {
      const display = await resolveEncounterDisplay(result.encounter, userId, locale);
      await interaction.editReply({
        embeds: [
          buildSanguoEncounterEmbed(
            {
              nodeName: display.nodeName,
              heroName: display.heroName,
              heroEmoji: display.heroEmoji,
              zoneName: display.zoneName,
              boss: result.encounter?.boss ?? false,
              shardId,
            },
            t,
          ),
        ],
        components: [buildAckRow(t)],
      });
      return;
    }
  }
}

/**
 * /sanguo travel execute — two modes (D-22/D-26):
 *  - start mode (no active journey): current-position embed + destination
 *    select menu + disabled Start button (confirm gate);
 *  - check-in mode (status='traveling' or encounter-active): delegates to
 *    checkInTravel (D-22) — a traveling user never starts a new journey (D-09).
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // No deferReply here — the parent 'sanguo' command (map.ts execute) already
  // deferred before dispatching to this subcommand handler. Deferring again
  // throws InteractionAlreadyReplied (verified live 2026-08-13).

  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
  if (!char || !user) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }

  try {
    const pos = await getCurrentPosition(user.id);

    const [travelRow] = await db
      .select({
        status: playerTravelState.status,
        encounterActive: playerTravelState.encounterActive,
      })
      .from(playerTravelState)
      .where(eq(playerTravelState.userId, user.id))
      .limit(1);

    if (travelRow && (travelRow.status === 'traveling' || travelRow.encounterActive)) {
      await dispatchCheckIn(interaction, user.id, t, locale, shardId);
      return;
    }

    const adjacent = await getAdjacentNodes(pos.nodeId);
    if (adjacent.length === 0) {
      // F6 — an empty StringSelectMenu would throw NO_OPTIONS on send
      await interaction.editReply({ embeds: [buildNoRouteEmbed(t, shardId)] });
      return;
    }

    const currentNode = await fetchNodeName(pos.nodeId);
    await interaction.editReply({
      embeds: [
        buildPickEmbed(currentNode ? pickName(currentNode, locale) : pos.nodeCode, t, shardId),
      ],
      components: buildTravelRow(adjacent, locale, t, true),
    });
  } catch (err) {
    logger.error('TravelExecute', 'Error in /sanguo travel execute', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
    });
  }
}

/**
 * StringSelectMenu handler (D-26): the user picked an adjacent node. Updates
 * the reply with the destination + ETA preview and enables the Start button,
 * encoding the selected code in its customId (F1) so the subsequent Start
 * press knows the destination.
 */
export async function handleDestinationSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await interaction.deferUpdate();

  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
      components: [],
    });
    return;
  }

  const selectedCode = interaction.values[0];
  if (!selectedCode) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const pos = await getCurrentPosition(userRow.id);
    const adjacent = await getAdjacentNodes(pos.nodeId);
    const selected = adjacent.find((n) => n.code === selectedCode);

    if (!selected) {
      // Stale selection — re-render the picker without enabling Start
      const currentNode = await fetchNodeName(pos.nodeId);
      await interaction.editReply({
        embeds: [
          buildPickEmbed(currentNode ? pickName(currentNode, locale) : pos.nodeCode, t, shardId),
        ],
        components: buildTravelRow(adjacent, locale, t, true),
      });
      return;
    }

    const currentNode = await fetchNodeName(pos.nodeId);
    await interaction.editReply({
      embeds: [
        buildSanguoTravelReplyEmbed(
          {
            destinationName: pickName(selected, locale),
            fromNodeName: currentNode ? pickName(currentNode, locale) : pos.nodeCode,
            etaSeconds: selected.travelSeconds,
            state: 'confirm', // CR-09-06: destination preview — action needed
            shardId,
          },
          t,
        ),
      ],
      components: buildTravelRow(adjacent, locale, t, false, selectedCode),
    });
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Start button handler (D-26 confirm gate): parses the destination code from
 * the customId suffix (F1), then commits the journey via startTravel(user.id,
 * code) — which re-validates adjacency server-side (NO_ROUTE, Pitfall 4).
 */
export async function handleStartPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
      components: [],
    });
    return;
  }

  const selectedCode =
    interaction.customId === START_BTN_ID
      ? undefined
      : interaction.customId.slice(START_BTN_ID.length + 1);
  if (!selectedCode) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const { etaSeconds } = await startTravel(userRow.id, selectedCode);
    const pos = await getCurrentPosition(userRow.id); // in-flight position = from node
    const [fromNode, destNode] = await Promise.all([
      fetchNodeName(pos.nodeId),
      fetchNodeByCode(selectedCode),
    ]);
    await interaction.editReply({
      embeds: [
        buildSanguoTravelReplyEmbed(
          {
            destinationName: destNode ? pickName(destNode, locale) : selectedCode,
            fromNodeName: fromNode ? pickName(fromNode, locale) : pos.nodeCode,
            etaSeconds,
            state: 'started', // CR-09-06: journey committed
            shardId,
          },
          t,
        ),
      ],
      // CR-09-04: Discord PATCH merges — omitted fields keep their previous
      // value, and discord.js drops `components` when absent, so the stale
      // select menu + Start button would persist. Explicit [] clears them.
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_TRAVELING') {
      await dispatchCheckIn(interaction, userRow.id, t, locale, shardId);
      return;
    }
    if (err instanceof Error && err.message === 'NO_ROUTE') {
      await interaction.editReply({ embeds: [buildNoRouteEmbed(t, shardId)], components: [] });
      return;
    }
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Encounter ack button handler (sanguo:travel:ack, D-25) — "Tiếp tục hành
 * trình". Clears encounterActive and sets updatedAt=now inside a FOR UPDATE
 * transaction, so the next check-in counts elapsed from the resume moment.
 * The reply replaces the stale encounter embed with the ack confirmation and
 * clears the button (CR-09-05) — Discord PATCH merges, so omitted components
 * would leave the button interactive.
 */
export async function handleAckPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
      components: [],
    });
    return;
  }

  let remaining = 0;
  let destinationName = '?';
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(playerTravelState)
        .where(eq(playerTravelState.userId, userRow.id))
        .for('update');
      if (row?.encounterActive) {
        await tx
          .update(playerTravelState)
          .set({ encounterActive: false, updatedAt: new Date() })
          .where(eq(playerTravelState.userId, userRow.id));
      }
      return row;
    });

    if (result?.toNodeId != null) {
      const node = await fetchNodeName(result.toNodeId);
      if (node) destinationName = pickName(node, locale);
    }
    remaining = result?.travelSecondsRemaining ?? 0;
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      buildSanguoAckEmbed({ destinationName, remainingSeconds: remaining, shardId }, t),
    ],
    components: [],
  });
}
