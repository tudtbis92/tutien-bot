---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Tam Quốc Collection
current_phase: 08
current_phase_name: foundation-economy-budget-content-infrastructure
status: executing
stopped_at: Completed 08-01-PLAN.md
last_updated: "2026-08-11T03:26:58.009Z"
last_activity: 2026-08-11
last_activity_desc: Phase 08 execution started
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.
**Current focus:** Phase 08 — foundation-economy-budget-content-infrastructure

## Current Position

Phase: 08 (foundation-economy-budget-content-infrastructure) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-08-11 — Phase 08 execution started

Progress: [███░░░░░░░] 25%

## Phase Registry (Milestone v3)

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 08 | Foundation, Economy Budget & Content Infrastructure | TQC-01..05 | ░░ Not started | - |
| 09 | Travel & Encounters | TQC-06..09 | ░░ Not started | - |
| 10 | Battle & Capture | TQC-10..13 | ░░ Not started | - |
| 11 | Progression, Chemistry & Economy Depth | TQC-14..17 | ░░ Not started | - |
| 12 | Anti-Abuse, Monitoring & Marketplace Gating | TQC-18..21 | ░░ Not started | - |

**Total v3 requirements:** 21/21 mapped ✓

## Performance Metrics (v3)

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Phases complete | 0 |
| Requirements total | 21 |
| Requirements delivered | 0 |
| Plans created | 0 |
| Plans complete | 0 |

## Accumulated Context (v3)

### Milestone v3 Decisions / Design Gates

| Decision | Rationale | Phase |
|----------|-----------|-------|
| Encounters từ paid travel, không từ chat activity | Linh thạch là sink chính + chống bot tự nhiên (khác Pokétwo/Mudae) | Milestone Init |
| `crypto.randomInt()` cho mọi roll player-facing; pure-rand chỉ cho battle replay/test | Predictable PRNG phá vỡ fairness + economy | Milestone Init |
| Economy design-gate trước content (TQC-05) | Chặn faucet → marketplace arbitrage (Linh thạch printing press) | Phase 8 |
| Soul gems account-bound, không convert Linh thạch | Ngăn dupe loop sụp economy | Phase 11 |
| Boss drops items, never money | Faucet an toàn không chạm `users.balance` | Phase 11 |

### Pending Todos / Blockers

- [ ] Resolve charge-on-arrival vs deduct-at-departure conflict (research gap) — Phase 9 planning; verification cần cancel/arrive/fail matrix test
- [ ] Emoji rendering deployment smoke-test (application-owned emoji, MEDIUM confidence) — trước khi Phase 9 phụ thuộc
- [ ] Economy budget numbers cần tu vi caps + VWAP band values hiện tại — Phase 8
- [ ] Research-phase khả năng cao: Phase 12 (bot detection vs farming captcha infra), Phase 11 (pacing balance + chemistry values)

## Session Continuity

**Resume file:** None

Last session: 2026-08-11T03:26:57.992Z
Stopped at: Completed 08-01-PLAN.md
Resume: `/gsd-plan-phase 8`

---

*State updated for v3: 2026-08-10*

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 08-foundation-economy-budget-content-infrastructure P1 | 32min | 3 tasks | 20 files |

## Decisions

- [Phase ?]: ESLint emoji rule uses ESLintUtils.RuleCreator (v8.66.0 actual API) scoped to src/commands + src/ui (emoji-rendering surface, D-15) — createRule does not exist in installed version; blanket src/** scope would flag pre-existing OWO_BOT_ID
- [Phase ?]: heroId optional in SanguoMapEmbedData.zones - null representative_hero_id renders label-only zone entry (D-07) — Plan interface said heroId: string but must-have truth requires label-only rendering for null zone markers
