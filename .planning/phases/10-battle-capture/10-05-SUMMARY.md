---
phase: 10-battle-capture
plan: 05
subsystem: battle-services
tags: battleCheckInService, captureService, FOR-UPDATE, single-writer, crypto-rng, sanguo_battles, replay-record, pity, capture-attempts, audit, boss-templates, vitest, tdd, TQC-11

# Dependency graph
requires:
  - phase: 10-battle-capture (10-01)
    provides: pure seeded engine runBattle(seed, input) + CombatantInput/BattleResult — the services build inputs from DB rows and store the SAME snapshot for replay
  - phase: 10-battle-capture (10-02)
    provides: sanguo_battles seed/input/result jsonb, encounter_runs.pity_count, capture_attempts audit table, user_sanguo_state active companion (migration 0019)
  - phase: 10-battle-capture (10-03)
    provides: CAPTURE_TIERS (5/15/40/100/250 fee × multipliers, item-gated 4-5), CAPTURE_BASE_BY_RARITY, FLEE_RATE_BY_RARITY, PITY_INCREMENT, hpFactor — the D-20-signed fee/chance/flee sources
  - phase: 10-battle-capture (10-04)
    provides: live heroes base stats/rarity/tier (str 21-75, hp 102-242) — the battle/capture formulas read real seeded numbers
  - phase: 09-travel-encounters
    provides: travelCheckInService structural analog (Tx type, FOR UPDATE, F2 re-fetch, injected-deps), encounterService cryptoUniform, encounter_runs pending rows + encounterActive flag
provides:
  - src/services/sanguo/battleCheckInService.ts — startEncounterBattle + startSparBattle + skipEncounter (D-01/D-03/D-04/D-06/D-17/D-18)
  - src/services/sanguo/captureService.ts — captureChance (clamped [0,1]) + attemptCapture (single-writer tx: fee → roll → pity/flee → audit → IV insert) (D-10/D-11, TQC-11)
  - src/constants/sanguoBoss.ts — zone-scaled boss stat templates for all 18 map_zones (A3, rarity 5, HP/STR ~2× a rarity-5 hero) + bossTemplateFor guard
  - src/services/sanguo/__tests__/battleCheckInService.test.ts — behaviors 1-7 + spar suite + skip + replay roundtrip + escape/travel-resume (13 tests)
  - src/services/sanguo/__tests__/captureService.test.ts — captureChance clamps + attemptCapture behaviors 1-7 + pity-sequence integration (10 tests)
affects: 10-06 (UI calls these services from button handlers — battle start, capture tier press, retreat), 10-07 (companion switch writes user_sanguo_state.active_hero_id read FOR UPDATE here; collection reads captured_zone/hp_current), Phase 12 audit (capture_attempts rows now written per attempt incl. failures)

actuals:
  tokens: 15574    # chars/4 over the 5 realized files (62,296 chars) — estimate was 62000/31000 raw, confidence low
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-writer FOR UPDATE tx per interaction: lock player_travel_state + user_sanguo_state (battle) / the pending encounter row (capture), then all reads/writes inside the tx (travelCheckInService analog, Pitfall 5/F7)
    - F2 indexed pending re-fetch (encounter_runs_user_status_idx) — battle/capture entry NEVER re-rolls; consumes the latest pending row
    - Replay record: sanguo_battles.input jsonb stores BOTH full CombatantInput snapshots ({ player, enemy }) exactly as passed to runBattle — Test 8 re-runs the REAL engine against the stored record and asserts deep-equal roundLogs (Pitfall 1/SC1)
    - Crypto-only player-facing rolls: battle seed crypto.randomInt(2**48) (P10-review F5), wild IV crypto.randomInt(0,32)×6, capture/flee rolls via cryptoUniform; pure-rand confined to battleEngine.ts (grep gate re-affirmed = 0)
    - Server-authoritative capture state: chance/pity/wild HP/rarity all resolve inside the tx from locked rows + constants — the customId carries only the tier (anti-tamper, Pitfall 3)
    - One audit row per attempt (single insert site, success/fail/flee) with EXACT chance + roll + pity_before — the SC2/TQC-11 repudiation proof incl. failures
    - Explicit join aliases (select({ uh: userHeroes, h: heroes }).innerJoin(...)) — sidesteps drizzle join-key naming ambiguity and makes mock fixtures stable

key-files:
  created:
    - src/services/sanguo/battleCheckInService.ts
    - src/services/sanguo/captureService.ts
    - src/constants/sanguoBoss.ts
    - src/services/sanguo/__tests__/battleCheckInService.test.ts
    - src/services/sanguo/__tests__/captureService.test.ts
  modified: []

key-decisions:
  - "captureChance pity term is pity×PITY_INCREMENT (5pp per failed attempt), NOT the raw failure count — the plan's literal '+ pity' would add +1.0 (100pp) per failure; the plan's own Task-3 contract (chance2 − chance1 === PITY_INCREMENT for pity 0→1) pins the D-11 scaling"
  - "Boss capture guarded with Error('BOSS_CAPTURE_UNAVAILABLE') BEFORE the fee — encounter_runs bosses have hero_id NULL (A3) and user_heroes.hero_id is NOT NULL, so a boss capture has no heroes row to grant; without the guard the tx would crash mid-flight (fee charged + audit lost). D-13 boss-capture semantics (which heroes row a captured boss maps to) deferred to a future plan"
  - "Boss stat templates: rarity 5, HP 420-525 / STR 108-145 (~2× the rarity-5 hero cap ~70 STR / ~235 HP), zone-flavored — nomad/frontier zones (o_hoan/tien_ti/hung_no/tinh_chau) STR/MOV/HP heavy, southern provinces (giao_chau/duong_chau) AGI/INT, central heartlands balanced; keyed to all 18 seeded map_zones codes"
  - "Spar (D-17) shares the readActiveCompanion gate + storeBattle replay record but structurally omits the hp_current write and any wallet call — the D-17 invariants locked by dedicated tests"
  - "Explicit join aliases ({ uh, h }) for the active-companion read — deterministic across the real drizzle runtime and the mock tx"

patterns-established:
  - "Service tx skeleton (battle/capture): FOR UPDATE lock → F2 pending re-fetch → gate (HP/companion) → crypto draws → engine/wallet → replay record / audit row → status transition + encounterActive=false + updatedAt pin on every terminal resolution (Pitfall 7)"
  - "Mock tx builder: thenable select-chain resolving queued reads in call order + values() carrying .returning() — one builder serves both service test suites"

requirements-completed: [TQC-11]

coverage:
  - id: D1
    description: "startEncounterBattle — single-writer FOR UPDATE tx (travel + companion locks), F2 pending re-fetch, HERO_FAINTED/NO_PENDING_ENCOUNTER gates, crypto wild IV + seed(2**48), runBattle, sanguo_battles replay record ({player,enemy} input snapshot, seed, roundLogs, result), HP write-back (encounter only), win keeps the capture window open / loss escapes + travel resumes (Pitfall 7)"
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T1 replay-record insert"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T2 HERO_FAINTED gate"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T4 HP write-back win / T5 loss escape resolution"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T6 crypto wild IV + base+IV snapshot to engine"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T8 real-engine replay roundtrip"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T10 escape → check-in resumes travel"
        status: pass
    human_judgment: false
  - id: D2
    description: "sanguoBoss.ts — BOSS_TEMPLATES keyed to all 18 seeded zone codes (rarity 5, HP/STR elevated ~2× a rarity-5 hero template, zone-flavored) + bossTemplateFor throwing NO_BOSS_TEMPLATE; boss battles build the enemy input from the template (heroId 'boss:{zone}') instead of a heroes row (A3)"
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#T7 boss template lookup + full zone coverage"
        status: pass
    human_judgment: true
    rationale: "The template VALUES are agent-discretion content (A3 adopted, like the 10-04 rarity/content pass): they feed battle difficulty and the D-13 boss capture rate directly. Structure/coverage is automated; the numeric balance warrants a human glance before it drives live boss fights."
  - id: D3
    description: "startSparBattle (D-17) — free practice vs a random real hero (crypto index pick), type 'spar' record with encounter_id NULL, NEVER writes HP back, never charges a fee; fainted companion blocks (same HERO_FAINTED gate); empty pool → NO_SPAR_POOL"
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#S1/S2/S3 spar no-stakes invariants"
        status: pass
    human_judgment: false
  - id: D4
    description: "skipEncounter (D-18) — retreat resolves the pending encounter 'skipped', clears encounterActive + pins updatedAt; the Redis cap window is never touched (cap counts roll hits, not resolutions)"
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#skipEncounter suite"
        status: pass
    human_judgment: false
  - id: D5
    description: "captureChance — base(rarity) × hpFactor × tierMultiplier + pity×PITY_INCREMENT, clamped [0,1] AFTER pity (strict); hpFactor Pokemon-standard; pity scales per D-11 (5pp per failure)"
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/captureService.test.ts#T1a exact formula / T1b upper clamp / T1c [0,1] invariant"
        status: pass
    human_judgment: false
  - id: D6
    description: "attemptCapture — single-writer FOR UPDATE tx: F2 lock, server-side tier/fee (INVALID_TIER/TIER_LOCKED), locked-row chance (battle snapshot HP + heroes rarity + pity), wallet fee via deductBalance (reason 'sanguo_capture_t{n}', same tx), exact-chance crypto roll, pity increment + flee roll, ONE capture_attempts audit row per attempt (exact chance+roll+pity_before incl. failures), IV insert (hp = base HP, captured_zone snapshot), captured/fled transitions + travel resume; NO_PENDING_ENCOUNTER and INSUFFICIENT_BALANCE roll the whole tx back"
    requirement: TQC-11
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/captureService.test.ts#T2 success IV insert + status / T3 fail pity / T4 flee / T5 one audit row / T6 TIER_LOCKED / T7 rollback"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/captureService.test.ts#T9 two-attempt pity sequence + fee/audit integrity"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 5: Battle Entry & Capture Services (D-01/D-03/D-04/D-06/D-10/D-11/D-17/D-18) Summary

**The two stateful orchestrators of Phase 10 shipped: `battleCheckInService` (encounter battle entry with the single-writer FOR UPDATE contract, crypto wild-IV/seed, the full D-06 replay record, D-04 HP persistence + fainted gate, loss-escape resolution that resumes travel, the D-17 no-stakes spar path, and D-18 retreat) and `captureService` (server-authoritative `captureChance` clamped [0,1] with D-11 pity, and the single-writer `attemptCapture` tx: FOR UPDATE lock → server-side tier/fee → wallet fee → exact-chance crypto roll → pity/flee → ONE audit row per attempt incl. failures → IV insert with base-HP/zone snapshot), plus zone-scaled boss stat templates for all 18 map_zones — proven by 23 tests including a real-engine replay roundtrip, a two-attempt pity-sequence integration test, and an escape→travel-resume regression**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-13T08:05:15Z
- **Completed:** 2026-08-13T08:27:26Z
- **Tasks:** 3 (2 TDD auto + 1 integration auto; 6 commits)
- **Files modified:** 5 (all new)

## Accomplishments

- **`battleCheckInService.startEncounterBattle`** — one `FOR UPDATE` tx (P10-review F7: locks `player_travel_state` + `user_sanguo_state`), F2 indexed pending re-fetch, active-companion gate (`NO_ACTIVE_HERO` / `HERO_FAINTED`), wild IV via `crypto.randomInt(0,32)` × 6 (D-03), battle seed via `crypto.randomInt(2 ** 48)` (D-06, P10-review F5 — a safe JS integer for the mode:'number' seed column), `runBattle` (10-01), the D-06 replay record (`input` jsonb = BOTH full CombatantInput snapshots + seed + roundLogs + result), HP write-back (`hp_current = playerHpAfter`, 0 = fainted — the ONLY hp write site), and resolution: win keeps the capture window open (encounter stays pending), loss → `'escaped'` + `encounterActive=false` + `updatedAt` pinned (travel resumes, Pitfall 7)
- **`startSparBattle`** (D-17) — same tx shape vs a random real hero (crypto index pick over the hero pool, `NO_SPAR_POOL` on empty), type `'spar'` record with `encounter_id NULL`, **never writes HP back, never charges a fee** — invariants locked by the S1-S3 tests
- **`skipEncounter`** (D-18) — retreat resolves the pending encounter `'skipped'`, clears `encounterActive` + pins `updatedAt`; the Redis cap window is structurally untouched (cap counts roll hits, not resolutions)
- **`captureChance`** — `base(rarity) × hpFactor × tierMultiplier + pity×PITY_INCREMENT`, clamped `[0,1]` AFTER pity (strict) — the D-10/D-11 formula with the pity scale pinned by the Task-3 contract
- **`attemptCapture`** — one `FOR UPDATE` tx (the double-spend defense, Pitfall 3): F2 lock → server-side tier/fee resolution (`INVALID_TIER` / `TIER_LOCKED` for tiers 4-5) → wild state from LOCKED rows (battle snapshot HP, heroes rarity, pity) → `deductBalance(tx, ...)` fee with reason `'sanguo_capture_t{n}'` (D-03, same tx) → exact-chance crypto roll (strict `<`, boundary fails) → fail: pity increment (D-11) + flee roll (`FLEE_RATE_BY_RARITY`) → **ONE `capture_attempts` audit row per attempt** (tier, fee, `displayedChance` = exact chance, `roll`, outcome, `pity_before` — incl. failures, TQC-11/SC2) → success: 6× IV insert with `hp_current` = base HP + `captured_zone` snapshot, `'captured'` transition, travel resumes; `NO_PENDING_ENCOUNTER` / `INSUFFICIENT_BALANCE` roll the whole tx back (no audit row)
- **`sanguoBoss.ts`** (A3) — `BOSS_TEMPLATES` for all 18 seeded `map_zones` codes (rarity 5, HP 420-525 / STR 108-145 — elevated ~2× a rarity-5 hero template, zone-flavored: nomad frontiers STR/MOV/HP heavy, southern provinces AGI/INT, central heartlands balanced) + `bossTemplateFor` throwing `NO_BOSS_TEMPLATE`; boss battles build the enemy from the template (`heroId: 'boss:{zone}'`) — the engine stays agnostic
- **Proven at the integration level** (Task 3): stored battle records replay byte-identically through the REAL engine (`runBattle(seed, input)` deep-equals the stored roundLogs — SC1/Pitfall 1); two failed attempts produce `pity_before` 0 → 1, equal tier fees, `'sanguo_capture_t1'` wallet reasons, and `chance2 − chance1 === PITY_INCREMENT` (pity applies to the NEXT attempt); a battle loss followed by `/sanguo travel` check-in resumes the journey from the pinned `updatedAt`
- **Full suite green:** 23 new tests + the whole repo (28 files / 243 tests) pass; `npm run typecheck` clean; scoped pure-rand gate re-affirmed (0 imports outside battleEngine.ts)

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1: battleCheckInService (encounter entry, HP persistence, loss resolution + boss constants)** - `386683c` (test, RED) + `b82161b` (feat, GREEN)
2. **Task 2: captureService (captureChance + attemptCapture)** - `376a734` (test, RED) + `3b70abe` (feat, GREEN)
3. **Task 3: integration tests (replay roundtrip, fee/audit integrity, pity accumulation, escape/retreat)** - `cfe0090` (test)
4. **Fix (post-Task-3): captureChance pity scaling** - `cc8fe40` (fix)

**Plan metadata:** `docs(10-05): complete battle entry + capture services plan` (this commit)

## Files Created/Modified

- `src/services/sanguo/battleCheckInService.ts` - Battle entry orchestrator: BattleResolution/BattleOutcome types, startEncounterBattle (single-writer tx, crypto IV/seed, replay record, HP write-back, loss escape), startSparBattle (D-17 no-stakes), skipEncounter (D-18)
- `src/services/sanguo/captureService.ts` - captureChance (clamped [0,1], pity×PITY_INCREMENT) + attemptCapture (single-writer tx: F2 lock, tier/fee, wallet, exact-chance roll, pity/flee, one audit row, IV insert) + CaptureAttemptResult/CaptureDeps
- `src/constants/sanguoBoss.ts` - BossTemplate + BOSS_TEMPLATES (18 zones) + bossTemplateFor (NO_BOSS_TEMPLATE guard); A3/D-13 header contract
- `src/services/sanguo/__tests__/battleCheckInService.test.ts` - 13 tests: behaviors 1-7, spar suite S1-S3, skip suite, T8 replay roundtrip (real engine), T10 escape→check-in resume
- `src/services/sanguo/__tests__/captureService.test.ts` - 10 tests: captureChance T1a-c clamps, attemptCapture T2-T7, T9 pity-sequence/fee/audit integrity

## Decisions Made

- **Pity scales as `pity × PITY_INCREMENT` (5pp per failed attempt)** — the plan's literal `+ pity` formula would add +1.0 (100pp) per failure, breaking D-11; the plan's own Task-3 Test 9 (`chance2 − chance1 === PITY_INCREMENT`) is the binding contract. The service passes `pity: encounter.pityCount` (the integer count); captureChance multiplies by PITY_INCREMENT. See Deviations.
- **Boss capture guarded pre-fee (`BOSS_CAPTURE_UNAVAILABLE`)** — `encounter_runs.hero_id` is NULL for bosses (A3) and `user_heroes.hero_id` is NOT NULL, so a boss capture has no heroes row to grant; the literal plan insert would hit the NOT NULL constraint mid-tx (fee charged, audit row lost, generic DB error). Guarding before the fee keeps the failure clean; D-13 boss-capture semantics (what a captured boss grants) are deferred. See Deviations + Known Stubs.
- **Boss template content** — rarity 5, HP/STR ~2× the rarity-5 hero cap, zone-flavored across the 18 seeded zones; the engine stays agnostic (A3).
- **Explicit join aliases** (`select({ uh: userHeroes, h: heroes }).innerJoin(...)`) for the active-companion read — deterministic key naming across the real drizzle runtime and the mock tx.
- **Mock-tx builder shared shape** — thenable select-chain (every awaited read resolves the next queued row) + `values()` carrying `.returning()`: one builder serves both service suites and models the FOR UPDATE lock, joins, and insert-returning shapes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] captureChance added the raw pity count instead of pity×PITY_INCREMENT**
- **Found during:** Task 3 (the two-attempt integration test — chance delta came out 0.4667 instead of 0.05)
- **Issue:** The plan's literal formula `... + pity` combined with the plan's own step 4 (`pity: encounter.pityCount` — an integer failure count) adds +1.0 (100pp) to the chance per failed attempt instead of the D-11 +5pp. The plan's Task-3 Test 9 contract (`chance2 − chance1 === PITY_INCREMENT` for pity 0 → 1) is the authoritative spec and pinned the correct scaling.
- **Fix:** `raw = base × hpFactor × tierMultiplier + pity × PITY_INCREMENT`; doc comment updated to state the pity-count semantics.
- **Files modified:** `src/services/sanguo/captureService.ts`
- **Verification:** Test 9 green — `second.chance − first.chance` is close to `PITY_INCREMENT`; T1a-c clamps still green; full suite + typecheck clean.
- **Committed in:** `cc8fe40` (fix commit)

**2. [Rule 1 - Bug] Boss capture would crash the tx on the user_heroes NOT NULL constraint**
- **Found during:** Task 2 (implementation — `heroId: encounter.heroId` is `number | null` for bosses; `user_heroes.hero_id` is NOT NULL; the plan's literal success-path insert cannot even typecheck for the boss branch)
- **Issue:** A boss encounter (`hero_id NULL`, A3) with a winning capture press would insert a NULL `hero_id` → DB error mid-tx → fee already deducted, audit row lost, generic failure surfaced to the player.
- **Fix:** Guard `encounter.heroId == null → throw Error('BOSS_CAPTURE_UNAVAILABLE')` BEFORE the wallet fee (a boss press never charges for an impossible insert); documented in the service header. D-13 boss-capture semantics deferred (see Known Stubs).
- **Files modified:** `src/services/sanguo/captureService.ts`
- **Verification:** typecheck green (the boss branch now narrows cleanly); no plan test asserted boss-capture success, so nothing regressed.
- **Committed in:** `3b70abe` (Task 2 GREEN)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes are correctness requirements inside the task's own scope (one pinned by the plan's own integration contract, one a NOT NULL crash on a path the plan's tests never exercised). No scope creep; the D-13 boss-capture gap is tracked as a Known Stub.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `BOSS_CAPTURE_UNAVAILABLE` guard blocks boss capture in Phase 10 | src/services/sanguo/captureService.ts | ~137 | D-13 says boss encounters are capturable, but `encounter_runs.hero_id` is NULL for bosses (A3) and `user_heroes.hero_id` is NOT NULL — no heroes row exists for a captured boss to reference. Guarded pre-fee so a press fails cleanly instead of charging for a broken insert. Resolution (e.g. a boss→heroes content mapping or a boss-owned capture grant) is a future content/schema decision. |

## Issues Encountered

- **Pity-scale bug surfaced by the Task-3 integration test** (see Deviation 1) — the two-attempt test failed with `second.chance = 1` (clamped); instrumented the service, confirmed the reads were correct, and identified the formula scale as the bug. Fixed in `cc8fe40`.
- **lint-staged hook rejected the RED test commits** — imports only needed by later Task-3 tests (`runBattle`, `checkInTravel`, `PITY_INCREMENT`, schema refs) were flagged as unused while the implementation didn't exist yet; removed them from the RED commits and re-added in Task 3 (standard TDD friction, not a code issue).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **10-06 (UI)** can call the services from button handlers with no state ambiguity: `startEncounterBattle(userId)` / `startSparBattle(userId)` return a `BattleOutcome` (resolution + battleId + HP + roundLogs); `attemptCapture(userId, tier)` returns the full `CaptureAttemptResult` (exact chance to display, outcome, balanceAfter); `skipEncounter(userId)` for the retreat button. Error codes are machine-readable (`HERO_FAINTED`, `NO_PENDING_ENCOUNTER`, `TIER_LOCKED`, `NO_SPAR_POOL`, `INSUFFICIENT_BALANCE`, `BOSS_CAPTURE_UNAVAILABLE`) for the command layer's `err.message` matching (travel.ts:496-509 pattern).
- **10-07 (collection / companion)** — the active-companion switch writes `user_sanguo_state.active_hero_id` which battle/capture read FOR UPDATE (single-writer holds); collection queries `captured_zone`/`hp_current` which capture/battle write.
- **Boss capture is the one open loop** — the boss battle path is fully wired (template enemy, replay record, HP write-back, capture window), but a winning boss capture press surfaces `BOSS_CAPTURE_UNAVAILABLE` until a heroes-row mapping decision lands (Known Stubs).

---

*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: battleCheckInService.ts, captureService.ts, sanguoBoss.ts, both test suites, 10-05-SUMMARY.md
- Commits exist: 386683c (RED battle), b82161b (GREEN battle), 376a734 (RED capture), 3b70abe (GREEN capture), cfe0090 (Task 3 integration), cc8fe40 (pity fix)
- Verification green: 23/23 service tests; full suite 243/243; npm run typecheck exit 0; pure-rand scoped gate = 0

