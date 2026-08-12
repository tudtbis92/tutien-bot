/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute } from '../map.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

const t = ((key: string) => key) as (key: string) => string;

function mockInteraction(): ChatInputCommandInteraction {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getSubcommand: vi.fn().mockReturnValue('map') },
  } as unknown as ChatInputCommandInteraction;
}

/**
 * Mock the two db.select() chains execute() issues: the first is the map_nodes
 * select (orderBy nodeOrder), the second is the map_zones select (orderBy
 * sortOrder) — zone labels now come from map_zones (A8).
 */
function mockDbSelects(nodeRows: unknown[], zoneRows: unknown[]) {
  const orderByNodes = vi.fn().mockResolvedValue(nodeRows);
  const fromNodes = vi.fn().mockReturnValue({ orderBy: orderByNodes });
  const orderByZones = vi.fn().mockResolvedValue(zoneRows);
  const fromZones = vi.fn().mockReturnValue({ orderBy: orderByZones });
  (db.select as any)
    .mockReturnValueOnce({ from: fromNodes })
    .mockReturnValueOnce({ from: fromZones });
}

// Mocked map_zones rows served by the second select (matches the seed dataset
// for the zones the node fixtures below reference).
const MOCK_ZONE_ROWS = [
  {
    id: 1,
    code: 'trung_nguyen',
    nameVi: 'Trung Nguyên',
    nameEn: 'Central Plains (Sili)',
    nameZh: '中原',
    sortOrder: 1,
  },
  {
    id: 2,
    code: 'quan_trung',
    nameVi: 'Quan Trung',
    nameEn: 'Guanzhong',
    nameZh: '关中',
    sortOrder: 2,
  },
];

describe('/sanguo map command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies via editReply with sanguo:map.empty_hint when map_nodes is empty (empty-branch)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { balance: 0n },
      shardId: 0,
    } as never);

    const orderBy = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ orderBy });
    (db.select as any).mockReturnValueOnce({ from }).mockReturnValueOnce({ from });

    const interaction = mockInteraction();
    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const embeds = (interaction.editReply as any).mock.calls[0]?.[0]?.embeds ?? [];
    const nodesField = embeds[0]?.data?.fields?.find(
      (f: { name: string }) => f.name === 'sanguo:map.nodes',
    );
    expect(nodesField?.value).toBe('sanguo:map.empty_hint');
  });

  it('renders heroEmoji markers for seeded snake_case representative_hero_id values without error (CR-01 regression)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { balance: 0n },
      shardId: 0,
    } as never);

    // The seed (scripts/seed-sanguo.ts) writes representative_hero_id in the
    // heroes.hero_id snake_case space — dong_trac, cao_cao, etc. The command
    // must resolve these to emoji markup, not throw EMOJI_NOT_FOUND.
    const rows = [
      {
        id: 1,
        code: 'luoyang',
        nameVi: 'Lạc Dương',
        nameEn: 'Luoyang',
        nameZh: '洛阳',
        zone: 'trung_nguyen',
        nodeOrder: 1,
        representativeHeroId: 'dong_trac',
      },
      {
        id: 2,
        code: 'changan',
        nameVi: 'Trường An',
        nameEn: 'Chang\u2019an',
        nameZh: '长安',
        zone: 'quan_trung',
        nodeOrder: 2,
        representativeHeroId: 'han_xian_di',
      },
    ];
    mockDbSelects(rows, MOCK_ZONE_ROWS);

    const interaction = mockInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    // Zone markers render in message CONTENT with '# ' headers (D-15) — Discord
    // renders emoji larger there and markdown headings don't work in embeds.
    const content = reply.content as string;
    // Zone label now comes from map_zones per-locale names (A8) — Trung Nguyên
    // from the zone table, NOT 'Lạc Dương' (the node-derived label), and the
    // marker renders via heroEmoji('<a:dtr_t0:...>' markup, animated prefix).
    expect(content).toMatch(/# <a:dtr_t0:\d+> Trung Nguyên/);
    expect(content).toMatch(/# <a:hxd_t0:\d+> Quan Trung/);
    expect(content).not.toContain('Lạc Dương');
    expect(content).not.toContain('trung_nguyen');
  });
});
