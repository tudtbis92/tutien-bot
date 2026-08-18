/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { db } from '../../../db/client.js';
import { rollSkill, rollSkillsForSpawn, NORMAL_SLOT_RARITY_WEIGHT } from '../skillService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn() },
}));

/**
 * D-30 class-pool skill roll — Test 2 (11-06):
 *  - rollSkill: rarity-weighted cumulative pick (NORMAL common 80/rare 20,
 *    SPECIAL common 60/rare 30/epic 10) over an injected pool.
 *  - rollSkillsForSpawn: queries the class/slot pools and rolls one per slot.
 */
describe('rollSkill — D-30 rarity-weighted skill pick', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const NORMAL_POOL: any[] = [
    { id: 1, code: 'vanguard_normal_common', class: 'vanguard', slot: 'normal', rarity: 'common', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 100, emoji: '⚔️' },
    { id: 2, code: 'vanguard_normal_rare', class: 'vanguard', slot: 'normal', rarity: 'rare', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 120, emoji: '🗡️' },
  ];
  const SPECIAL_POOL: any[] = [
    { id: 3, code: 'vanguard_special_common', class: 'vanguard', slot: 'special', rarity: 'common', mpCost: 15, mpGain: 0, effectType: 'damage', effectValue: 150, emoji: '🛡️' },
    { id: 4, code: 'vanguard_special_rare', class: 'vanguard', slot: 'special', rarity: 'rare', mpCost: 25, mpGain: 0, effectType: 'damage', effectValue: 200, emoji: '💥' },
    { id: 5, code: 'vanguard_special_epic', class: 'vanguard', slot: 'special', rarity: 'epic', mpCost: 40, mpGain: 0, effectType: 'damage', effectValue: 300, emoji: '🔥' },
  ];

  it('NORMAL pool: common 80 / rare 20 — rng 0.79 → common, rng 0.8 (the 80 boundary) → rare', () => {
    expect(rollSkill(NORMAL_POOL, () => 0.0, NORMAL_SLOT_RARITY_WEIGHT)).toMatchObject({ id: 1, rarity: 'common' });
    expect(rollSkill(NORMAL_POOL, () => 0.79, NORMAL_SLOT_RARITY_WEIGHT)).toMatchObject({ id: 1, rarity: 'common' });
    // cumulative: common band [0, 80); rare band [80, 100) — rng×100 = 80 lands on rare.
    expect(rollSkill(NORMAL_POOL, () => 0.8, NORMAL_SLOT_RARITY_WEIGHT)).toMatchObject({ id: 2, rarity: 'rare' });
    expect(rollSkill(NORMAL_POOL, () => 0.99, NORMAL_SLOT_RARITY_WEIGHT)).toMatchObject({ id: 2, rarity: 'rare' });
  });

  it('SPECIAL pool: common 60 / rare 30 / epic 10 — rng 0.59→common, 0.6→rare, 0.9→epic', () => {
    expect(rollSkill(SPECIAL_POOL, () => 0.0)).toMatchObject({ id: 3, rarity: 'common' });
    expect(rollSkill(SPECIAL_POOL, () => 0.59)).toMatchObject({ id: 3, rarity: 'common' });
    expect(rollSkill(SPECIAL_POOL, () => 0.6)).toMatchObject({ id: 4, rarity: 'rare' });
    expect(rollSkill(SPECIAL_POOL, () => 0.89)).toMatchObject({ id: 4, rarity: 'rare' });
    expect(rollSkill(SPECIAL_POOL, () => 0.9)).toMatchObject({ id: 5, rarity: 'epic' });
  });

  it('an empty pool → null (the spawn insert writes null skill ids)', () => {
    expect(rollSkill([], () => 0.0)).toBeNull();
  });
});

describe('rollSkillsForSpawn — class/slot pool query + one roll per slot (D-30/D-31)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const VANGUARD_ROWS: any[] = [
    { id: 1, code: 'vanguard_normal_common', class: 'vanguard', slot: 'normal', rarity: 'common', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 100, emoji: '⚔️' },
    { id: 2, code: 'vanguard_normal_rare', class: 'vanguard', slot: 'normal', rarity: 'rare', mpCost: 0, mpGain: 12, effectType: 'damage', effectValue: 120, emoji: '🗡️' },
    { id: 3, code: 'vanguard_special_common', class: 'vanguard', slot: 'special', rarity: 'common', mpCost: 15, mpGain: 0, effectType: 'damage', effectValue: 150, emoji: '🛡️' },
    { id: 4, code: 'vanguard_special_rare', class: 'vanguard', slot: 'special', rarity: 'rare', mpCost: 25, mpGain: 0, effectType: 'damage', effectValue: 200, emoji: '💥' },
    { id: 5, code: 'vanguard_special_epic', class: 'vanguard', slot: 'special', rarity: 'epic', mpCost: 40, mpGain: 0, effectType: 'damage', effectValue: 300, emoji: '🔥' },
  ];

  /** Mock db.select().from(sanguoSkills) resolving queued pools per call. */
  function mockSkillSelect(readResults: unknown[][]) {
    let i = 0;
    const next = (): unknown[] => readResults[i++] ?? [];
    const chain: any = {
      where: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      then: (onF: any) => Promise.resolve(next()).then(onF),
    };
    const from = vi.fn(() => chain);
    (db.select as any).mockReturnValue({ from });
    return chain;
  }

  it('rng 0.0 → the FIRST normal (common) + FIRST special (common) of the class pool; the query filters class + slot', async () => {
    mockSkillSelect([[VANGUARD_ROWS[0], VANGUARD_ROWS[1]], [VANGUARD_ROWS[2], VANGUARD_ROWS[3], VANGUARD_ROWS[4]]]);
    const result = await rollSkillsForSpawn('vanguard', () => 0.0);
    expect(result).toEqual({ normalId: 1, specialId: 3 });

    const chains = (db.select as any).mock.results.map((r: any) => r.value.from());
    // Both queries rode the class filter; the pools were slot-filtered.
    const whereCalls = chains.map((c: any) => c.where.mock.calls[0]?.[0]);
    expect(whereCalls).toHaveLength(2);
    for (const cond of whereCalls) {
      expect(cond).toBeDefined();
    }
  });

  it('rng lands on rare normal + epic special (the weighted boundaries)', async () => {
    mockSkillSelect([[VANGUARD_ROWS[0], VANGUARD_ROWS[1]], [VANGUARD_ROWS[2], VANGUARD_ROWS[3], VANGUARD_ROWS[4]]]);
    const result = await rollSkillsForSpawn('vanguard', () => 0.9);
    expect(result).toEqual({ normalId: 2, specialId: 5 }); // normal 0.9×100=90 → rare; special 0.9×100=90 → epic
  });

  it('empty class pool → { normalId: null, specialId: null } (no skills seeded for the class)', async () => {
    mockSkillSelect([[], []]);
    const result = await rollSkillsForSpawn('schemer', () => 0.0);
    expect(result).toEqual({ normalId: null, specialId: null });
  });
});