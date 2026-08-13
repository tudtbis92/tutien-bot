---
phase: 10-battle-capture
plan: 06
subsystem: ui-battle-capture
tags: discord-embeds, message-components, customId-routing, D-01, D-07, D-09, D-10, D-12, D-17, D-18, spar, capture-view, i18n, vitest, TQC-10, TQC-11

# Dependency graph
requires:
  - phase: 10-battle-capture (10-05)
    provides: startEncounterBattle/startSparBattle/skipEncounter (BattleOutcome + machine error codes) + attemptCapture/captureChance (CaptureAttemptResult) — the handlers call these services and never re-implement state
  - phase: 10-battle-capture (10-01)
    provides: TurnLog/BattleResult engine shapes the battle log embed consumes
  - phase: 10-battle-capture (10-03)
    provides: CAPTURE_TIERS (tier fees/multipliers, requiresItem gating) — tier button labels render fees from config, never from payloads
  - phase: 09-travel-encounters
    provides: the travel check-in dispatch (D-22..D-28), encounter embed, D-26 start button — the D-01 inversion replaces the D-25 ack row on this path
provides:
  - src/ui/embeds/buildSanguoBattleLogEmbed.ts — D-07 single-embed battle log (≤20 turn lines, SEASON/NEUTRAL, formatTurnLine)
  - src/ui/embeds/buildSanguoCaptureEmbed.ts — capture view + success/fail/flee/retreat states (single mechanic % per D-12)
  - src/ui/components/sanguoBattleButtons.ts + sanguoCaptureButtons.ts — BATTLE_START_ID/BATTLE_SKIP_ID/CAPTURE_OPEN_ID + CAPTURE_TIER_PREFIX/RETRY/RETREAT builders (anti-tamper tier-only customIds)
  - src/commands/sanguo/battle.ts — /sanguo battle spar (D-17) + handleBattleStart/Skip/CaptureOpen/CaptureTierPress/CaptureRetryPress/CaptureRetreatPress + renderCaptureView
  - src/commands/sanguo/travel.ts — encounter branch renders fight/skip row; handleAckPress + buildAckRow removed; F4 won-battle → capture view
  - src/events/interactionCreate.ts — sanguo:battle:*/sanguo:capture:* routes (ACK route removed, Pitfall 7)
  - battle.*/capture.*/cmd.battle.* i18n keys across vi/en/zh-cn
affects: 10-07 (collection/companion — the battle log's turn names and capture view resolve hero names via the same D-07 per-locale pattern), Phase 12 audit (capture_attempts rows now reachable from the full UI flow)

actuals:
  tokens: 23083    # chars/4 over the realized diff (92,333 chars) — estimate was 58000/29000 raw, confidence low
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Button-handler skeleton (battle.ts): deferUpdate → resolveInteractionUser (users.discordId → users.id, NEVER char.id) → service call (Error('CODE') matching, travel.ts:496-509 pattern) → editReply with components: [] on every terminal state (CR-09-03/04)
    - Shared capture-view render path (renderCaptureView): one function serves handleCaptureOpen + handleCaptureRetryPress + travel.ts F4 abandoned-capture routing — the tier-1 chance % is computed at render, the attempt re-computes the exact chance inside its tx (flagged assumption)
    - display-name mapping for the battle log: round-log heroIds map to per-locale names via playerHeroId/enemyHeroId — the enemy id = the distinct non-player id in roundLogs (covers spar opponents too)
    - D-01 inversion discipline: the old ACK route/builder/handler are REMOVED, not disabled — grep gates assert zero ACK_BTN_ID in the router and zero buildAckButton in travel.ts (Pitfall 7)

key-files:
  created:
    - src/ui/embeds/buildSanguoBattleLogEmbed.ts
    - src/ui/embeds/buildSanguoCaptureEmbed.ts
    - src/ui/components/sanguoBattleButtons.ts
    - src/ui/components/sanguoCaptureButtons.ts
    - src/commands/sanguo/battle.ts
    - src/commands/sanguo/__tests__/battle.test.ts
  modified:
    - src/commands/sanguo/travel.ts
    - src/commands/sanguo/map.ts
    - src/events/interactionCreate.ts
    - locales/vi/sanguo.json
    - locales/en/sanguo.json
    - locales/zh-cn/sanguo.json
    - src/commands/sanguo/__tests__/travel.test.ts

key-decisions:
  - "Capture-view % is the TIER-1 chance (multiplier 1.0) computed via captureService.captureChance at render time — the single displayed mechanic number (D-12); the attempt re-computes the exact chance inside its tx with the pressed tier's multiplier. Flagged assumption: a small % drift between render and press is possible; the attempt always uses the recomputed exact chance (Pitfall 2)."
  - "Battle log renders the LAST ≤20 turn entries (not all): the engine logs up to ROUND_CAP×2 = 40 actions, so slicing to the decisive closing rounds honors the D-07 '≤20 turn lines ≤ ~1,700 chars' contract."
  - "The battle-log data interface adds optional playerHeroId/enemyHeroId so round-log heroId strings map to per-locale display names — the pinned interface lacked them and without them D-07 turn lines would render raw ids (cao_cao / boss:du_chau)."
  - "renderCaptureView lives in the command layer (battle.ts), not captureService — the plan sanctioned either location and captureService.ts is outside this plan's file scope; the view re-reads the same locked-row inputs captureService reads in its tx."
  - "Skip/retreat consequence reuses the capture view title + capture.retreat_body (NEUTRAL) — the pinned capture.* key set has no retreat_title key; D-18 copy is preserved verbatim."

patterns-established:
  - "Shared view render path exported from the command module and imported by travel.ts (renderCaptureView) — one ActionRow shape (3 tiers + retreat = 4 ≤ 5) everywhere the capture view renders, incl. the F4 abandoned-capture route"
  - "Machine-error-code → documented-copy mapping in every handler: NO_PENDING_ENCOUNTER → battle.no_encounter, INSUFFICIENT_BALANCE → capture.insufficient { fee } (fee from CAPTURE_TIERS, never payload), HERO_FAINTED → battle.blocked_fainted { name }, everything else → section error"

requirements-completed: [TQC-10, TQC-11]

coverage:
  - id: D1
    description: "Battle log embed (D-07): ONE embed, description-only, ≤20 turn lines ≤ ~80 chars (formatTurnLine), SEASON for encounters / NEUTRAL for spar, win/loss resolution lines, embedFooter + setTimestamp, no hex literals"
    requirement: TQC-10
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#formatTurnLine stays within the ~80-char line budget with real copy"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#handleBattleStart win/loss embed colors + win resolution"
        status: pass
      - kind: other
        ref: "grep: 0 hex literals in buildSanguoBattleLogEmbed.ts; MAX_TURN_LINES=20 slice"
        status: pass
    human_judgment: false
  - id: D2
    description: "Capture embed (D-09/D-12): view/success/fail/flee/retreat states with the exact 5 COLORS keys; the ONLY mechanic number rendered is the capture % via capture.chance (never-render contract)"
    requirement: TQC-11
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#handleCaptureOpen render + boss GOLD"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#tier press success/fail/flee colors"
        status: pass
      - kind: other
        ref: "grep: 0 hex literals in buildSanguoCaptureEmbed.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Button set + customId contract (D-01/D-10/D-18): BATTLE_START_ID/BATTLE_SKIP_ID/CAPTURE_OPEN_ID, CAPTURE_TIER_PREFIX/RETRY/RETREAT; customIds carry ONLY the tier (anti-tamper T-10-06-01); capture row = 3 tiers + 1 retreat in ONE ActionRow (T-10-06-05)"
    requirement: TQC-11
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#handleCaptureOpen 4-component row + tier/retreat customIds"
        status: pass
      - kind: other
        ref: "grep: tier customIds constructed with CAPTURE_TIER_PREFIX + tier only; fee never in setCustomId"
        status: pass
    human_judgment: false
  - id: D4
    description: "battle.*/capture.*/cmd.battle.* i18n keys with identical structure across vi/en/zh-cn (check-i18n parity)"
    verification:
      - kind: other
        ref: "npm run check-i18n exits 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "/sanguo battle spar command (D-17): NEUTRAL battle log + spar hint, NO capture button, HERO_FAINTED → battle.blocked_fainted DANGER embed; subcommand appended to map.ts"
    requirement: TQC-10
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#execute spar NEUTRAL + no capture button + fainted block"
        status: pass
    human_judgment: false
  - id: D6
    description: "Encounter battle + capture handler flow: handleBattleStart (win → Bắt row / loss → no buttons), handleCaptureTierPress (success/fail-no-flee WARNING+retry/retreat/flee/NO_PENDING_ENCOUNTER/INSUFFICIENT_BALANCE — every terminal state clears components, CR-09-03/04), retry re-renders the view, retreat resolves skipEncounter"
    requirement: TQC-10
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#handleBattleStart, handleCaptureTierPress state suite, retry/retreat, NaN guard"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#tier parse parseInt+isNaN → attemptCapture(userId, tier) users.id identity grep"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-01 ack→battle inversion: travel.ts encounter branch renders fight/skip row; buildAckRow/handleAckPress removed; interactionCreate routes sanguo:battle:*/sanguo:capture:* BEFORE the chat-input gate and the ACK route is GONE (Pitfall 7); F4 abandoned-capture routing renders the capture view after a won battle"
    requirement: TQC-10
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/battle.test.ts#Test 1 router (ACK removed) + Test 7 travel.ts fight/skip row + F4 capture view"
        status: pass
      - kind: other
        ref: "greps: 0 ACK_BTN_ID in interactionCreate.ts, 0 buildAckButton in travel.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "Interaction-latency backstops (UI-SPEC 🧪): battle log (≤20 rounds computed synchronously in the seeded engine) and capture view (tier press tx) reply within the 3s window via deferReply → editReply"
    verification: []
    human_judgment: true
    rationale: "UI-SPEC marks both as backstop ('no skeleton exists on Discord') — there is no held-out interaction test on a live bot, so the 3s-window latency can only be signed off in live UAT. The unit suite proves the handlers reply without throwing; wall-clock latency on a real shard needs a human/verifier run."

# Metrics
duration: 25min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 6: Battle Log, Capture View & D-01 Ack Inversion Summary

**The player's first visible battle/capture surface shipped: the D-07 single-embed battle log (≤20 turn lines, SEASON/NEUTRAL), the capture view with THE single mechanic number (floor(chance×100)%, D-12) plus 3 tier buttons + retreat in one ActionRow (anti-tamper tier-only customIds), the /sanguo battle spar command (D-17, no stakes), the full sanguo:battle:*/sanguo:capture:* interaction routes (the D-25 ack route REMOVED per Pitfall 7), the travel.ts ack→battle inversion with F4 abandoned-capture routing, and the complete battle.*/capture.* i18n key sets across vi/en/zh-cn — all proven by 20 new tests (7 behaviors) with the whole 263-test suite + typecheck + check-i18n green**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-13T08:36:00Z
- **Completed:** 2026-08-13T08:56:45Z
- **Tasks:** 2 (1 auto + 1 TDD auto; 3 commits)
- **Files modified:** 13 (6 created, 7 modified)

## Accomplishments

- **`buildSanguoBattleLogEmbed` (D-07)** — one embed, description-only (never fields-per-round, 25-field cap), the LAST ≤20 turn entries (engine logs up to 40 actions; the decisive closing rounds bound the description at ~1,700 chars < 4,096), SEASON for encounters / NEUTRAL for spar (D-17), win/loss resolution lines (+ spar hint), `formatTurnLine` unit-testable at ≤ ~80 chars/line
- **`buildSanguoCaptureEmbed`** — view/success/fail/flee/retreat states mapped to exactly the UI-SPEC colors (view SEASON / boss GOLD, success SUCCESS, fail WARNING — setback with retry open, flee DANGER, retreat NEUTRAL); the view renders the single mechanic number via `capture.chance` — no flee %, pity, multiplier, or rarity anywhere (D-12)
- **Button builders** — `BATTLE_START_ID`/`BATTLE_SKIP_ID` (the D-01 fight/skip row, 2 comps) + `CAPTURE_OPEN_ID` (the D-10 Bắt button on the battle-win row); `CAPTURE_TIER_PREFIX`/`CAPTURE_RETRY_ID`/`CAPTURE_RETREAT_ID` — tier customIds carry ONLY the tier number (fee never rides the payload, T-10-06-01); the capture row is exactly 3 active tiers + retreat in ONE ActionRow (4 ≤ 5, T-10-06-05); retry SWAPS the row content (retry + retreat), never appends
- **`/sanguo battle` spar (D-17)** — NEUTRAL battle log + spar hint, NO capture button, no HP loss/no reward (service-enforced in 10-05), HERO_FAINTED → `battle.blocked_fainted` DANGER with the companion name; subcommand appended to map.ts with the handler re-exports
- **Full battle/capture handler flow** — `handleBattleStart` (win → Bắt row, loss → no buttons), `handleBattleSkip`/`handleCaptureRetreatPress` (D-18 retreat consequence, NEUTRAL), `handleCaptureOpen`/`handleCaptureRetryPress` via the shared `renderCaptureView`, `handleCaptureTierPress` (success → SUCCESS no buttons; fail-no-flee → WARNING + retry/retreat; flee → DANGER no buttons; NO_PENDING_ENCOUNTER → `battle.no_encounter`; INSUFFICIENT_BALANCE → `capture.insufficient` with the server-config fee; NaN tier no-op) — every editReply passes `components: []` when clearing (CR-09-03/04)
- **D-01 inversion complete** — travel.ts's encounter branch renders the fight/skip row (`buildAckRow`/`buildAckButton`/`handleAckPress` removed — its FOR UPDATE resume semantics live in the 10-05 resolution path); interactionCreate's `sanguo:battle:*` / `sanguo:capture:*` routes (prefix for tier, `===` for fixed ids, parseInt+isNaN tier guard) dispatch BEFORE the chat-input gate and the `ACK_BTN_ID` route is GONE (grep-gated = 0, Pitfall 7); the F4 (P10-review) abandoned-capture routing re-opens the CAPTURE VIEW when a completed + player-won `sanguo_battles` row exists for the pending encounter — a won-but-abandoned encounter never forces a re-battle
- **i18n parity** — `battle.*` (11 keys) + `capture.*` (14 keys) + `cmd.battle.description` with identical structure across vi/en/zh-cn; `npm run check-i18n` green
- **Proven end-to-end** — the D-01 chain (encounter embed → fight button → battle log → Bắt → capture view → tier/retry/retreat → travel resume) is covered by 20 new tests (7 behaviors) + the updated travel.test.ts; full suite 263/263, `npm run typecheck` clean, all acceptance grep gates pass (0 ACK_BTN_ID, 0 buildAckButton, 0 char.id service calls)

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Task 2):

1. **Task 1: battle log + capture embeds + button builders + i18n keys** - `549876d` (feat)
2. **Task 2: /sanguo battle spar + encounter-battle/capture handlers + D-01 inversion** - `7db8aba` (test, RED) + `a2d174a` (feat, GREEN)

**Plan metadata:** `docs(10-06): complete battle log + capture view plan` (this commit)

## Files Created/Modified

- `src/ui/embeds/buildSanguoBattleLogEmbed.ts` - D-07 single-embed battle log: SanguoBattleLogEmbedData, buildSanguoBattleLogEmbed (SEASON/NEUTRAL, ≤20-line description, win/loss resolution), formatTurnLine (≤80 chars), MAX_TURN_LINES
- `src/ui/embeds/buildSanguoCaptureEmbed.ts` - Capture view + result states: SanguoCaptureEmbedData, 5 COLORS keys, percent only via capture.chance (D-12)
- `src/ui/components/sanguoBattleButtons.ts` - BATTLE_START_ID/BATTLE_SKIP_ID/CAPTURE_OPEN_ID + buildBattleStartButton/buildBattleSkipButton/buildCaptureOpenButton
- `src/ui/components/sanguoCaptureButtons.ts` - CAPTURE_TIER_PREFIX/CAPTURE_RETRY_ID/CAPTURE_RETREAT_ID + tier/retry/retreat builders (anti-tamper)
- `src/commands/sanguo/battle.ts` - battleSubcommand + execute (spar) + 6 button handlers + renderCaptureView + display-resolution helpers
- `src/commands/sanguo/travel.ts` - encounter branch → fight/skip row; F4 won-battle → capture view; buildAckRow/handleAckPress/buildSanguoAckEmbed import removed
- `src/commands/sanguo/map.ts` - `.addSubcommand(battleSubcommand)` + battle dispatch + battle/capture handler re-exports (ack re-export removed)
- `src/events/interactionCreate.ts` - sanguo:battle:*/sanguo:capture:* routes replacing the ACK route; extended SanguoComponentHandlers
- `locales/vi/sanguo.json` + `locales/en/sanguo.json` + `locales/zh-cn/sanguo.json` - battle.*/capture.*/cmd.battle.* keys
- `src/commands/sanguo/__tests__/battle.test.ts` - 20 tests (7 behaviors + formatTurnLine budget)
- `src/commands/sanguo/__tests__/travel.test.ts` - D-01 assertions updated (fight/skip row, ack gone, F4 queue)

## Decisions Made

- **Capture-view % = the tier-1 chance at render time** — `renderCaptureView` computes floor(captureChance(rarity, hp, tierMultiplier 1, pity)×100); the ATTEMPT re-computes the exact chance inside its tx with the pressed tier's multiplier (Pitfall 2 — the plan's flagged assumption, documented in code).
- **Battle log keeps the LAST ≤20 turn entries** — the engine emits up to ROUND_CAP×2 = 40 actions; slicing to the closing rounds honors the D-07 line/char budget while keeping the decisive ending visible.
- **Optional `playerHeroId`/`enemyHeroId` on the log data interface** — the pinned interface lacked the ids needed to map round-log heroId strings to display names; the enemy id is derived as the distinct non-player id in roundLogs (also covers spar foes).
- **`renderCaptureView` in the command layer** — the plan sanctioned either captureService or the handler; captureService.ts is outside this plan's file scope, and the handler re-reads the same locked-row inputs the service reads.
- **Skip/retreat reuses the capture view title + retreat_body (NEUTRAL)** — no retreat_title key exists in the pinned capture.* set; D-18 copy preserved verbatim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing travel.test.ts assertions invalidated by the required D-01 inversion**
- **Found during:** Task 2 GREEN (after implementing the ack removal)
- **Issue:** travel.test.ts asserted `sanguo:travel:ack` on the encounter row (2 tests), the ack router branch (1 test), and called `handleAckPress` directly (1 test) — the D-01 inversion the plan mandates removes all of these, so the pre-existing suite could not pass.
- **Fix:** Updated the two encounter-mode tests to assert the fight/skip row (`sanguo:battle:start` + `sanguo:battle:skip`) with the F4 pending/battle reads appended to their mock queues; the router test now asserts `ACK_BTN_ID` is absent; the ack-press test became a source assertion that `handleAckPress` is no longer exported. travel.test.ts was not in the plan's files list, but the required inversion structurally invalidates its assertions.
- **Files modified:** `src/commands/sanguo/__tests__/travel.test.ts`
- **Verification:** full suite green (263/263) + typecheck
- **Committed in:** `a2d174a` (Task 2 GREEN)

**2. [Rule 1 - Bug] Battle-log turn lines would render raw heroId strings (cao_cao / boss:du_chau)**
- **Found during:** Task 2 implementation (wiring BattleOutcome.roundLogs into the embed)
- **Issue:** `SanguoBattleLogEmbedData` (pinned by the plan) carries playerName/enemyName but no heroIds; the engine's TurnLog attacker/defender are heroId strings, so the D-07 turn lines would display raw ids instead of per-locale names.
- **Fix:** Added OPTIONAL `playerHeroId`/`enemyHeroId` to the data interface + an optional `names` map to `formatTurnLine` (2-arg usage unchanged); the handlers resolve ids via the active companion + the distinct non-player id in roundLogs. Verified by the ≤80-char budget test with real copy.
- **Files modified:** `src/ui/embeds/buildSanguoBattleLogEmbed.ts`, `src/commands/sanguo/battle.ts`
- **Verification:** unit test (real-copy line length) + handleBattleStart/execute spar tests render names
- **Committed in:** `a2d174a` (Task 2 GREEN)

**3. [Plan-internal inconsistency - acceptance grep unsatisfiable as written] `tier.*fee` grep on sanguoCaptureButtons.ts**
- **Found during:** Task 1 verification
- **Issue:** The acceptance criterion `grep -c "tier.*fee|fee.*tier" src/ui/components/sanguoCaptureButtons.ts == 0` is mathematically unsatisfiable — the plan's OWN mandated API `buildCaptureTierButtons(t, tiers: { tier: number; fee: string }[])` and its t() interpolation `{ tier, fee }` inherently match the pattern. The real contract (T-10-06-01 anti-tamper) is that no fee rides any customId.
- **Fix:** Reworded comments to reduce pattern noise; verified the ACTUAL contract precisely — every `setCustomId` in the file uses only the tier (or a fixed id); fee appears only in the label interpolation. 5 remaining matches are all plan-mandated code (type + destructure + interpolation).
- **Files modified:** `src/ui/components/sanguoCaptureButtons.ts`
- **Verification:** grep on setCustomId lines shows tier-only customIds
- **Committed in:** `549876d` (Task 1)

---

**Total deviations:** 3 (1 Rule 3 blocking, 1 Rule 1 bug, 1 plan-internal inconsistency documented)
**Impact on plan:** All fixes are correctness requirements inside the task's own scope (the D-01 inversion necessarily breaks the old assertions; raw-heroId rendering would leak internal ids to players; the grep gate contradicts the plan's own API). No scope creep; the anti-tamper intent is preserved and verified.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| Boss capture press → `capture.error` (generic) | src/commands/sanguo/battle.ts | handleCaptureTierPress catch | 10-05 known stub: `BOSS_CAPTURE_UNAVAILABLE` fires pre-fee for boss encounters (no heroes row to grant, D-13 deferred). The boss capture VIEW renders correctly (GOLD, D-13); only the press surfaces the generic error — a clean fail, never a broken insert. Resolution (boss→heroes mapping) is a future content/schema decision (tracked in 10-05 Known Stubs + WINDOWS.md #5). |

## Issues Encountered

- **Mock-chain gap surfaced by the tier-press tests** — my pending-encounter reads use `.orderBy().limit()`; the shared `mockDbReads` helper only modeled `.limit()`. Extended the helper to serve both chain shapes (where returns `{ orderBy, limit }`); the same helper update was needed in travel.test.ts for the F4 reads. Pure test-infrastructure work, not a code issue.
- **TDD RED lint friction (repeat of 10-05)** — eslint rejected the RED test commit for unused imports (`getAdjacentNodes`, `startTravel` — needed only by later tests); removed them from the RED commit.
- **TypeScript union on `.toJSON().custom_id`** — `APIButtonComponent` is a discriminated union; casting the toJSON result (`as { custom_id: string }`) fixed the typecheck errors in both test files (matches the existing travel.test.ts pattern).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **10-07 (collection / companion)** — the `/sanguo battle` spar entry, the battle log, and the capture view all resolve hero names via the D-07 per-locale pattern and `safeHeroEmoji` (name-only on EMOJI_NOT_FOUND); the same helpers (`pickName`, `safeHeroEmoji`) are reusable for the collection/companion surfaces. The active-companion read in `resolveBattleDisplay`/`fetchActiveCompanionName` mirrors the 10-07 companion-switch write target (`user_sanguo_state.active_hero_id`).
- **Boss capture remains the one open loop** — the boss flow is fully wired through the UI (GOLD capture view renders), but a winning boss press surfaces the generic capture error until the D-13 boss→heroes mapping lands (10-05 Known Stubs).
- **UI-SPEC backstops need live sign-off** — the 3s-window latency for the battle log and capture view (deferReply → editReply) is covered by handler tests only; a live-UAT interaction pass (coverage D8) is the remaining verification.

---

*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: battle log/capture embeds, battle/capture buttons, battle.ts, battle.test.ts, 10-06-SUMMARY.md
- Commits exist: 549876d (T1), 7db8aba (RED), a2d174a (GREEN)
- Verification green: 263/263 tests; npm run typecheck exit 0; check-i18n exit 0; grep gates (ACK_BTN_ID=0, buildAckButton=0, char.id calls=0)

