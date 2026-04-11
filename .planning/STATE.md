# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Current Position

**Current Phase:** None (not started)  
**Current Plan:** None  
**Status:** Roadmap created — ready to begin Phase 1  
**Last Updated:** 2026-04-11

```
Progress: ░░░░░░░░░░░░░░░░░░░░ 0%

Phase 1 [Foundation]               ░░░░░ NOT STARTED
Phase 2 [Core Game Loop]           ░░░░░ NOT STARTED
Phase 3 [Combat + Marketplace]     ░░░░░ NOT STARTED
Phase 4 [Season System + Admin]    ░░░░░ NOT STARTED
```

---

## Phase Registry

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 1 | Foundation | INFRA-01..07, I18N-01..03 (10) | Pending | - |
| 2 | Core Game Loop + Progression | CORE-01..08, PROG-01..08 (16) | Pending | - |
| 3 | Combat + Marketplace | COMBAT-01..04, MKT-01..12 (16) | Pending | - |
| 4 | Season System + Admin | SEASON-01..05, ADMIN-01 (6) | Pending | - |

**Total requirements:** 48/48 mapped ✓

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 4 |
| Phases complete | 0 |
| Requirements total | 48 |
| Requirements delivered | 0 |
| Plans created | 0 |
| Plans complete | 0 |

---

## Accumulated Context

### Key Decisions Made

| Decision | Rationale | Phase |
|----------|-----------|-------|
| 4 coarse phases (compressed from 8) | Granularity = coarse; CORE+PROG combined; COMBAT+MKT combined | Roadmap |
| Stateless shards from day 1 | All state in PostgreSQL, Redis for hot cache only — non-negotiable architecture | Phase 1 |
| Anti-farming ships with accumulation | CORE-04/05 in same phase as CORE-01/02/03 — never deferred | Phase 2 |
| Marketplace Worker concurrency: 1 | Prevent order double-fill race conditions — architectural constraint | Phase 3 |
| Season after marketplace stability | SEASON-05 reset flushes marketplace orders — must be stable first | Phase 4 |
| Single linh thạch currency for v1 | Two-tier deferred to v2 if inflation materializes | Phase 2 |

### Active Todos

- [ ] Resolve two-tier currency decision before writing Phase 2 user schema
- [ ] Specify breakthrough failure chance values before planning PROG-02
- [ ] Specify "what persists" across season reset before Phase 4 planning
- [ ] VWAP outlier rejection algorithm needs research before Phase 3 planning
- [ ] Minimum marketplace txn count for VWAP needs simulation before Phase 3

### Research Flags

| Phase | Research Topic | Priority |
|-------|---------------|----------|
| Phase 3 | VWAP outlier rejection algorithm + wash-trading detection | High |
| Phase 3 | PostgreSQL advisory lock patterns for order matching | High |
| Phase 4 | Multi-phase reset transaction safety + real-money payment protection | High |
| Phase 4 | "What persists" design and player communication strategy | Medium |

### Blockers

None currently.

---

## Session Continuity

**To resume work:** Start with `/gsd-plan-phase 1`

**Architecture reminders:**
- Stateless shards: NEVER store game state in shard process memory
- Activity pipeline: fire-and-forget async — event → Redis cooldown guard → pg-boss enqueue → return
- Marketplace Worker: `concurrency: 1` always — serialized order matching
- Currency: `BIGINT` everywhere, never float; `CHECK (balance >= 0)` DB constraint
- i18n: no hardcoded user-facing strings — pre-commit hook enforces this

---

*State initialized: 2026-04-11*  
*Last updated: 2026-04-11 after roadmap creation*
