---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-08-12T08:35:12.172Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 09 | stub | src/services/sanguo/travelCheckInService.ts | 13 | Thin check-in stub — full pull-based engine (elapsed → per-minute rolls → encounter/arrival/status, D-22/D-24) ships in plan 09-03 | open |  | 2026-08-12T08:35:11.166Z |  |
| 2 | 09 | stub | src/events/interactionCreate.ts | 467 | sanguo:travel:ack button branch is a deferUpdate stub in wave 1 — real encounter-resume handler ships in plan 09-03 (D-25) | open |  | 2026-08-12T08:35:12.172Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "09",
    "file": "src/services/sanguo/travelCheckInService.ts",
    "line": 13,
    "description": "Thin check-in stub — full pull-based engine (elapsed → per-minute rolls → encounter/arrival/status, D-22/D-24) ships in plan 09-03",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T08:35:11.166Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "stub",
    "phase": "09",
    "file": "src/events/interactionCreate.ts",
    "line": 467,
    "description": "sanguo:travel:ack button branch is a deferUpdate stub in wave 1 — real encounter-resume handler ships in plan 09-03 (D-25)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T08:35:12.172Z",
    "resolved_at": null
  }
]
````
