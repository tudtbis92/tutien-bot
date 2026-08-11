---
phase: 08-foundation-economy-budget-content-infrastructure
plan: 3
subsystem: economy
tags: [economy-budget, design-gate, adr, tqc-05, linh-thach, sink-source, net-sink, convertibility]

# Dependency graph
requires:
  - phase: 08-foundation-economy-budget-content-infrastructure
    provides: Verified sink/source numbers from TQC-05 research (gather fees, farming prices, football bounds, DAILY_CAP) and milestone decisions (hồn ngọc account-bound, boss drops items never money)
provides:
  - docs/economy-budget.md — ADR-style design-gate document (D-17): sink/source model with file:line citations (D-20), expected net Linh thạch/hour <= 0 below DAILY_CAP 10_000 tu-vi bound (SC5), convertibility matrix, D-19 net-sink/neutral hard constraint
  - Design Gate Sign-off record (D-18) — gate PASSED 2026-08-11, gates content authoring in Phases 9-11
affects: [Phase 9 Travel & Encounters (TQC-06/08), Phase 10 Battle & Capture (TQC-12), Phase 11 Progression & Economy (TQC-14/15/16/17), Phase 12 Anti-Abuse & Marketplace Gating (TQC-19/20)]

# Actuals (#2632) — pairs with the plan's estimate (10000 tokens) to calibrate future estimates.
actuals:
  tokens: 2858   # chars/4 over the realized diff (11,433 chars)
  tasks: 2       # tasks completed
  commits: 2     # commits made

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ADR-style design-gate document (Status/Context/Decision/Consequences) as the pre-content economic contract
    - Append-only gate record pattern: sign-off section appended, never editing earlier sections, single gate record per doc

key-files:
  created:
    - docs/economy-budget.md - ADR-style economy design-gate doc (TQC-05/D-17/D-18/D-19/D-20)
  modified: []

key-decisions:
  - "Economy design gate PASSED (2026-08-11): D-19 net-sink/neutral is a hard constraint, expected net Linh thạch/hour of the optimal sanguo loop is <= 0 (trivially below DAILY_CAP 10_000 tu-vi cap, SC5), convertibility matrix accepted"
  - "Marketplace figures (VWAP 1.2x/0.7x/2.5x, 10% seller fee min 1 burn) labeled 'planned (MKT-02/03/04/07), not live' so Phase 12 audit (TQC-19) cannot treat them as live numbers"
  - "The doc records the only faucet: Phase 10 free starter hero (TQC-12); hồn ngọc account-bound and never convertible to Linh thạch; boss thường drops items only, never money"

patterns-established:
  - "Design-gate doc pattern: every number cited to source file:line (D-20), spec-only figures explicitly labeled planned/not live, sign-off records decision + date + gated phases (D-18 one-way gate)"

requirements-completed: [TQC-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "docs/economy-budget.md ADR-style design-gate document with verified sink/source model, expected Linh thạch/hour bound below tu vi cap, convertibility matrix, and D-19 net-sink/neutral hard constraint"
    requirement: TQC-05
    verification:
      - kind: unit
        ref: "PowerShell verification: docs/economy-budget.md exists; DAILY_CAP+10_000+game.ts:14, MKT-07 planned-not-live label, net-sink outflow>=inflow, convertibility+hồn ngọc-never-to-linh-thạch, start.ts:75-79 + gatherFees.ts:17-30 all PASS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Design Gate Sign-off section (D-18) — gate PASSED with date, decision, gating statement for Phases 9-11, Phase 12 consumer reference; single gate record, append-only"
    requirement: TQC-05
    verification:
      - kind: unit
        ref: "PowerShell verification: '## Design Gate Sign-off' appears exactly once; contains date 2026-08-11, D-19 hard constraint, SC5 bound, Phase 9/10/11 gating, TQC-12, TQC-19; all task-1 markers intact"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-08-11
status: complete
---

# Phase 8 Plan 3: Economy Budget Design-Gate Document Summary

**ADR-style economy budget doc (docs/economy-budget.md) with code-verified sink/source numbers (each cited file:line), D-19 net-sink/neutral hard constraint, convertibility matrix, and the Design Gate Sign-off (PASSED 2026-08-11) that gates Phases 9-11 content authoring**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-11T11:04:22Z
- **Completed:** 2026-08-11T11:22:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Authored `docs/economy-budget.md` — the Milestone v3 economic design gate (TQC-05, D-17/D-18/D-19/D-20) — as a standalone ADR-style document (Status: Accepted, Context, Sink/Source Model, Expected Linh thạch/hour, Convertibility Matrix, Net-Sink/Neutral Constraint, Consequences)
- Recorded the live economy with every number verified against the codebase and cited: gather fees `200n → 400_000n` across 12 tiers (`gatherFees.ts:17-30`, EV invariant `gatherFees.ts:10`), farming subscription prices `10000n/35000n/50000n` + upgrade `BigInt(daysLeft * 1000)` (`subscriptionService.ts:19-32, 50-56`), football wager bounds `MIN_BET 100n / MAX_BET 1_000_000n` (`footballConfig.ts:8-11`), daily tu vi cap `DAILY_CAP 10_000` (`game.ts:14`) labeled as a progression cap not currency, new-user starting balance 0 (`start.ts:75-79`)
- Documented the only live source (football winnings/refunds via `matchLifecycleService.ts:357-360, 417-420, 433-436`) and labeled the marketplace figures (instant-buy 1.2x, instant-sell 0.7x, limit-sell ceiling 2.5x, 10% seller fee min 1 all burn) as **planned (MKT-02/03/04/07), not live** — the marketplace is stubbed (`src/jobs/vwapRecalc.ts:11` TODO)
- Recorded the expected net Linh thạch/hour of the optimal loop <= 0 under the net-sink/neutral constraint (D-19), trivially below the `DAILY_CAP 10_000` tu-vi-cap sanity bound (SC5), with a ~416/hour gross magnitude bound and the recompute method Phases 9-11 must apply
- Recorded the convertibility matrix: tu vi never → Linh thạch; hồn ngọc account-bound, never → Linh thạch; duplicate heroes → hồn ngọc (Phase 11 TQC-14); the ONLY faucet is the Phase 10 free starter hero (TQC-12); boss thường drops items never money; no sanguo item marketable without a reviewed conversion spec (Phase 12 TQC-20)
- Appended the **Design Gate Sign-off** (D-18): gate PASSED 2026-08-11, hard gating statement for Phases 9-11 content (TQC-06/08, TQC-12, TQC-14/15/16/17 must comply with D-19), Phase 12 audit (TQC-19) consumer reference — SC5 "design gate passed before content authoring" satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Author docs/economy-budget.md — ADR-style economy design gate document (TQC-05, D-17/D-18/D-20)** - `e374263` (docs)
2. **Task 2: Record the Design Gate Sign-off (D-18) — gate passed, gates Phases 9-11 content** - `63d58af` (docs)

**Plan metadata:** pending (docs: complete plan — committed in final metadata commit)

## Files Created/Modified
- `docs/economy-budget.md` - ADR-style economy design-gate document: live sink/source model with code-verified citations (D-20), expected net Linh thạch/hour <= 0 below DAILY_CAP 10_000 (SC5), convertibility matrix, D-19 net-sink/neutral hard constraint, and the appended Design Gate Sign-off (D-18) gating Phases 9-11

## Decisions Made
- **Economy design gate PASSED (2026-08-11)** — the document as authored is approved: D-19 net-sink/neutral is a hard constraint; expected net Linh thạch/hour <= 0 is trivially below the tu-vi cap sanity bound; convertibility matrix accepted. Any future rebalancing requires a new sign-off (D-18 one-way gate).
- **Marketplace figures labeled spec-only** — VWAP bands and the 10% seller fee are cited to REQUIREMENTS.md (MKT-02/03/04/07) as "planned, not live", so Phase 12 monitoring (TQC-19) re-verifies against code before auditing and cannot treat them as live numbers.
- **Single gate record, append-only** — the sign-off was appended without modifying earlier sections; verified the "Design Gate Sign-off" heading occurs exactly once.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. (Environment note: `rg` is not on PATH in this PowerShell environment; the plan's verification commands were executed with equivalent PowerShell/`[System.IO.File]` byte-level checks, including UTF-8-safe verification of Vietnamese strings like "hồn ngọc" which the console display mangles.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- **SC5 satisfied:** the economy budget document is approved and the design gate passes before any content authoring in Phases 9-11.
- **Gate applies to:** Phase 9 (travel costs TQC-06, encounter yields TQC-08), Phase 10 (starter faucet TQC-12 is the only faucet), Phase 11 (evolution/shop sinks TQC-14/15/16/17 must comply with D-19), Phase 12 (TQC-19 consumes this doc as audit baseline; TQC-20 marketplace gating).
- **Blockers/concerns:** none for this plan. Phase 08 plan 4 (08-04 — dev-DB env + sanguo schemas + migration + seed) is the remaining wave-2 plan.

---
*Phase: 08-foundation-economy-budget-content-infrastructure*
*Completed: 2026-08-11*

## Self-Check: PASSED

- FOUND: docs/economy-budget.md (127 insertions, both task commits)
- FOUND: 08-03-SUMMARY.md
- FOUND: commit e374263 (Task 1 — author economy budget doc)
- FOUND: commit 63d58af (Task 2 — Design Gate Sign-off)

