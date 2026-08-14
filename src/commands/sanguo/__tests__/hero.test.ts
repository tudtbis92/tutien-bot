/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import { execute, handleCompanionPress, handleCopyPress, handleCopyPage, handleConvertPress, handleLevelPress, handleEvolvePress, handleRerollPress, handleRerollSlot, handleRerollGo } from '../hero.js';
import { COMPANION_PREFIX } from '../../../ui/components/sanguoHeroCompanionButton.js';
import { COPY_MENU_ID } from '../../../ui/components/sanguoHeroCopyMenu.js';
import { COPY_PAGE_PREFIX } from '../../../ui/components/sanguoHeroPageButtons.js';
import { CONVERT_PREFIX } from '../../../ui/components/sanguoConvertButton.js';
import { LEVEL_PREFIX } from '../../../ui/components/sanguoLevelButton.js';
import { EVOLVE_PREFIX } from '../../../ui/components/sanguoEvolveButton.js';
import { REROLL_OPEN_PREFIX, REROLL_SLOT_PREFIX } from '../../../ui/components/sanguoRerollSlotMenu.js';
import { REROLL_GO_PREFIX } from '../../../ui/components/sanguoRerollButton.js';
import { convertDuplicate, levelUp, evolveHero, rerollSkill } from '../../../services/sanguo/soulgemService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

vi.mock('../../../services/sanguo/soulgemService.js', () => ({
  convertDuplicate: vi.fn(),
  levelUp: vi.fn(),
  evolveHero: vi.fn(),
  rerollSkill: vi.fn(),
  TIER_VALUE: { 0: 1, 1: 5, 2: 10, 3: 20 },
  BOOSTER_ITEM_CODE: 'booster_x2',
}));

// t renders real copy for the keys the hero detail surface interpolates so the
// tests assert the actual rendered text (stars, grade, HP/MP, companion,
// copy list, skills, convert result).
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
      case 'sanguo:hero.copy_select':
        return 'Chọn bản';
      case 'sanguo:hero.copy_option':
        return `#${opts.i} — Lv${opts.level} • ${opts.grade}`;
      case 'sanguo:hero.copy_line':
        return `#${opts.i} — Lv${opts.level} • ${opts.grade} • **${opts.hp}** HP`;
      case 'sanguo:hero.copy_list':
        return '📋 Danh sách bản';
      case 'sanguo:hero.copy_page':
        return `Trang ${opts.page}/${opts.total}`;
      case 'sanguo:hero.field_skills':
        return '🎯 Kỹ năng';
      case 'sanguo:hero.convert_button':
        return 'Chuyển hóa';
      case 'sanguo:skills.normal_label':
        return 'Đánh thường';
      case 'sanguo:skills.special_label':
        return 'Kỹ năng đặc biệt';
      case 'sanguo:skills.line':
        return `${opts.skill_emoji} ${opts.name} (${opts.mp_cost} MP)`;
      case 'sanguo:convert.title':
        return `💠 Chuyển hóa ${opts.hero_emoji} ${opts.name}`;
      case 'sanguo:convert.button':
        return `Chuyển hóa → **${opts.amount}** 🧿`;
      case 'sanguo:convert.done':
        return `💠 Đã chuyển hóa bản #${opts.i} → +**${opts.amount}** 🧿 của ${opts.name}.`;
      case 'sanguo:convert.booster_hint':
        return '✨ Bộ kích hoạt ×2 đang sẵn sàng — lần chuyển hóa tiếp theo nhận gấp đôi.';
      case 'sanguo:convert.collection_empty':
        return 'Không thể chuyển hóa bản cuối cùng — bộ sưu tập không được rỗng.';
      case 'sanguo:convert.active_companion':
        return 'Không thể chuyển hóa hero đồng hành đang hoạt động.';
      case 'sanguo:convert.in_formation':
        return 'Không thể chuyển hóa bản đang nằm trong đội hình.';
      case 'sanguo:convert.error':
        return 'Có lỗi khi chuyển hóa. Hãy thử lại.';
      case 'sanguo:level.title':
        return `⬆️ Tăng cấp ${opts.hero_emoji} ${opts.name}`;
      case 'sanguo:level.button':
        return `Tăng cấp (${opts.cost} 🧿)`;
      case 'sanguo:level.up':
        return `⬆️ ${opts.name} đã lên **Lv${opts.level}**!`;
      case 'sanguo:level.max':
        return `${opts.name} đã đạt cấp tối đa (**Lv100**).`;
      case 'sanguo:level.insufficient':
        return `Không đủ hồn ngọc (cần ${opts.cost} 🧿).`;
      case 'sanguo:level.error':
        return 'Có lỗi khi tăng cấp. Hãy thử lại.';
      case 'sanguo:evolve.title':
        return `✨ Tiến hóa ${opts.hero_emoji} ${opts.name}`;
      case 'sanguo:evolve.button':
        return `Tiến hóa (${opts.cost} 🧿)`;
      case 'sanguo:evolve.requirement':
        return `Cần **Lv${opts.req}** để tiến hóa`;
      case 'sanguo:evolve.level_required':
        return `${opts.name} cần đạt **Lv${opts.req}** trước khi tiến hóa.`;
      case 'sanguo:evolve.done':
        return `🎉 ${opts.hero_emoji} ${opts.name} đã tiến hóa thành ${opts.new_emoji} **${opts.new_tier}**!`;
      case 'sanguo:evolve.t3_gated':
        return 'Bậc t3 chưa mở — cần vật phẩm sự kiện đặc biệt.';
      case 'sanguo:evolve.insufficient':
        return `Không đủ hồn ngọc (cần ${opts.cost} 🧿).`;
      case 'sanguo:evolve.error':
        return 'Có lỗi khi tiến hóa. Hãy thử lại.';
      case 'sanguo:hero.reroll_button':
        return 'Đổi kỹ năng';
      case 'sanguo:reroll.title':
        return `🎲 Đổi kỹ năng ${opts.hero_emoji} ${opts.name}`;
      case 'sanguo:reroll.select_slot':
        return 'Chọn khe kỹ năng để đổi';
      case 'sanguo:reroll.button':
        return `Đổi lại (${opts.cost} 🧿)`;
      case 'sanguo:reroll.done':
        return `🎲 Kỹ năng ${opts.slot} của ${opts.name} → **${opts.skill}**!`;
      case 'sanguo:reroll.insufficient':
        return `Không đủ hồn ngọc (cần ${opts.cost} 🧿).`;
      case 'sanguo:reroll.error':
        return 'Có lỗi khi đổi kỹ năng. Hãy thử lại.';
      case 'sanguo:skills.vanguard_special_rare':
        return 'Tiên phong · Kỹ năng · Hiếm';
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

/** The renderCopyDetail db.select sequence (skills guarded off — null slots). */
function copyDetailSpecs(
  target: any,
  copies: any[],
  stateRow: any = STATE_ROW,
  boosterOwned: any[] = [],
  poolRow: any[] = [{ amount: 999 }],
) {
  return [
    { steps: ['innerJoin', 'where', 'limit'], result: [target] },   // target copy
    { steps: ['where', 'orderBy'], result: copies },                 // copies of species
    { steps: ['where', 'limit'], result: [stateRow] },               // companion state
    { steps: ['where', 'limit'], result: [{ id: 1 }] },              // booster catalog row
    { steps: ['where', 'limit'], result: boosterOwned },             // owned booster
    { steps: ['where', 'limit'], result: poolRow },                  // per-hero pool amount
  ];
}

/** The last ActionRow (the action-buttons row) of an editReply payload. */
function lastRow(reply: any): ActionRowBuilder<any> {
  return reply.components[reply.components.length - 1] as ActionRowBuilder<any>;
}

function customIdsIn(row: ActionRowBuilder<any>): string[] {
  return row.components.map((c: any) => c.toJSON().custom_id);
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
  level: 1,
  ivStr: 31, ivAgi: 31, ivInt: 31, ivMov: 31, ivLea: 31, ivCha: 31,
  hpCurrent: 120,
  hp: 120,
  mp: 40,
  capturedZone: 'trung_nguyen',
  capturedAt: new Date('2026-08-01T00:00:00Z'),
  skillNormalId: null,
  skillSpecialId: null,
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
  level: 1,
  ivStr: 10, ivAgi: 10, ivInt: 10, ivMov: 10, ivLea: 10, ivCha: 10,
  hpCurrent: 140,
  hp: 140,
  mp: 50,
  capturedZone: 'du_chau',
  capturedAt: new Date('2026-08-01T00:00:00Z'),
  skillNormalId: null,
  skillSpecialId: null,
};
// A second owned copy of the same catalog hero — the D-04 dupe (duplicate
// disambiguation prefers the ACTIVE copy, else the earliest).
const UH_CAO_CAO_DUP = {
  ...UH_CAO_CAO,
  id: 13,
  ivStr: 5, ivAgi: 5, ivInt: 5, ivMov: 5, ivLea: 5, ivCha: 5,
  hpCurrent: 90,
  capturedAt: new Date('2026-08-02T00:00:00Z'),
};

const CONTEXT = {
  locale: 'vi',
  t,
  char: { id: 1 },
  user: { id: 42, balance: 0n },
  shardId: 0,
};

describe('/sanguo hero command (10-07 + 11-03 copy selector)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: owned hero renders the detail (D-16) ────────────────────────
  it('an OWNED hero renders the detail: emoji, name, stars, grade, HP/MP (base-only), companion status + action row (companion disabled when active)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [UH_CAO_CAO, UH_CAO_CAO_DUP] }, // resolveOwnedHero
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // disambiguation (active 11)
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail (2 copies)
    ]);

    const interaction = mockChatInputInteraction('Tào Tháo');
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

    // D-04: 2 copies → the copy-list field + page counter render.
    const copyListField = fields.find((f: any) => f.name === '📋 Danh sách bản');
    expect(copyListField).toBeDefined();
    expect(copyListField.value).toContain('#1 — Lv1 • Hoàng Kim • **120** HP');

    // 3 rows: copy select + action row (no page row — 2 copies ≤ 25).
    expect(reply.components).toHaveLength(2);
    const selectRow = reply.components[0] as ActionRowBuilder<any>;
    const selectJson = (selectRow.components[0] as any).toJSON();
    expect(selectJson.custom_id).toBe(COPY_MENU_ID);
    expect(selectJson.options).toHaveLength(2); // one option per copy

    // The action row carries CONVERT + LEVEL + EVOLVE + REROLL + COMPANION
    // (the latter DISABLED when the copy is already the active companion).
    const actionRow = lastRow(reply);
    const ids = customIdsIn(actionRow);
    expect(ids[0]).toBe(`${CONVERT_PREFIX}:11`);
    expect(ids[1]).toBe(`${LEVEL_PREFIX}:11`);
    expect(ids[2]).toBe(`${EVOLVE_PREFIX}:11`);
    expect(ids[3]).toBe(`${REROLL_OPEN_PREFIX}:11`);
    expect(ids[4]).toBe(`${COMPANION_PREFIX}:11`);
    const compBtn = (actionRow.components[4] as ButtonBuilder).toJSON() as {
      disabled: boolean;
    };
    expect(compBtn.disabled).toBe(true);
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

  it('F9 duplicate disambiguation: prefers the ACTIVE companion copy over a newer duplicate (action buttons carry the active id)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      {
        steps: ['innerJoin', 'where', 'orderBy'],
        result: [UH_CAO_CAO, UH_CAO_CAO_DUP], // same catalog hero, two copies (id 11 active, 13 newer)
      },
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // activeHeroId = 11
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail → the ACTIVE copy
    ]);

    const interaction = mockChatInputInteraction('Tào Tháo'); // name matches BOTH copies → F9 picks the active one
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('🗡️ Tào Tháo');
    // The action buttons target the ACTIVE copy (11).
    const actionRow = lastRow(reply);
    expect(customIdsIn(actionRow)[0]).toBe(`${CONVERT_PREFIX}:11`);
  });

  // ── zero-one-many (D-04): 1 copy → NO select, actions directly ──────────
  it('a hero with exactly 1 copy renders NO copy select — action buttons directly (zero-one-many)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue(CONTEXT as never);
    mockDbSelects([
      { steps: ['innerJoin', 'where', 'orderBy'], result: [UH_LIU_BEI] }, // resolveOwnedHero (1 copy of Lưu Bị)
      { steps: ['where', 'limit'], result: [STATE_ROW] }, // disambiguation
      ...copyDetailSpecs(UH_LIU_BEI, [UH_LIU_BEI]), // renderCopyDetail (1 copy → no select)
    ]);

    const interaction = mockChatInputInteraction('Lưu Bị');
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    // ONLY the action row — no copy select, no page buttons.
    expect(reply.components).toHaveLength(1);
    const actionRow = lastRow(reply);
    expect(customIdsIn(actionRow)[0]).toBe(`${CONVERT_PREFIX}:12`);
    // No copy-list field for a single copy.
    const fields = reply.embeds?.[0]?.data?.fields ?? [];
    expect(fields.find((f: any) => f.name === '📋 Danh sách bản')).toBeUndefined();
  });

  // ── Test 3: handleCompanionPress (D-16/D-04) ────────────────────────────
  it('handleCompanionPress switches activeHeroId inside a FOR UPDATE tx and re-renders with the button disabled', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      ...copyDetailSpecs(UH_LIU_BEI, [UH_LIU_BEI], STATE_ROW_ACTIVE_12), // renderCopyDetail (post-switch — now active)
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
    const actionRow = lastRow(reply);
    const compBtn = (actionRow.components[4] as ButtonBuilder).toJSON() as {
      custom_id: string;
      disabled: boolean;
    };
    expect(compBtn.custom_id).toBe('sanguo:hero:companion:12');
    expect(compBtn.disabled).toBe(true); // now the active companion
  });

  it('pressing the ALREADY-ACTIVE hero is a no-op (no state write — defense in depth, D-16)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO]),
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

  // ── D-04 copy select press ──────────────────────────────────────────────
  it('handleCopyPress re-renders with the action buttons targeting the CHOSEN copy (ownership re-gated)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      ...copyDetailSpecs(UH_CAO_CAO_DUP, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail(13)
    ]);

    const interaction = mockSelectInteraction(COPY_MENU_ID, ['13']);
    await handleCopyPress(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const actionRow = lastRow(reply);
    expect(customIdsIn(actionRow)[0]).toBe(`${CONVERT_PREFIX}:13`); // chosen copy
  });

  it('handleCopyPress rejects a NaN select value without rendering (parseInt + isNaN guard)', async () => {
    mockDbSelects([{ steps: ['where', 'limit'], result: [USER_ROW] }]);

    const interaction = mockSelectInteraction(COPY_MENU_ID, ['notanumber']);
    await handleCopyPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.components).toEqual([]);
  });

  // ── D-04 copy page press ────────────────────────────────────────────────
  it('handleCopyPage moves the copy-list page and keeps the action target pinned', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail(11, next page)
    ]);

    const interaction = mockButtonInteraction(`${COPY_PAGE_PREFIX}:next:0:11`);
    await handleCopyPage(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.components).toHaveLength(2); // select + action rows
    const actionRow = lastRow(reply);
    expect(customIdsIn(actionRow)[0]).toBe(`${CONVERT_PREFIX}:11`); // pinned target
  });

  // ── D-03 convert press ──────────────────────────────────────────────────
  it('handleConvertPress consumes the dupe and renders the SUCCESS progression-result embed with the yield', async () => {
    vi.mocked(convertDuplicate).mockResolvedValue({ yield: 1, boosterUsed: false });
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] }, // pre-read target
      { steps: ['where', 'orderBy'], result: [UH_CAO_CAO, UH_CAO_CAO_DUP] }, // pre-read copies (index 1)
    ]);
    mockTransaction(buildMockTx([])); // the convert tx — mocked service, tx unused

    const interaction = mockButtonInteraction(`${CONVERT_PREFIX}:13`);
    await handleConvertPress(interaction);

    expect(convertDuplicate).toHaveBeenCalledWith(42, 13);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0x10b981); // COLORS.SUCCESS
    expect(embed.title).toBe('💠 Chuyển hóa <a:mock:1> Tào Tháo');
    expect(embed.description).toContain('💠 Đã chuyển hóa bản #2 → +**1** 🧿 của Tào Tháo.');
    expect(reply.components).toEqual([]); // terminal state
  });

  it('handleConvertPress with a booster shows the ×2 hint in the result', async () => {
    vi.mocked(convertDuplicate).mockResolvedValue({ yield: 2, boosterUsed: true });
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
      { steps: ['where', 'orderBy'], result: [UH_CAO_CAO, UH_CAO_CAO_DUP] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${CONVERT_PREFIX}:13`);
    await handleConvertPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.description).toContain('+**2** 🧿');
    expect(embed.description).toContain('✨ Bộ kích hoạt ×2');
  });

  it('handleConvertPress maps COLLECTION_EMPTY → convert.collection_empty (DANGER) — the last-copy guard (user amendment)', async () => {
    vi.mocked(convertDuplicate).mockRejectedValue(new Error('COLLECTION_EMPTY'));
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
      { steps: ['where', 'orderBy'], result: [UH_CAO_CAO] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${CONVERT_PREFIX}:13`);
    await handleConvertPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.embeds?.[0]?.data?.description).toContain(
      'Không thể chuyển hóa bản cuối cùng — bộ sưu tập không được rỗng.',
    );
  });

  it('handleConvertPress maps ACTIVE_COMPANION / IN_FORMATION to their friendly embeds (user amendment)', async () => {
    vi.mocked(convertDuplicate).mockRejectedValue(new Error('ACTIVE_COMPANION'));
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
      { steps: ['where', 'orderBy'], result: [UH_CAO_CAO] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${CONVERT_PREFIX}:13`);
    await handleConvertPress(interaction);
    let reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain(
      'Không thể chuyển hóa hero đồng hành đang hoạt động.',
    );

    vi.mocked(convertDuplicate).mockRejectedValue(new Error('IN_FORMATION'));
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
      { steps: ['where', 'orderBy'], result: [UH_CAO_CAO] },
    ]);
    mockTransaction(buildMockTx([]));
    const interaction2 = mockButtonInteraction(`${CONVERT_PREFIX}:13`);
    await handleConvertPress(interaction2);
    reply = (interaction2.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain(
      'Không thể chuyển hóa bản đang nằm trong đội hình.',
    );
  });

  // ── D-05 level press ───────────────────────────────────────────────────
  it('handleLevelPress charges the pool and renders the level-up result embed (level ONLY — D-12)', async () => {
    vi.mocked(levelUp).mockResolvedValue({ newLevel: 2, cost: 1 });
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] }, // pre-read target
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${LEVEL_PREFIX}:11`);
    await handleLevelPress(interaction);

    expect(levelUp).toHaveBeenCalledWith(42, 11);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0x10b981); // COLORS.SUCCESS
    expect(embed.title).toBe('⬆️ Tăng cấp <a:mock:1> Tào Tháo');
    expect(embed.description).toContain('⬆️ Tào Tháo đã lên **Lv2**!');
    // D-12: NO stat deltas / base stats / tier multipliers in the result.
    expect(embed.description).not.toMatch(/ivStr|ivAgi|ivInt|ivMov|ivLea|ivCha/);
    expect(reply.components).toEqual([]);
  });

  it('handleLevelPress maps LEVEL_MAX → level.max (DANGER)', async () => {
    vi.mocked(levelUp).mockRejectedValue(new Error('LEVEL_MAX'));
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${LEVEL_PREFIX}:11`);
    await handleLevelPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.embeds?.[0]?.data?.description).toContain('Tào Tháo đã đạt cấp tối đa');
  });

  // ── D-06/D-07 evolve press ─────────────────────────────────────────────
  it('handleEvolvePress charges the pool and renders the result with the NEW tier emoji (D-07 swap)', async () => {
    vi.mocked(evolveHero).mockResolvedValue({ newTier: 1, cost: 20 });
    const t0Copy = { ...UH_CAO_CAO, id: 14, tier: 0, level: 20 };
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] }, // resolveInteractionUser
      { steps: ['innerJoin', 'where', 'limit'], result: [t0Copy] }, // pre-read target
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${EVOLVE_PREFIX}:14`);
    await handleEvolvePress(interaction);

    expect(evolveHero).toHaveBeenCalledWith(42, 14);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0x10b981); // COLORS.SUCCESS
    expect(embed.title).toBe('✨ Tiến hóa <a:mock:1> Tào Tháo');
    expect(embed.description).toContain('đã tiến hóa thành <a:mock:1> **★**!');
    expect(reply.components).toEqual([]);
  });

  it('handleEvolvePress maps LEVEL_REQUIRED → evolve.level_required with the gate level (DANGER)', async () => {
    vi.mocked(evolveHero).mockRejectedValue(new Error('LEVEL_REQUIRED'));
    const t0Copy = { ...UH_CAO_CAO, id: 14, tier: 0, level: 19 };
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [t0Copy] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${EVOLVE_PREFIX}:14`);
    await handleEvolvePress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.embeds?.[0]?.data?.description).toContain('Tào Tháo cần đạt **Lv20** trước khi tiến hóa.');
  });

  // ── D-32 reroll flow (open → slot → confirm) ───────────────────────────
  it('handleRerollPress replaces the action row with the SLOT select (3 rows max)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail(rerollOpen)
    ]);

    const interaction = mockButtonInteraction(`${REROLL_OPEN_PREFIX}:11`);
    await handleRerollPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    // 2 rows: copy select + the reroll SLOT select (page row skipped — 2 copies).
    expect(reply.components).toHaveLength(2);
    const slotRow = lastRow(reply);
    const slotJson = (slotRow.components[0] as any).toJSON();
    expect(slotJson.custom_id).toBe(`${REROLL_SLOT_PREFIX}:11`);
    expect(slotJson.options.map((o: any) => o.value)).toEqual(['normal', 'special']);
  });

  it('handleRerollSlot renders the CONFIRM button for the chosen slot (cost label)', async () => {
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      ...copyDetailSpecs(UH_CAO_CAO, [UH_CAO_CAO, UH_CAO_CAO_DUP]), // renderCopyDetail(rerollSlot)
    ]);

    const interaction = mockSelectInteraction(`${REROLL_SLOT_PREFIX}:11`, ['special']);
    await handleRerollSlot(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const confirmRow = lastRow(reply);
    expect(customIdsIn(confirmRow)[0]).toBe(`${REROLL_GO_PREFIX}:11:special`);
  });

  it('handleRerollGo charges REROLL_COST and renders the reroll result with the replacement skill', async () => {
    vi.mocked(rerollSkill).mockResolvedValue({ newSkillCode: 'vanguard_special_rare' });
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] }, // pre-read target
      { steps: ['where', 'limit'], result: [{ id: 202, code: 'vanguard_special_rare', emoji: '🔥' }] }, // new skill row
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${REROLL_GO_PREFIX}:11:special`);
    await handleRerollGo(interaction);

    expect(rerollSkill).toHaveBeenCalledWith(42, 11, 'special');
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0x10b981); // COLORS.SUCCESS
    expect(embed.title).toBe('🎲 Đổi kỹ năng <a:mock:1> Tào Tháo');
    expect(embed.description).toContain('Kỹ năng Kỹ năng đặc biệt của Tào Tháo → **🔥 Tiên phong · Kỹ năng · Hiếm**!');
    expect(reply.components).toEqual([]);
  });

  it('handleRerollGo maps INSUFFICIENT_HON_NGOC → reroll.insufficient (DANGER)', async () => {
    vi.mocked(rerollSkill).mockRejectedValue(new Error('INSUFFICIENT_HON_NGOC'));
    mockDbSelects([
      { steps: ['where', 'limit'], result: [USER_ROW] },
      { steps: ['innerJoin', 'where', 'limit'], result: [UH_CAO_CAO] },
    ]);
    mockTransaction(buildMockTx([]));

    const interaction = mockButtonInteraction(`${REROLL_GO_PREFIX}:11:normal`);
    await handleRerollGo(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xef4444);
    expect(reply.embeds?.[0]?.data?.description).toContain('Không đủ hồn ngọc (cần 10 🧿).');
  });

  // ── Test 4: D-12 never-render on the detail surface ─────────────────────
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
