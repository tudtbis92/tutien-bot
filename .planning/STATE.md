---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Tam Quốc Collection
status: planning
last_updated: "2026-08-10"
last_activity: 2026-08-10
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.
**Current focus:** Phase 8 — Foundation, Economy Budget & Content Infrastructure (Milestone v3.0)

## Current Position

Phase: 8 of 12 (Milestone v3.0 — Tam Quốc Collection)
Plan: — (not yet planned)
Status: Roadmap created — ready to plan Phase 8
Last activity: 2026-08-10 — Milestone v3.0 roadmap created (Phases 8–12, 21/21 TQC requirements mapped)

Progress: [░░░░░░░░░░] 0%

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

Last session: 2026-08-10
Stopped at: Milestone v3.0 roadmap created — Phases 8–12 defined, 21/21 TQC requirements mapped
Resume: `/gsd-plan-phase 8`

---

*State updated for v3: 2026-08-10*
