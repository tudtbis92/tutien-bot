import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * /sanguo heroes collection + starter-picker embed (Phase 10 — TQC-13,
 * D-12/D-14/D-15).
 *
 * Three render states:
 *  - starter picker: `lines` empty AND no `successName`/`emptyHint` — the
 *    ONLY empty-collection state (D-14 onboarding): empty_title/empty_body;
 *  - collection: one line per owned hero
 *    `{{emoji}} {{name}} • {{stars}} • {{grade}}{{active}}` — stars from the
 *    public heroes.tier (★1-5), grade from the iv_grade.* keys (D-12 hard
 *    rule: raw IV numbers and rarity NEVER render);
 *  - filtered-empty: a zone filter selected but zero rows → the field renders
 *    emptyHint copy (never the starter picker — the picker is the entirely-
 *    empty-collection state only);
 *  - starter acquired: `successName` set → SUCCESS-color confirmation.
 *
 * D-12 never-render: the data interface carries gradeKey + stars only — no IV
 * column, no rarity column, no iv sum. Overflow control: the zone filter
 * bounds rows; the field value stays within Discord's 1,024-char budget.
 */
export interface SanguoHeroesLine {
  emoji?: string;
  name: string;
  stars: string;
  gradeKey: string;
  active: boolean;
}

export interface SanguoHeroesEmbedData {
  /** Collection size — the title count reflects the filtered total when filtered. */
  count: number;
  lines: SanguoHeroesLine[];
  /** Per-locale zone label when a zone filter is applied. */
  zoneLabel?: string;
  /** Per-locale faction label when a faction filter is applied (SC5). */
  factionLabel?: string;
  /** Per-locale IV-grade label when an IV filter is applied (SC5, grade key only). */
  ivLabel?: string;
  /** Starter-acquired confirmation name — renders the SUCCESS state. */
  successName?: string;
  /** Filtered-empty hint copy — renders instead of the starter picker. */
  emptyHint?: string;
  shardId?: number;
}

export function buildSanguoHeroesEmbed(
  data: SanguoHeroesEmbedData,
  t: TFunction,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  // Starter acquired (D-14) — UI-SPEC SUCCESS accent.
  if (data.successName) {
    return embed
      .setColor(COLORS.SUCCESS)
      .setTitle(t('sanguo:heroes.success', { name: data.successName }));
  }

  // Starter picker (D-14) — the ONLY empty-collection state.
  if (data.lines.length === 0 && !data.emptyHint) {
    return embed
      .setColor(COLORS.SEASON)
      .setTitle(t('sanguo:heroes.empty_title'))
      .setDescription(t('sanguo:heroes.empty_body'));
  }

  const value =
    data.lines.length > 0
      ? data.lines
          .map((line) =>
            t('sanguo:heroes.line', {
              emoji: line.emoji ?? '',
              name: line.name,
              stars: line.stars,
              grade: t(line.gradeKey),
              active: line.active ? ` ${t('sanguo:heroes.active_badge')}` : '',
            }),
          )
          .join('\n')
      : (data.emptyHint ?? '');

  // The field name reflects the ACTIVE filter state (SC5) — zone + faction +
  // IV-grade labels joined; when no filter is active it falls back to the title.
  const activeFilters = [data.zoneLabel, data.factionLabel, data.ivLabel].filter(
    (l): l is string => l != null,
  );
  const fieldName = activeFilters.length > 0 ? activeFilters.join(' • ') : t('sanguo:heroes.title', { count: data.count });

  return embed
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:heroes.title', { count: data.count }))
    .addFields({
      name: fieldName,
      value,
    });
}
