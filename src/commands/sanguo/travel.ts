import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { eq, and, desc } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { heroes } from '../../db/schema/heroes.js';
import { mapNodes } from '../../db/schema/mapNodes.js';
import { mapZones } from '../../db/schema/mapZones.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { sanguoBattles } from '../../db/schema/sanguoBattles.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoTravelReplyEmbed } from '../../ui/embeds/buildSanguoTravelReplyEmbed.js';
import { buildSanguoEncounterEmbed } from '../../ui/embeds/buildSanguoEncounterEmbed.js';
import { buildDestinationMenu } from '../../ui/components/sanguoTravelDestinationMenu.js';
import { START_BTN_ID, buildStartButton } from '../../ui/components/sanguoTravelButtons.js';
import {
  buildBattleStartButton,
  buildBattleSkipButton,
} from '../../ui/components/sanguoBattleButtons.js';
import { renderCaptureView } from './battle.js';
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

/**
 * Check-in dispatch (D-22/D-24/D-25/D-28) — full result routing inline in the
 * interaction (D-23): status → travel reply embed; arrived → arrival embed +
 * re-opened destination menu; encounter / encounterPending → encounter embed +
 * fight/skip button row (D-01 — battle entry REPLACES the D-25 ack row;
 * pending re-fetches the stored row, never re-rolls — F2). A completed +
 * player-won battle for the pending encounter (F4, P10-review) renders the
 * CAPTURE VIEW instead — a won-but-abandoned encounter never forces a
 * re-battle to reach capture.
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
      // F4 (P10-review): a completed + player-won battle for this pending
      // encounter → the CAPTURE VIEW (capture embed + 3 tier buttons + retreat)
      // so a player who walked away after winning can capture without re-battling.
      const [pending] = await db
        .select()
        .from(encounterRuns)
        .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
        .orderBy(desc(encounterRuns.id))
        .limit(1);
      if (pending) {
        const [wonBattle] = await db
          .select()
          .from(sanguoBattles)
          .where(and(eq(sanguoBattles.encounterId, pending.id), eq(sanguoBattles.type, 'encounter')))
          .orderBy(desc(sanguoBattles.id))
          .limit(1);
        const storedResult = (wonBattle?.result ?? {}) as { winner?: string };
        if (wonBattle && storedResult.winner === 'player') {
          const view = await renderCaptureView(userId, t, locale, shardId);
          await interaction.editReply({ embeds: [view.embed], components: [view.row] });
          return;
        }
      }
      // D-01: battle entry row — fight/skip replaces the D-25 ack.
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
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            buildBattleStartButton(t),
            buildBattleSkipButton(t),
          ),
        ],
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

  const ctx = await resolveComponentUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const selectedCode = interaction.values[0];
  if (!selectedCode) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:travel.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const pos = await getCurrentPosition(userId);
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

  const ctx = await resolveComponentUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

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
    const { etaSeconds } = await startTravel(userId, selectedCode);
    const pos = await getCurrentPosition(userId); // in-flight position = from node
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
      await dispatchCheckIn(interaction, userId, t, locale, shardId);
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

