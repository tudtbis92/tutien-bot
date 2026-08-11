import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mapNodes, type MapNode } from '../../db/schema/mapNodes.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoMapEmbed, type SanguoMapEmbedData } from '../../ui/embeds/buildSanguoMapEmbed.js';
import type { SupportedLocale } from '../../i18n/index.js';

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
  );
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, locale, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'map') {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:map.error'), shardId)],
    });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(mapNodes)
      .orderBy(asc(mapNodes.nodeOrder));

    // Zones: distinct zone values, each with its representativeHeroId from DB (D-07).
    // Zone label = the first node's per-locale name in that zone (zone codes like
    // trung_nguyen are DB keys, never user-facing — WR-02 review fix).
    const zoneMap = new Map<string, { label: string; heroId: string | null }>();
    for (const row of rows) {
      if (!zoneMap.has(row.zone)) {
        zoneMap.set(row.zone, {
          label: pickName(row, locale),
          heroId: row.representativeHeroId,
        });
      }
    }

    const data: SanguoMapEmbedData = {
      currentZoneName: rows.length > 0 ? pickName(rows[0]!, locale) : '',
      zones: [...zoneMap.entries()].map(([, v]) => ({
        label: v.label,
        heroId: v.heroId ?? undefined,
      })),
      nodes: rows.map((row) => pickName(row, locale)),
      shardId,
    };

    await interaction.editReply({ embeds: [buildSanguoMapEmbed(data, t)] });
  } catch {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:map.error'), shardId)],
    });
  }
}
