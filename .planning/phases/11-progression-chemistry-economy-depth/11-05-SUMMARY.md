---
phase: 11-progression-chemistry-economy-depth
plan: 05
subsystem: combat-engine, chemistry, testing
tags: [battle-engine, legion, run-legion-battle, mp-economy, skills, support-effects, chemistry, d-19, d-29, d-18, pure-module, replay, tqc-17]

# Dependency graph
requires:
  - phase: 11-02
    provides: sanguoProgression.ts STAT_GAIN_PER_LEVEL (the level term) + sanguoChemistry.ts CHEMISTRY_POINTS/CHEMISTRY_TIERS (the chemistry contract)
  - phase: 11-02
    provides: sanguo-skills.json seeded — the effectValue convention the engine's special multiplier reads (damage = percent multiplier 100..300, attack_up 20, hp_regen 15, mp_regen +10)
provides:
  - battleEngine extension: optional level (D-08) + optional MP/skill fields (D-29) on CombatantInput; the SHARED resolveTurn helper (PLAN-FIX P0-3) used by both runBattle and runLegionBattle — absent skill fields -> byte-identical Phase 10 turns
  - runLegionBattle(seed, input) new pure export (D-17): 3 mains fight in MOV/AGI order + boss targets lowest-HP main; support effects (D-18) roll on the seeded rng (attack_up/hp_regen/mp_regen, LEA-driven trigger chance) — support outcomes part of the replay (OQ4)
  - chemistryService pure module (D-19): mainChemistryPoints (FIRST-MATCH P1-3) -> chemistryTier -> applyChemistryBuff (multiplicative on final combatStat) + supportTriggerChance (D-18) — pre-baked engine input (Pitfall 6)
  - 25 new tests (12 engine + 13 chemistry); Phase 10 18 replay tests UNCHANGED
affects: [11-06 boss routing (runLegionBattle input snapshot -> sanguo_battles.input jsonb; chemistry pre-bake), 11-07 legion assembly (chemistryService consumption + tier label/link count render), 11-08 balance pass (runs the legion sim + tunes CHEMISTRY_TIERS/STAT_GAIN), 12-anti-abuse-monitoring-marketplace-gating]

# Actuals (#2632) — pairs with the plan's estimate (48000) on the same chars/4 scale over the realized diff.
actuals:
  tokens: 11677    # chars/4 over the 9b31327..HEAD realized diff (46708 chars, 4 files)
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared turn-resolution helper (PLAN-FIX P0-3): ONE resolveTurn(rng, attacker, defender, ctx) serves BOTH engines — skill fields present -> D-29 MP branch, absent -> the exact Phase 10 hit/crit/damage steps consuming the same rng draws in the same order (byte-identical replay); per-combatant MP tracked by the caller, optional TurnLog fields only attached on MP-active turns"
    - "Legion round structure (D-17/D-18): support effects roll FIRST each round on the seeded rng (attack_up picks its target via the same rng — part of the replay), then the mains act in MOV/AGI order, then the boss attacks the lowest-current-HP living main (deterministic, replay-faithful)"
    - "Pure chemistry transform (D-19): link -> points -> tier -> buff is a deterministic function of the already-validated slots (class-agnostic; D-20 enforced at assembly), pre-baked into the mains' CombatantInput so sanguo_battles.input stays replay-faithful — points/buff% never render (D-12)"

key-files:
  created:
    - src/services/sanguo/chemistryService.ts
    - src/services/sanguo/__tests__/chemistryService.test.ts
  modified:
    - src/services/sanguo/battleEngine.ts
    - src/services/sanguo/__tests__/battleEngine.test.ts

key-decisions:
  - "resolveTurn carries the defender's current HP + the attacker's current MP via a TurnContext arg (the plan's literal (rng, attacker, defender) signature plus context) — the caller owns HP/MP state so runBattle and runLegionBattle can share ONE turn-resolution path; when the attacker carries NO skill/MP fields the turn is byte-identical to Phase 10 (same rng draws, same order; no optional log fields attached)"
  - "MP economy activation = presence of ANY MP/skill field on the combatant's snapshot (mpCurrent/skillNormal/skillSpecial); battle-start MP = mpCurrent ?? base.mp (the snapshot carries it per A6 — the engine never derives MP from a DB); the special-vs-normal decision is a deterministic MP check that consumes NO rng, so the hit/crit draw stream is unchanged by the skill branch"
  - "The engine keeps a PRIVATE supportTriggerChance copy (same D-18 formula as the chemistryService export) — Task 1 must not import a Task-2 file, and the engine stays self-contained/replay-faithful; chemistryService.ts is the canonical export for 11-06/11-07 consumers"
  - "Support-effect targets: attack_up picks a random main via the seeded rng (per plan); hp_regen heals the lowest-current-HP living main; mp_regen boosts the lowest-current-MP living main (deterministic picks, replay-faithful); damage/unknown effectTypes consume the trigger roll but apply nothing (a support never attacks — D-17)"
  - "Legion cap-tie HP%: player fraction = sum of the mains' remaining HP / sum of their base HP (playerHpAfter is the sum) — the natural generalization of the 1v1 resolveCap rule"
  - "chemistryService role is typed string (not the DB heroRoleEnum) — the pure module consumes already-resolved reference data, keeping it import-free (D-06)"

patterns-established:
  - "First-match chemistry scoring (PLAN-FIX P1-3): mainChemistryPoints walks supports with early-return priority spouse/family 3 > faction 2 > role 1 > 0 — never additive; the S/A/B/C/D thresholds are calibrated on this (max 27)"
  - "TurnLog additive-optional extension: Phase 11 fields (attackerMpAfter/action/mpFallback) are attached ONLY on MP-active turns; legacy turns keep exactly the 7 Phase 10 keys (pinned by a key-set test)"

requirements-completed: [TQC-17]

coverage:
  - id: D1
    description: "battleEngine CombatantInput extension — OPTIONAL level (D-08: eff() = base + IV + (level-1) x STAT_GAIN_PER_LEVEL, absent -> levelGain 0) + OPTIONAL MP/skill fields (D-29: mpCurrent/skillNormal/skillSpecial, resolved from the snapshot, never a DB read); the L1-vs-L50 test pins the +98 levelGain on a non-crit hit and combatStat stays base+IV (backward-compat)"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleEngine.test.ts#level term (D-08) describe"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveTurn shared helper (PLAN-FIX P0-3) — runBattle with skill fields ABSENT produces byte-identical Phase 10 roundLogs (7-key shape pinned per turn) while the SAME runBattle with skill fields PRESENT resolves the D-29 MP branch (special consumes 25, fallback gains 12, special damage multiplier round(1x1.5)=2 visible)"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleEngine.test.ts#MP economy (D-29 / PLAN-FIX P0-3) describe"
        status: pass
    human_judgment: false
  - id: D3
    description: "runLegionBattle(seed, input) pure export (D-17) — 3 mains fight in MOV desc -> AGI desc order (player-first tie), boss attacks the lowest-current-HP living main; replay deep-equals; round-cap winner-by-damage; dead-side fainted guard; incomplete legions (1-3 mains) accepted"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleEngine.test.ts#legion battle (D-17) replay contract + legion round cap describes"
        status: pass
    human_judgment: false
  - id: D4
    description: "Support effects (D-18) — per round per support, a seeded LEA-driven trigger roll (clamp(0.15 x (1 + (lea-10) x 0.02), 0.05, 0.35)); attack_up +20% atk 1 turn on a rng-picked main (dmg 70 buffed vs 50 unbuffed at seed 2), hp_regen 15% of base HP, mp_regen +10 MP; outcomes ride the same xoroshiro128plus so they are part of the replay (OQ4)"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/battleEngine.test.ts#support effects (D-18) describe"
        status: pass
    human_judgment: false
  - id: D5
    description: "chemistryService pure module (D-19) — mainChemistryPoints FIRST-MATCH (P1-3: family+faction support scores 3 not 5), chemistryTier walks CHEMISTRY_TIERS (S>=12 +10% .. D>=1 +2%, 0 -> { label: null, buff: 0 } bonus-only), applyChemistryBuff multiplicative Math.round on the final combatStat (100 -> 110 at S), supportTriggerChance anchors + [0.05, 0.35] clamp; zero db/redis/discord imports"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/chemistryService.test.ts#mainChemistryPoints/chemistryTier/applyChemistryBuff/supportTriggerChance describes"
        status: pass
    human_judgment: false

# Metrics
duration: 16min
completed: 2026-08-14
status: complete
---

# Phase 11 Plan 05: Legion Battle Engine + Pure Chemistry Service Summary

**The combat core of Phase 11 (TQC-17): battleEngine extended non-breakingly into the seeded 3-main legion battle engine — optional level term (D-08), the shared resolveTurn helper with the 2-slot MP/skill economy (D-29/P0-3), LEA-driven support effects (D-18) all riding the replay-faithful xoroshiro128plus — plus the pure first-match chemistry module (D-19) whose multiplicative buff pre-bakes the mains' stats before the engine — with all 18 Phase 10 replay tests green UNCHANGED.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-14T17:17:00+07:00
- **Completed:** 2026-08-14T17:33:00+07:00
- **Tasks:** 2 (1 tracer + 1 auto/tdd)
- **Files modified:** 4 (2 modified, 2 created)

## Accomplishments

- **Task 1 (TRACER) — battleEngine non-breaking extension:** `CombatantInput` gains an OPTIONAL `level` (D-08 — `eff()` = base + IV + (level−1)×STAT_GAIN_PER_LEVEL; absent → levelGain 0 → the Phase 10 formula byte-identical) and OPTIONAL `mpCurrent`/`skillNormal`/`skillSpecial` fields (D-29 — resolved from the snapshot, never a DB read, Pitfall 6). The new shared `resolveTurn(rng, attacker, defender, ctx)` helper (PLAN-FIX P0-3) performs the Phase 10 hit/crit/damage steps AND the D-29 skill/MP branch (normal +mpGain / special −mpCost × effectValue/100 multiplier / insufficient-MP normal fallback emitting the `mpFallback` flag for the skills.no_mp UI line) — when the skill fields are ABSENT it consumes the same rng draws in the same order, so the Phase 10 replay contract holds byte-identically (pinned by a 7-key-per-turn shape test + the untouched 18-test suite). `runLegionBattle(seed, input)` (D-17) is the new pure export: 3 mains act in MOV desc → AGI desc order (player-first tie), each attacking the boss via `resolveTurn`; the boss attacks the lowest-current-HP living main (deterministic, replay-faithful) with its own rolled skills when present; support effects (D-18) roll per round per support on the SAME seeded rng (attack_up +20% atk 1 turn / hp_regen 15% base HP / mp_regen +10 MP, LEA-driven trigger chance clamped [0.05, 0.35]) — support outcomes are part of the replay (OQ4). Round cap 20 → winner by total damage, tie → remaining HP% (sum of the mains' remaining / sum of base HP). `TurnLog` gains optional `attackerMpAfter`/`action`/`mpFallback` — attached only on MP-active turns so legacy log bytes never change.
- **Task 2 (TDD RED→GREEN) — chemistryService pure module (D-19):** `mainChemistryPoints(main, supports)` implements the PLAN-FIX P1-3 **first-match** scoring (spouse/family 3 > faction 2 > role 1 > 0 per support, never additive — a same-family AND same-faction support scores 3, not 5; pinned by test), summing over the ≤9 supports (max 27). `chemistryTier(points)` walks the `CHEMISTRY_TIERS` constant (S≥12 +10% … D 1-2 +2%, 0 → `{ label: null, buff: 0 }` bonus-only EA FC floor). `applyChemistryBuff(stat, buff)` is multiplicative on the final combatStat (base + IV + levelGain) with Math.round. `supportTriggerChance(lea)` = clamp(0.15×(1+(lea−10)×0.02), 0.05, 0.35) — the D-18 value the engine's support rolls use (the engine keeps a private copy for self-containment; this export is canonical for 11-06/11-07). Pure module discipline: zero db/redis/discord imports, no Math.random, no Date (D-06); points/buff% never render (D-12); class-agnostic (D-20 enforced at assembly in 11-07).
- **Non-breaking proof + tracer gate:** the FULL Phase 10 battleEngine suite (18 replay/formula tests) passes UNCHANGED after the refactor; the tracer's end-to-end `<verify>` re-ran green (30/30 engine tests + typecheck); the whole repo suite is 38 files / 388 tests green.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TRACER): battleEngine extension — legion 3v1 + MP/skills + support effects + level term** - `c97235d` (feat)
2. **Task 2 RED: failing chemistryService tests** - `6a56d76` (test)
3. **Task 2 GREEN: chemistryService implementation** - `e6059bf` (feat)

**Plan metadata:** `11-05-SUMMARY.md` (docs — this commit)

## Files Created/Modified

- `src/services/sanguo/battleEngine.ts` - OPTIONAL level + MP/skill fields on CombatantInput; shared resolveTurn (P0-3); runLegionBattle export + LegionBattleInput/LegionBattleResult; support-effect rolls + private supportTriggerChance; header D-17/D-29/D-18/OQ4/P0-3 notes
- `src/services/sanguo/__tests__/battleEngine.test.ts` - 12 new tests (legion replay, MOV order, cap damage-win, fainted guard, support trigger at seed 2, one-turn buff, L1-vs-L50 level term, P0-3 byte-identical key shape, MP fallback/special bookkeeping, boss own skills); Phase 10 18 tests untouched
- `src/services/sanguo/chemistryService.ts` - mainChemistryPoints (first-match P1-3), chemistryTier, applyChemistryBuff, supportTriggerChance + ChemistryLinkInput/SupportLinkInput
- `src/services/sanguo/__tests__/chemistryService.test.ts` - 13 tests (points/first-match pin/ceiling 27, tier table walk, multiplicative buff, trigger anchors + clamp)

## Decisions Made

- **resolveTurn's context parameter:** the shared helper takes the defender's current HP + the attacker's current MP through a `TurnContext` arg (the caller owns HP/MP state, so runBattle and runLegionBattle share one turn path). When the attacker carries NO skill/MP fields the turn is byte-identical to Phase 10 — same rng draws in the same order, no optional log fields attached.
- **MP economy activation = any MP/skill field present** on the snapshot; battle-start MP = `mpCurrent ?? base.mp` (A6 — the caller snapshots base.mp); the special-vs-normal decision is a deterministic MP check that consumes NO rng, preserving the hit/crit draw stream.
- **Private engine copy of supportTriggerChance:** Task 1 cannot import a Task-2 file and the engine must stay self-contained/replay-faithful — the same D-18 formula is implemented privately in battleEngine and exported canonically from chemistryService (11-06/11-07 consume the export).
- **Support-effect targets:** attack_up → random main via the seeded rng (per plan); hp_regen → lowest-current-HP living main; mp_regen → lowest-current-MP living main (deterministic picks, replay-faithful); damage/unknown effectTypes consume the trigger roll but apply nothing (a support never attacks — D-17).
- **Legion cap-tie HP%:** player fraction = Σ mains' remaining HP / Σ mains' base HP (playerHpAfter is the sum) — the natural generalization of the 1v1 resolveCap rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion on the level-term delta assumed identical hit/crit patterns across levels**
- **Found during:** Task 1 (post-implementation seed scan before writing the level test)
- **Issue:** The planned assertion `delta % 98 === 0` (L50 total damage − L1 total damage) assumed the L1 and L50 runs share the identical hit/crit pattern. The D-08 level term applies to ALL 6 stats — a L50 main's AGI is +98, so its hit/crit chances legitimately differ and the same rng stream yields different outcomes (verified: L50 crits at turns 2/6 vs L1 at turn 18).
- **Fix:** Rewrote the level test to pin the level term precisely on comparable per-hit damage: a non-crit hit is max(100−50,1)=50 at L1 and max(100+98−50,1)=148 at L50 — `dmg(L50) − dmg(L1) = 49 × STAT_GAIN_PER_LEVEL` — plus `totalDamagePlayer(L50) > totalDamagePlayer(L1)`.
- **Files modified:** src/services/sanguo/__tests__/battleEngine.test.ts
- **Verification:** level test green; full suite 388/388
- **Committed in:** `c97235d` (Task 1 commit)

**2. [Rule 1 - Bug] Legion fixture spread `agi`/`mov` at the top level instead of under `base`**
- **Found during:** Task 1 (writing LEGION_MAIN_B/C fixtures)
- **Issue:** The spread `{ ...LEGION_MAIN_A, agi: 45, mov: 40 }` added unknown top-level keys — `agi`/`mov` live nested under `base`, so the MOV-order test would have seen identical stats for all three mains.
- **Fix:** `base: { ...LEGION_MAIN_A.base, agi: 45, mov: 40 }`.
- **Files modified:** src/services/sanguo/__tests__/battleEngine.test.ts
- **Verification:** MOV-order test green (main-c 45 → main-b 40 → main-a 35)
- **Committed in:** `c97235d` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bug — both test-fixture/assertion corrections, no production-code change)
**Impact on plan:** None — both were test-authoring corrections made before the tests were committed; the production engine + chemistry service shipped exactly as specified. No scope creep.

## TDD Gate Compliance

The plan frontmatter is `type: execute` (not `type: tdd`), so plan-level RED/GREEN gate enforcement does not apply. Task 2 carries `tdd="true"` and followed RED → GREEN with atomic commits:
- RED: `6a56d76` (test — 13 failing tests, module-not-found for the right reason) → GREEN: `e6059bf` (feat — 13 passing).

Task 1 (tracer) is a real production slice committed atomically at `c97235d`; its end-to-end `<verify>` re-ran green before Task 2 started (tracer feedback gate, autonomous path — this run executes the full plan in one shot).

## Issues Encountered

- **Level-term AGI side effect (design-correct, test-surprise):** because D-08 raises all 6 stats, a higher-level main also hits/crits more often — the intended "leveling raises the 6 battle stats" behavior, but it means per-level battle comparisons must pin per-hit damage rather than total-damage deltas (documented in the level test comment).
- **Pure-module grep false positive:** the acceptance grep `Math.random\|new Date\|from '.*db` matches the Phase 10 header docblock prose ("no Math.random, no Date/now/global state…") — a code-only grep (calls + imports) confirms zero violations; the docblock prose existed in the original Phase 10 file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **11-06 (boss routing + capture):** `runLegionBattle(seed, input)` is the pure engine the boss branch calls; the input snapshot (`mains[3]` buffed + `supports[9]` + `boss`) maps directly to `sanguo_battles.input` jsonb (Pitfall 6). The 11-06 boss input builder applies `TIER_MULTIPLIERS` (P0-2) + L50 level + IV100 to the zone-general's `heroes` row; `chemistryService` pre-bakes the mains' buffed stats; the player main's `user_heroes` skills feed `skillNormal`/`skillSpecial` + `mpCurrent` (base.mp per A6).
- **11-07 (legion assembly):** `mainChemistryPoints` consumes the class-validated slots (D-20 enforced there); `chemistryTier`'s label + the link count render (D-12 — points/buff% never); `supportTriggerChance` exports the canonical D-18 value.
- **11-08 (balance pass):** the legion-vs-boss simulation rides `runLegionBattle` over the seeded stat ranges at L50/60/70 × t0/t1/t2 × chemistry tiers; tunes `STAT_GAIN_PER_LEVEL`/`TIER_MULTIPLIERS`/`CHEMISTRY_TIERS` buffs — never the locked D-05 fight formula.
- **Boss server + PvP (deferred):** the 3-main active-combatant engine built here is the foundation.

## Self-Check: PASSED

- FOUND: src/services/sanguo/battleEngine.ts (modified), chemistryService.ts (created), __tests__/battleEngine.test.ts (modified, 30 tests), __tests__/chemistryService.test.ts (created, 13 tests)
- FOUND commits: c97235d (feat tracer), 6a56d76 (test RED), e6059bf (feat GREEN)
- Full suite: 38 files / 388 tests green; `npm run typecheck` green; eslint pre-commit green on all 3 commits
- Acceptance greps: `level?` ≥1 ✓, `runLegionBattle` ≥2 (5) ✓, code-level `Math.random(`/`new Date(`/db-imports = 0 ✓, chemistryService db/redis/discord imports = 0 ✓, CHEMISTRY_POINTS imported not literal ✓, `Math.min(0.35` + `Math.max(0.05` clamps present ✓

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-14*
