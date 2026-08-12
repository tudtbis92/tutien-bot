---
phase: 09-travel-encounters
plan: 01
subsystem: game (sanguo travel)
tags: [discord.js, drizzle, travelService, StringSelectMenu, ButtonBuilder, i18n, playerTravelState, mapEdges, TDD]

# Dependency graph
requires:
  - phase: 08-foundation-economy-budget-content-infrastructure
    provides: map_nodes/map_zones content-in-DB schema, /sanguo map command, player_travel_state + encounter_runs placeholders, heroEmoji() registry, fetchCommandContext, i18n sanguo namespace
provides:
  - Pure time/state travelService (getCurrentPosition/getAdjacentNodes/startTravel) keyed on users.id with FOR UPDATE double-start lock and server-side NO_ROUTE re-validation
  - D-07 remaining-seconds travel schema (travel_seconds_remaining + encounter_active; absolute-timestamp + money columns dropped), D-14 encounter_type boss flag + F2 index, D-17 map_edges graph table
  - /sanguo travel subcommand: destination StringSelectMenu + Start button (first message components in the codebase), check-in dispatch stub (D-22), inline travel reply embed, travel.* i18n keys (3 locales)
affects: [09-02 (mapZones/heroZoneRates + index.ts re-export), 09-03 (full check-in engine + ack handler replace the stubs), 09-04 (encounter roll math), 09-05 (migration + ROADMAP amendments), 10 (battle replaces ack), 11, 12]

actuals:
  tokens: 19954    # chars/4 over the 16 files actually changed (79819 chars) — plan estimate 56000
  tasks: 2         # tasks executed (checkpoint:decision D-01/D-03 was pre-approved by the orchestrator)
  commits: 5

tech-stack:
  added: []   # no new packages — Phase 9 runs entirely on the installed stack (discord.js 14.27.0 builders, drizzle 0.45.2 .for('update'))
  patterns:
    - "First StringSelectMenu + ActionRow component pattern in the codebase (buildDestinationMenu + buildStartButton in one ActionRow)"
    - "F1 component-contract: selected destination rides in the Start button customId suffix (sanguo:travel:start:{code}) — a ButtonInteraction carries no select values"
    - "F3 concurrency: startTravel reads the travel row with .for('update') inside one transaction — the second concurrent Start press sees status='traveling' → ALREADY_TRAVELING"
    - "Pitfall 4 defense-in-depth: select-menu/button values are advisory — startTravel re-validates adjacency against map_edges (NO_ROUTE) before any write"
    - "In-place row UPDATE on subsequent journeys (userId.unique() = one row per user forever) — the row doubles as last-arrived-position + active-journey record"

key-files:
  created:
    - src/db/schema/mapEdges.ts — D-17 undirected edge table (node_a_id, node_b_id, travel_seconds, unique pair index)
    - src/services/sanguo/travelService.ts — pure time/state service: START_NODE, getCurrentPosition, getAdjacentNodes, startTravel
    - src/services/sanguo/travelCheckInService.ts — thin check-in stub (full engine in 09-03)
    - src/commands/sanguo/travel.ts — travelSubcommand + execute + handleDestinationSelect + handleStartPress
    - src/ui/components/sanguoTravelDestinationMenu.ts — DEST_MENU_ID + buildDestinationMenu (≤25, value = node code)
    - src/ui/components/sanguoTravelButtons.ts — START_BTN_ID/ACK_BTN_ID + buildStartButton(t, disabled, code?) + buildAckButton
    - src/ui/embeds/buildSanguoTravelReplyEmbed.ts — SEASON embed + humanizeEta (i18next plurals)
    - src/services/sanguo/__tests__/travelService.test.ts — 11 unit tests (6 behaviors)
    - src/commands/sanguo/__tests__/travel.test.ts — 8 unit tests (7 behaviors)
  modified:
    - src/db/schema/playerTravelState.ts — D-07 remaining-seconds model (arrive_at/cost dropped per D-01)
    - src/db/schema/encounterRuns.ts — encounter_type varchar(20) default 'hero' (D-14) + F2 user_status index
    - src/commands/sanguo/map.ts — .addSubcommand(travelSubcommand) + travel dispatch + handler re-exports
    - src/events/interactionCreate.ts — isStringSelectMenu DEST_MENU_ID branch + start/ack button branches before the chat-input gate
    - locales/{vi,en,zh-cn}/sanguo.json — cmd.travel.description + travel.* keys

key-decisions:
  - "Executed per D-01/D-03 (pre-approved checkpoint): travel is time-only (no wallet import anywhere in travelService — grep gate == 0) and status has no 'cancelled' value; the stale REQUIREMENTS.md TQC-06 paid-travel text is treated as invalidated"
  - "Embed field layout: field NAME = short label key (destination_label/eta_label/from_label), field VALUE = the plan's full 'Điểm đến: **{{node}}**' strings — honors the UI-SPEC copy contract and the plan's key list"
  - "Start-mode picker embed (current position + hint) required two extra i18n keys (pick_title/pick_body) not listed in the plan — the zero-hardcoded-strings gate leaves no room for an inline literal"
  - "All command-layer db reads standardized on .limit(1) so the test mock terminal chain (where → limit) is uniform — no behavior change"
  - "Tracer feedback gate satisfied by re-running the tracer <verify> end-to-end (11/11 unit tests + typecheck + D-01 grep) before expansion, per the orchestrator's pre-authorization (context_notes)"

patterns-established:
  - "StringSelectMenu + Start button confirm gate (D-26): menu lists adjacent nodes value=node code, Start disabled until selection, code rides in the Start customId"
  - "FOR UPDATE on the user's own travel row (single writer, no SKIP LOCKED) — closed double-start race (F3)"
  - "Server-side adjacency re-validation inside the transaction (NO_ROUTE before any write) — select/button values never authoritative (T-09-01/02/05)"
  - "users.id (users.id) identity rule: travelService and all command handlers key on the users row — never char.id"

requirements-completed: [TQC-06]

coverage:
  - id: D1
    description: "travelService journey-start domain: getCurrentPosition (START_NODE default / arrived / in-flight), getAdjacentNodes (edges+node join, travelSeconds ASC, cap 25), startTravel (code→id resolve, FOR UPDATE, ALREADY_TRAVELING, NO_ROUTE, INSERT-first/in-place-UPDATE), zero wallet/deduction references (D-01)"
    requirement: TQC-06
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelService.test.ts#startTravel INSERTs on the first journey"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelService.test.ts#startTravel UPDATEs the existing row in place"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelService.test.ts#throws ALREADY_TRAVELING when the row status is traveling"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelService.test.ts#reads the current row with .for('update')"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelService.test.ts#throws NO_ROUTE when the destination is not adjacent"
        status: pass
      - kind: other
        ref: "grep -cE 'deductBalance|services/wallet' src/services/sanguo/travelService.ts == 0 (D-01 gate)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/sanguo travel command interaction contract: start mode select menu + disabled Start, destination select enables Start with code in customId (F1), Start press calls startTravel(user.id, code) and replies the SEASON embed with NO money field, ALREADY_TRAVELING → check-in path, NO_ROUTE → DANGER embed, zero-adjacent renders no menu (F6), router branches before the chat-input gate, users.id identity, 3-locale i18n sync"
    requirement: TQC-06
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#execute with NO active journey replies the destination select menu"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#selecting a destination updates the reply"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#pressing Start calls startTravel(user.id, code-from-customId)"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#ALREADY_TRAVELING takes the check-in path"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#NO_ROUTE replies the no_route DANGER embed"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#routes sanguo:travel:* component branches BEFORE the chat-input gate"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#passes user.id to every travelService call"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#zero adjacent nodes renders NO select menu"
        status: pass
      - kind: other
        ref: "npm run check-i18n == 0; npm run typecheck == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-Discord-client adequacy of the first message components in the codebase (StringSelectMenu rendering, button enable/disable transitions, embed visual layout in a live client)"
    verification: []
    human_judgment: true
    rationale: "Unit tests assert builder shapes (customId, options, disabled, embed fields/colors) but cannot render the Discord client; visual/interaction adequacy of the select menu + buttons + embeds needs a human sign-off in a live guild"

# Metrics
duration: 18min
completed: 2026-08-12
status: complete
---

# Phase 9 Plan 1: Travel Journey-Start Slice (tracer) Summary

**`/sanguo travel` journey-start path proven end-to-end: destination StringSelectMenu + Start button (D-26 confirm gate) → interaction router → pure time/state travelService (D-01, zero wallet) → D-07/D-17 schema → inline SEASON reply embed with no money field**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-12T08:17:03Z
- **Completed:** 2026-08-12T08:35:12Z
- **Tasks:** 2 (checkpoint:decision D-01/D-03 pre-approved by the orchestrator — not re-presented)
- **Files modified:** 16 (9 created, 7 modified)

## Accomplishments

- **travelService (TQC-06, pure time/state):** `getCurrentPosition` (START_NODE 'luoyang' default for first-ever journey A6 / arrived→toNodeId / traveling→fromNodeId), `getAdjacentNodes` (edges joined to node content, travelSeconds ASC, cap 25), `startTravel(userId, toNodeCode)` in ONE transaction: code→id resolve, `.for('update')` row lock (F3 double-start race), `ALREADY_TRAVELING` (D-09), server-side adjacency re-validation → `NO_ROUTE` (Pitfall 4 / T-09-01), INSERT-on-first/in-place-UPDATE-on-subsequent (`userId.unique()` = one row forever). **No wallet import, no deduction call anywhere (D-01 grep gate == 0).**
- **D-07 schema evolution:** `player_travel_state` drops `arrive_at` + `cost`, gains `travel_seconds_remaining int default 0` + `encounter_active bool default false`; status comment now `'traveling'|'arrived'` only ('cancelled' removed per D-03). `encounter_runs` gains `encounter_type varchar(20) default 'hero'` (D-14 boss flag) + the F2 `(user_id, status)` index for the 09-03 pending-encounter re-fetch.
- **D-17 map_edges table** created in this wave (wave 1) — the adjacency source `getAdjacentNodes` + `startTravel` NO_ROUTE validation read; ships in the same wave so 09-01 typecheck passes standalone (TS2307 would fail otherwise).
- **First message components in the codebase:** `/sanguo travel` renders the destination select menu (≤25, nearest first, value = stable node code, heroEmoji label with EMOJI_NOT_FOUND guard) + disabled "Bắt đầu hành trình" button; selecting enables it with the code in the customId suffix (`sanguo:travel:start:{code}` — F1); zero-adjacent renders the no_route DANGER embed with NO menu (F6 — addOptions([]) throws NO_OPTIONS).
- **Check-in dispatch wired (stub):** a traveling/encounter-active user never starts a new journey — `execute` and the Start-press `ALREADY_TRAVELING` path delegate to `checkInTravel` (thin stub in this wave; 09-03 replaces it with the full D-22/D-24 engine).
- **i18n:** `cmd.travel.description` + `travel.*` keys in vi/en/zh-cn with identical structure — `npm run check-i18n` green; `npm run typecheck` green; full vitest suite 159/159.

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1 RED: travelService tests** — `6d82bb6` (test)
2. **Task 1 GREEN: travelService + D-07 schema + map_edges** — `b03217e` (feat)
3. **Task 2 RED: /sanguo travel command tests** — `73b7bed` (test)
4. **Task 2 GREEN: subcommand + components + routing + i18n** — `dcc47ed` (feat)
5. **Task 2 test refinement (GREEN iteration)** — `9c3c16e` (test)

**Plan metadata:** committed separately after SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/services/sanguo/travelService.ts` — pure time/state domain service (D-01, users.id)
- `src/db/schema/playerTravelState.ts` — D-07 remaining-seconds model
- `src/db/schema/encounterRuns.ts` — D-14 encounter_type + F2 index
- `src/db/schema/mapEdges.ts` — D-17 graph edges (unique pair index)
- `src/commands/sanguo/travel.ts` — subcommand + execute + select/button handlers
- `src/commands/sanguo/map.ts` — travel subcommand appended + handler re-exports (Pitfall 3-safe)
- `src/events/interactionCreate.ts` — select/button branches before the chat-input gate
- `src/ui/components/sanguoTravelDestinationMenu.ts` — destination picker (D-26)
- `src/ui/components/sanguoTravelButtons.ts` — start/ack buttons (D-25/D-26, F1)
- `src/ui/embeds/buildSanguoTravelReplyEmbed.ts` — SEASON embed + humanizeEta
- `src/services/sanguo/travelCheckInService.ts` — thin check-in stub (09-03 owns the engine)
- `locales/{vi,en,zh-cn}/sanguo.json` — cmd.travel.description + travel.* keys
- `src/services/sanguo/__tests__/travelService.test.ts` — 11 tests
- `src/commands/sanguo/__tests__/travel.test.ts` — 8 tests

## Decisions Made

- **D-01/D-03 confirmed (pre-approved gate):** travel stays pure time/state — no money path structurally possible; no cancel status exists. The stale REQUIREMENTS.md TQC-06 paid-travel/cancel text remains invalidated per the plan's flagged assumption.
- **Embed field layout:** field name = short label key, field value = the plan's full "Điểm đến: **{{node}}**" strings (honors UI-SPEC copy + plan action text).
- **Tracer gate:** the tracer `<verify>` was re-run end-to-end green (11/11 + typecheck + D-01 grep) before starting Task 2, per the orchestrator's context_notes pre-authorization — no interactive pause.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Start-mode picker embed + embed field labels required extra i18n keys**
- **Found during:** Task 2 (travel.ts execute start mode + buildSanguoTravelReplyEmbed fields)
- **Issue:** The plan's locale key list had no keys for the "current position + hint" start-mode embed, and the reply embed's three field NAMEs need short localized labels (Discord embed fields require a name; zero-hardcoded-strings gate forbids inline literals).
- **Fix:** Added `travel.pick_title`, `travel.pick_body`, `travel.destination_label`, `travel.eta_label`, `travel.from_label` to all 3 locales (identical structure — check-i18n green).
- **Files modified:** locales/{vi,en,zh-cn}/sanguo.json, src/commands/sanguo/travel.ts
- **Verification:** check-i18n green; travel.test.ts asserts pick_title embed + destination/eta/from field labels
- **Committed in:** dcc47ed (Task 2 GREEN)

**2. [Rule 3 - Blocking] travelCheckInService stub created (not in Task 2's explicit files list)**
- **Found during:** Task 2 (travel.ts import)
- **Issue:** travel.ts imports `checkInTravel` from travelCheckInService per the plan text ("imported from 09-03; in this wave a thin stub"), but the stub file was absent and not in the Task 2 `<files>` list — typecheck would fail TS2307.
- **Fix:** Created `src/services/sanguo/travelCheckInService.ts` — thin stub reading the travel row and returning `{ mode: 'status', remaining }` / `{ mode: 'start' }`; documented as the 09-03 replacement seam.
- **Files modified:** src/services/sanguo/travelCheckInService.ts
- **Verification:** typecheck green; travel.test.ts mocks it and asserts the check-in dispatch path
- **Committed in:** dcc47ed (Task 2 GREEN)

**3. [Rule 1 - Bug] Test mock mechanics fixed during GREEN iteration**
- **Found during:** Task 2 GREEN (first travel.test.ts run)
- **Issue:** (a) component handlers call the real `getT()` → uninitialized-i18next crash in tests; (b) command db reads lacked `.limit(1)` so the mock terminal chain returned a non-iterable object; (c) discord.js `StringSelectMenuBuilder.data` omits `options` and `ButtonBuilder.data` is union-typed — `.data` assertions broke.
- **Fix:** Stubbed `../../../i18n/index.js` via `vi.hoisted` (getT → identity t); standardized all travel.ts db reads on `.limit(1)`; asserted builders via `toJSON()` with a narrow cast.
- **Files modified:** src/commands/sanguo/travel.ts, src/commands/sanguo/__tests__/travel.test.ts
- **Verification:** travel.test.ts 8/8 green; full suite 159/159
- **Committed in:** dcc47ed (travel.ts) + 9c3c16e (test refinements, separate follow-up commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 blocking, 1 bug)
**Impact on plan:** All fixes necessary for correctness (i18n gate), typecheck (stub file), and test reliability. No scope creep — no new packages, no architecture changes.

## Known Stubs

| File | Line | Stub | Resolved by |
|------|------|------|-------------|
| src/services/sanguo/travelCheckInService.ts | 13 | Thin check-in stub — returns `{ mode: 'status', remaining }`; no elapsed/roll/arrival engine | Plan 09-03 (full pull-based engine D-22/D-24) |
| src/events/interactionCreate.ts | 467 | `sanguo:travel:ack` button branch = `deferUpdate()` no-op | Plan 09-03 (encounter-resume handler D-25) |

Both stubs are intentional wiring seams per the plan ("check-in dispatch wired so 09-03 can replace it with the full engine") and do NOT block this plan's goal (the journey-start slice). Recorded in `.planning/WINDOWS.md` (2 open stub entries).

## Issues Encountered

- **discord.js builder `.data` shape:** `StringSelectMenuBuilder.data` exposes only `{ type, custom_id }` (options live in `toJSON()`); `ButtonBuilder.data` returns a union where `custom_id` isn't on every variant. Resolved by asserting via `toJSON()` with a narrow cast — no production impact.
- **i18next singleton in tests:** component handlers call `getT(locale)` which crashes on an uninitialized singleton (initI18n runs only at app startup). Resolved by mocking the i18n module in the test — production path unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 09-02:** mapEdges is committed; 09-02 adds mapZones/heroZoneRates + the `src/db/schema/index.ts` re-export for mapEdges (drizzle-kit generate reads index.ts at 09-05 migration time).
- **Ready for 09-03:** the check-in dispatch + ack-branch seams are wired to thin stubs — 09-03 replaces `checkInTravel` with the full elapsed→per-minute-rolls engine and the ack handler with the real encounter-resume logic (D-25).
- **Ready for 09-04:** encounter roll math consumes `travelService.getAdjacentNodes`/`getCurrentPosition` contracts unchanged.
- **Blockers/concerns:** none. The D-18 economy re-sign (`docs/economy-budget.md` sink move travel→capture fee) and the ROADMAP SC2/SC3 amendments remain scheduled for 09-05, not this plan.

---

*Phase: 09-travel-encounters*
*Completed: 2026-08-12*

## Self-Check: PASSED

- Files verified on disk: mapEdges.ts, travelService.ts, travelCheckInService.ts, travel.ts, sanguoTravelDestinationMenu.ts, sanguoTravelButtons.ts, buildSanguoTravelReplyEmbed.ts, travelService.test.ts, travel.test.ts, 09-01-SUMMARY.md — all FOUND.
- Commits verified in git log: `6d82bb6` (test RED), `b03217e` (feat GREEN), `73b7bed` (test RED), `dcc47ed` (feat GREEN), `9c3c16e` (test refine), `2bba764` (docs plan complete) — all FOUND.
- TDD gate compliance: each task has a `test(...)` commit strictly before its `feat(...)` commit — RED/GREEN sequence intact for both tasks.
- Full suite re-run at close-out: 22 files / 159 tests passed; `npm run check-i18n` green; `npm run typecheck` green.
