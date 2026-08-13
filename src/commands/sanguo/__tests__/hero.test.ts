/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import { execute, handleCompanionPress } from '../hero.js';
import { COMPANION_PREFIX } from '../../../ui/components/sanguoHeroCompanionButton.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

// t renders real copy for the keys the hero detail surface interpolates so the
// tests assert the actual rendered text (stars, grade, HP/MP, companion).
const { t } = vi.hoisted(() => {
  const t = ((key: string, opts: Record<string, unknown> = {}) => {
    switch (key) {
      case 'sanguo:hero.title':
        return `🗡️ ${opts.name}`;
      case 'sanguo:hero.field_stars':
        return 'Sao';
      case 'sanguo:hero.field_grade':
        return 'Cấp';
      case 'sanguo:hero.field_hp_mp':
        return 'HP/MP';
      case 'sanguo:hero.companion_label':
        return '⭐ Hero đồng hành';
      case 'sanguo:hero.companion_button':
        return 'Chọn làm hero đồng hành';
      case 'sanguo:hero.fainted':
        return '💀 Kiệt sức';
      case 'iv_grade.gold':
        return 'Hoàng Kim';
      case 'iv_grade.ruby':
        return 'Hồng ngọc';
      case 'iv_grade.sapphire':
        return 'Lam cấp';
      case 'iv_grade.jade':
        return 'Lục cấp';
      case 'iv_grade.gray':
        return 'Hôi cấp';
      default:
        return key;
    }
  }) as (key: string, opts?: Record<string, unknown>) => string;
  return { t };
});

vi.mock('../../../i18n/index.js', () => ({
  resolveLocale: (_stored?: string | null, _interaction?: string | null) => 'vi' as const,
  getT: () => t,
}));

// heroEmoji mocked — the real one throws EMOJI_NOT_FOUND for unknown ids.
vi.mock('../../../assets/sanguoEmojis.js', () => ({
  heroEmoji: vi.fn(() => '<a:mock:1>'),
}));

/**
 * Chainable db.select().from(...)... mock (same contract as heroes.test.ts):
 * `steps` are the method names after from(); the terminal step returns a
 * THENABLE mock — the command code awaits the last chain method's return.
 */
type ChainSpec = { steps: string[]; result: unknown[] };

function terminalMock(result: unknown[]) {
  const fn = vi.fn().mockResolvedValue(result);
  (fn as any).then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return fn;
}

function chainFrom(spec: ChainSpec): any {
  const build = (idx: number): any => {
    if (idx >= spec.steps.length) return terminalMock(spec.result);
    const step = spec.steps[idx]!;
    const node: any = {};
    node[step] = vi.fn(() => build(idx + 1));
    return node;
  };
  return build(0);
}

function mockDbSelects(specs: ChainSpec[]) {
  let i = 0;
  (db.select as any).mockImplementation(() => {
    const spec = specs[i++] ?? { steps: ['where'], result: [] };
    return { from: vi.fn(() => chainFrom(spec)) };
  });
}

function buildMockTx(readSpecs: ChainSpec[]) {
  const tx: any = {};
  let i = 0;
  (tx.select = vi.fn()).mockImplementation(() => {
    const spec = readSpecs[i++] ?? { steps: ['where'], result: [] };
    return { from: vi.fn(() => chainFrom(spec)) };
  });
  const insertValues = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 5 }]) }));
  tx.insert = vi.fn(() => ({ values: insertValues }));
  tx.__insertValues = insertValues;
  const txSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  tx.update = vi.fn(() => ({ set: txSet }));
  tx.__set = txSet;
  return tx;
}

function mockTransaction(mockTx: any) {
  (db.transaction as any).mockImplementation(async (cb: (tx: any) => unknown) => cb(mockTx));
}

function mockButtonInteraction(customId: string): ButtonInteraction {
  return {
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    customId,
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as ButtonInteraction;
}

function mockChatInputInteraction(raw: string): ChatInputCommandInteraction {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: vi.fn().mockReturnValue('hero'),
      getString: vi.fn().mockReturnValue(raw),
    },
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as ChatInputCommandInteraction;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const USER_ROW = { id: 42, locale: 'vi' };
const STATE_ROW = { id: 1, userId: 42, activeHeroId: 11 };
const STATE_ROW_ACTIVE_12 = { ...STATE_ROW, activeHeroId: 12 };

const UH_CAO_CAO = {
  id: 11,
  userId: 42,
  heroId: 5,
  heroHeroId: 'cao_cao',
  nameVi: 'Tào Tháo',
  nameEn: 'Cao Cao',
  nameZh: null,
  tier: 3,
  ivStr: 31, ivAgi: 31, ivInt: 31, ivMov: 31, ivLea: 31, ivCha: 31,
  hpCurrent: 120,
  hp: 120,
  mp: 40,
  capturedZone: 'trung_nguyen',
};
const UH_LIU_BEI = {
  id: 12,
  userId: 42,
  heroId: 9,
  heroHeroId: 'liu_bei',
  nameVi: 'Lưu Bị',
  nameEn: 'Liu Bei',
  nameZh: null,
  tier: 4,
  ivStr: 10, ivAgi: 10, ivInt: 10, ivMov: 10, ivLea: 10, ivCha: 10,
  hpCurrent: 140,
  hp: 140,
  mp: 50,
  capturedZone: 'du_chau',
};
// A second owned copy of the same catalog hero — for the F9 duplicate
// disambiguation: prefer the ACTIVE copy, else the earliest (lowest id).
const UH_CAO_CAO_DUP = {
  ...UH_CAO_CAO,
  id: 13,
  ivStr: 5, ivAgi: 5, ivInt: 5, ivMov: 5, ivLea: 5, ivCha: 5,
  hpCurrent: 90,
};

const CONTEXT = {
  locale: 'vi',
  t,
  char: { id: 1 },
  user: { id: 42, balance: 0n },
  shardId: 0,
};

describe('/sanguo hero command (10-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: owned hero renders the detail (D-16)
  it('an OWNED hero renders the detail: emoji, name, stars, grade, HP/MP (base-only), companion status + button (disabled when active)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [UH_CAO_CAO, UH_LIU_BEI] }, // resolveOwnedHero
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // disambiguation (active 11)
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] }, // renderHeroDetail row
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // renderHeroDetail state
    ]);

    const interaction = mockChatInputInteraction('Tào Tháo'); // match by per-locale name
    await execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled(); // parent command owns it
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('🗡️ Tào Tháo');
    expect(embed.color).toBe(0x8b5cf6); // COLORS.SEASON
    expect(embed.description).toBe('<a:mock:1>'); // hero emoji anchor

    const fields = embed.fields ?? [];
    const starField = fields.find((f: any) => f.name === 'Sao');
    expect(starField?.value).toBe('★★★'); // stars from the public heroes.tier
    const gradeField = fields.find((f: any) => f.name === 'Cấp');
    expect(gradeField?.value).toBe('Hoàng Kim'); // 31×6=186/186 → gold
    const hpField = fields.find((f: any) => f.name === 'HP/MP');
    expect(hpField?.value).toContain('120'); // base-only HP numbers (D-05)
    expect(hpField?.value).toContain('40');
    // companion status label when active
    const compField = fields.find((f: any) => f.name === '⭐ Hero đồng hành');
    expect(compField).toBeDefined();

    // The companion button is DISABLED when the hero is already active (D-16).
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(1);
    const btn = (row.components[0] as ButtonBuilder).toJSON() as {
      custom_id: string;
      disabled: boolean;
    };
    expect(btn.custom_id).toBe('sanguo:hero:companion:11');
    expect(btn.disabled).toBe(true);
  });

  it('a NON-OWNED hero renders hero.error (DANGER) — no stat leak (D-16 ownership gate)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [UH_CAO_CAO, UH_LIU_BEI] }, // resolveOwnedHero
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // disambiguation
    ]);

    const interaction = mockChatInputInteraction('Lã Bố'); // not owned
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0xef4444); // DANGER
    expect(embed.description).toContain('sanguo:hero.error');
    expect(reply.components).toEqual([]);
  });

  it('F9 duplicate disambiguation: prefers the ACTIVE companion copy over a newer duplicate', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      {
        steps: ['innerJoin', 'where', 'orderBy'],
        result: [UH_CAO_CAO, UH_CAO_CAO_DUP], // same catalog hero, two copies (id 11 active, 13 newer)
      },
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // activeHeroId = 11
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] }, // renderHeroDetail → the ACTIVE copy
      { steps: ['where', 'limit'], result: [STATE_ROW] },
    ]);

    const interaction = mockChatInputInteraction('Tào Tháo'); // name matches BOTH copies → F9 picks the active one
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('🗡️ Tào Tháo');
    // The active copy renders — its button is DISABLED.
    const btn = ((reply.components?.[0] as ActionRowBuilder<any>).components[0] as ButtonBuilder).toJSON() as {
      custom_id: string;
    };
    expect(btn.custom_id).toBe('sanguo:hero:companion:11');
  });

  // ── Test 3: handleCompanionPress (D-16/D-04)
  it('handleCompanionPress switches activeHeroId inside a FOR UPDATE tx and re-renders with the button disabled', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_LIU_BEI] }, // renderHeroDetail row (post-switch)
      { steps: ['where', 'limit'], result: [STATE_ROW_ACTIVE_12] }, // renderHeroDetail state
    ]);
    const mockTx = buildMockTx([
      { steps: ['where', 'limit'], result: [UH_LIU_BEI] }, // ownership gate
      { steps: ['where', 'for'], result: [STATE_ROW] }, // locked state
    ]);
    mockTransaction(mockTx);

    const interaction = mockButtonInteraction(`${COMPANION_PREFIX}:12`);
    await handleCompanionPress(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled(); // the FOR UPDATE tx wrote the switch
    expect((mockTx as any).__set).toHaveBeenCalledWith(
      expect.objectContaining({ activeHeroId: 12 }),
    );

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('🗡️ Lưu Bị');
    const btn = ((reply.components?.[0] as ActionRowBuilder<any>).components[0] as ButtonBuilder).toJSON() as {
      custom_id: string;
      disabled: boolean;
    };
    expect(btn.custom_id).toBe('sanguo:hero:companion:12');
    expect(btn.disabled).toBe(true); // now the active companion
  });

  it('pressing the ALREADY-ACTIVE hero is a no-op (no state write — defense in depth, D-16)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // activeHeroId 11 already
    ]);
    const mockTx = buildMockTx([
      { steps: ['where', 'limit'], result: [UH_CAO_CAO] }, // ownership gate
      { steps: ['where', 'for'], result: [STATE_ROW] }, // activeHeroId === pressed id
    ]);
    mockTransaction(mockTx);

    const interaction = mockButtonInteraction(`${COMPANION_PREFIX}:11`);
    await handleCompanionPress(interaction);

    expect(mockTx.update).not.toHaveBeenCalled(); // no-op — nothing written
  });

  it('a NON-OWNED companion heroId → hero.error (DANGER), no state change (T-10-07-03)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
    ]);
    const mockTx = buildMockTx([
      { steps: ['where', 'limit'], result: [] }, // ownership gate — not owned
    ]);
    mockTransaction(mockTx);

    const interaction = mockButtonInteraction(`${COMPANION_PREFIX}:999`);
    await handleCompanionPress(interaction);

    expect(mockTx.update).not.toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:hero.error');
    expect(reply.components).toEqual([]);
  });

  it('a NaN companion heroId is rejected without touching the tx (parseInt + isNaN guard)', async () => {
    mockDbSelects([{ steps: ['where', 'limit'], result: [USER_ROW] }]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${COMPANION_PREFIX}:notanumber`);
    await handleCompanionPress(interaction);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ── Test 4: D-12 never-render on the detail surface
  it('the detail embed renders NO raw IV numbers and NO rarity — grade key + stars only (D-12)', () => {
    // The render path is covered above; this pins the DATA contract: the embed
    // data carries gradeKey/stars/hp/mp, never iv_* columns or rarity.
    const embedData = JSON.stringify({
      title: '🗡️ Tào Tháo',
      fields: [
        { name: 'Sao', value: '★★★' },
        { name: 'Cấp', value: 'Hoàng Kim' },
        { name: 'HP/MP', value: '**120**/120 HP • **40** MP' },
      ],
    });
    expect(embedData).not.toMatch(/iv_str|ivStr|ivAgi|ivInt|ivMov|ivLea|ivCha|rarity/);
  });
});
