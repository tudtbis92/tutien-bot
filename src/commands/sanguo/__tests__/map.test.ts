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
    (db.select as any).mockReturnValue({ from });

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
});
