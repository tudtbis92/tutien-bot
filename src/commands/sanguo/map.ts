import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mapNodes, type MapNode } from '../../db/schema/mapNodes.js';
import { mapZones, type MapZone } from '../../db/schema/mapZones.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoMapEmbed, type SanguoMapEmbedData } from '../../ui/embeds/buildSanguoMapEmbed.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { travelSubcommand, execute as travelExecute } from './travel.js';
import { battleSubcommand, execute as battleExecute } from './battle.js';
import { heroesSubcommand, execute as heroesExecute } from './heroes.js';
import { heroSubcommand, execute as heroExecute } from './hero.js';
import { getCurrentPosition } from '../../services/sanguo/travelService.js';

// Re-export the component handlers so the interaction router can find
// them on the 'sanguo' command module (client.commands.get('sanguo') — Pitfall 3:
// travel.ts/battle.ts/heroes.ts/hero.ts must NOT export their own `data`; one
// command file owns the name). handleAckPress is retired with the D-01
// ack→battle inversion.
export { handleDestinationSelect, handleStartPress } from './travel.js';
export {
  handleBattleStart,
  handleBattleSkip,
  handleCaptureOpen,
  handleCaptureTierPress,
  handleCaptureRetryPress,
  handleCaptureRetreatPress,
} from './battle.js';
export { handleStarterPick, handleZoneFilterSelect } from './heroes.js';
export { handleCompanionPress } from './hero.js';

/* eslint-disable i18next/no-literal-string -- slash commands name/description are static Discord API strings */
export const data = new SlashCommandBuilder()
  .setName('sanguo')
  .setDescription('Xem bản đồ và thông tin Tam Quốc')
  .setDescriptionLocalizations({
    'en-US': 'View Three Kingdoms map and information',
    'zh-CN': '查看三国地图和信息',
  })
  .addSubcommand((subcommand) =>
    subcommand
      .setName('map')
      .setDescription('Xem bản đồ Tam Quốc')
      .setDescriptionLocalizations({
        'en-US': 'View the Three Kingdoms map',
        'zh-CN': '查看三国地图',
      })
  )
  .addSubcommand(travelSubcommand)
  .addSubcommand(battleSubcommand)
  .addSubcommand(heroesSubcommand)
  .addSubcommand(heroSubcommand);
/* eslint-enable i18next/no-literal-string */

/**
 * Pick the node's per-locale name column for the resolved locale (D-07).
 * Content names live in DB columns, never in the i18n sanguo namespace.
 * nameZh is nullable (filled by Tavily re-run per D-06/D-11) — fall back to vi.
 */
function pickName(node: MapNode, locale: SupportedLocale): string {
  if (locale === 'en') return node.nameEn;
  if (locale === 'zh-cn') return node.nameZh ?? node.nameVi;
  return node.nameVi;
}

/** Per-locale zone label from the map_zones reference table (A8 / D-19). */
function pickZoneName(zone: MapZone, locale: SupportedLocale): string {
  if (locale === 'en') return zone.nameEn;
  if (locale === 'zh-cn') return zone.nameZh ?? zone.nameVi;
  return zone.nameVi;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);

  if (!char || !user) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'travel') {
    await travelExecute(interaction);
    return;
  }
  if (subcommand === 'battle') {
    await battleExecute(interaction);
    return;
  }
  if (subcommand === 'heroes') {
    await heroesExecute(interaction);
    return;
  }
  if (subcommand === 'hero') {
    await heroExecute(interaction);
    return;
  }
  if (subcommand !== 'map') {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:map.error'), shardId)],
    });
    return;
  }

  try {
    // TQC-13 SC5: the player's ACTUAL current position (from
    // player_travel_state via getCurrentPosition) — NOT the first map row.
    const pos = await getCurrentPosition(user.id);

    const rows = await db
      .select()
      .from(mapNodes)
      .orderBy(asc(mapNodes.nodeOrder));

    // Zone labels come from the map_zones reference table (A8 / D-19) — the
    // researched per-locale zone names, NOT the first node's name in the zone.
    const zoneRows = await db
      .select()
      .from(mapZones)
      .orderBy(asc(mapZones.sortOrder));
    const zoneCodeToLabel = new Map<string, string>();
    for (const zone of zoneRows) {
      zoneCodeToLabel.set(zone.code, pickZoneName(zone, locale));
    }

    // Zones: distinct zone values, each with its representativeHeroId from DB (D-07).
    // Zone label = map_zones name (fallback: the first node's per-locale name keeps
    // label-only rendering safe when a zone row is missing — D-07 null-safe).
    const zoneMap = new Map<string, { label: string; heroId: string | null }>();
    for (const row of rows) {
      if (!zoneMap.has(row.zone)) {
        zoneMap.set(row.zone, {
          label: zoneCodeToLabel.get(row.zone) ?? pickName(row, locale),
          heroId: row.representativeHeroId,
        });
      }
    }

    const zones = [...zoneMap.entries()].map(([, v]) => ({
      label: v.label,
      heroId: v.heroId ?? undefined,
    }));

    // SC5: current position = the player's real node (per-locale name from
    // getCurrentPosition's node id); the zones content + node list stay as-is.
    const [currentNode] = await db
      .select()
      .from(mapNodes)
      .where(eq(mapNodes.id, pos.nodeId))
      .limit(1);

    const data: SanguoMapEmbedData = {
      currentZoneName: currentNode ? pickName(currentNode, locale) : pos.nodeCode,
      nodes: rows.map((row) => pickName(row, locale)),
      shardId,
    };

    // Zone markers go in message CONTENT — Discord render emoji inside '# ' headers
    // larger than in embed fields, and markdown headings only work in content,
    // never in embed field/description values (verified 2026-08-12).
    const zonesContent = zones
      .map((z) => `# ${z.heroId ? `${heroEmoji(z.heroId)} ${z.label}` : z.label}`)
      .join('\n');

    await interaction.editReply({
      content: zonesContent || null,
      embeds: [buildSanguoMapEmbed(data, t)],
    });
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:map.error'), shardId)],
    });
  }
}
