---
quick_id: 260812-j7r
status: complete
date: 2026-08-12
---

# Quick Task 260812-j7r — Phase 9 Pull-based Travel Redesign (docs)

## What was done

Applied the user-locked pull-based travel check-in redesign (D-22..D-28) to the Phase 9 planning artifacts. **Docs-only task — no code changed.**

### Decisions locked (supersede/amend)
- **D-22** — No sanguoTick crons (supersedes D-11). Travel computed only when `/sanguo travel` is invoked.
- **D-23** — No REST DM notifications (supersedes D-12). All results inline in the interaction on the user's shard.
- **D-24** — 1 ROLL 35%/counted-minute, **stop at the first hit** (no batch).
- **D-25** — Encounter pause via **"Tiếp tục hành trình"** ack button (`encounterActive=true`, `updatedAt` pinned to the hit minute; ack clears + `updatedAt=now`).
- **D-26** — Destination picker = **StringSelectMenu** + **"Bắt đầu hành trình"** button (no autocomplete).
- **D-27** — Check-in fires ONLY on `/sanguo travel`.
- **D-28** — Encounters roll only while traveling (0→arrival); arrival ends the journey.

### Files updated
| File | Change |
|------|--------|
| `09-CONTEXT.md` | D-22..D-28 block; D-11/D-12 superseded; D-05/D-06/D-07/D-10 amended; code_context/integration points rewritten (travelCheckInService, select menu + buttons, no pgBoss/REST) |
| `09-UI-SPEC.md` | Interaction surface: StringSelectMenu + Start + ack buttons; DM-notification contract removed; check-in contract; copy keys (start_button, ack_button, dest_placeholder) |
| `09-RESEARCH.md` | Summary/requirements/patterns rewritten: Pattern 1 = pull check-in (was cron), Pattern 2 = arrival branch (was tick), Pattern 4 = inline + ack (was REST DM); §7 per-minute roll specifics; pitfalls 1/2/4/5/7 re-targeted; pg-boss 45s myth documented; validation test map updated |
| `09-PATTERNS.md` | Full rewrite for the pull model: travelCheckInService + component patterns; pgBoss/jobs/notification-service rows removed |
| `09-01-PLAN.md` | Rewritten: StringSelectMenu + Start button confirm gate; startTravel(userId, toNodeCode) code-based; check-in dispatch stub; **B1 fixed (no Number() on code), B2 fixed (user.id not char.id)** |
| `09-02-PLAN.md` | **B3 fixed** (seed full-replace: delete mapEdges + heroZoneRates + mapNodes child→parent for idempotent re-runs); **B4 fixed** (nodeOrder in every dataset node) |
| `09-03-PLAN.md` | Rewritten: `travelCheckInService` (FOR UPDATE, elapsed → per-minute roll loop → encounter/arrival/status), arrival embed inline, ack resume handler; no cron, no notification service |
| `09-04-PLAN.md` | Rewritten: `encounterService` pure math kept + **B6 dominant-zone attribution fix**; rollMinute wired into check-in; no job; encounter embed (boss GOLD) |
| `09-05-PLAN.md` | ROADMAP SC3 + Goal amended to pull model; REQUIREMENTS TQC-06/TQC-07 annotated INVALIDATED; economy-budget re-baseline (encounter supply = f(check-in cadence) ≤ 20/hr); STATE.md supersession + charge-todo resolved |

### Verifications passed
- D-22..D-28 present in CONTEXT (≥1 mention each).
- Grep: no stale autocomplete/cron/REST-DM implementation references remain (only intentional negative-grep gates + SUPERSEDED/INVALIDATED annotations).
- 09-02 carries nodeOrder (B4) + full-replace delete flow (B3).
- All plan files use StringSelectMenu/checkInTravel (pull-refs), zero stale job references outside intentional gates.

## Notes for the executor
- `src/services/sanguo/travelCheckInService.ts` (09-03) and `src/services/sanguo/encounterService.ts` (09-04) are now the core; `pgBoss.ts` must NOT be touched.
- `interactionCreate.ts` gains `isStringSelectMenu()` + `sanguo:travel:*` button branches BEFORE the chat-input gate.
- The three earlier review blockers (B1 autocomplete/Number, B2 char.id, B3 seed idempotency) + B4/B6 are baked into the plans.
