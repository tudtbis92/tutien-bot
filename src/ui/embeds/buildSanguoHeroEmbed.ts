import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';

/**
 * /sanguo hero detail embed (Phase 10 D-16 — TQC-13).
 *
 * Fixed-field detail surface (UI-SPEC long-text covered): title `🗡️ {{name}}`,
 * hero-emoji description (the visual anchor), stars field (★1-5 from the
 * PUBLIC heroes.tier), grade field (iv_grade.* keys), HP/MP as base-only
 * numbers (D-05 — hp_current/hpMax/mp, never IV-modified), companion status
 * field when active, and the 💀 fainted badge appended to the HP line when
 * hpCurrent = 0.
 *
 * D-12 hard rule: the data interface carries gradeKey + stars + HP/MP only —
 * NO raw IV numbers, NO iv sum, NO rarity anywhere (never-render contract).
 *
 * Phase 11 additions (D-04/D-29): the copy-list field (≤ 2 fields — the list
 * + a page counter, ≤ 1,024 chars per page) and the 🎯 Kỹ năng field (2
 * slots — normal + special). Both are optional: a single-copy hero renders no
 * copy list (zero-one-many), and a copy with no rolled skills renders no
 * skills field. The skill lines are pre-rendered at the command layer (names
 * via i18n, MP costs — spendable resources, VISIBLE).
 */
export interface SanguoHeroEmbedData {
  /** heroEmoji markup — the description visual anchor (name-only on EMOJI_NOT_FOUND). */
  emoji?: string;
  name: string;
  stars: string;
  gradeKey: string;
  hpCurrent: number;
  hpMax: number;
  mp: number;
  isActive: boolean;
  fainted: boolean;
  shardId?: number;
  /** D-04 copy-list page — rendered as the copy-list field + page counter. */
  copyList?: { lines: string[]; page: string };
  /** D-29 skills field — the two slot lines (rendered at the command layer). */
  skills?: { normal?: string; special?: string };
}

export function buildSanguoHeroEmbed(data: SanguoHeroEmbedData, t: TFunction): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:hero.title', { name: data.name }))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();

  if (data.emoji) {
    embed.setDescription(data.emoji);
  }

  const hpLine = `**${data.hpCurrent}**/${data.hpMax} HP • **${data.mp}** MP`;

  embed.addFields(
    { name: t('sanguo:hero.field_stars'), value: data.stars, inline: true },
    { name: t('sanguo:hero.field_grade'), value: t(data.gradeKey), inline: true },
    {
      name: t('sanguo:hero.field_hp_mp'),
      value: data.fainted ? `${hpLine}\n${t('sanguo:hero.fainted')}` : hpLine,
      inline: true,
    },
  );

  if (data.isActive) {
    embed.addFields({
      name: t('sanguo:hero.companion_label'),
      value: '⭐',
      inline: true,
    });
  }

  // D-04 copy list (multi-copy hero only) — the list + page counter fields,
  // bounded at ≤ 1,024 chars per page (Discord field cap, defensive slice).
  if (data.copyList && data.copyList.lines.length > 0) {
    embed.addFields(
      {
        name: t('sanguo:hero.copy_list'),
        value: data.copyList.lines.join('\n').slice(0, 1024),
      },
      {
        name: t('sanguo:hero.copy_page'),
        value: data.copyList.page,
        inline: true,
      },
    );
  }

  // D-29 skills field — the two slot lines (normal + special) with MP costs.
  if (data.skills && (data.skills.normal || data.skills.special)) {
    const parts: string[] = [];
    if (data.skills.normal) {
      parts.push(`${t('sanguo:skills.normal_label')}: ${data.skills.normal}`);
    }
    if (data.skills.special) {
      parts.push(`${t('sanguo:skills.special_label')}: ${data.skills.special}`);
    }
    embed.addFields({ name: t('sanguo:hero.field_skills'), value: parts.join('\n') });
  }

  return embed;
}
