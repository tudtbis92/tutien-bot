---
type: quick
slug: p10-phase-10-plan-fixes
date: 2026-08-13
status: complete
description: Apply P10 plan-review fixes (starter heroIds, crypto seed, bigint mode, abandoned-capture routing, wave dependency, lock scope, hero-lookup ambiguity, economy re-sign precision) to the 10-0x PLAN.md files.
---

# Phase 10 Plan Fixes (P10-review F1..F8)

## Context

A review of the 7 Phase 10 plans (10-01..10-07) verified against the live codebase +
context7/tavily research found 3 blocking bugs, 2 flow gaps, and 3 minor robustness
notes. This task applies the fixes to the PLAN.md files so the phase is execution-ready.

## Fixes

| # | File | Fix |
|---|------|-----|
| F1 | 10-04-PLAN.md | Starter set-2 heroIds `zhang_jue`/`dong_zhuo` do not exist. Real keys (verified in `sanguo-classifications.json`): **`truong_giac`** (Trương Giác) and **`dong_trac`** (Đổng Trác). |
| F2 | 10-07-PLAN.md | Same starter fix in `STARTER_SET_2` + tests. |
| F3 | 10-02-PLAN.md | `seed: bigint('seed')` → `bigint('seed', { mode: 'number' })` — drizzle requires an explicit mode; mode 'number' keeps the replay seed a JS number for `runBattle(seed: number)`. |
| F4 | 10-06-PLAN.md | Abandoned-capture routing: `encounterPending` re-fetch renders the CAPTURE VIEW when a completed + player-won `sanguo_battles` row exists for the pending encounter; else fight/skip. |
| F5 | 10-05-PLAN.md | `crypto.randomInt` → `crypto.randomInt(2 ** 48)` (node requires `max`; bound keeps a safe JS integer). |
| F6 | 10-05-PLAN.md | `depends_on` += `10-04` (base-stats content seed must precede DB-gated battle/capture verification). |
| F7 | 10-05-PLAN.md | Lock `user_sanguo_state` with `FOR UPDATE` in `startEncounterBattle` (single-writer with the 10-07 companion switch). |
| F8 | 10-03-PLAN.md | Re-sign note: `E[outflow]` must use EFFECTIVE chances (base × hpFactor × tierMult) — hpFactor ≈ 1/3 at full HP; gross < ~416/hr must hold under realistic tier usage. |
| F9 | 10-07-PLAN.md | `/sanguo hero` lookup disambiguation when the user owns duplicate rows of one heroId: prefer the active companion, else earliest copy. |

## Files Changed

- `.planning/phases/10-battle-capture/10-02-PLAN.md`
- `.planning/phases/10-battle-capture/10-03-PLAN.md`
- `.planning/phases/10-battle-capture/10-04-PLAN.md`
- `.planning/phases/10-battle-capture/10-05-PLAN.md`
- `.planning/phases/10-battle-capture/10-06-PLAN.md`
- `.planning/phases/10-battle-capture/10-07-PLAN.md`

## Verification

- Grep each fixed token (`truong_giac`, `dong_trac`, `mode: 'number'`,
  `crypto.randomInt(2 ** 48)`, `- 10-04`) present in the target file; old tokens
  (`zhang_jue`, `dong_zhuo`, `bigint('seed')` without mode) absent.
- No PLAN structure changes beyond the intended bullets/columns.

## Notes

- No commit made (not requested). STATE.md Quick Tasks table updated with this entry.
