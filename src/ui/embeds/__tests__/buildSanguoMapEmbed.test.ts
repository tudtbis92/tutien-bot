import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { buildSanguoMapEmbed, type SanguoMapEmbedData } from '../buildSanguoMapEmbed.js';
import { COLORS } from '../../theme.js';

const t = ((key: string) => key) as unknown as TFunction;

describe('buildSanguoMapEmbed', () => {
  it('renders SEASON color, localized title, and empty nodes copy when nodes is empty', () => {
    const data: SanguoMapEmbedData = {
      currentZoneName: 'Lạc Dương',
      nodes: [],
      shardId: 0,
    };
    const embed = buildSanguoMapEmbed(data, t);
    expect(embed.data.color).toBe(COLORS.SEASON);
    expect(embed.data.title).toBe(t('sanguo:map.title'));
    const currentField = embed.data.fields?.find((f) => f.name === t('sanguo:map.current_position'));
    expect(currentField?.value).toBe('Lạc Dương');
    const nodesField = embed.data.fields?.find((f) => f.name === t('sanguo:map.nodes'));
    expect(nodesField?.value).toBe(t('sanguo:map.empty_hint'));
  });

  it('renders current position + node list, and zone markers stay OUT of embeds (they go in message content)', () => {
    const data: SanguoMapEmbedData = {
      currentZoneName: 'Lạc Dương',
      nodes: ['Lạc Dương', 'Xích Bích'],
      shardId: 0,
    };
    const embed = buildSanguoMapEmbed(data, t);
    const currentField = embed.data.fields?.find((f) => f.name === t('sanguo:map.current_position'));
    expect(currentField?.value).toBe('Lạc Dương');
    const nodesField = embed.data.fields?.find((f) => f.name === t('sanguo:map.nodes'));
    expect(nodesField?.value).toBe('Lạc Dương\nXích Bích');
    // Zone markers are rendered in message CONTENT ('# emoji label') by the
    // command — the embed must not duplicate them (D-15).
    expect(embed.data.fields?.some((f) => f.name === t('sanguo:map.zones'))).toBe(false);
  });
});
