/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '../../../db/client.js';
import {
  listOwnedFormations,
  getActiveLegion,
  assignHero,
  clearSlot,
  saveLegion,
} from '../legionService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

// ── fixtures ────────────────────────────────────────────────────────────────
const USER_ID = 42;

const STARTER_FORMATION = {
  id: 1,
  code: 'can_ban',
  nameVi: 'Trận Căn Bản',
  nameEn: 'Basic Formation',
  nameZh: null,
  slotCount: 12,
  basePrice: 0n, // free starter (D-21) — granted via first-use upsert
  emoji: '⚔️',
};
const THIEN_CO_FORMATION = {
  ...STARTER_FORMATION,
  id: 2,
  code: 'thien_co',
  nameVi: 'Trận Thiên Cơ',
  nameEn: 'Heavenly Mechanism Formation',
  basePrice: 200n,
};

// formation_slots for the starter: slot 0 vanguard (main), slot 1 vanguard (main)
const FORMATION_SLOT_VANGUARD_0 = { id: 1, formationId: 1, slotOrder: 0, class: 'vanguard', position: 'main', quantity: 1 };
const FORMATION_SLOT_VANGUARD_1 = { id: 2, formationId: 1, slotOrder: 1, class: 'vanguard', position: 'main', quantity: 1 };

const CAO_CAO = {
  id: 5,
  heroId: 'cao_cao',
  nameVi: 'Tào Tháo',
  nameEn: 'Cao Cao',
  nameZh: null,
  factionId: 1,
  role: 'ruler',
  class: 'vanguard', // vanguard → matches slot 0 (vanguard)
  familyId: 1,
  tier: 3,
  hp: 120,
};

const USER_HERO_CAO_CAO = {
  id: 11,
  userId: USER_ID,
  heroId: 5,
  level: 1,
  ivStr: 31, ivAgi: 31, ivInt: 31, ivMov: 31, ivLea: 31, ivCha: 31,
  hpCurrent: 120,
  capturedZone: 'trung_nguyen',
  capturedAt: new Date('2026-08-14T00:00:00Z'),
  tier: 0,
  skillNormalId: null,
  skillSpecialId: null,
};
const USER_HERO_LIU_BEI = {
  ...USER_HERO_CAO_CAO,
  id: 12,
  heroId: 9,
};
// A hero owned by ANOTHER user — the crafted-id ownership case (V4).
const FOREIGN_USER_HERO = {
  ...USER_HERO_CAO_CAO,
  id: 99,
  userId: 999,
};

const LEGION_ROW = { id: 1, userId: USER_ID, formationId: 1, updatedAt: new Date('2026-08-14T00:00:00Z') };
const SLOT_ROW = { id: 1, userId: USER_ID, slotOrder: 0, userHeroId: 11 };

// ── fake drizzle tx (chainable; mirrors shopService.test.ts's makeTx) ────────
function makeTx(readResults: unknown[][]) {
  let i = 0;
  const next = (): unknown[] => readResults[i++] ?? [];
  const terminal = () => {
    const thenable: any = Promise.resolve(undefined);
    thenable.returning = vi.fn(() => Promise.resolve(next()));
    thenable.onConflictDoUpdate = vi.fn((_t: any, _s: any) => thenable);
    thenable.onConflictDoNothing = vi.fn(() => thenable);
    return thenable;
  };
  const chain: any = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    for: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    then: (onF: any, onR: any) => Promise.resolve(next()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(next()).catch(onR),
  };
  const from = vi.fn(() => chain);
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn(() => terminal());
  const updateSet = vi.fn((_v: any) => ({ where: updateWhere }));
  const update = vi.fn((_t: any) => ({ set: updateSet }));
  const insertValues = vi.fn((_v: any) => terminal());
  const insert = vi.fn((_t: any) => ({ values: insertValues }));
  const delWhere = vi.fn(() => Promise.resolve(undefined));
  const del = vi.fn((_t: any) => ({ where: delWhere }));
  return { tx: { select, update, insert, delete: del }, chain, update, insert, insertValues, select };
}

function runInTx<T>(readResults: unknown[][], fn: (tx: any) => Promise<T>) {
  const mocks = makeTx(readResults);
  (db.transaction as any).mockImplementation(async (cb: any) => cb(mocks.tx));
  const promise = fn(mocks.tx);
  return { promise, ...mocks };
}

// ── listOwnedFormations ──────────────────────────────────────────────────────
describe('listOwnedFormations — free-starter upsert + owned formations (D-21/D-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grants the free (basePrice 0) starter formation via the first-use upsert (P0-1 onConflictDoNothing), then returns owned formations ordered by id', async () => {
    // reads: [1] the free starter formations (basePrice 0), [2] owned join -> list
    const { promise, insert } = runInTx(
      [
        [STARTER_FORMATION], // 1. free starter (basePrice 0) — grant target
        [STARTER_FORMATION, THIEN_CO_FORMATION], // 2. owned formations ordered by id
      ],
      () => listOwnedFormations(USER_ID),
    );
    await expect(promise).resolves.toHaveLength(2);
    expect(insert).toHaveBeenCalled(); // the free-starter upsert ran
  });
});

// ── getActiveLegion ──────────────────────────────────────────────────────────
describe('getActiveLegion — active legion + slots joined to hero identities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the legion + its slots with hero identities; empty slots allowed', async () => {
    // reads: [1] user_legions join formations, [2] slots join user_heroes + heroes
    const { promise } = runInTx(
      [
        [LEGION_ROW],
        [
          { slotOrder: 0, userHeroId: 11, heroId: 'cao_cao', nameVi: 'Tào Tháo', nameEn: 'Cao Cao', nameZh: null, class: 'vanguard' },
        ],
      ],
      () => getActiveLegion(USER_ID),
    );
    await expect(promise).resolves.not.toBeNull();
    const legion = await promise;
    expect(legion!.slots).toHaveLength(1);
    expect(legion!.slots[0]).toMatchObject({ slotOrder: 0, userHeroId: 11 });
    expect(legion!.slots[0].hero).toMatchObject({ nameVi: 'Tào Tháo', class: 'vanguard' });
  });

  it('returns null when no active legion is saved', async () => {
    const { promise } = runInTx(
      [[],],
      () => getActiveLegion(USER_ID),
    );
    await expect(promise).resolves.toBeNull();
  });
});

// ── assignHero ───────────────────────────────────────────────────────────────
describe('assignHero — ownership + strict class-match + one-copy-one-slot (D-20/V4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T1: assigns a hero whose class matches the slot — row upserted in user_legion_slots', async () => {
    // reads: [1] formation owned, [2] user_heroes FOR UPDATE lock, [3] slot class, [4] hero_classes membership (Cao Cao has vanguard), [5] dup check (none)
    const { promise, tx } = runInTx(
      [
        [{ id: 1 }], // 1. user_formations owned → formationId 1
        [USER_HERO_CAO_CAO], // 2. user_heroes FOR UPDATE (owned — userId 42)
        [FORMATION_SLOT_VANGUARD_0], // 3. formation_slots class='vanguard'
        [{ id: 1, heroId: 5, class: 'vanguard' }], // 4. hero_classes membership (multi-class, Phase 11)
        [], // 5. dup check: no existing assignment
      ],
      () => assignHero(USER_ID, 1, 0, 11),
    );
    await expect(promise).resolves.toEqual({ slotOrder: 0, userHeroId: 11 });

    // The slot row upsert rides user_legion_slots unique(userId, slotOrder).
    expect(tx.insert).toHaveBeenCalled();
  });

  it('T2: a hero not in the slot class (no hero_classes membership) → legion.class_mismatch BEFORE any write (D-20 strict)', async () => {
    // liu_bei has no hero_classes row for slot 0 (vanguard) → mismatch → NO upsert.
    const { promise, insert } = runInTx(
      [
        [{ id: 1 }], // formation owned
        [USER_HERO_LIU_BEI], // user_heroes FOR UPDATE (owned)
        [FORMATION_SLOT_VANGUARD_0], // slot class='vanguard'
        [], // hero_classes: liu_bei NOT in vanguard → mismatch
      ],
      () => assignHero(USER_ID, 1, 0, 12),
    );
    await expect(promise).rejects.toThrow('legion.class_mismatch');
    expect(insert).not.toHaveBeenCalled(); // no write before the mismatch throw
  });

  it('T3: a foreign userHeroId → NOT_OWNED, no write (V4 crafted id)', async () => {
    const { promise, insert } = runInTx(
      [
        [{ id: 1 }], // formation owned
        [FOREIGN_USER_HERO], // user_heroes FOR UPDATE — NOT the caller's (userId 999)
      ],
      () => assignHero(USER_ID, 1, 0, 99),
    );
    await expect(promise).rejects.toThrow('NOT_OWNED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('T4: the same copy in another slot of the legion → HERO_ALREADY_ASSIGNED (one copy = one slot)', async () => {
    const { promise, insert } = runInTx(
      [
        [{ id: 1 }], // formation owned
        [USER_HERO_CAO_CAO], // user_heroes FOR UPDATE (owned)
        [FORMATION_SLOT_VANGUARD_1], // slot 1 class='vanguard'
        [CAO_CAO], // catalog class='vanguard' (matches)
        [SLOT_ROW], // dup check: already assigned to slot 0
      ],
      () => assignHero(USER_ID, 1, 1, 11),
    );
    await expect(promise).rejects.toThrow('HERO_ALREADY_ASSIGNED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('assigning to a non-owned formation → NOT_OWNED', async () => {
    const { promise, insert } = runInTx(
      [[], // formation not owned → NOT_OWNED
      ],
      () => assignHero(USER_ID, 2, 0, 11),
    );
    await expect(promise).rejects.toThrow('NOT_OWNED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('WR-05: a DB unique-violation on user_legion_slots_unique_user_hero is surfaced as HERO_ALREADY_ASSIGNED (structural race guard)', async () => {
    // The pre-SELECT dup check passed (`[]` — the concurrent race: both
    // presses ran before either inserted), so the INSERT hits the new
    // (userId, userHeroId) unique index (migration 0022) and throws a Postgres
    // 23505 — which the service must surface as HERO_ALREADY_ASSIGNED, never
    // leak as a raw error.
    const mocks = makeTx([
      [{ id: 1 }], // 1. user_formations owned → formationId 1
      [USER_HERO_CAO_CAO], // 2. user_heroes FOR UPDATE (owned — userId 42)
      [FORMATION_SLOT_VANGUARD_1], // 3. formation_slots slot 1 class='vanguard'
      [CAO_CAO], // 4. heroes catalog class='vanguard' (matches)
      [], // 5. dup pre-check: none — both concurrent presses passed it
    ]);
    mocks.tx.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockRejectedValueOnce(
          Object.assign(new Error('duplicate key value violates unique constraint "user_legion_slots_unique_user_hero"'), {
            code: '23505',
            constraint: 'user_legion_slots_unique_user_hero',
          }),
        ),
      }),
    });
    (db.transaction as any).mockImplementation(async (cb: any) => cb(mocks.tx));
    await expect(assignHero(USER_ID, 1, 1, 11)).rejects.toThrow('HERO_ALREADY_ASSIGNED');
  });
});

// ── clearSlot ────────────────────────────────────────────────────────────────
describe('clearSlot — delete the slot row (empty allowed, bonus-only chemistry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes the slot row for the user', async () => {
    const { promise, tx } = runInTx([], () => clearSlot(USER_ID, 0));
    await expect(promise).resolves.toBeUndefined();
    expect(tx.delete).toHaveBeenCalled();
  });
});

// ── saveLegion ───────────────────────────────────────────────────────────────
describe('saveLegion — persist formation + slots atomically; one active legion per user (D-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T5: verifies ownership + upserts user_legions (unique userId) and returns the saved formation', async () => {
    // reads: [1] formation owned, [2] formation catalog
    const { promise, insert } = runInTx(
      [
        [{ id: 1 }],
        [STARTER_FORMATION],
      ],
      () => saveLegion(USER_ID, 1),
    );
    await expect(promise).resolves.toMatchObject({ formationId: 1 });

    // The user_legions upsert rides the unique userId (onConflictDoUpdate).
    expect(insert).toHaveBeenCalled();
  });

  it('saving a non-owned formation → NOT_OWNED', async () => {
    const { promise, insert } = runInTx(
      [[]],
      () => saveLegion(USER_ID, 2),
    );
    await expect(promise).rejects.toThrow('NOT_OWNED');
    expect(insert).not.toHaveBeenCalled();
  });
});

// ── grep-gated security invariants (source scan) ─────────────────────────────
describe('legionService security invariants (V4 / D-20 / D-19)', () => {
  it('has NO currency-deduction import (assembly is free, D-19)', () => {
    const src = readFileSync(new URL('../legionService.ts', import.meta.url), 'utf-8');
    expect(src).not.toMatch(/\bwallet\b/);
  });
});
