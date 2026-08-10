---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Tam Quốc Collection
status: planning
last_updated: "2026-08-10T06:59:26.363Z"
last_activity: 2026-08-10
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-08-10 — Milestone v3.0 started

## Phase Registry (Milestone v2)

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 05 | Self-bot Infrastructure & Core Loop | FARM-01, FARM-06 | ██ Done | 2026-06-04 |
| 05.1 | Proxy Pool & Admin Management | FARM-08 | ██ Done | 2026-06-04 |
| 06 | Farming Logic & Captcha Handling | FARM-03, FARM-04, FARM-07 | ██ Done | 2026-06-04 |
| 06.1 | Farming Channel Management | FARM-09 | ██ Done | 2026-06-04 |
| 07 | Monetization & Subscription Commands | FARM-02, FARM-05, MONET-01, MONET-04 | ██ Done | 2026-06-05 |

**Total v2 requirements:** 13/13 mapped ✓

---

## Performance Metrics (v2)

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Phases complete | 5 |
| Requirements total | 13 |
| Requirements delivered | 13 |
| Plans created | 11 |
| Plans complete | 11 |

---

## Accumulated Context (v2)

### Milestone v2 Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| Batched Worker Pool Architecture | Optimize CPU usage (4 cores) while leveraging high RAM (24GB). Batch clients into 2-3 worker processes instead of 1-per-process. | Milestone Init |
| discord.js-selfbot-v13 | Stable library for interacting with user tokens and automation. | Milestone Init |
| Channel Isolation (D-03) | Each self-bot gets a private channel in the auth server to prevent cross-account detection and message clashing. | Phase 06.1 |
| Prorated Subscription Upgrades | Allow users to upgrade from Basic to VIP by paying for the remaining days, improving user experience and monetization flexibility. | Phase 07 |

### Active Todos (v2)

- [x] Implement Subscription model (Phase 07)
- [ ] Prepare for production deployment of OwO Farming Service

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260629-8pw | Fix football placeholder team names in bet notifications | 2026-06-28 | ef21849 | [260629-8pw-fix-football-placeholder-team-names-in-b](./quick/260629-8pw-fix-football-placeholder-team-names-in-b/) |
| 260810-f7j | Upgrade dependencies: eslint 9→10 (EOL), TS 6.0.3, vitest 4, ioredis 6, pm2 7, lint-staged 17, + minor/patch | 2026-08-10 | 4700405 | [260810-f7j-upgrade-dependencies-eslint-9-to-10-eol-](./quick/260810-f7j-upgrade-dependencies-eslint-9-to-10-eol-/) |

---

## Session Continuity

**To resume work:** Milestone v2 is functionally complete. Proceed to production hardening or next milestone.

---

*State updated for v2: 2026-06-04*
