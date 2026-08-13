/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import {
  execute,
  handleStarterPick,
  handleZoneFilterSelect,
} from '../heroes.js';
import { STARTER_SET_1, STARTER_SET_2 } from '../../../ui/components/sanguoStarterButtons.js';
import { ZONE_MENU_ID } from '../../../ui/components/sanguoHeroesZoneMenu.js';
import { wallet } from '../../../services/wallet.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

// t renders real copy for the keys the heroes surface interpolates so the
// tests assert on the actual rendered text (stars, grade, active badge).
const { t } = vi.hoisted(() => {
  const t = ((key: string, opts: Record<string, unknown> = {}) => {
    switch (key) {
      case 'sanguo:heroes.empty_title':
        return '🌱 Chọn hero khởi đầu';
      case 'sanguo:heroes.empty_body':
        return 'Bạn chưa có hero nào.';
      case 'sanguo:heroes.starter_button':
        return `Chọn ${opts.name}`;
      case 'sanguo:heroes.title':
        return `📜 Bộ sưu tập (${opts.count})`;
      case 'sanguo:heroes.line':
        return `${opts.emoji ?? ''}${opts.name} • ${opts.stars} • ${opts.grade}${opts.active ?? ''}`;
      case 'sanguo:heroes.active_badge':
        return '⭐';
      case 'sanguo:heroes.zone_filter':
        return 'Lọc theo vùng';
      case 'sanguo:heroes.empty_filtered':
        return 'Không có hero nào trong vùng này.';
      case 'sanguo:heroes.success':
        return `🎉 Bạn đã chọn ${opts.name} làm hero khởi đầu!`;
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

// wallet mocked to PROVE the starter path never touches it (D-19 faucet-free).
vi.mock('../../../services/wallet.js', () => ({
  wallet: { deductBalance: vi.fn(), creditBalance: vi.fn() },
}));

/**
 * Chainable db.select().from(...)... mock. Each entry queues one select call;
 * `steps` are the method names after from() in call order — the LAST step
 * resolves the result. Supports where / orderBy / limit / for / innerJoin.
 */
type ChainSpec = { steps: string[]; result: unknown[] };

function chainFrom(spec: ChainSpec): any {
  const build = (idx: number): any => {
    if (idx >= spec.steps.length) return vi.fn().mockResolvedValue(spec.result);
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

/** Chainable tx mirroring drizzle's PgTransaction (select/insert/values/returning/update/set/where). */
function buildMockTx(readSpecs: ChainSpec[]) {
  const tx: any = {};
  let i = 0;
  (tx.select = vi.fn()).mockImplementation(() => {
    const spec = readSpecs[i++] ?? { steps: ['where'], result: [] };
    return { from: vi.fn(() => chainFrom(spec)) };
  });
  tx.insert = vi.fn(() => ({
    values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 5 }]) })),
  }));
  tx.update = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }));
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

function mockChatInputInteraction(): ChatInputCommandInteraction {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getSubcommand: vi.fn().mockReturnValue('heroes'), getString: vi.fn() },
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as ChatInputCommandInteraction;
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

// ── Fixtures ────────────────────────────────────────────────────────────────
const USER_ROW = { id: 42, locale: 'vi' };
const STATE_ROW = { id: 1, userId: 42, activeHeroId: 11, starterViews: 0 };
const STATE_ROW_3_VIEWS = { ...STATE_ROW, starterViews: 3 };

const OWNED_CAO_CAO = {
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
const OWNED_LIU_BEI = {
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

const CAO_CAO_CATALOG = {
  id: 5,
  heroId: 'cao_cao',
  nameVi: 'Tào Tháo',
  nameEn: 'Cao Cao',
  nameZh: null,
  hp: 120,
  mp: 40,
  tier: 3,
};
const LIU_BEI_CATALOG = {
  id: 9,
  heroId: 'liu_bei',
  nameVi: 'Lưu Bị',
  nameEn: 'Liu Bei',
  nameZh: null,
  hp: 140,
  mp: 50,
  tier: 4,
};
const TRUONG_GIAC_CATALOG = {
  id: 20,
  heroId: 'truong_giac',
  nameVi: 'Trương Giác',
  nameEn: 'Zhang Jue',
  nameZh: null,
  hp: 100,
  mp: 80,
  tier: 2,
};

const ZONES = [
  { code: 'trung_nguyen', nameVi: 'Trung Nguyên', nameEn: 'Central Plains', nameZh: null, sortOrder: 1 },
  { code: 'du_chau', nameVi: 'Dự Châu', nameEn: 'Yuzhou', nameZh: null, sortOrder: 2 },
];

const CONTEXT = {
  locale: 'vi',
  t,
  char: { id: 1 },
  user: { id: 42, balance: 0n },
  shardId: 0,
};

describe('/sanguo heroes command (10-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: empty collection → starter picker (D-14) + view counter + rotation
  it('empty collection renders the starter picker (exactly 3 set-1 buttons in ONE row) and increments starterViews', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [] }, // owned — empty
      { steps: ['where', 'orderBy'], result: [CAO_CAO_CATALOG, LIU_BEI_CATALOG] }, // pool heroes
    ]);
    const mockTx = buildMockTx([
      { steps: ['where', 'for'], result: [STATE_ROW] }, // locked state read
    ]);
    mockTransaction(mockTx);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled(); // parent command owns it
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('🌱 Chọn hero khởi đầu');
    expect(embed.description).toBe('Bạn chưa có hero nào.');
    expect(embed.color).toBe(0x8b5cf6); // COLORS.SEASON

    // UI-SPEC zero-one-many: exactly 3 starter buttons in ONE ActionRow (set 1).
    expect(reply.components).toHaveLength(1);
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(3);
    const ids = row.components.map(
      (c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id,
    );
    expect(ids).toEqual([
      'sanguo:heroes:starter:cao_cao',
      'sanguo:heroes:starter:liu_bei',
      'sanguo:heroes:starter:sun_jian',
    ]);
    expect(ids).toEqual(STARTER_SET_1.map((id) => `sanguo:heroes:starter:${id}`));

    // D-14: the counter increments — FOR UPDATE on the one-row state (single-writer).
    expect(mockTx.update).toHaveBeenCalled();
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.objectContaining({ starterViews: 1 }),
    );
  });

  it('4th empty invocation (starterViews >= 3) rotates the pool to set 2 — no 4th option ever exists in set 1', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [] }, // owned — empty
      { steps: ['where', 'orderBy'], result: [TRUONG_GIAC_CATALOG] }, // pool heroes
    ]);
    const mockTx = buildMockTx([
      { steps: ['where', 'for'], result: [STATE_ROW_3_VIEWS] }, // views >= 3 → set 2
    ]);
    mockTransaction(mockTx);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(3);
    const ids = row.components.map(
      (c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id,
    );
    expect(ids).toEqual(STARTER_SET_2.map((id) => `sanguo:heroes:starter:${id}`));
    expect(ids).toEqual([
      'sanguo:heroes:starter:truong_giac',
      'sanguo:heroes:starter:yuan_shao',
      'sanguo:heroes:starter:dong_trac',
    ]);
  });

  // ── Test 2: handleStarterPick grants FREE (D-19 faucet — no wallet call)
  it('handleStarterPick grants the hero FREE with 6 IVs in [0,31], hp = base HP, active companion set, views reset — NO wallet call', async () => {
    const mockTx = buildMockTx([
      { steps: ['where', 'for'], result: [STATE_ROW] }, // locked state
      { steps: ['where', 'limit'], result: [] }, // collection still empty (double-grant guard)
      { steps: ['where', 'limit'], result: [CAO_CAO_CATALOG] }, // hero resolution
    ]);
    mockTransaction(mockTx);

    const interaction = mockButtonInteraction('sanguo:heroes:starter:cao_cao');
    await handleStarterPick(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    // Faucet-free proof: the wallet mock is NEVER called on the starter path.
    expect(wallet.deductBalance).not.toHaveBeenCalled();
    expect(wallet.creditBalance).not.toHaveBeenCalled();

    // One user_heroes insert with 6 IVs each in [0,31] + hp_current = base HP.
    const insertValues = (mockTx.insert as any).mock.calls[0]?.[1] ?? {};
    expect(insertValues.userId).toBe(42);
    expect(insertValues.heroId).toBe(5);
    for (const k of ['ivStr', 'ivAgi', 'ivInt', 'ivMov', 'ivLea', 'ivCha']) {
      expect(insertValues[k]).toBeGreaterThanOrEqual(0);
      expect(insertValues[k]).toBeLessThanOrEqual(31);
    }
    expect(insertValues.hpCurrent).toBe(120); // base HP — never 0
    expect(insertValues.capturedZone).toBeNull(); // A5: starter grants are not zone-captured

    // State: activeHeroId = the new row id, starterViews reset to 0.
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.objectContaining({ activeHeroId: 5, starterViews: 0 }),
    );

    // Reply: the SUCCESS 'starter acquired' embed (UI-SPEC SUCCESS accent).
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toContain('Tào Tháo');
    expect(embed.color).toBe(0x10b981); // COLORS.SUCCESS
    expect(reply.components).toEqual([]);
  });

  it('handleStarterPick with a heroId outside both starter sets is rejected (heroes.error, no state change)', async () => {
    mockTransaction(buildMockTx([]));
    const interaction = mockButtonInteraction('sanguo:heroes:starter:lu_bu');
    await handleStarterPick(interaction);

    expect(db.transaction).not.toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:heroes.error');
  });

  // ── Test 3: non-empty collection → per-zone lines (stars + grade, D-12 clean)
  it('non-empty collection renders one line per owned hero with ★ stars + IV grade + ONE active badge; NO raw IV / rarity', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [OWNED_CAO_CAO, OWNED_LIU_BEI] },
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // activeHeroId = 11 (cao_cao)
      { steps: ['orderBy'], result: ZONES }, // zone filter menu options
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('📜 Bộ sưu tập (2)'); // count reflects the total
    expect(embed.color).toBe(0x8b5cf6);

    const field = embed.fields?.find((f: { name: string }) => f.name.startsWith('📜'));
    const value = field?.value ?? '';
    expect(value).toContain('Tào Tháo • ★★★ • Hoàng Kim ⭐'); // gold grade (31×6=186/186)
    expect(value).toContain('Lưu Bị • ★★★★ • Hôi cấp'); // 60/186 < 60% → gray
    // exactly ONE active badge
    expect((value.match(/⭐/g) ?? []).length).toBe(1);
    // D-12 never-render: no raw IV number, no rarity number in the embed data
    expect(JSON.stringify(embed)).not.toMatch(/"iv_str|ivStr/);
    expect(JSON.stringify(embed)).not.toMatch(/rarity/);

    // The zone filter select is in its OWN ActionRow (CR-09-01) — one row, select only.
    expect(reply.components).toHaveLength(1);
    const menuRow = reply.components?.[0] as ActionRowBuilder<any>;
    expect(menuRow.components).toHaveLength(1);
    const menu = (menuRow.components[0] as any).toJSON() as { custom_id: string };
    expect(menu.custom_id).toBe(ZONE_MENU_ID);
  });

  // ── Test 4: zone filter select (D-15) + filtered re-render
  it('selecting a zone re-renders the collection with only that zone + the filtered count', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      { steps: ['orderBy'], result: ZONES }, // zone validation + menu options
      { steps: ['innerJoin', 'where', 'orderBy'], result: [OWNED_CAO_CAO] }, // filtered du_chau? no — trung_nguyen
      { steps: ['where', 'limit'], result: [STATE_ROW] },
    ]);

    const interaction = mockSelectInteraction(ZONE_MENU_ID, ['trung_nguyen']);
    await handleZoneFilterSelect(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('📜 Bộ sưu tập (1)'); // filtered total
    const field = embed.fields?.find((f: { name: string }) => f.name.startsWith('📜'));
    expect(field?.value ?? '').toContain('Tào Tháo');
    expect(field?.value ?? '').not.toContain('Lưu Bị');
    // menu row stays (same zone menu) — own ActionRow
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect((row.components[0] as any).toJSON().custom_id).toBe(ZONE_MENU_ID);
  });

  it('an unknown zone value falls back to the FULL collection — never a crash (T-10-07-05)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['orderBy'], result: ZONES },
      { steps: ['innerJoin', 'where', 'orderBy'], result: [OWNED_CAO_CAO, OWNED_LIU_BEI] }, // full collection
      { steps: ['where', 'limit'], result: [STATE_ROW] },
    ]);

    const interaction = mockSelectInteraction(ZONE_MENU_ID, ['fake_zone']);
    await handleZoneFilterSelect(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('📜 Bộ sưu tập (2)');
  });

  // ── Test 5: 1 hero vs many render the same line format; count matches
  it('a collection with 1 hero renders the same line format with count 1', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [OWNED_CAO_CAO] },
      { steps: ['where', 'limit'], result: [STATE_ROW] },
      { steps: ['orderBy'], result: ZONES },
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('📜 Bộ sưu tập (1)');
    const field = embed.fields?.find((f: { name: string }) => f.name.startsWith('📜'));
    const value = field?.value ?? '';
    expect(value).toContain('Tào Tháo • ★★★ • Hoàng Kim ⭐');
    expect((value.match(/⭐/g) ?? []).length).toBe(1); // exactly one active badge
  });

  // ── Test 6 (routing, Task 3): the interaction router dispatches the new
  //    customIds BEFORE the chat-input gate (extension of 10-06's router test).
  it('interactionCreate routes sanguo:heroes:* / sanguo:hero:* BEFORE the chat-input gate', () => {
    const source = readFileSync(
      new URL('../../../events/interactionCreate.ts', import.meta.url),
      'utf-8',
    );
    const gateIdx = source.indexOf('if (!interaction.isChatInputCommand()) return;');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(source.indexOf('ZONE_MENU_ID')).toBeGreaterThan(-1);
    expect(source.indexOf('STARTER_PICK_PREFIX')).toBeGreaterThan(-1);
    expect(source.indexOf('COMPANION_PREFIX')).toBeGreaterThan(-1);
    expect(source.indexOf('ZONE_MENU_ID')).toBeLessThan(gateIdx);
    expect(source.indexOf('STARTER_PICK_PREFIX')).toBeLessThan(gateIdx);
    expect(source.indexOf('COMPANION_PREFIX')).toBeLessThan(gateIdx);
  });
});
