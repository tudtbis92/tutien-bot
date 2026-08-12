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
import { mapNodes } from '../../db/schema/mapNodes.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { resolveLocale, getT, type SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoTravelReplyEmbed } from '../../ui/embeds/buildSanguoTravelReplyEmbed.js';
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
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildDestinationMenu(adjacent, locale, t),
    buildStartButton(t, disabled, destinationCode),
  );
}

/**
 * Minimal inline encounter renderer — 09-04 lands buildSanguoEncounterEmbed
 * (hero name + heroEmoji resolution, boss copy); this wave renders the
 * pending-style line from the check-in payload + ack button (D-25).
 */
function buildMinimalEncounterEmbed(
  encounter: CheckInEncounter | undefined,
  t: TFunction,
  shardId?: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(encounter?.boss ? COLORS.GOLD : COLORS.SEASON) // UI-SPEC: GOLD accent reserved for boss
    .setTitle(t('sanguo:encounter.pending_title'))
    .setDescription(t('sanguo:encounter.pending_body'))
    .setFooter(embedFooter(shardId))
    .setTimestamp();
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
      await interaction.editReply({ embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)] });
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
        await interaction.editReply({ embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)] });
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
              shardId,
            },
            t,
          ),
        ],
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
        await interaction.editReply({ embeds: [arrivalEmbed] });
        return;
      }
      // D-08/D-26: one hop per journey — re-open the picker at the arrived node.
      await interaction.editReply({
        embeds: [arrivalEmbed],
        components: [buildTravelRow(adjacent, locale, t, true)],
      });
      return;
    }

    case 'encounter':
    case 'encounterPending': {
      await interaction.editReply({
        embeds: [buildMinimalEncounterEmbed(result.encounter, t, shardId)],
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
  await interaction.deferReply();

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
      components: [buildTravelRow(adjacent, locale, t, true)],
    });
  } catch {
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
    });
    return;
  }

  const selectedCode = interaction.values[0];
  if (!selectedCode) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
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
        components: [buildTravelRow(adjacent, locale, t, true)],
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
            shardId,
          },
          t,
        ),
      ],
      components: [buildTravelRow(adjacent, locale, t, false, selectedCode)],
    });
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
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
            shardId,
          },
          t,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_TRAVELING') {
      await dispatchCheckIn(interaction, userRow.id, t, locale, shardId);
      return;
    }
    if (err instanceof Error && err.message === 'NO_ROUTE') {
      await interaction.editReply({ embeds: [buildNoRouteEmbed(t, shardId)] });
      return;
    }
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
    });
  }
}

/**
 * Encounter ack button handler (sanguo:travel:ack, D-25) — "Tiếp tục hành
 * trình". Clears encounterActive and sets updatedAt=now inside a FOR UPDATE
 * transaction, so the next check-in counts elapsed from the resume moment.
 * The reply is deferUpdate (the encounter embed stays; the resume is silent).
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
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
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
    });
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
    });
  }
}
