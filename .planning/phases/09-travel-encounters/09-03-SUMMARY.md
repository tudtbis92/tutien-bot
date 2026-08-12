---
phase: 09-travel-encounters
plan: 03
subsystem: game (sanguo travel)
tags: [discord.js, drizzle, travelCheckInService, FOR UPDATE, pull-model, encounter, ack-button, i18n, TDD]

# Dependency graph
requires:
  - phase: 09-01
    provides: travelService remaining-seconds model, D-07 schema (travel_seconds_remaining/encounter_active), /sanguo travel check-in dispatch stub, ack button customId (sanguo:travel:ack), StringSelectMenu + Start button, map_edges graph table
  - phase: 09-02
    provides: map_zones + hero_zone_rates schema (consumed by 09-04's roll, not by this plan's loop skeleton)
provides:
  - Pull-based check-in engine checkInTravel(userId, deps) — FOR UPDATE row lock, elapsed → per-counted-minute roll loop (stop-at-first D-24, hit-minute counted F4), encounterActive pause (D-25) returning the latest pending encounter_runs row (F2), overdue self-heal (D-05), arrival branch (D-28)
  - Injectable rollMinute seam + capCheck closure (D-13) — 09-04 lands the encounterService-backed default roll
  - buildSanguoArrivalEmbed (SEASON, inline D-23) + arrival.* i18n keys + minimal encounter.pending_* keys (3 locales)
  - Full /sanguo travel dispatch by mode (status/arrived/encounter/encounterPending) + handleAckPress resume handler wired to sanguo:travel:ack (was a deferUpdate stub)
affects: [09-04 (rollMinute default implementation + buildSanguoEncounterEmbed replaces the minimal line), 09-05 (migration/ROADMAP amendments), 10 (battle replaces the ack gate), 11, 12]

actuals:
  tokens: 9526    # chars/4 over the realized diff (38104 diff chars, 10 files, 736+/64-) — plan estimate 36000
  tasks: 2        # TDD: RED+GREEN per task (5 commits)
  commits: 5

tech-stack:
  added: []   # no new packages — the installed stack only (drizzle .for('update'), ioredis, i18next, discord.js builders)
  patterns:
    - "Injectable rollMinute seam: checkInTravel(userId, deps) — the loop skeleton is order-independent of 09-04's encounterService (default no-hit roll replaced in 09-04 Task 2)"
    - "Stop-at-first-hit loop with ack-pin updatedAt (D-24/F4/D-25): remaining decrements through the hit minute, updatedAt = row.updatedAt + k·60, encounterActive=true, immediate return"
    - "Single-writer rule: the check-in tx is the ONLY writer of remaining/updatedAt for traveling rows; ack handler and startTravel are the only other writers and set updatedAt deliberately"
    - "FOR UPDATE on the user's own travel row (no SKIP LOCKED) closes concurrent check-ins — second tx reads advanced updatedAt → elapsed ≈ 0"

key-files:
  created:
    - src/services/sanguo/travelCheckInService.ts — full pull check-in engine (replaces the 09-01 thin stub)
    - src/ui/embeds/buildSanguoArrivalEmbed.ts — inline arrival embed (SEASON, D-23)
    - src/services/sanguo/__tests__/travelCheckInService.test.ts — 8 unit tests (7 behaviors)
  modified:
    - src/commands/sanguo/travel.ts — full dispatch by mode + handleAckPress + minimal encounter renderer
    - src/events/interactionCreate.ts — sanguo:travel:ack branch → handleAckPress (was deferUpdate stub)
    - src/commands/sanguo/map.ts — handleAckPress re-export
    - src/commands/sanguo/__tests__/travel.test.ts — +4 dispatch/ack tests (12 total)
    - locales/{vi,en,zh-cn}/sanguo.json — arrival.* + encounter.pending_* keys

key-decisions:
  - "encounterService (09-04) had not landed at execution time — checkInTravel takes an injectable rollMinute (deps) with a no-hit default; the loop skeleton, arrival branch and ack pause ship order-independently; 09-04 Task 2 replaces the default with the encounterService-backed implementation"
  - "The ack-pin model (F4): a hit at minute k sets remaining = max(0, remaining − k·60) and updatedAt = row.updatedAt + k·60 — the hit minute IS counted; the loop returns immediately (at most one encounter per invocation, D-24)"
  - "Encounter display in this wave is a minimal pending-style embed (encounter.pending_title/pending_body) — the plan's Task 2 files list excluded locales but the zero-hardcoded gate needs localized strings; 09-04 finalizes with buildSanguoEncounterEmbed (hero name/emoji, boss copy)"
  - "Arrival embed returns { mode: 'arrived' } only — the command resolves the per-locale node name via getCurrentPosition/fetchNodeName (D-07 content-in-DB, locale-agnostic service)"

patterns-established:
  - "Pull check-in engine (D-22): /sanguo travel invocation computes elapsed → rolls → result, all inline (D-23), no cron/no pg-boss/no @discordjs/rest"
  - "RollMinuteFn injectable contract: ({ remainingAfter, totalSeconds, fromNodeId, toNodeId, capCheck }) → { hit, heroId?, zone?, boss? } — the 09-04 seam"
  - "F2 pending re-fetch: encounterActive early-return reads encounter_runs (user_id, status='pending') ORDER BY id DESC LIMIT 1 (encounter_runs_user_status_idx) and returns it as the encounter payload with remaining untouched"
  - "handleAckPress: FOR UPDATE tx clears encounterActive + sets updatedAt=now — the D-07 clock resumes from the press moment"

requirements-completed: [TQC-07]

coverage:
  - id: D1
    description: "checkInTravel pull engine: FOR UPDATE row lock (T-09-06), no-row/arrived → start, encounterActive → encounterPending with latest pending run + NO decrement (T-09-07/F2), elapsed → per-minute roll loop with stop-at-first-hit + hit-minute counting (D-24/F4), overdue self-heal clamped to 0 → arrived (T-09-09/D-05), arrival/status branches, injectable rollMinute + capCheck, zero wallet references (D-01)"
    requirement: TQC-07
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T1 no row or status=arrived → start"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T2 encounterActive → encounterPending with latest pending run, NO time counted"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T3 overdue journey self-heals to arrived — remaining clamped to 0"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T4 remaining hits 0 after failed rolls → arrived; NO rolls past arrival"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T5 hit at minute k pins updatedAt, sets encounterActive, STOPS the loop"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T6 no hits → remaining decremented, updatedAt=now, status"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T7 row SELECT uses .for('update') and tx is the only writer"
        status: pass
      - kind: other
        ref: "grep deductBalance|services/wallet in travelCheckInService.ts == 0 (D-01)"
        status: pass
      - kind: other
        ref: "npm run check-i18n == 0; npm run typecheck == 0; full vitest suite 171/171"
        status: pass
    human_judgment: false
  - id: D2
    description: "/sanguo travel full dispatch by mode (status → travel reply embed, arrived → arrival embed + re-opened destination menu, encounter/encounterPending → encounter embed + ack button) + handleAckPress resume (FOR UPDATE clears encounterActive, sets updatedAt=now) wired through interactionCreate and map.ts, users.id identity, no char.id"
    requirement: TQC-07
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#execute with an active journey — arrived mode replies the arrival embed + re-opens the destination menu"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#execute — encounter mode replies the encounter embed + ack button"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#execute — encounterPending mode replies pending embed (boss GOLD), NO re-roll"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#ack press clears encounterActive + sets updatedAt=now inside a FOR UPDATE tx"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#routes sanguo:travel:* component branches BEFORE the chat-input gate"
        status: pass
      - kind: other
        ref: "grep 'checkInTravel(char.id' in travel.ts == 0; checkInTravel called with users.id (42)"
        status: pass
      - kind: other
        ref: "npm run check-i18n == 0; npm run typecheck == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-Discord-client adequacy of the inline arrival/encounter embeds + ack button resume flow (embed visual layout, button interaction in a live guild)"
    verification: []
    human_judgment: true
    rationale: "Unit tests assert builder shapes (titles, colors, customIds, component rows) but cannot render the Discord client; visual/interaction adequacy of the arrival embed + minimal encounter embed + ack button needs a human sign-off in a live guild"

# Metrics
duration: 22min
completed: 2026-08-12
status: complete
---

# Phase 9 Plan 3: Pull-Based Travel Check-In Engine (TQC-07) Summary

**`/sanguo travel` now resolves active journeys end-to-end: FOR UPDATE row lock → elapsed → per-counted-minute encounter roll loop (stop-at-first-hit, hit-minute counted) → encounter pause via the ack button (D-25) or inline arrival — no cron, no push, results inline (D-23)**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-12T09:16:52Z
- **Completed:** 2026-08-12T09:38:00Z
- **Tasks:** 2 (TDD — RED + GREEN per task)
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- **Pull check-in engine (`checkInTravel(userId, deps)`):** one `FOR UPDATE` transaction reads the travel row (single writer — concurrent check-ins serialize, T-09-06), returns `{mode:'start'}` when idle/arrived, and for an active journey computes elapsed → `countedMinutes` → rolls 1× per counted minute via an **injectable `rollMinute` seam** (09-04's `encounterService` has not landed — the default is a no-hit roll the next plan replaces). The loop stops at the first hit (D-24), counts the hit minute (F4, D-28 amended), pins `updatedAt = row.updatedAt + k·60` and sets `encounterActive=true` — the ack-pin clock model.
- **Ack pause (D-25/F2):** `encounterActive=true` early-returns `{mode:'encounterPending'}` with the latest pending `encounter_runs` row (`status='pending' ORDER BY id DESC LIMIT 1` via the 09-01 `encounter_runs_user_status_idx`) mapped to `{heroId, zone, boss}` — **no time counted, no decrement**. The `sanguo:travel:ack` button branch (was a deferUpdate no-op) now calls `handleAckPress`, which clears the flag + sets `updatedAt=now` inside a FOR UPDATE tx — the D-07 clock resumes from the press.
- **Arrival (D-05/D-28):** when remaining reaches 0 the row is set `status='arrived'` inside the same tx; overdue journeys self-heal structurally (elapsed computed at check-in, clamped `Math.max(0, ...)` → arrive late, never stuck). Arrival is a branch of the check-in — no separate job (D-22). The command re-opens the destination select menu at the arrived node (D-08/D-26).
- **Full inline dispatch (D-23):** `/sanguo travel` routes `status` → travel reply embed, `arrived` → `buildSanguoArrivalEmbed` + next-hop picker, `encounter`/`encounterPending` → encounter embed (SEASON; GOLD boss variant) + ack button. All calls pass `user.id` (users.id) — `checkInTravel(char.id` grep == 0.
- **i18n:** `arrival.*` + minimal `encounter.pending_*` keys in vi/en/zh-cn — `check-i18n` green. **No wallet reference** anywhere in the check-in (D-01 grep == 0). No `sanguo-tick-*`, no `schedule(`, no `@discordjs/rest` in this plan's files.

## Task Commits

Each task followed TDD (RED test commit → GREEN implementation commit):

1. **Task 1 RED: check-in engine tests** — `0e96e54` (test)
2. **Task 1 GREEN: engine + arrival embed + i18n** — `ac05d40` (feat)
3. **Task 2 RED: dispatch-mode + ack command tests** — `61e45ac` (test)
4. **Task 2 GREEN: full dispatch + handleAckPress + router wiring** — `88d57c2` (feat)
5. **Task 2 GREEN refinement: mock param types (typecheck)** — `b3acd9d` (test)

**Plan metadata:** committed separately after SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/services/sanguo/travelCheckInService.ts` — full pull engine (replaces the 09-01 thin stub): FOR UPDATE, F2 pending re-fetch, per-minute roll loop, arrival/status branches, `RollMinuteFn` seam + `capCheck` closure
- `src/ui/embeds/buildSanguoArrivalEmbed.ts` — inline arrival embed (COLORS.SEASON + embedFooter + setTimestamp, D-23)
- `src/services/sanguo/__tests__/travelCheckInService.test.ts` — 8 unit tests (7 behaviors: start/encounterPending/overdue/arrival/hit-pin/status/FOR-UPDATE)
- `src/commands/sanguo/travel.ts` — `dispatchCheckIn` switch by mode + `handleAckPress` + `buildMinimalEncounterEmbed` (temporary renderer)
- `src/events/interactionCreate.ts` — `sanguo:travel:ack` branch → `cmd.handleAckPress` (SanguoComponentHandlers extended)
- `src/commands/sanguo/map.ts` — `handleAckPress` added to the handler re-export line
- `src/commands/sanguo/__tests__/travel.test.ts` — +4 tests (12 total): arrived re-opens menu, encounter embed + ack, encounterPending GOLD no-re-roll, ack FOR UPDATE tx
- `locales/{vi,en,zh-cn}/sanguo.json` — `arrival.title/body/cta` + `encounter.pending_title/pending_body`

## Decisions Made

- **Injectability over import (wave ordering):** `encounterService` (09-04) had not landed when this plan executed, so `checkInTravel(userId, deps)` takes a `rollMinute` callback with a `{hit:false}` default. The loop skeleton, arrival branch, ack pause and F2 re-fetch are all order-independent; 09-04 Task 2 replaces the default with the real cap-first/position-blend/boss-roll implementation. This is the plan's prescribed seam ("if 09-04 has not landed yet, use injectable roll callbacks").
- **Ack-pin model confirmed (F4):** the hit minute IS counted — `remaining = max(0, remaining − k·60)` and `updatedAt = row.updatedAt + k·60` on a hit; the loop returns immediately. Each encounter credits exactly one counted minute, matching "no further minutes rolled after a hit".
- **Locale-agnostic arrival result:** `{mode:'arrived'}` carries no name — the command resolves the per-locale node name via `getCurrentPosition`/`fetchNodeName` (D-07 content-in-DB), keeping the service free of locale coupling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Minimal encounter display strings absent from the locale spec**
- **Found during:** Task 2 (encounter/encounterPending dispatch rendering)
- **Issue:** The plan's Task 2 action calls for "a minimal inline encounter line" (09-04's `buildSanguoEncounterEmbed` has not landed) but the Task 2 `<files>` list excludes locale files and no encounter display key was planned for 09-03 — the zero-hardcoded-strings gate (check-i18n) forbids an inline literal.
- **Fix:** Added `encounter.pending_title`/`encounter.pending_body` to all 3 locales (identical structure) in Task 1's locale edit, and rendered both `encounter` and `encounterPending` modes through a small `buildMinimalEncounterEmbed` (SEASON; GOLD when `boss`) + ack button. 09-04's Task 2 finalizes with `buildSanguoEncounterEmbed` (hero name/emoji resolution + boss copy).
- **Files modified:** locales/{vi,en,zh-cn}/sanguo.json, src/commands/sanguo/travel.ts
- **Verification:** check-i18n green; encounter/encounterPending dispatch tests assert embed title, SEASON/GOLD color and ack customId
- **Committed in:** ac05d40 (locales) + 88d57c2 (dispatch)

**2. [Rule 3 - Blocking] Test mock typecheck fixes not staged with the Task 1 GREEN commit**
- **Found during:** Task 2 verification (typecheck on committed state)
- **Issue:** The typecheck-driven mock param declarations (`vi.fn((_v: any) => ...)`, `(_ctx: any) => ...`) were applied in the working tree during Task 1 GREEN but the GREEN `git add` list omitted the test file — the committed RED test file would fail typecheck (TS2493 on `mock.calls[0][0]` tuples).
- **Fix:** Follow-up `test` commit staging the 4-line mock declaration fix.
- **Files modified:** src/services/sanguo/__tests__/travelCheckInService.test.ts
- **Verification:** `npm run typecheck` clean on the committed HEAD; full suite 171/171
- **Committed in:** b3acd9d

**3. [Rule 1 - Bug] `buildAckRow` referenced `t` without a parameter**
- **Found during:** Task 2 GREEN (travel.ts rewrite)
- **Issue:** The first draft of the ack component row helper used module-scope `t` that does not exist (i18n `t` is passed per-handler) — would be a runtime ReferenceError.
- **Fix:** `buildAckRow(t: TFunction)` takes the translator explicitly; call site passes the handler's `t`.
- **Files modified:** src/commands/sanguo/travel.ts
- **Verification:** typecheck green; ack dispatch test asserts the ack button customId renders
- **Committed in:** 88d57c2

**4. [Rule 3 - Blocking] Duplicate sanguoTravelButtons import lines during travel.ts edits**
- **Found during:** Task 2 GREEN (import consolidation)
- **Issue:** Sequential edits produced two `START_BTN_ID/buildStartButton/buildAckButton` import lines — a duplicate-identifier compile error.
- **Fix:** Removed the duplicate import; single consolidated line retained.
- **Files modified:** src/commands/sanguo/travel.ts
- **Verification:** typecheck green
- **Committed in:** 88d57c2

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for the i18n gate, committed-state typecheck, and compile correctness. No scope creep — no new packages, no architecture changes.

## Known Stubs

| File | Line | Stub | Resolved by |
|------|------|------|-------------|
| src/services/sanguo/travelCheckInService.ts | 55 | `defaultRollMinute` returns `{hit:false}` — no encounters surface until 09-04 lands the roll | Plan 09-04 Task 2 (encounterService-backed rollMinute: cap-first ZSET, position blend, boss sub-roll, encounter_runs record) |
| src/commands/sanguo/travel.ts | 85 | `buildMinimalEncounterEmbed` pending-style line (no hero name/emoji resolution) | Plan 09-04 Task 2 (buildSanguoEncounterEmbed: hero name/emoji, boss copy) |

Both are intentional wiring seams per the plan ("else a minimal inline encounter line") and do NOT block this plan's goal — the check-in engine, ack pause and arrival all resolve correctly; the ROLL CONTENT is 09-04's deliverable. Recorded in `.planning/WINDOWS.md` (entries 3-4 open; the two 09-01 stubs marked fixed).

## Issues Encountered

- **09-04 ordering:** `encounterService.ts` and `buildSanguoEncounterEmbed.ts` had not landed at execution time — resolved by the plan's prescribed injectable `rollMinute` seam + minimal embed; the 09-04 plan explicitly edits both seams (its Task 2 replaces them).
- **Pre-commit hook (lint-staged):** the hook runs `eslint --max-warnings=0` on staged `src/**/*.ts` — the RED test commit was initially blocked by two unused destructured mock vars; fixed and re-committed (no `--no-verify` used).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 09-04:** the `RollMinuteFn` seam (`{ remainingAfter, totalSeconds, fromNodeId, toNodeId, capCheck } → { hit, heroId?, zone?, boss? }`), the F2 pending re-fetch contract, and the ack wiring are all in place — 09-04 implements the default roll with `encounterService` (cap-first, position blend, boss sub-roll, record) and finalizes the encounter embed.
- **Ready for 09-05:** schema + migrations unchanged by this plan (no schema drift); ROADMAP SC2/SC3 amendments + the D-18 economy re-sign remain scheduled there.
- **Blockers/concerns:** none. Journeys resolve (or surface encounters) on `/sanguo travel`; the D-07/D-25 clock pauses correctly via the ack button; results are inline — no cron, no pg-boss registration (D-22), no REST DM (D-23).

---

*Phase: 09-travel-encounters*
*Completed: 2026-08-12*
