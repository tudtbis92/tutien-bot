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

  return embed;
}
