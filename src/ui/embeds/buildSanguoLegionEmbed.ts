import { EmbedBuilder } from 'discord.js';
import { COLORS, embedFooter } from '../theme.js';

/**
 * /sanguo legion embed (Phase 11 — TQC-17 assembly, D-22).
 *
 * Two-field layout (UI-SPEC ≤ 25-field budget): the 3 Mains field + the 9
 * Support field, each slot line pre-rendered by the command layer. The mains
 * field carries the per-main chemistry tier lines (legion.chemistry_line —
 * tier label + link COUNT only) as sub-line(s).
 *
 * D-12 STRUCTURAL RULE: the data interface carries NO chemistry points, NO
 * buff %, NO raw IV — the command layer pre-renders every field value through
 * t() (tier labels + link counts are already de-numbered), and this builder
 * stays dumb (mirrors buildSanguoProgressionResultEmbed). The embed colors
 * come ONLY from theme.ts COLORS (SEASON; WARNING for the incomplete caution).
 */
export interface SanguoLegionEmbedData {
  formationEmoji?: string;
  formationName: string;
  /** Pre-rendered "Chủ lực" field label (legion.field_mains). */
  mainFieldName: string;
  /** Pre-rendered mains value — 3 main lines + per-main chemistry lines. */
  mainFieldValue: string;
  /** Pre-rendered "Hỗ trợ" field label (legion.field_supports). */
  supportFieldName: string;
  /** Pre-rendered supports value — 9 support lines. */
  supportFieldValue: string;
  /** legion.incomplete caution (WARNING accent) when < 3 mains assembled. */
  incomplete?: string;
  /** SUCCESS state — legion.saved confirmation. */
  savedLine?: string;
  shardId?: number;
}

export function buildSanguoLegionEmbed(
  data: SanguoLegionEmbedData,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(
      // formation emoji is content-driven (formations.emoji) — never hardcoded.
      data.formationEmoji
        ? `${data.formationEmoji} ${data.formationName}`
        : data.formationName,
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  // SUCCESS state — the legion.saved confirmation (legion.save_press).
  if (data.savedLine) {
    return embed.setColor(COLORS.SUCCESS).setDescription(data.savedLine);
  }

  if (data.incomplete) {
    embed.setColor(COLORS.WARNING);
  }

  embed.addFields(
    { name: data.mainFieldName, value: data.mainFieldValue || '—' },
    { name: data.supportFieldName, value: data.supportFieldValue || '—' },
  );
  if (data.incomplete) {
    embed.setDescription(data.incomplete);
  }
  return embed;
}
