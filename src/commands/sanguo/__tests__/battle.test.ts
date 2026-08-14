/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { db } from '../../../db/client.js';
import { fetchCommandContext } from '../../../utils/commandContext.js';
import {
  execute,
  handleBattleStart,
  handleBattleSkip,
  handleCaptureOpen,
  handleCaptureTierPress,
  handleCaptureRetryPress,
  handleCaptureRetreatPress,
} from '../battle.js';
import { formatTurnLine } from '../../../ui/embeds/buildSanguoBattleLogEmbed.js';
import {
  startEncounterBattle,
  startSparBattle,
  skipEncounter,
} from '../../../services/sanguo/battleCheckInService.js';
import { attemptCapture, captureChance } from '../../../services/sanguo/captureService.js';
import { checkInTravel } from '../../../services/sanguo/travelCheckInService.js';
import { getCurrentPosition } from '../../../services/sanguo/travelService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('../../../utils/commandContext.js', () => ({
  fetchCommandContext: vi.fn(),
}));

const { t } = vi.hoisted(() => ({
  t: ((key: string) => key) as (key: string) => string,
}));

vi.mock('../../../i18n/index.js', () => ({
  resolveLocale: (_stored?: string | null, _interaction?: string | null) => 'vi' as const,
  getT: () => t,
}));

vi.mock('../../../services/sanguo/battleCheckInService.js', () => ({
  startEncounterBattle: vi.fn(),
  startSparBattle: vi.fn(),
  skipEncounter: vi.fn(),
}));

vi.mock('../../../services/sanguo/captureService.js', () => ({
  attemptCapture: vi.fn(),
  captureChance: vi.fn(),
}));

vi.mock('../../../services/sanguo/travelCheckInService.js', () => ({
  checkInTravel: vi.fn(),
}));

vi.mock('../../../services/sanguo/travelService.js', () => ({
  getCurrentPosition: vi.fn(),
  getAdjacentNodes: vi.fn(),
  startTravel: vi.fn(),
}));

// heroEmoji mocked — the real one throws EMOJI_NOT_FOUND for unknown ids.
vi.mock('../../../assets/sanguoEmojis.js', () => ({
  heroEmoji: vi.fn(() => '<a:mock:1>'),
}));

/**
 * db.select().from(table).where(cond)...limit(1) — resolves the terminal
 * results in call order. Supports BOTH chain shapes: `.where().limit()` (users
 * row read, hero reads) and `.where().orderBy().limit()` (pending encounter /
 * battle snapshot reads).
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
    options: { getSubcommand: vi.fn().mockReturnValue('battle') },
    user: { id: '123' },
    locale: 'vi',
    client: { shard: { ids: [0] } },
  } as unknown as ChatInputCommandInteraction;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const USER_ROW = { id: 42, locale: 'vi' };
const STATE_ROW = { id: 1, userId: 42, activeHeroId: 11 };
const UH_ROW = { id: 11, userId: 42, heroId: 5, hpCurrent: 120 };
const CAO_CAO = {
  id: 5,
  heroId: 'cao_cao',
  nameVi: 'Tào Tháo',
  nameEn: 'Cao Cao',
  nameZh: null,
  rarity: 2,
  hp: 120,
};
const LIU_BEI = {
  id: 9,
  heroId: 'liu_bei',
  nameVi: 'Lưu Bị',
  nameEn: 'Liu Bei',
  nameZh: null,
  rarity: 3,
  hp: 140,
};
const PENDING_ENC = {
  id: 7,
  userId: 42,
  travelId: 3,
  zone: 'du_chau',
  heroId: 9,
  encounterType: 'hero',
  status: 'pending',
  pityCount: 0,
};
const PENDING_BOSS = {
  id: 8,
  userId: 42,
  travelId: 3,
  zone: 'du_chau',
  heroId: null,
  encounterType: 'boss',
  status: 'pending',
  pityCount: 0,
};
const ZONE_ROW = { code: 'du_chau', nameVi: 'Dự Châu', nameEn: 'Yuzhou', nameZh: null };
const BATTLE_SNAPSHOT = {
  id: 9,
  encounterId: 7,
  type: 'encounter',
  input: { enemy: { base: { hp: 140 } } },
  result: { enemyHpAfter: 40, winner: 'player' },
};
const ROUND_LOGS = [
  { round: 1, attacker: 'cao_cao', defender: 'liu_bei', hit: true, crit: false, dmg: 12, defenderHpAfter: 128 },
  { round: 1, attacker: 'liu_bei', defender: 'cao_cao', hit: true, crit: true, dmg: 9, defenderHpAfter: 111 },
  { round: 2, attacker: 'cao_cao', defender: 'liu_bei', hit: true, crit: false, dmg: 14, defenderHpAfter: 114 },
];
const WON_OUTCOME = {
  resolution: 'won',
  battleId: 1,
  winner: 'player',
  playerHpAfter: 80,
  enemyHpAfter: 40,
  roundLogs: ROUND_LOGS,
};
const LOST_OUTCOME = { ...WON_OUTCOME, resolution: 'lost', winner: 'enemy', playerHpAfter: 0 };

describe('/sanguo battle command (10-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: interaction router ────────────────────────────────────────────
  it('routes sanguo:battle:* / sanguo:capture:* BEFORE the chat-input gate; ACK route is GONE (D-01)', () => {
    const source = readFileSync(
      new URL('../../../events/interactionCreate.ts', import.meta.url),
      'utf-8',
    );
    const gateIdx = source.indexOf('if (!interaction.isChatInputCommand()) return;');

    expect(source.indexOf("startsWith('sanguo:battle:')")).toBeGreaterThan(-1);
    expect(source.indexOf('startsWith(CAPTURE_TIER_PREFIX)')).toBeGreaterThan(-1);
    expect(source.indexOf('customId === CAPTURE_OPEN_ID')).toBeGreaterThan(-1);
    expect(source.indexOf('customId === CAPTURE_RETRY_ID')).toBeGreaterThan(-1);
    expect(source.indexOf('customId === CAPTURE_RETREAT_ID')).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(source.indexOf("startsWith('sanguo:battle:')")).toBeLessThan(gateIdx);
    expect(source.indexOf('startsWith(CAPTURE_TIER_PREFIX)')).toBeLessThan(gateIdx);
    // Pitfall 7: the old ack route is REMOVED, not dormant.
    expect(source.indexOf('ACK_BTN_ID')).toBe(-1);
  });

  // ── Test 2: handleBattleStart ─────────────────────────────────────────────
  it('handleBattleStart win renders the SEASON battle log + the Bắt (capture open) row', async () => {
    mockDbReads([[USER_ROW], [STATE_ROW], [UH_ROW], [CAO_CAO], [LIU_BEI]]);
    vi.mocked(startEncounterBattle).mockResolvedValue(WON_OUTCOME as never);

    const interaction = mockButtonInteraction('sanguo:battle:start');
    await handleBattleStart(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(startEncounterBattle).toHaveBeenCalledWith(42); // users.id, never char.id
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:battle.log_title');
    expect(embed.color).toBe(0x8b5cf6); // COLORS.SEASON — encounter battle
    expect(embed.description).toContain('sanguo:battle.win');

    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(1);
    const btn = (row.components[0] as ButtonBuilder).toJSON() as { custom_id: string };
    expect(btn.custom_id).toBe('sanguo:capture:open'); // D-10 Bắt button
  });

  it('handleBattleStart loss renders the loss resolution with NO buttons', async () => {
    mockDbReads([[USER_ROW], [STATE_ROW], [UH_ROW], [CAO_CAO], [LIU_BEI]]);
    vi.mocked(startEncounterBattle).mockResolvedValue(LOST_OUTCOME as never);

    const interaction = mockButtonInteraction('sanguo:battle:start');
    await handleBattleStart(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.description).toContain('sanguo:battle.loss');
    expect(reply.components).toEqual([]); // CR-09-04: terminal state clears components
  });

  it('handleBattleStart BATTLE_ALREADY_FOUGHT routes to the CAPTURE VIEW — no re-battle (CR-02)', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [BATTLE_SNAPSHOT], [LIU_BEI]]);
    vi.mocked(startEncounterBattle).mockRejectedValue(new Error('BATTLE_ALREADY_FOUGHT'));
    vi.mocked(captureChance).mockReturnValue(0.42);

    const interaction = mockButtonInteraction('sanguo:battle:start');
    await handleBattleStart(interaction);

    // Rendered the capture view, NOT an error embed and NOT a re-battle.
    expect(startEncounterBattle).toHaveBeenCalledWith(42);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:capture.title');
    expect(embed.description).toBe('sanguo:capture.chance');
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(4); // 3 tiers + retreat — capture, not re-fight
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual([
      'sanguo:capture:tier:1',
      'sanguo:capture:tier:2',
      'sanguo:capture:tier:3',
      'sanguo:capture:retreat',
    ]);
  });

  // ── Test 3: handleCaptureOpen (capture view) ──────────────────────────────
  it('handleCaptureOpen renders the capture view: % + 3 tier buttons + retreat in ONE row', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [BATTLE_SNAPSHOT], [LIU_BEI]]);
    vi.mocked(captureChance).mockReturnValue(0.42);

    const interaction = mockButtonInteraction('sanguo:capture:open');
    await handleCaptureOpen(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    // The view % uses the tier-1 multiplier (the single displayed mechanic number).
    expect(captureChance).toHaveBeenCalledWith(
      expect.objectContaining({ rarity: 3, hpMax: 140, hpCurrent: 40, tierMultiplier: 1, pity: 0 }),
    );
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:capture.title');
    expect(embed.description).toBe('sanguo:capture.chance'); // THE single mechanic number
    expect(embed.color).toBe(0x8b5cf6); // SEASON hero capture view

    // T-10-06-05: exactly 4 components in ONE ActionRow (3 tiers + retreat).
    expect(reply.components).toHaveLength(1);
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(4);
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual([
      'sanguo:capture:tier:1',
      'sanguo:capture:tier:2',
      'sanguo:capture:tier:3',
      'sanguo:capture:retreat',
    ]);
  });

  it('handleCaptureOpen boss encounter renders the GOLD capture view (D-13)', async () => {
    mockDbReads([[USER_ROW], [PENDING_BOSS], [BATTLE_SNAPSHOT], [ZONE_ROW]]);
    vi.mocked(captureChance).mockReturnValue(0.1);

    const interaction = mockButtonInteraction('sanguo:capture:open');
    await handleCaptureOpen(interaction);

    expect(captureChance).toHaveBeenCalledWith(
      expect.objectContaining({ rarity: 5 }), // boss rarity constant
    );
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.color).toBe(0xf59e0b); // COLORS.GOLD boss variant
  });

  it('handleCaptureOpen CAPTURE_NOT_AVAILABLE renders capture.not_available with components cleared (CR-01)', async () => {
    // The pending encounter has NO won battle — the view fails closed.
    mockDbReads([[USER_ROW], [PENDING_ENC], [], [LIU_BEI]]);
    vi.mocked(captureChance).mockReturnValue(0.42);

    const interaction = mockButtonInteraction('sanguo:capture:open');
    await handleCaptureOpen(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:capture.not_available');
    expect(reply.components).toEqual([]);
  });

  // ── Test 4: handleCaptureTierPress ────────────────────────────────────────
  it('handleCaptureTierPress parses the tier (parseInt + isNaN guard) and calls attemptCapture with it', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(attemptCapture).mockResolvedValue({
      success: true,
      chance: 0.8,
      roll: 0.1,
      outcome: 'success',
      tier: 2,
      fee: 15n,
      pityBefore: 0,
      balanceAfter: 100n,
    } as never);

    const interaction = mockButtonInteraction('sanguo:capture:tier:2');
    await handleCaptureTierPress(interaction);

    expect(attemptCapture).toHaveBeenCalledWith(42, 2);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:capture.success_title');
    expect(embed.color).toBe(0x10b981); // SUCCESS
    expect(reply.components).toEqual([]); // terminal state clears components
  });

  it('handleCaptureTierPress fail-no-flee renders the WARNING embed with retry + retreat row', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(attemptCapture).mockResolvedValue({
      success: false,
      chance: 0.42,
      roll: 0.5,
      outcome: 'fail',
      tier: 1,
      fee: 5n,
      pityBefore: 0,
      balanceAfter: 95n,
    } as never);

    const interaction = mockButtonInteraction('sanguo:capture:tier:1');
    await handleCaptureTierPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:capture.fail_title');
    expect(embed.color).toBe(0xf59e0b); // WARNING — setback, retry open
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(2); // retry + retreat — swap, never append
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual(['sanguo:capture:retry', 'sanguo:capture:retreat']);
  });

  it('handleCaptureTierPress flee renders the DANGER embed with components cleared', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(attemptCapture).mockResolvedValue({
      success: false,
      chance: 0.42,
      roll: 0.5,
      outcome: 'flee',
      tier: 1,
      fee: 5n,
      pityBefore: 0,
      balanceAfter: 95n,
    } as never);

    const interaction = mockButtonInteraction('sanguo:capture:tier:1');
    await handleCaptureTierPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:capture.flee_title');
    expect(embed.color).toBe(0xef4444); // DANGER
    expect(reply.components).toEqual([]);
  });

  it('handleCaptureTierPress NO_PENDING_ENCOUNTER renders battle.no_encounter with components cleared', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(attemptCapture).mockRejectedValue(new Error('NO_PENDING_ENCOUNTER'));

    const interaction = mockButtonInteraction('sanguo:capture:tier:1');
    await handleCaptureTierPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:battle.no_encounter');
    expect(reply.components).toEqual([]);
  });

  it('handleCaptureTierPress INSUFFICIENT_BALANCE renders capture.insufficient with the required fee', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(attemptCapture).mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const interaction = mockButtonInteraction('sanguo:capture:tier:2');
    await handleCaptureTierPress(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:capture.insufficient');
    expect(reply.components).toEqual([]);
  });

  it('handleCaptureTierPress NaN tier is a no-op (parseInt + isNaN guard)', async () => {
    mockDbReads([[USER_ROW]]);

    const interaction = mockButtonInteraction('sanguo:capture:tier:notanumber');
    await handleCaptureTierPress(interaction);

    expect(attemptCapture).not.toHaveBeenCalled();
  });

  // ── Test 5: retry / retreat ───────────────────────────────────────────────
  it('handleCaptureRetryPress re-renders the capture view with the recomputed % (no new attempt)', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [BATTLE_SNAPSHOT], [LIU_BEI]]);
    vi.mocked(captureChance).mockReturnValue(0.47);

    const interaction = mockButtonInteraction('sanguo:capture:retry');
    await handleCaptureRetryPress(interaction);

    expect(attemptCapture).not.toHaveBeenCalled();
    expect(captureChance).toHaveBeenCalled();
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:capture.title');
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(4); // full tier row again
  });

  it('handleCaptureRetreatPress resolves skipEncounter and renders the NEUTRAL retreat embed', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(skipEncounter).mockResolvedValue(undefined);

    const interaction = mockButtonInteraction('sanguo:capture:retreat');
    await handleCaptureRetreatPress(interaction);

    expect(skipEncounter).toHaveBeenCalledWith(42);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.description).toContain('sanguo:capture.retreat_body');
    expect(embed.color).toBe(0x6b7280); // NEUTRAL
    expect(reply.components).toEqual([]);
  });

  it('handleBattleSkip resolves skipEncounter and renders the same retreat consequence (D-18)', async () => {
    mockDbReads([[USER_ROW], [PENDING_ENC], [LIU_BEI]]);
    vi.mocked(skipEncounter).mockResolvedValue(undefined);

    const interaction = mockButtonInteraction('sanguo:battle:skip');
    await handleBattleSkip(interaction);

    expect(skipEncounter).toHaveBeenCalledWith(42);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.description).toContain('sanguo:capture.retreat_body');
    expect(reply.components).toEqual([]);
  });

  // ── Test 6: /sanguo battle execute (spar, D-17) ───────────────────────────
  it('execute spar renders the NEUTRAL battle log with the spar hint and NO capture button', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(startSparBattle).mockResolvedValue(WON_OUTCOME as never);
    mockDbReads([[STATE_ROW], [UH_ROW], [CAO_CAO], [LIU_BEI]]);

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled(); // parent command owns it
    expect(startSparBattle).toHaveBeenCalledWith(42);
    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.title).toBe('sanguo:battle.log_title');
    expect(embed.color).toBe(0x6b7280); // NEUTRAL — spar no-stakes (D-17)
    expect(embed.description).toContain('sanguo:battle.spar_hint');
    expect(reply.components).toEqual([]); // spar never offers capture
  });

  it('execute spar with a fainted companion renders the battle.blocked_fainted DANGER embed', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(startSparBattle).mockRejectedValue(new Error('HERO_FAINTED'));
    mockDbReads([[STATE_ROW], [UH_ROW], [CAO_CAO]]); // active companion name lookup

    const interaction = mockChatInputInteraction();
    await execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    const embed = reply.embeds?.[0]?.data ?? {};
    expect(embed.color).toBe(0xef4444); // DANGER
    expect(embed.description).toContain('sanguo:battle.blocked_fainted');
  });

  // ── formatTurnLine ≤ 80 chars (D-07 line budget) ──────────────────────────
  it('formatTurnLine stays within the ~80-char line budget with real copy', () => {
    const interpT = ((key: string, opts?: Record<string, unknown>) => {
      if (key === 'sanguo:battle.turn') {
        return `Lượt ${opts?.n} — ${opts?.attacker} → ${opts?.defender}: **${opts?.dmg}** sát thương`;
      }
      if (key === 'sanguo:battle.turn_crit') {
        return `Lượt ${opts?.n} — 💥 ${opts?.attacker} chí mạng ${opts?.defender}: **${opts?.dmg}** sát thương`;
      }
      return key;
    }) as any;

    const names = { cao_cao: 'Tào Tháo', liu_bei: 'Lưu Bị' };
    const line = formatTurnLine(
      { round: 12, attacker: 'cao_cao', defender: 'liu_bei', hit: true, crit: true, dmg: 18, defenderHpAfter: 0 },
      interpT,
      names,
    );
    expect(line.length).toBeLessThanOrEqual(80);
  });

  // ── Test 7: travel.ts ack→battle inversion (D-01) ─────────────────────────
  it('travel.ts renders the fight/skip button row (NOT the ack row); buildAckButton is gone', () => {
    const source = readFileSync(new URL('../travel.ts', import.meta.url), 'utf-8');
    expect(source).toContain('buildBattleStartButton');
    expect(source).toContain('buildBattleSkipButton');
    expect(source.indexOf('buildAckButton')).toBe(-1);
    expect(source.indexOf('handleAckPress')).toBe(-1);
  });

  it('execute with an active journey — encounter mode replies the encounter embed + fight/skip row (D-01)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(checkInTravel).mockResolvedValue({
      mode: 'encounter',
      remaining: 300,
      encounter: { heroId: 9, zone: 'du_chau', boss: false },
    });
    mockDbReads([
      [{ status: 'traveling', encounterActive: false }], // execute() status gate → check-in path
      [{ toNodeId: 7 }], // resolveEncounterDisplay: destination node id
      [{ nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: null }], // node display name
      [ZONE_ROW], // zone name
      [LIU_BEI], // hero name
      [PENDING_ENC], // F4 pending re-fetch
      [], // sanguoBattles — no battle yet → fight/skip row
    ]);

    const interaction = mockChatInputInteraction();
    await (await import('../travel.js')).execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:encounter.title');
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    const ids = row.components.map((c: any) => ((c as ButtonBuilder).toJSON() as { custom_id: string }).custom_id);
    expect(ids).toEqual(['sanguo:battle:start', 'sanguo:battle:skip']);
  });

  it('execute with an active journey — a won battle for the pending encounter renders the CAPTURE VIEW (F4)', async () => {
    vi.mocked(fetchCommandContext).mockResolvedValue({
      locale: 'vi',
      t,
      char: { id: 1 },
      user: { id: 42, balance: 0n },
      shardId: 0,
    } as never);
    vi.mocked(getCurrentPosition).mockResolvedValue({ nodeId: 5, nodeCode: 'luoyang' });
    vi.mocked(checkInTravel).mockResolvedValue({
      mode: 'encounterPending',
      remaining: 300,
      encounter: { heroId: 9, zone: 'du_chau', boss: false },
    });
    vi.mocked(captureChance).mockReturnValue(0.42);
    mockDbReads([
      [{ status: 'traveling', encounterActive: true }], // execute() status gate → check-in path
      [{ toNodeId: 7 }], // resolveEncounterDisplay: destination node id
      [{ nameVi: 'Hứa Xương', nameEn: 'Xuchang', nameZh: null }], // node display name
      [ZONE_ROW], // zone name
      [LIU_BEI], // hero name
      [PENDING_ENC], // F4 pending re-fetch
      [{ ...BATTLE_SNAPSHOT, result: { enemyHpAfter: 40, winner: 'player' } }], // won battle
      [PENDING_ENC], // renderCaptureView pending
      [BATTLE_SNAPSHOT], // renderCaptureView battle snapshot
      [LIU_BEI], // renderCaptureView hero
    ]);

    const interaction = mockChatInputInteraction();
    await (await import('../travel.js')).execute(interaction);

    const reply = (interaction.editReply as any).mock.calls[0]?.[0] ?? {};
    expect(reply.embeds?.[0]?.data?.title).toBe('sanguo:capture.title');
    const row = reply.components?.[0] as ActionRowBuilder<any>;
    expect(row.components).toHaveLength(4); // 3 tiers + retreat — no re-battle needed
  });
});
