---
phase: 11-progression-chemistry-economy-depth
reviewed: 2026-08-18T10:32:13Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/services/sanguo/soulgemService.ts
  - src/services/sanguo/shopService.ts
  - src/services/sanguo/bagService.ts
  - src/services/sanguo/dropService.ts
  - src/services/sanguo/chemistryService.ts
  - src/services/sanguo/legionService.ts
  - src/services/sanguo/battleEngine.ts
  - src/services/sanguo/battleCheckInService.ts
  - src/services/sanguo/captureService.ts
  - src/constants/sanguoProgression.ts
  - src/constants/sanguoChemistry.ts
  - src/commands/sanguo/shop.ts
  - src/commands/sanguo/legion.ts
  - src/events/interactionCreate.ts
  - src/db/schema/userHeroes.ts
  - src/db/schema/userHeroSoulgems.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 11: Code Review Report

**Reviewed:** 2026-08-18T10:32:13Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** clean

> **Fix status (2026-08-18):** All 5 WARNING findings (WR-01..WR-05) are
> resolved and re-verified (typecheck + targeted tests + full suite + lint +
> check-i18n green). IN-01 was resolved by documenting the single-slot
> last-wins `attack_up` behavior in the battle engine header (no behavior
> change). See `11-REVIEW-FIX.md`. The one outstanding operational item is
> applying migration `0022_motionless_blade.sql` (`npm run migrate`) to
> materialize the new `user_legion_slots_unique_user_hero` unique index.

## Summary

Adversarial review of the Phase 11 (progression / chemistry / economy depth) source changes at `standard` depth. The phase is a large, well-structured vertical slice: hidden balance constants (sanguoProgression/sanguoChemistry), hồn ngọc single-writer progression transactions (soulgemService), wallet-sink shop/formation purchases (shopService), soft-lock heal recovery (bagService), guaranteed boss drops (dropService), the pure chemistry linker (chemistryService), legion ownership-gated assembly (legionService), the extended battle engine (battleEngine + runLegionBattle), and the boss forced-legion routing + boss capture (battleCheckInService + captureService).

Overall the code adheres tightly to the documented patterns: FOR UPDATE single-writer transactions, WHERE-guard deductions, server-side anti-tamper price resolution, crypto-only player-facing RNG, i18n zero-hardcoded strings, and the D-12 never-render rule (verified: the legion embed and command render only tier label + link count, never chemistry points/buff%). No hardcoded secrets, eval, or debug artifacts found anywhere in the reviewed files.

Five WARNING-level correctness defects were identified — concentrated in the boss-integration and currency-race boundaries. Two of these (WR-02 boss capture tier distribution skew and WR-03 captured-boss-spawns-fainted) affect the phase's headline boss-capture feature and should be treated as high priority. No CRITICAL (security / currency-loss / data-loss) issues were found; the currency double-spend primitives themselves are sound.

## Warnings

### WR-01: Legion HP write-back corrupts per-copy HP state

**File:** `src/services/sanguo/battleCheckInService.ts:449-476`
**Issue:** `writeLegionHpBack` persists main HP after a boss battle by:
1. Re-querying `userHeroes` with `where(eq(heroes.heroId, heroId)).limit(1)` — but `user_heroes` deliberately has **no** unique `(userId, heroId)` index (duplicates are the D-03 conversion fuel, per `userHeroes.ts:10`). When the user owns multiple copies of a species — and/or when two legion mains are copies of the same species — each loop iteration resolves the *same arbitrary* copy and writes to it, corrupting the real main copies' HP.
2. Writing `share = Math.round(playerHpAfter / mains.length)` to **every** main. This both **resurrects fainted mains** (a main that fell to 0 HP gets positive `share` written back) and **damages survivors** (a full-HP main is clamped down to the average). The function's own comment describes the split as "for simplicity," but it is not HP-faithful and feeds the capture HP snapshot (WR-03 sizing).
3. Reading the row id via `(uh as unknown as { uh: { id: number } }).uh.id` on a bare `.select()` (no explicit column shape) — inconsistent with the explicit `{ uh, h }` shape used in `buildLegionInput` — so `.uh` may be `undefined` on the flat merged row, throwing inside the transaction.
The engine returns only the summed `playerHpAfter`; the per-main state is not recoverable from the current `BattleResult`.

**Fix:** Have the engine (or the caller) return per-main remaining HP aligned to the specific `userHeroes` copy id, and write each copy's own HP back keyed by `userHeroes.id` (not the species `heroId`). At minimum, carry `userHeroId` through `LegionBattleInput.mains` and write `hpCurrent` per copy id.

### WR-02: Boss capture tier roll consumes two RNG draws — t2 is 20× rarer than the signed contract

**File:** `src/services/sanguo/captureService.ts:236`
**Issue:** `const capturedTier = isBoss ? (tierFn() < 0.95 ? 0 : tierFn() < 0.9998 ? 1 : 2) : 0;` calls `tierFn()` **twice** when the first draw is ≥ 0.95. The signed D-28 contract is a single partitioned draw: t0 95% / t1 4.98% / t2 0.02%. With two independent draws the effective distribution becomes t0 95%, t1 ≈ 4.999% (`0.05 × 0.9998`), t2 = **0.001%** (`0.05 × 0.0002`) — **20× rarer than the signed 0.02%**. The distribution skew silently changes the intended economy and the deterministic boundary tests cannot pin the signed rates.

**Fix:** Partition a single draw into the three bands:
```typescript
const t = tierFn();
const capturedTier = isBoss ? (t < 0.95 ? 0 : t < 0.9998 ? 1 : 2) : 0;
```

### WR-03: Captured boss copy is inserted with 0 HP (fainted on arrival)

**File:** `src/services/sanguo/captureService.ts:113-117, 254`
**Issue:** For the boss branch `wildRarity` returns `{ rarity: 5, heroBaseHp: 0 }`, and the capture insert uses `hpCurrent: heroBaseHp` unconditionally. A successful boss capture therefore inserts a `user_heroes` row with `hp_current = 0` — the freshly captured zone-general is **fainted on arrival** (and, per the D-04 gate, cannot be used until healed). For wild captures `heroBaseHp` is the real hero's base HP (full HP — correct), so only the boss path is affected. The boss's true base HP should be returned for the insert.

**Fix:** Return the real boss base HP from `wildRarity`'s boss branch (read `heroes.hp` for `encounter.heroId`), e.g. `return { rarity: 5, heroBaseHp: general.hp }`, instead of a hardcoded `0`.

### WR-04: Concurrent first-conversion of the same species can lose hồn ngọc (lost-update)

**File:** `src/services/sanguo/soulgemService.ts:238-258`
**Issue:** In `convertDuplicate` the pool upsert reads `userHeroSoulgems` with `FOR UPDATE`; when the (user, heroId) pool row does not yet exist (first conversion of a species), `FOR UPDATE` locks nothing. Two concurrent conversions of copies of the same species both read `current = 0`, both compute `balanceAfter = yieldAmount`, and the `onConflictDoUpdate` writes the **absolute** `amount: balanceAfter` — so one conversion's yield is silently lost (net pool = 1 hồn ngọc instead of 2 for two simultaneous first conversions). This contradicts the file's "single-writer, no double-spend" contract. Note the `FOR UPDATE` + re-read *does* protect the existing-row case; only the missing-row first-insert path races.

**Fix:** Make the upsert additive server-side regardless of the pre-read, e.g.:
```typescript
.onConflictDoUpdate({
  target: [userHeroSoulgems.userId, userHeroSoulgems.heroId],
  set: { amount: sql`${userHeroSoulgems.amount} + ${yieldAmount}`, updatedAt: new Date() },
});
```
and drop the separate `balanceAfter` computation for the ledger, or serialize on the uniqueness by always running `INSERT ... ON CONFLICT DO UPDATE SET amount = amount + yield`.

### WR-05: Legion one-copy-one-slot guard is a non-locking TOCTOU (no DB unique on userHeroId)

**File:** `src/services/sanguo/legionService.ts:239-253`
**Issue:** `assignHero`'s `HERO_ALREADY_ASSIGNED` dup check is a plain (non-`FOR UPDATE`) SELECT against `userLegionSlots.userHeroId`, and there is **no DB unique constraint** on `userLegionSlots.userHeroId`. The upsert targets `(userId, slotOrder)`. Two concurrent `assignHero` presses placing the same hero into two different slots can both pass the dup check and insert/update two distinct slot rows — violating the one-copy-one-slot invariant (D-17). Discord interaction handling does not guarantee per-user serialization.

**Fix:** Add a DB constraint to make the invariant structural — e.g. a partial/global unique index on `userLegionSlots(userId, userHeroId)` — and handle the resulting conflict as `HERO_ALREADY_ASSIGNED` (mirroring the P0-1 `onConflictDoNothing` pattern used elsewhere).

## Info

### IN-01: Multiple `attack_up` supports overwrite the round's buff (only the last applies)

**File:** `src/services/sanguo/battleEngine.ts:564-583`
**Issue:** In `runLegionBattle`, `atkBuff` is a single slot overwritten by each triggering `attack_up` support in the round loop — if two supports both trigger `attack_up`, only the last one's buff applies to the target it picked (the first buff is silently discarded). This may be intended, but it is undocumented behaviour and diverges from the raw "every successful support trigger applies its effect" reading of the D-18 block. Each `attack_up` trigger still consumes its rng roll (replay-faithful), so only the applied-effect count differs.

**Fix:** Either document that attack_up is single-slot last-wins, or apply each successful `attack_up` as intended (e.g. apply to its own target / compound).

---

_Reviewed: 2026-08-18T10:32:13Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
