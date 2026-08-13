/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import { execute, handleDestinationSelect, handleStartPress } from '../travel.js';
import * as travelModule from '../travel.js';
import {
  getCurrentPosition,
  getAdjacentNodes,
  startTravel,
} from '../../../services/sanguo/travelService.js';
import { checkInTravel } from '../../../services/sanguo/travelCheckInService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

// Component handlers resolve their own t via getT() — stub i18next so no
// uninitialized-singleton crash in tests (initI18n runs only at app startup).
const { t } = vi.hoisted(() => ({
  t: ((key: string) => key) as (key: string) => string,
}));

vi.mock('../../../i18n/index.js', () => ({
  resolveLocale: (_stored?: string | null, _interaction?: string | null) => 'vi' as const,
  getT: () => t,
}));

vi.mock('../../../services/sanguo/travelService.js', () => ({
  START_NODE: 'luoyang',
  getCurrentPosition: vi.fn(),
  getAdjacentNodes: vi.fn(),
  startTravel: vi.fn(),
}));

vi.mock('../../../services/sanguo/travelCheckInService.js', () => ({
  checkInTravel: vi.fn(),
}));

/**
 * db.select().from(table).where(cond)...limit(1) — resolves the terminal results
 * in call order (users row read, travel status read, node name lookups, ...).
 * Supports BOTH chain shapes: `.where().limit()` and `.where().orderBy().limit()`
 * (the F4 pending/battle re-fetch reads in dispatchCheckIn).
 */
function mockDbReads(results: unknown[][]) {
  const limit = vi.fn();
  for (const r of results) limit.mockResolvedValueOnce(r);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy, limit }));
  const from = vi.fn(() => ({ where }));
  (db.select as any).mockReturnValue({ from });
  return { limit, where, orderBy, from };
}

const CURRENT_NODE = { id: 5, nameVi: 'Lạc Dương', nameEn: 'Luoyang', nameZh: '洛阳' };
const XUCHANG_NODE = { id: 7, nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: '许昌' };
const USER_ROW = { id: 42, locale: 'vi' };

const ADJACENT = [
  {
    nodeId: 7,
    code: 'xuchang',
    nameVi: 'Hứa Xương',
    nameEn: 'Xuchang',
    nameZh: '许昌',
    zone: 'du_chau',
    travelSeconds: 600,
    representativeHeroId: 'cao_cao',
  },
  {
    nodeId: 9,
    code: 'yecheng',
    nameVi: 'Nghiệp Thành',
    nameEn: 'Yecheng',
    nameZh: '邺城',
    zone: 'ky_chau',
    travelSeconds: 900,
    representativeHeroId: 'yuan_shao',
  },
];

function mockChatInputInteraction(): ChatInputCommandInteraction {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getSubcommand: vi.fn().mockReturnValue('travel') },
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as ChatInputCommandInteraction;
}

function mockSelectInteraction(values: string[] = ['xuchang']): StringSelectMenuInteraction {
  return {
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    values,
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as StringSelectMenuInteraction;
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

describe('/sanguo travel command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('execute with NO active journey replies the destination select menu + a disabled Start button (start mode, D-26)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(getAdjacentNodes).mockResolvedValue(ADJACENT);
    mockDbReads([
      [], // playerTravelState status read → no row → start mode
      [CURRENT_NODE], // current node name for the pick embed
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    // CR-09-01: the parent 'sanguo' command owns deferReply (map.ts), so the
    // subcommand handler must NOT defer again — it replies via editReply only.
    expect(interaction.deferReply).not.toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:travel.pick_title');

    // CR-09-02: the select menu and Start button live in SEPARATE action rows —
    // a StringSelectMenu spans the full row width (5 units), so combining them
    // in one row throws Discord COMPONENT_LAYOUT_WIDTH_EXCEEDED.
    expect(reply.components).toHaveLength(2);
    const menuRow = reply.components?.[0] as ActionRowBuilder<any>;
    expect(menuRow.components).toHaveLength(1);
    expect(menuRow.components[0]).toBeInstanceOf(StringSelectMenuBuilder);

    const menu = (menuRow.components[0] as StringSelectMenuBuilder).toJSON();
    expect(menu.custom_id).toBe('sanguo:travel:dest');
    expect(menu.options).toHaveLength(2);
    expect(menu.options?.[0]?.value).toBe('xuchang');
    // CR-09-03: emoji goes in the option's `emoji` field (resolved from the
    // '<a:name:id>' markup via resolvePartialEmoji) — NEVER in the label text
    // (labels are plain text; markup there renders literally).
    const opt = menu.options?.[0] as { label: string; emoji?: { id: string; name: string; animated?: boolean } };
    expect(opt.label).toBe('Hứa Xương');
    expect(opt.emoji?.id).toBe('1536202210814464083'); // cao_cao t0
    expect(opt.emoji?.animated).toBe(true);

    const startRow = reply.components?.[1] as ActionRowBuilder<any>;
    expect(startRow.components).toHaveLength(1);
    const startBtn = (startRow.components[0] as ButtonBuilder).toJSON() as {
      custom_id: string;
      disabled?: boolean;
    };
    expect(startBtn.custom_id).toBe('sanguo:travel:start');
    expect(startBtn.disabled).toBe(true);
  });

  it('selecting a destination updates the reply with destination + ETA and enables the Start button carrying the code (F1)', async () => {
    mockDbReads([[USER_ROW], [CURRENT_NODE]]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(getAdjacentNodes).mockResolvedValue(ADJACENT);

    const interaction = mockSelectInteraction(['xuchang']);
    await handleDestinationSelect(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    expect(embeds[0]?.data?.title).toBe('sanguo:travel.confirm_title'); // CR-09-06: preview state
    const fields = embeds[0]?.data?.fields ?? [];
    expect(fields.map((f: { name: string }) => f.name)).toEqual([
      'sanguo:travel.destination_label',
      'sanguo:travel.eta_label',
      'sanguo:travel.from_label',
    ]);

    expect(reply.components).toHaveLength(2); // CR-09-02: menu row + button row
    const startRow = reply.components?.[1] as ActionRowBuilder<any>;
    expect(startRow.components).toHaveLength(1);
    const startBtn = (startRow.components[0] as ButtonBuilder).toJSON() as {
      custom_id: string;
      disabled?: boolean;
    };
    expect(startBtn.disabled).toBe(false);
    expect(startBtn.custom_id).toBe('sanguo:travel:start:xuchang');
  });

  it('pressing Start calls startTravel(user.id, code-from-customId) and replies the travel embed with NO cost field', async () => {
    mockDbReads([[USER_ROW], [CURRENT_NODE], [XUCHANG_NODE]]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(startTravel).mockResolvedValue({ etaSeconds: 600 });

    const interaction = mockButtonInteraction('sanguo:travel:start:xuchang');
    await handleStartPress(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(startTravel).toHaveBeenCalledWith(42, 'xuchang');

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    expect(embeds[0]?.data?.title).toBe('sanguo:travel.started_title');
    const fields = embeds[0]?.data?.fields ?? [];
    expect(fields).toHaveLength(3); // destination/ETA/from — NO cost field (D-01)
    expect(fields.map((f: { name: string }) => f.name)).not.toContain('sanguo:travel.cost');
    expect(fields.map((f: { name: string }) => f.name)).toEqual([
      'sanguo:travel.destination_label',
      'sanguo:travel.eta_label',
      'sanguo:travel.from_label',
    ]);
    // CR-09-04: Discord PATCH merges fields — omitted components keep the stale
    // select menu + button. The Start-press reply MUST clear them explicitly.
    expect(reply.components).toEqual([]);
  });

  it('startTravel ALREADY_TRAVELING takes the check-in path and replies a status embed', async () => {
    mockDbReads([[USER_ROW], [{ id: 1, fromNodeId: 5, toNodeId: 7 }], [CURRENT_NODE], [XUCHANG_NODE]]);
    vi.mocked(startTravel).mockRejectedValue(new Error('ALREADY_TRAVELING'));
    vi.mocked(checkInTravel).mockResolvedValue({ mode: 'status', remaining: 300 });

    const interaction = mockButtonInteraction('sanguo:travel:start:xuchang');
    await handleStartPress(interaction);

    expect(checkInTravel).toHaveBeenCalledWith(42);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    expect(embeds[0]?.data?.title).toBe('sanguo:travel.status_title'); // CR-09-06: mid-journey state
    const fields = embeds[0]?.data?.fields ?? [];
    const etaField = fields.find((f: { name: string }) => f.name === 'sanguo:travel.eta_label');
    expect(etaField?.value).toBe('sanguo:travel.eta');
    expect(reply.components).toEqual([]); // CR-09-04: check-in clears stale components
  });

  it('startTravel NO_ROUTE replies the no_route DANGER embed (server-side re-validation)', async () => {
    mockDbReads([[USER_ROW]]);
    vi.mocked(startTravel).mockRejectedValue(new Error('NO_ROUTE'));

    const interaction = mockButtonInteraction('sanguo:travel:start:not_adjacent');
    await handleStartPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    expect(embeds[0]?.data?.title).toBe('sanguo:travel.no_route_title');
    expect(embeds[0]?.data?.color).toBe(0xef4444); // COLORS.DANGER
  });

  it('routes sanguo:travel:* component branches in interactionCreate BEFORE the chat-input gate; the ACK route is REMOVED (D-01)', () => {
    const source = readFileSync(
      new URL('../../../events/interactionCreate.ts', import.meta.url),
      'utf-8',
    );
    const destIdx = source.indexOf('customId === DEST_MENU_ID');
    const startIdx = source.indexOf('customId.startsWith(START_BTN_ID)');
    const gateIdx = source.indexOf('if (!interaction.isChatInputCommand()) return;');

    expect(destIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(destIdx).toBeLessThan(gateIdx);
    expect(startIdx).toBeLessThan(gateIdx);
    // Pitfall 7: the D-25 ack route is removed, not dormant (battle entry D-01).
    expect(source.indexOf('ACK_BTN_ID')).toBe(-1);
  });

  it('passes user.id (users.id) to every travelService call — never char.id', async () => {
    mockDbReads([[USER_ROW], [CURRENT_NODE], [XUCHANG_NODE]]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(startTravel).mockResolvedValue({ etaSeconds: 600 });

    const interaction = mockButtonInteraction('sanguo:travel:start:xuchang');
    await handleStartPress(interaction);

    // user row id (42) is passed, never the character id (1)
    expect(startTravel).toHaveBeenCalledWith(42, 'xuchang');
    expect(getCurrentPosition).toHaveBeenCalledWith(42);
    expect(startTravel).not.toHaveBeenCalledWith(1, expect.any(String));
  });

  it('zero adjacent nodes replies the no_route DANGER embed and renders NO select menu (F6)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(getAdjacentNodes).mockResolvedValue([]);
    mockDbReads([[]]); // status read → no row → start mode

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embeds = reply.embeds ?? [];
    expect(embeds[0]?.data?.title).toBe('sanguo:travel.no_route_title');
    expect(reply.components).toBeUndefined();
  });

  // ── 09-03 Task 2: full check-in dispatch (D-22/D-24/D-25/D-28) + ack resume ──

  it('execute with an active journey — arrived mode replies the arrival embed + re-opens the destination menu (D-08/D-26)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(checkInTravel).mockResolvedValue({ mode: 'arrived' });
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 7, nodeCode: 'xuchang' });
    vi.mocked(getAdjacentNodes).mockResolvedValue(ADJACENT);
    mockDbReads([
      [{ status: 'traveling', encounterActive: false }], // execute() status gate → check-in path
      [XUCHANG_NODE], // fetchNodeName(7) for the arrival embed
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    expect(checkInTravel).toHaveBeenCalledWith(42); // users.id, never char.id
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:arrival.title');
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:arrival.body');
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components[0]).toBeInstanceOf(StringSelectMenuBuilder); // next-hop picker
    expect(reply.components).toHaveLength(2); // CR-09-02: + Start button row
  });

  it('execute with an active journey — encounter mode replies the encounter embed (hero name/emoji) + fight/skip battle row (D-01)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(checkInTravel).mockResolvedValue({
      mode: 'encounter',
      remaining: 300,
      encounter: { heroId: 5, zone: 'du_chau', boss: false },
    });
    mockDbReads([
      [{ status: 'traveling', encounterActive: false }], // execute() status gate → check-in path
      [{ toNodeId: 7 }], // resolveEncounterDisplay: destination node id
      [{ nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: null }], // fetchNodeName(7) — node display name
      [{ nameVi: 'Dự Châu', nameEn: 'Yuzhou', nameZh: null }], // zone name lookup
      [{ heroId: 'cao_cao', nameVi: 'Tào Tháo', nameEn: 'Cao Cao', nameZh: null }], // hero lookup
      [{ id: 7, heroId: 5, zone: 'du_chau', status: 'pending' }], // F4 pending re-fetch
      [], // sanguoBattles — no won battle yet → fight/skip row
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:encounter.title');
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:encounter.body');
    expect(reply.embeds?.[0]?.data?.color).toBe(0x8b5cf6); // COLORS.SEASON normal encounter
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual(['sanguo:battle:start', 'sanguo:battle:skip']); // D-01: battle entry, not ack
  });

  it('execute with an active journey — encounterPending mode replies the boss GOLD embed, NO re-roll (F2/D-25)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(checkInTravel).mockResolvedValue({
      mode: 'encounterPending',
      remaining: 300,
      encounter: { heroId: null, zone: 'du_chau', boss: true },
    });
    mockDbReads([
      [{ status: 'traveling', encounterActive: false }], // execute() status gate → check-in path
      [{ toNodeId: 7 }], // resolveEncounterDisplay: destination node id
      [{ nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: null }], // fetchNodeName(7) — node display name
      [{ nameVi: 'Dự Châu', nameEn: 'Yuzhou', nameZh: null }], // boss → zone name only, NO hero read
      [{ id: 8, heroId: null, zone: 'du_chau', status: 'pending' }], // F4 pending re-fetch
      [], // sanguoBattles — no won battle yet → fight/skip row
    ]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    expect(checkInTravel).toHaveBeenCalledTimes(1); // pending comes from the DB, never re-rolled
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:encounter.boss_title');
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:encounter.boss_body');
    expect(reply.embeds?.[0]?.data?.color).toBe(0xf59e0b); // COLORS.GOLD boss variant (UI-SPEC)
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual(['sanguo:battle:start', 'sanguo:battle:skip']); // D-01 battle row, not ack
  });

  it('D-01 inversion: travel.ts no longer exports handleAckPress (retired with the ack route)', () => {
    expect((travelModule as any).handleAckPress).toBeUndefined();
  });
});
