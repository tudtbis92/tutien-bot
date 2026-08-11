import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { buildSanguoMapEmbed, type SanguoMapEmbedData } from '../buildSanguoMapEmbed.js';
import { COLORS } from '../../theme.js';
import { heroEmoji } from '../../../assets/sanguoEmojis.js';

const t = ((key: string) => key) as unknown as TFunction;

describe('buildSanguoMapEmbed', () => {
  it('renders SEASON color, localized title, and empty zones copy when zones is empty', () => {
    const data: SanguoMapEmbedData = {
      currentZoneName: 'Lạc Dương',
      zones: [],
      nodes: ['Lạc Dương'],
      shardId: 0,
    };
    const embed = buildSanguoMapEmbed(data, t);
    expect(embed.data.color).toBe(COLORS.SEASON);
    expect(embed.data.title).toBe(t('sanguo:map.title'));
    const zonesField = embed.data.fields?.find((f) => f.name === t('sanguo:map.zones'));
    expect(zonesField?.value).toBe(t('sanguo:map.empty'));
  });

  it('renders each zone with heroEmoji markup and no raw emoji ID literal (SC3)', () => {
    const data: SanguoMapEmbedData = {
      currentZoneName: 'Lạc Dương',
      zones: [
        { label: 'Trung Nguyên', heroId: 'abt' },
        { label: 'Giang Đông', heroId: 'hsd' },
      ],
      nodes: ['Lạc Dương', 'Xích Bích'],
      shardId: 0,
    };
    const embed = buildSanguoMapEmbed(data, t);
    const zonesField = embed.data.fields?.find((f) => f.name === t('sanguo:map.zones'));
    const expected = data.zones
      .map((z) => `${heroEmoji(z.heroId as string)} ${z.label}`)
      .join('\n');
    expect(zonesField?.value).toBe(expected);
    // <:name:id> markup is present, but no RAW 17-20 digit ID literal outside markup (SC3 renderability)
    for (const field of embed.data.fields ?? []) {
      const stripped = field.value.replace(/<:[^:]+:\d{17,20}>/g, '');
      expect(/\d{17,20}/.test(stripped)).toBe(false);
    }
  });
});
