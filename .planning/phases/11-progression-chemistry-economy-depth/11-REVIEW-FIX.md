---
phase: 11-progression-chemistry-economy-depth
fixed_at: 2026-08-18T11:05:56Z
review_path: .planning/phases/11-progression-chemistry-economy-depth/11-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-18T11:05:56Z
**Source review:** .planning/phases/11-progression-chemistry-economy-depth/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (5 warnings + 1 info)
- Fixed: 6
- Skipped: 0

All 5 WARNING findings (WR-01..WR-05) are fixed in code and re-verified
(typecheck + targeted tests + full vitest suite + lint + check-i18n all green).
IN-01 was resolved by documenting the single-slot last-wins `attack_up`
behavior in the battle engine header (no behavior change, as recommended).

## Fixed Issues

### WR-01: Legion HP write-back corrupts per-copy HP state

**Files modified:** `src/services/sanguo/battleEngine.ts`, `src/services/sanguo/battleCheckInService.ts`, `src/services/sanguo/__tests__/battleEngine.test.ts`, `src/services/sanguo/__tests__/battleCheckInService.test.ts`
**Commit:** 15826b7
**Applied fix:** The battle engine now returns `LegionBattleResult.mainHpAfter`
(per-main remaining HP, aligned to the `mains` array order; sum ===
`playerHpAfter` — the D-05 formula and all Phase 10 replay tests are
untouched). `LegionBattleInput.mains` now carries an optional `userHeroId`
(the owning `userHeroes` copy id); `bakeMain` populates it from `main.uh.id`.
`writeLegionHpBack` was rewritten to write EACH copy's own remaining HP back
keyed by `userHeroes.id` via `main.userHeroId`, using
`result.mainHpAfter[i]` — never a per-survivor average. This preserves the
D-04 fainted state (a main that fell to 0 HP stays fainted) and does not clamp
full-HP survivors down. The broken `.uh.id` accessor on the flat merged select
is gone (no re-join by species `heroId` at all). New tests pin the per-main
write-back and that `mainHpAfter`'s sum equals `playerHpAfter`.

### WR-02: Boss capture tier roll consumes two RNG draws

**Files modified:** `src/services/sanguo/captureService.ts`, `src/services/sanguo/__tests__/captureService.test.ts`
**Commit:** a0e9a2a
**Applied fix:** `capturedTier` now uses a SINGLE partitioned draw `const t =
tierFn()`, mapping `t < 0.95 → 0`, `t < 0.9998 → 1`, else `→ 2` — exactly the
signed D-28 t0 95 / t1 4.98 / t2 0.02 distribution (previously a two-draw form
made t2 20× rarer at 0.001%). A new boundary-sweep test pins every band edge
and asserts `tierFn` is called exactly once.

### WR-03: Captured boss copy is inserted with 0 HP (fainted on arrival)

**Files modified:** `src/services/sanguo/captureService.ts`, `src/services/sanguo/__tests__/captureService.test.ts`
**Commit:** a0e9a2a
**Applied fix:** `wildRarity`'s boss branch now reads the real `heroes.hp` for
`encounter.heroId` (guarding the nullable column) and returns it as
`heroBaseHp` instead of the hardcoded `0` — so a successful boss capture
inserts the new copy at FULL base HP (the D-04 gate no longer blocks it). The
B-CAP-2 test now pins `hpCurrent: 300` on the captured boss.

### WR-04: Concurrent first-conversion can lose hồn ngọc (lost-update)

**Files modified:** `src/services/sanguo/soulgemService.ts`, `src/services/sanguo/__tests__/soulgemService.test.ts`
**Commit:** e68c42c
**Applied fix:** The pool write is now a single atomic
`INSERT ... ON CONFLICT (userId, heroId) DO UPDATE SET amount = amount + yield`
with `.returning({ amount })` — the additive expression serializes on the
`user_hero_soulgems_unique_user_hero` unique index, so concurrent
first-conversions BOTH add their yield (net 2, never 1). The stale pre-read
`FOR UPDATE` + absolute `set({ amount: balanceAfter })` path is removed, and
the ledger `balanceAfter` is reconciled from the upsert's `RETURNING` (the true
post-update amount), not the racy pre-read. A new test asserts the pool is
written via INSERT (additive upsert), never a standalone UPDATE, on
`user_hero_soulgems`.

### WR-05: Legion one-copy-one-slot guard is a non-locking TOCTOU

**Files modified:** `src/services/sanguo/legionService.ts`, `src/db/schema/userLegions.ts`, `migrations/0022_motionless_blade.sql`, `migrations/meta/_journal.json`, `migrations/meta/0022_snapshot.json`, `src/services/sanguo/__tests__/legionService.test.ts`
**Commit:** 7b6e7b6
**Applied fix:** Added the DB unique index
`user_legion_slots_unique_user_hero (userId, userHeroId)` (drizzle-kit generated
migration `0022_motionless_blade.sql`, following the established 0020/0021
generate pattern — not hand-written SQL), making one-copy-one-slot STRUCTURAL.
`assignHero` keeps the pre-SELECT dup check (fast path) and now catches a Postgres
unique-violation (SQLSTATE 23505) on that constraint from the concurrent
`INSERT ... ON CONFLICT (userId, slotOrder)` and surfaces it as
`HERO_ALREADY_ASSIGNED` instead of leaking a raw error. A new test simulates the
DB conflict and asserts `HERO_ALREADY_ASSIGNED`.

> **Operational note:** Postgres (`postgres://localhost:5432/tutien`) is
> reachable and the migration file was generated by drizzle-kit, but the
> migration has NOT been applied to the database during this review-fix run
> (`npm run migrate` is required to materialize the new unique index). This
> was deliberately not run to avoid mutating the shared dev database from the
> isolated worktree. No migration-verification pass is claimed.

### IN-01: Multiple `attack_up` supports overwrite the round's buff (documented)

**Files modified:** `src/services/sanguo/battleEngine.ts`
**Commit:** 15826b7
**Applied fix:** Documented in the `runLegionBattle` JSDoc that `attack_up` is
single-slot LAST-WINS within a round — `atkBuff` holds one `{mainIdx, mult}` and
each triggering `attack_up` support overwrites it, so only the last one's buff
applies (to the target it picked with its own rng draw). Every trigger still
consumes its rng roll (replay-faithful); compounding multiple attack_up buffs in
one round is not part of the signed D-18 contract. No behavior change.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification

All verification ran in the isolated review-fix worktree:
- `tsc --noEmit` — PASS (exit 0)
- `vitest run` (full suite) — PASS (43 files / 449 tests)
- Targeted suites (capture, soulgem, legion, battleEngine, battleCheckIn) — 104 tests pass
- `eslint src --max-warnings=0` — PASS (exit 0)
- `check-i18n` — PASS (all locale files in sync)

The DB migration was generated (drizzle-kit) but not applied — see the
WR-05 operational note.

---

_Fixed: 2026-08-18T11:05:56Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
