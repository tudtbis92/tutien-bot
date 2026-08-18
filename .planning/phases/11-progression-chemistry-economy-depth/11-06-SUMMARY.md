---
phase: 11-progression-chemistry-economy-depth
plan: 06
subsystem: combat-routing, capture, surfaces, i18n, testing
tags: [boss, legion, run-legion-battle, capture, d-24, d-25, d-26, d-28, d-35, d-36, adopt-d24, tier-bake, superseded-code, embeds, i18n]

# Dependency graph
requires:
  - phase: 11-04
    provides: dropService.rollBossDrop (the guaranteed boss-win item, D-14) + the sanguo item pool (sanguoItems.dropWeight)
  - phase: 11-05
    provides: runLegionBattle/LegionBattleInput (the forced 3v1 engine), chemistryService.applyChemistryBuff, resolveTurn (shared solo MP/skill path), TIER_MULTIPLIERS/STAT_GAIN_PER_LEVEL
  - phase: 11-02
    provides: sanguoCapture.ts CAPTURE_TIERS + CAPTURE_BASE_BY_RARITY (reused verbatim, D-26) + sanguoProgression.ts TIER_MULTIPLIERS/STAT_GAIN_PER_LEVEL
provides:
  - battleCheckInService real-zone-general boss routing (D-24/D-35): buildEnemyInput→buildLegionInput (per-main TIER_MULTIPLIERS bake P0-2, supports effective LEA P2-2, t2×IV31×L50 boss with rolled skills), forced runLegionBattle, WIN→rollBossDrop+capture / LOSS→boss departs; wild stays solo runBattle with the P0-3 skill/MP carry
  - captureService boss capture roll (D-26/D-28/D-36): rarity-5 10% base keyed on encounterType (P1-2), random IV ×6 + t0 95/t1 4.98/t2 0.02 + FIXED L20; wild insert now writes encounter.level + spawn skills (P1-1)
  - adopt-d24 superseded-code removal: src/constants/sanguoBoss.ts deleted, its import dropped, BOSS_CAPTURE_UNAVAILABLE guard gone — grep gate === 0
  - boss surfaces + i18n: buildSanguoBossEncounterEmbed (GOLD), battle-log 3v1 MP/special/support/no_mp lines, capture item_drop + captured_copy reveal; capture.item_drop/captured_copy, encounter.level/boss_line, skills.battle_* + battle.legion_log_title (3 locales)
affects: [11-07 legion assembly (consumes the persisted active legion the boss builder reads), 11-08 balance pass (tunes TIER_MULTIPLIERS/STAT_GAIN — this plan bakes the tier into the mains' input), 12-anti-abuse-monitoring-marketplace-gating]

# Actuals (#2632) — pairs with the plan's estimate (58000 estimateTokens / 29000 raw_tokens) on the same chars/4 scale over the realized diff.
actuals:
  tokens: 27265    # chars/4 over the 37bed6e..HEAD realized diff (~109060 chars, 15 files across tasks 2+3)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adopt-d24 one-way supersession: the superseded boss-template path (BOSS_TEMPLATES/bossTemplateFor) + the BOSS_CAPTURE_UNAVAILABLE guard are DELETED, not commented out — a real heroes row exists so the boss is capturable; the plan grep gate (=== 0) is the regression backstop"
    - "Nullable-column narrowing at trust boundaries: encounter.heroId stays nullable in the schema (wild vs boss); each consumer guards `if (heroId == null) throw new Error('NO_WILD_HERO')` before eq()/insert — never eq(heroes.id, null), never a silent undefined insert into the NOT NULL user_heroes.heroId"
    - "Skill-aware battle-log rendering: formatTurnLine branches on the TurnLog action/mpFallback fields (battle_special/battle_mp_gain/no_mp) only when the caller supplies a resolved skills context — absent context keeps the Phase 10 turn line byte-identical"

key-files:
  created:
    - src/ui/embeds/buildSanguoBossEncounterEmbed.ts
  modified:
    - src/services/sanguo/battleCheckInService.ts
    - src/services/sanguo/captureService.ts
    - src/ui/embeds/buildSanguoBattleLogEmbed.ts
    - src/ui/embeds/buildSanguoCaptureEmbed.ts
    - locales/vi/sanguo.json, locales/en/sanguo.json, locales/zh-cn/sanguo.json
    - src/services/sanguo/__tests__/battleCheckInService.test.ts
    - src/services/sanguo/__tests__/captureService.test.ts
  deleted:
    - src/constants/sanguoBoss.ts (superseded, adopt-d24)

key-decisions:
  - "ADOPT-D24 (the Task 1 checkpoint:decision, user-confirmed): FULL boss redesign supersession — the boss is a real capturable zone-general hero row at t2×IV100×L50, src/constants/sanguoBoss.ts BOSS_TEMPLATES + bossTemplateFor are DELETED (not dormant), and the captureService BOSS_CAPTURE_UNAVAILABLE guard is removed — closing WINDOWS.md #5"
  - "Type fixing via narrowing, not schema change: encounter.heroId stays nullable (legitimately null for other rows); each boss/wild consumer guards null before the heroes eq() and the NOT NULL user_heroes.heroId insert — the minimal correct fix per STEP A"
  - "P1-2 rarity stays type-driven on `encounterType === 'boss'` (NOT heroId == null): after the redesign a boss carries a real heroId with a real rarity (1-5); keying on heroId would silently move the boss base chance off the signed rarity-5 10% (D-26 violation) — the P1-2 pin test fixes chance === CAPTURE_BASE_BY_RARITY[5]"
  - "The capture-success embed sets a description ONLY when item_drop/captured_copy content exists — an empty string throws on EmbedBuilder.setDescription (shapeshift length >= 1)"

patterns-established:
  - "Legion input full snapshot stored in sanguo_battles.input (Pitfall 6): the boss branch calls storeLegionBattle with the complete LegionBattleInput; re-running runLegionBattle(seed, input) reproduces the stored roundLogs"
  - "First-match chemistry first-match + tier bake baked into the mains BEFORE the engine (P0-2/P2-2): mains' base × TIER_MULTIPLIERS[userHeroes.tier], supports' lea = base.lea + IV.lea + (level-1)×STAT_GAIN_PER_LEVEL — the pre-baked input is what the engine + replay store"

requirements-completed: [TQC-16, TQC-17]

coverage:
  - id: D1
    description: "Encounter-spawn layer (Task 2): encounterLevelService.rollWildLevel (D-33 band roll via cryptoUniform + crypto.randomInt in-band), skillService.rollSkill/rollSkillsForSpawn (D-30 rarity-weighted from class/slot pools), travelCheckInService spawn integration — boss sub-roll picks a REAL zone-general (hero_id non-null) at L50 + rolled skills written to encounter_runs"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterLevelService.test.ts#rollWildLevel bands"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/skillService.test.ts#rollSkill weighted + rollSkillsForSpawn"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#spawn integration (boss real hero + level + skills)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boss forced-legion routing (D-25, Task 3): a BOSS encounter routes to runLegionBattle with the full legion input — mains[3] each base × TIER_MULTIPLIERS[userHeroes.tier] (P0-2) + chemistry + level + skills, supports[9] effective LEA (P2-2), boss t2×IV31×L50 with rolled skills; no legion → legion.not_assembled; WIN → rollBossDrop + capture, LOSS → boss departs"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleCheckInService.test.ts#B1/B2/B4 boss routing + P0-2 pin"
        status: pass
    human_judgment: false
  - id: D3
    description: "Boss capture roll (D-26/D-28/D-36, Task 3): boss capture resolves rarity-5 10% base keyed on encounterType (P1-2) + 6× random IV + t0 95/t1 4.98/t2 0.02 tier roll + FIXED L20 + skills from encounter_runs; wild insert writes encounter.level + spawn skills (P1-1); masked guard removed"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/captureService.test.ts#P1-1 wild level carry + B-CAP-1/B-CAP-2 boss capture + P1-2 pin"
        status: pass
    human_judgment: false
  - id: D4
    description: "Boss surfaces + i18n (Task 3): new buildSanguoBossEncounterEmbed (GOLD, named general, encounter.boss_line), battle-log 3v1 MP/special/support/no_mp lines, capture item_drop + captured_copy reveal (D-28 weights never render — src/ui grep === 0); new i18n keys across 3 locales"
    verification:
      - kind: unit
        ref: "src/ui/embeds/buildSanguoBattleLogEmbed.ts#formatTurnLine skill-aware branches"
        status: pass
    human_judgment: false
  - id: D5
    description: "Superseded-code removal (adopt-d24): src/constants/sanguoBoss.ts deleted + its import dropped + BOSS_CAPTURE_UNAVAILABLE guard gone — the grep gate bossTemplateFor|BOSS_TEMPLATES|BOSS_CAPTURE_UNAVAILABLE === 0 across src/ (including the embedded phrases in tests/comments)"
    verification: []
    human_judgment: true
    rationale: "The deletion is structurally verified by the grep gate === 0 (enforced below in Self-Check) and the deleted-file git record — but the broader 'is the removed path never resurfacing through a handler' is a judgment call the phase verifier confirms."

# Metrics
duration: 45min
completed: 2026-08-18
status: complete
---

# Phase 11 Plan 06: Boss Fight + Capture Routing + Boss Surfaces Summary

**Closes WINDOWS.md #5 (adopt-d24): the boss is a real capturable zone-general hero fought as a forced 3v1 legion battle at t2×IV100×L50, with per-main tier bake (P0-2), effective-LEA supports (P2-2), spawn-rolled levels/skills carrying to capture (P1-1), rarity-5 boss base keyed on encounterType (P1-2), a fixed-L20 random-tier prize (D-28/D-36), the superseded boss-template + capture-guard code fully removed, and the GOLD/battle-log/capture surfaces + i18n built across 3 locales.**

## Performance

- **Duration:** 45 min (this continuation run ~33 min; Task 2 ~12 min committed by the prior executor)
- **Started:** 2026-08-18T07:35:00+07:00 (continuation)
- **Completed:** 2026-08-18T08:20:00+07:00
- **Tasks:** 3 (1 checkpoint:decision + 2 auto/tdd)
- **Files modified:** 15 (11 in Task 3 + 4 in Task 2) — 1 deleted, 2 created

## Accomplishments

- **Task 1 (RESOLVED) — adopt-d24 checkpoint:decision:** the user confirmed FULL one-way boss supersession — delete the sanguoBoss template path + the capture guard, route bosses as real zone-general heroes. This unblocked Tasks 2-3 per plan (`autonomous: false`).
- **Task 2 (TDD, prior executor) — encounter-spawn layer:** `encounterLevelService.rollWildLevel` (D-33 band roll L1-10 60% / L11-20 30% / L21-30 9.9% / L31-50 0.1% via cryptoUniform band then crypto.randomInt within-band), `skillService.rollSkill`/`rollSkillsForSpawn` (D-30 rarity-weighted class/slot pool picks), and the travelCheckInService spawn integration — a boss sub-roll now picks a REAL zone-general (hero_id non-null) at fixed L50 (D-35) with rolled skills, and both boss + wild writes carry level + skill ids into encounter_runs (D-31/D-33). Committed `37bed6e` (RED) + `218adf3` (GREEN).
- **Task 3 (this continuation) — boss fight + capture routing + superseded removal + surfaces:** `battleCheckInService` replaces the deleted `bossTemplateFor` path with `buildLegionInput` — a REAL zone-general boss at t2 base × IV all-31 × L50 with its rolled skills, mains each baked by `TIER_MULTIPLIERS[userHeroes.tier]` (P0-2), supports' `lea` = base.lea + IV.lea + (level−1)×STAT_GAIN_PER_LEVEL (P2-2), the FULL legion input stored in `sanguo_battles.input` (Pitfall 6). Forced `runLegionBattle`; WIN → `rollBossDrop` (guaranteed, D-14) + capture stays open, LOSS → boss departs. Wild stays solo `runBattle` now carrying the P0-3 skills/MP. `captureService` gains the boss branch (random IV ×6, tier t0 95/t1 4.98/t2 0.02, FIXED L20, skills from encounter_runs) keyed on `encounterType === 'boss'` (P1-2); the wild insert writes `encounter.level` + spawn skills (P1-1). `src/constants/sanguoBoss.ts` is deleted and the BOSS_CAPTURE_UNAVAILABLE guard removed (adopt-d24) — the grep gate === 0. Surfaces: `buildSanguoBossEncounterEmbed` (GOLD, named general, forced-legion line), battle-log 3v1 MP/special/support/no_mp lines, capture `item_drop` + `captured_copy` reveal (D-28 weights NEVER render), + i18n keys in vi/en/zh-cn.
- **Verification gate (STEP G):** targeted vitest (36 → 61 with Task 2 files), FULL suite 40 files / 409 tests green, typecheck green, check-i18n green, eslint (--max-warnings=0) green, grep gate === 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: checkpoint:decision (adopt-d24 resolved)** — (no code commit; decision recorded)
2. **Task 2 RED: encounter-spawn layer tests** - `37bed6e` (test)
3. **Task 2 GREEN: encounter-spawn implementation** - `218adf3` (feat)
4. **Task 3: boss routing + capture + superseded removal + boss surfaces** - `36c249e` (feat)

**Plan metadata:** `11-06-SUMMARY.md` (docs — this commit)

## Files Created/Modified

- `src/services/sanguo/battleCheckInService.ts` - boss routing: buildLegionInput (P0-2 tier bake + P2-2 effective LEA + t2×IV31×L50 boss), buildBossInput/buildSupports, storeLegionBattle, WIN→rollBossDrop / LOSS→depart, wild P0-3 skills/MP carry, null-guards on encounter.heroId
- `src/services/sanguo/captureService.ts` - boss capture branch (rarity-5 base P1-2, random IV/tier/L20), wild P1-1 level+skills insert, null-guard before the NOT NULL heroId insert
- `src/services/sanguo/__tests__/battleCheckInService.test.ts` - boss routing B1/B2/B3/B4 + P0-2 damage pin (real runLegionBattle), bossQueue() read-queue helper
- `src/services/sanguo/__tests__/captureService.test.ts` - P1-1 wild level carry + boss capture B-CAP-1/B-CAP-2 + P1-2 chance pin
- `src/ui/embeds/buildSanguoBossEncounterEmbed.ts` (new) - GOLD boss encounter, named general, forced-legion line
- `src/ui/embeds/buildSanguoBattleLogEmbed.ts` - 3v1 legion variant (GOLD) + skill-aware turn lines
- `src/ui/embeds/buildSanguoCaptureEmbed.ts` - boss success item_drop + captured_copy reveal
- `locales/{vi,en,zh-cn}/sanguo.json` - capture.item_drop/captured_copy, encounter.level/boss_line, skills.battle_*+support_*, battle.legion_log_title

## Decisions Made

- **ADOPT-D24 (Task 1, user-confirmed):** full one-way boss supersession — delete `src/constants/sanguoBoss.ts` BOSS_TEMPLATES/bossTemplateFor + the capture guard. The boss is a real capturable zone-general hero. One-way per D-24 / Pitfall 7; no dormant copy.
- **Type fixing by null-guard narrowing, not schema change:** `encounter.heroId` stays nullable in the schema; each boss/wild consumer guards `== null` → throw `NO_WILD_HERO` before the heroes `eq()` and the `user_heroes.heroId` NOT NULL insert (per STEP A).
- **P1-2 rarity keyed on `encounterType === 'boss'`, never `heroId == null`:** keeps the signed rarity-5 10% base (D-26); the pin test locks `chance === CAPTURE_BASE_BY_RARITY[5]` regardless of the zone general's real rarity.
- **Legion input fully stored (Pitfall 6) + tier/LEA baked into the snapshot** before the engine, keeping `sanguo_battles.input` replay-faithful.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `encounter.heroId` nullable typing broke typecheck after the interrupted edits**
- **Found during:** Task 3 (STEP A — the two TS2769 errors at battleCheckInService.ts:410 + captureService.ts:118/236)
- **Issue:** `encounter.heroId` is typed `number | null` (schema `hero_id` nullable); passing it to `eq(heroes.id, encounter.heroId)` and the NOT NULL `user_heroes.heroId` insert failed typecheck.
- **Fix:** null-guard narrowing (`if (encounter.heroId == null) throw new Error('NO_WILD_HERO')`) before each heroes `eq()` (buildBossInput, wildRarity) and before the capture insert — the schema column stays nullable (per STEP A preference (a), no schema change).
- **Files modified:** src/services/sanguo/battleCheckInService.ts, src/services/sanguo/captureService.ts
- **Verification:** typecheck green; full suite green
- **Committed in:** `36c249e` (Task 3)

**2. [Rule 1 - Bug] Test read-queue fixtures were wrong for the boss routing path**
- **Found during:** Task 3 (B1/B4 failing — `joined.slice is not a function`, boss-skills empty, runLegionBattle never reaching the drop assertions)
- **Issue:** `[legionJoin()]` wrapped the 12-row array in an extra array (the mock resolves each read result as-is, so `slots` became `[12rowArray]`); the P0-3 player-skill snapshot + the mains' skill snapshots + fetchSupportSpecials added reads the queue didn't account for, so the boss heroes + skills reads consumed wrong slots.
- **Fix:** added a `bossQueue()` helper returning the full 13-read sequence in call order (incl. mains' skill snapshots, fetchSupportSpecials, boss heroes, boss skills) and `legionJoin()` unwrapped; B3 now injects `runBattleFn` via deps (the helper maps its positional arg to runLegionBattleFn).
- **Files modified:** src/services/sanguo/__tests__/battleCheckInService.test.ts
- **Verification:** B1/B2/B3/B4 green
- **Committed in:** `36c249e` (Task 3)

**3. [Rule 2 - Missing Critical] P0-2 regression pin (t2 main strictly more damage than identical t0) absent**
- **Found during:** Task 3 (STEP F requirement — the interrupted edits had no P0-2 damage pin)
- **Issue:** the plan mandates a test that a t2 main's tier bake yields strictly more engine damage than an identical t0 main at the same level (P0-2).
- **Fix:** added a self-contained P0-2 pin building two otherwise-identical legion inputs differing only in tier and asserting `runLegionBattle` damage t2 > t0 (with a boss whose def stays below the main's eff atk so hits land).
- **Files modified:** src/services/sanguo/__tests__/battleCheckInService.test.ts
- **Verification:** P0-2 pin green (t2 totalDamage strictly greater)
- **Committed in:** `36c249e` (Task 3)

**4. [Rule 1 - Bug] Capture-success embed broke on an empty description**
- **Found during:** Task 3 (the `/sanguo battle` command test `handleCaptureTierPress` failed — `EmbedBuilder.setDescription('')` threw shapeshift length >= 1)
- **Issue:** extending the success state to render item_drop/captured_copy called `setDescription(parts.join('\n'))` with an empty string for a plain (non-boss) wild success.
- **Fix:** set the description only when parts is non-empty; a plain wild success keeps title-only (the Phase 10 behavior).
- **Files modified:** src/ui/embeds/buildSanguoCaptureEmbed.ts
- **Verification:** the battle command test + full suite green
- **Committed in:** `36c249e` (Task 3)

---

**Total deviations:** 4 auto-fixed (3 bug / 1 missing-critical)
**Impact on plan:** All 4 were necessary for the plan to type-check and pass its own acceptance criteria. Two (type errors, empty-description bug) were completion-of-interrupted-work; one (P0-2 pin) was a plan-mandated regression the interrupted edits lacked; one (read-queue) was a test-fixture correction. No scope creep.

## TDD Gate Compliance

The plan frontmatter is `type: execute` (not `type: tdd`), so plan-level RED/GREEN gate enforcement does not apply. Task 2 carries `tdd="true"` and followed RED → GREEN with atomic commits (`37bed6e` test → `218adf3` feat). Task 3 (this continuation) was completed as a single cohesive feat commit (`36c249e`) over the already-type-checked production + test changes — the tests were authored alongside the interrupted implementation (the plan's Task 3 is `type="auto"` not a TDD RED/GREEN split).

## Issues Encountered

- The continuation's 4 interrupted-edit issues (type errors, read-queue skew, missing P0-2 pin, empty-description embed) — all resolved above as deviations; none required the plan's structure to change.
- The `<verify>` greps for `0.95|4.98|0.02` correctly show 0 in `src/ui/` (hidden mechanics) while the SAME weights legitimately live in `captureService.ts` (the D-28 roll) — the UI gate and the service gate are separate (never-render is a UI contract).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **11-06 closes WINDOWS.md #5:** the boss is a real capturable hero fought as a forced 3v1 legion battle at t2×IV100×L50 with a guaranteed-item win and a D-28 random-roll prize.
- **11-07 (legion assembly):** `battleCheckInService.buildLegionInput` consumes the persisted active legion (user_legions + user_legion_slots) that 11-07 assembles; the chemistry tier label/link-count render rides `chemistryService`.
- **11-08 (balance pass):** the per-main tier bake (P0-2) + effective-LEA supports (P2-2) + boss stat profile are the exact values the legion-vs-boss sim tunes.

## Self-Check: PASSED

- FOUND: `src/services/sanguo/battleCheckInService.ts`, `captureService.ts`, `__tests__/battleCheckInService.test.ts`, `__tests__/captureService.test.ts`, `src/ui/embeds/buildSanguoBossEncounterEmbed.ts`, `buildSanguoBattleLogEmbed.ts`, `buildSanguoCaptureEmbed.ts`, `locales/{vi,en,zh-cn}/sanguo.json`; DELETED `src/constants/sanguoBoss.ts`
- FOUND commits: `37bed6e` (test Task 2), `218adf3` (feat Task 2), `36c249e` (feat Task 3)
- Verification: targeted vitest 61/61; FULL suite 40 files / 409 tests green; `npm run typecheck` green; `npm run check-i18n` green; `npm run lint` (--max-warnings=0) green; eslint pre-commit green on `36c249e`
- Acceptance greps: `bossTemplateFor|BOSS_TEMPLATES|BOSS_CAPTURE_UNAVAILABLE` across `src/` = **0** ✓; `runLegionBattle` + `rollBossDrop` present ✓; `TIER_MULTIPLIERS[tier]` in the mains path ✓; P0-3 skill/mp carry present ✓; `src/ui/` `0.95|4.98|0.02` = 0 ✓; boss `level: 20` + `0.95|0.9998` weights in captureService ✓; P1-2 pin `chance === CAPTURE_BASE_BY_RARITY[5]` ✓

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-18*
