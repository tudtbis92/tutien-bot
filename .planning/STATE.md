---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-05-21T04:21:13.792Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 14
  completed_plans: 13
  percent: 50
---

# State: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

---

## Current Position

Phase: 02.2 (add-football-prediction-event-system) — EXECUTING
Plan: 3 of 5
Phase: 02.1 (gather-craft-seed-data) — NEXT (INSERTED, urgent)
Phase: 02.2 (add-football-prediction-event-system) — NEXT (INSERTED, urgent)

```
Progress: [█████████░] 93%

Phase 1  [Foundation]                    █████ COMPLETE (2026-04-11)
Phase 2  [Core Game Loop]                █████ COMPLETE (2026-04-12, 7/7 plans)
Phase 02.1 [Gather/Craft Seed Data]      ░░░░░ NOT STARTED (INSERTED)
Phase 02.2 [Football Prediction Event]   ░░░░░ IN PROGRESS (1/5 plans)
Phase 3  [Combat + Marketplace]          ░░░░░ NOT STARTED
Phase 4  [Season System + Admin]         ░░░░░ NOT STARTED
```

---

## Phase Registry

| # | Phase | Requirements | Status | Completed |
|---|-------|-------------|--------|-----------|
| 1 | Foundation | INFRA-01..07, I18N-01..03 (10) | ✅ Complete | 2026-04-11 |
| 2 | Core Game Loop + Progression | CORE-01..08, PROG-01..08 (16) | ✅ Complete (7/7 plans, UAT 5/5 passed) | 2026-04-12 |
| 02.1 | Gather & Craft — Seed Data + Cơ Chế Chi Tiết | PROG-06, PROG-07 (unblocked) | Pending (INSERTED) | - |
| 02.2 | Football Prediction Event System | PRED-01..13 (13) | In progress (1/5 plans) | - |
| 3 | Combat + Marketplace | COMBAT-01..04, MKT-01..12 (16) | Pending | - |
| 4 | Season System + Admin | SEASON-01..05, ADMIN-01 (6) | Pending | - |

**Total requirements:** 61/61 mapped ✓

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 4 |
| Phases complete | 2 |
| Requirements total | 61 |
| Requirements delivered | 28 |
| Plans created | 9 (Phase 1: 1, Phase 2: 7, Phase 02.2: 1) |
| Plans complete | 9 |

---
| Phase 01 P01 | multi-session | 14 tasks | 55 files |
| Phase 02 P01-07 | multi-session | 23+ tasks | 36+ files |
| Phase 02.2 P05 | 12min | 2 tasks | 8 files |
| Phase 02.2 P04 | 14min | 2 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- Phase 02.1 inserted after Phase 2: Gather & Craft — Seed Data + Cơ Chế Chi Tiết (URGENT) — 2026-04-12
- Phase 02.2 inserted after Phase 2: Add football prediction event system (URGENT)
- Phase 02.2 context gathered: Football prediction event system decisions captured (19 decisions, API-Football integration, 5-key pool, 15-min polling)

### Key Decisions Made

| Decision | Rationale | Phase |
|----------|-----------|-------|
| 4 coarse phases (compressed from 8) | Granularity = coarse; CORE+PROG combined; COMBAT+MKT combined | Roadmap |
| Stateless shards from day 1 | All state in PostgreSQL, Redis for hot cache only — non-negotiable architecture | Phase 1 |
| Anti-farming ships with accumulation | CORE-04/05 in same phase as CORE-01/02/03 — never deferred | Phase 2 |
| Marketplace Worker concurrency: 1 | Prevent order double-fill race conditions — architectural constraint | Phase 3 |
| Season after marketplace stability | SEASON-05 reset flushes marketplace orders — must be stable first | Phase 4 |
| Single linh thạch currency for v1 | Two-tier deferred to v2 if inflation materializes | Phase 2 |
| ioredis named import {Redis} | No default export in ESM — import { Redis } from 'ioredis' | Phase 1 |
| BigInt default uses sql template | drizzle-kit cannot serialize BigInt literal 0n — use sql`0` | Phase 1 |
| Command registration in bot.ts only | N shards × REST PUT = rate-limit exhaustion; manager registers once | Phase 1 |
| pg-boss uses DATABASE_URL_DIRECT | Advisory locks incompatible with PgBouncer transaction mode | Phase 1 |
| ASCII-only command/option names | Discord API rejects Unicode identifiers (diacritics); English names required | Phase 2 |
| message.content NOT stored in pg-boss | PII privacy — pre-compute hasRepeatPattern + contentFingerprint in gateway handler | Phase 2 |
| `characters.tu_vi` is cumulative-forever | Never reset on breakthrough; all threshold comparisons MUST use `entryThreshold + tuViRequired` (absolute), never `tuViRequired` alone (incremental) | Phase 2 UAT |
| ActivityWorker Layer 1 removed | Redis re-verify in worker removed — event-handler Redis guard is sufficient; Layer 2 DB check covers restart recovery | Phase 2 UAT |
| ActivityWorker uses `localConcurrency: 5` | Per-user `SELECT FOR UPDATE` makes parallel processing safe; `concurrency: 1` would be a bottleneck | Phase 2 UAT |
| 53-key i18n structure for football predictions | Covers predictions.* (18), embed.* (14), status.* (8), config.* (9) in VI/EN/ZH-CN; all files share identical key structure | Phase 02.2 P05 |
| /config predictions uses interaction.channelId | No separate channel parameter — uses the invocation channel directly; league_id=0 for global, league_id>0 per-league | Phase 02.2 P05 |
| Match lifecycle uses Discord REST API over gateway | REST post/patch avoids shard dependency for background cron job embed operations | Phase 02.2 P04 |
| 4 separate pg-boss cron jobs for Option C lifecycle | Fetch every 6h, refresh odds every 2h, poll every 15min, resolve every 2h — dedicated jobs per lifecycle phase | Phase 02.2 P04 |

### Active Todos

- [ ] Resolve two-tier currency decision before writing Phase 3 economy schema (probably not needed for v1)
- [ ] Specify "what persists" across season reset before Phase 4 planning
- [ ] VWAP outlier rejection algorithm needs research before Phase 3 planning
- [ ] Minimum marketplace txn count for VWAP needs simulation before Phase 3
- [ ] Minor issues MI-01..08 from 02-REVIEW.md still open (deferred; non-blocking)

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

**To resume work:** Phase 02.2 all plans complete. Ready for next phase (02.1, Phase 3, or Phase 4).

**Phase 02 completion note:**  

- 7/7 plans executed, 23/23 tests pass, tsc clean, lint clean.
- Human UAT complete: 5/5 tests passed. 5 bugs found and fixed during UAT.
- Minor issues (MI-01..08) from 02-REVIEW.md deferred to a future cleanup pass.

**Architecture reminders:**

- Stateless shards: NEVER store game state in shard process memory
- Activity pipeline: fire-and-forget async — event → Redis cooldown guard → pg-boss enqueue → return
- Marketplace Worker: `concurrency: 1` always — serialized order matching
- Currency: `BIGINT` everywhere, never float; `CHECK (balance >= 0)` DB constraint
- i18n: no hardcoded user-facing strings — pre-commit hook enforces this
- Commands: ASCII-only names/options/subcommands — Discord API requires it

---

*State initialized: 2026-04-11*  
*Last updated: 2026-05-21 — Phase 02.2 P04 complete: match lifecycle cron jobs + embed service*
