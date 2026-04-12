/**
 * Embed builder for the profession allocation display.
 *
 * Shows all 10 professions with their current skill point allocations,
 * total available points (= char.realmId per D-24), and remaining allocatable points.
 *
 * Source: CONTEXT.md D-22..D-25 (profession rules, D-24: points = realm_id, no respec)
 */
import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, EMOJI, embedFooter } from '../theme.js';
import { PROFESSION_KEYS, getTotalProfessionPoints } from '../../types/professions.js';
import type { ProfessionPoints } from '../../types/professions.js';
import { getProfessionLevel } from '../../types/professions.js';

/**
 * Data required to render the profession embed.
 * realmId = total available skill points (1 point per realm tier, lifetime, per D-24).
 */
export interface ProfessionEmbedData {
  /** Validated JSONB profession_points from characters table */
  points: ProfessionPoints;
  /** Total available skill points = realmId (lifetime total per D-24) */
  realmId: number;
}

/**
 * Build the profession allocation embed.
 * Displays all 10 professions, current point allocation, and remaining points.
 *
 * @param data - Profession display data (validated points + realmId)
 * @param t    - Bound translation function (use getT(locale))
 * @param shardId - Optional shard ID for footer
 */
export function buildProfessionEmbed(
  data: ProfessionEmbedData,
  t: TFunction,
  shardId?: number,
): EmbedBuilder {
  const totalAvailable = data.realmId;
  const totalAllocated = getTotalProfessionPoints(data.points);
  const remaining = totalAvailable - totalAllocated;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(t('game:profession.title'))
    .setFooter(embedFooter(shardId))
    .setTimestamp();

  // Points remaining summary field
  embed.addFields({
    name: t('game:profession.points_remaining', { points: remaining }),
    value: `${totalAllocated} / ${totalAvailable}`,
    inline: false,
  });

  // Add each profession as an inline field (2-column layout via pairs)
  for (const key of PROFESSION_KEYS) {
    const pts = getProfessionLevel(data.points, key);
    const profName = t(`game:profession.names.${key}`);

    embed.addFields({
      name: profName,
      value: `${EMOJI.SKILL_POINT} ${pts}`,
      inline: true,
    });
  }

  return embed;
}
