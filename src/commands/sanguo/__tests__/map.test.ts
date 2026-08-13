/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute } from '../map.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import { getCurrentPosition } from '../../../services/sanguo/travelService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

vi.mock('../../../services/sanguo/travelService.js', () => ({
  getCurrentPosition: vi.fn(),
  getAdjacentNodes: vi.fn(),
  startTravel: vi.fn(),
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
 * Mock the three db.select() chains execute() issues after the TQC-13 SC5
 * fix: (1) map_nodes select (orderBy nodeOrder), (2) map_zones select (orderBy
 * sortOrder — zone labels from map_zones, A8), (3) the current-node name
 * lookup (map_nodes where id, limit 1 — SC5: the player's real position from
 * getCurrentPosition, not rows[0]).
 */
function mockDbSelects(nodeRows: unknown[], zoneRows: unknown[], currentNodeRows: unknown[]) {
  const orderByNodes = vi.fn().mockResolvedValue(nodeRows);
  const fromNodes = vi.fn().mockReturnValue({ orderBy: orderByNodes });
  const orderByZones = vi.fn().mockResolvedValue(zoneRows);
  const fromZones = vi.fn().mockReturnValue({ orderBy: orderByZones });
  const limit = vi.fn().mockResolvedValue(currentNodeRows);
  const where = vi.fn(() => ({ limit }));
  const fromCurrent = vi.fn().mockReturnValue({ where });
  (db.select as any)
    .mockReturnValueOnce({ from: fromNodes })
    .mockReturnValueOnce({ from: fromZones })
    .mockReturnValueOnce({ from: fromCurrent });
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

const CONTEXT = {
  locale: 'vi',
  t,
  char: { id: 1 },
  user: { id: 42, balance: 0n },
  shardId: 0,
};

describe('/sanguo map command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies via editReply with sanguo:map.empty_hint when map_nodes is empty (empty-branch)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 7, nodeCode: 'xuchang' });

    const orderBy = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ orderBy });
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const fromCurrent = vi.fn().mockReturnValue({ where });
    (db.select as any)
      .mockReturnValueOnce({ from })
      .mockReturnValueOnce({ from })
      .mockReturnValueOnce({ from: fromCurrent });

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
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 7, nodeCode: 'xuchang' });

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
    mockDbSelects(rows, MOCK_ZONE_ROWS, [
      { id: 7, code: 'xuchang', nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: '许昌', zone: 'du_chau', nodeOrder: 7, representativeHeroId: null },
    ]);

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

  // ── Test 5 (TQC-13 SC5): current position from the player's real node
  it('SC5: current_position comes from getCurrentPosition (the player\'s real node), NOT rows[0]', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    // The player is at Xuchang (node 7) while the FIRST map row is Luoyang.
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 7, nodeCode: 'xuchang' });

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
        id: 7,
        code: 'xuchang',
        nameVi: 'Hứa Xương',
        nameEn: 'Xuchang',
        nameZh: '许昌',
        zone: 'du_chau',
        nodeOrder: 7,
        representativeHeroId: null,
      },
    ];
    mockDbSelects(rows, MOCK_ZONE_ROWS, [
      { id: 7, code: 'xuchang', nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: '许昌', zone: 'du_chau', nodeOrder: 7, representativeHeroId: null },
    ]);

    const interaction = mockInteraction();
    await execute(interaction);

    expect(getCurrentPosition).toHaveBeenCalledWith(42); // users.id, never char.id
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    const currentField = embeds[0]?.data?.fields?.find(
      (f: { name: string }) => f.name === 'sanguo:map.current_position',
    );
    // The REAL position (Hứa Xương), not the first map row (Lạc Dương).
    expect(currentField?.value).toBe('Hứa Xương');
    expect(currentField?.value).not.toBe('Lạc Dương');
  });

  it('SC5: current_position falls back to the node code when the node row is missing', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 99, nodeCode: 'unknown_node' });

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
    ];
    mockDbSelects(rows, MOCK_ZONE_ROWS, []); // node 99 not in map_nodes

    const interaction = mockInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    const currentField = embeds[0]?.data?.fields?.find(
      (f: { name: string }) => f.name === 'sanguo:map.current_position',
    );
    expect(currentField?.value).toBe('unknown_node');
  });
});
