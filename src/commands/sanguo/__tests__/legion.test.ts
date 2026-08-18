/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { StringSelectMenuInteraction } from 'discord.js';
import { db } from '../../../db/client.js';
import { legionSubcommand, handleHeroPress } from '../legion.js';
import { LEGION_HERO_PREFIX } from '../../../ui/components/sanguoLegionHeroMenu.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// Mock the service module so the handler flows are deterministic (no real tx).
vi.mock('../../../services/sanguo/legionService.js', () => ({
  listOwnedFormations: vi.fn(),
  getActiveLegion: vi.fn(),
  assignHero: vi.fn(),
  saveLegion: vi.fn(),
  clearSlot: vi.fn(),
}));

import { getActiveLegion, assignHero } from '../../../services/sanguo/legionService.js';

const { t } = vi.hoisted(() => {
  const t = ((key: string, opts: Record<string, unknown> = {}) => {
    switch (key) {
      case 'sanguo:legion.class_mismatch':
        return `${opts.hero} không hợp vị trí ${opts.slot} (cần lớp ${opts.class}).`;
      case 'sanguo:legion.error':
        return 'Có lỗi khi lập trận hình. Hãy thử lại.';
      case 'sanguo:legion.not_assembled':
        return 'Bạn chưa lập trận hình.';
      default:
        return key;
    }
  }) as (key: string, opts?: Record<string, unknown>) => string;
  return { t };
});

vi.mock('../../../i18n/index.js', () => ({
  resolveLocale: (_s?: string | null, _i?: string | null) => 'vi' as const,
  getT: () => t,
}));

const USER_ROW = { id: 42, locale: 'vi' };

function mockComponentUser() {
  (db.select as any).mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([USER_ROW]) })),
    })),
  }));
}

function mockSelectInteraction(customId: string, values: string[]): StringSelectMenuInteraction {
  return {
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    customId,
    values,
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as StringSelectMenuInteraction;
}

describe('/sanguo legion command (11-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the legion subcommand (cmd.legion name + per-locale descriptions)', () => {
    expect(legionSubcommand.name).toBe('legion');
    const json = (legionSubcommand as any).toJSON?.() ?? {};
    expect(json.description).toBeTruthy();
    expect(legionSubcommand.description).toBeTruthy();
  });

  it('handleHeroPress renders legion.class_mismatch when the service rejects (D-20 server-side)', async () => {
    mockComponentUser();
    // Working formation resolves from the active legion; listOwnedFormations fallback.
    vi.mocked(getActiveLegion).mockResolvedValue({ formationId: 1 } as never);
    vi.mocked(assignHero).mockRejectedValue(new Error('legion.class_mismatch'));

    const interaction = mockSelectInteraction(`${LEGION_HERO_PREFIX}:0`, ['11']);
    await handleHeroPress(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    // The friendly class-mismatch copy renders; no state write was attempted.
    expect(reply.embeds?.[0]?.data?.description).toContain('không hợp vị trí');
  });

  it('interactionCreate routes sanguo:legion:* customIds BEFORE the chat-input gate', () => {
    const source = readFileSync(
      new URL('../../../events/interactionCreate.ts', import.meta.url),
      'utf-8',
    );
    const gateIdx = source.indexOf('if (!interaction.isChatInputCommand()) return;');
    expect(gateIdx).toBeGreaterThan(-1);
    for (const id of [LEGION_HERO_PREFIX, 'LEGION_FORMATION_MENU_ID', 'LEGION_SLOT_MENU_ID', 'LEGION_SAVE_ID']) {
      expect(source.indexOf(id)).toBeGreaterThan(-1);
      expect(source.indexOf(id)).toBeLessThan(gateIdx);
    }
  });
});
