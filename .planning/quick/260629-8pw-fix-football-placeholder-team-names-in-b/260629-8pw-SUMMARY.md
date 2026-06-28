---
phase: quick
plan: 260629-8pw
subsystem: football
tags: [drizzle-orm, postgres, football-api, betting, espn]
requires: []
provides:
  - ESPN placeholder team name resolution via upsert (homeTeamName/awayTeamName in onConflictDoUpdate)
  - Placeholder-detection filter gating football match announcements for betting
affects: [football-betting, football-jobs]
tech-stack:
  added: []
  patterns: ["Direct excluded.column for NOT NULL fields (no COALESCE wrapper)", "Placeholder regex gate at announce boundary (not at ingest)"]
key-files:
  created: []
  modified:
    - src/jobs/footballFetchFixtures.ts
    - src/jobs/footballAnnounceMatches.ts
key-decisions:
  - "Used direct excluded.column assignment for homeTeamName/awayTeamName (NOT NULL columns) rather than COALESCE wrapper used for nullable odds/logos"
  - "Placeholder filter only gates announcements — placeholder rows stay in DB so the fetch-fixtures upsert can update them when ESPN resolves real names"
patterns-established: []
requirements-completed: []
duration: 5min
completed: 2026-06-28
status: complete
---

# Quick Task 260629-8pw: Fix Football Placeholder Team Names in Bet Notifications

**ESPN placeholder team names (e.g. "Group A 2nd Place") now update to real names on upsert and are filtered from betting announcements.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-28T23:18:42Z
- **Completed:** 2026-06-28T23:23:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `homeTeamName` and `awayTeamName` to the `onConflictDoUpdate` `set` clause in `footballFetchFixtures.ts` — when ESPN resolves a placeholder name (e.g. "Group A 2nd Place" → "Brazil") in subsequent poll cycles, the DB row is updated with the real name
- Added `hasPlaceholderTeamName()` helper and filter in `footballAnnounceMatches.ts` — matches with placeholder team names matching `Group [A-H]`, `Winner of...`, `Runner-up...`, or `TBD` patterns are silently skipped during betting announcements, with skipped count logged for observability
- Placeholder rows remain in the DB with `NS` status so the fetch-fixtures upsert can populate real team names on the next poll cycle; once real names arrive, the announce job picks them up normally

## Task Commits

Each task was committed atomically:

1. **Task 1: Add homeTeamName and awayTeamName to onConflictDoUpdate set clause** - `e3d1d10` (fix)
2. **Task 2: Filter placeholder team names from match announcements** - `ef21849` (fix)

## Files Created/Modified

- `src/jobs/footballFetchFixtures.ts` — Added `homeTeamName` and `awayTeamName` to `onConflictDoUpdate` `set` clause (lines 154-155), using direct `excluded.column` assignment since both are NOT NULL
- `src/jobs/footballAnnounceMatches.ts` — Added `hasPlaceholderTeamName()` regex helper (lines 8-15), filter block after DB query (lines 40-49), and updated for-loop to iterate over `validMatches` (lines 59-66)

## Decisions Made

- **Direct `excluded.column` for team names (no COALESCE):** `homeTeamName` and `awayTeamName` are NOT NULL in the schema — ESPN always provides a value (even if it's a placeholder). Using direct assignment (same pattern as `kickoffAt`) rather than the COALESCE wrapper used for nullable fields like logos and odds preserves the invariant that these columns never store null.
- **Filter at announce boundary, not at ingest:** Placeholder rows are intentionally kept in the DB so that Task 1's upsert can later update them with real team names. The filter only gates the announcement path, preventing ghost-team matches from being presented for betting while still allowing the upsert to resolve them on future poll cycles.

## Deviations from Plan

None — plan executed exactly as written. Both files edited with the exact code specified in the plan, TypeScript compiles cleanly (no new errors in either file).

## Issues Encountered

None. The three pre-existing TypeScript errors in `src/workers/` (unrelated `discord.js-selfbot-v13` module) are out of scope and unaffected by these changes.

## User Setup Required

None — no external service configuration required. Changes take effect on next ESPN poll cycle (fetch-fixtures job) and next announce scan.

---

## Self-Check: PASSED

- [x] `.planning/quick/260629-8pw-fix-football-placeholder-team-names-in-b/260629-8pw-SUMMARY.md` exists
- [x] `src/jobs/footballFetchFixtures.ts` exists with modifications
- [x] `src/jobs/footballAnnounceMatches.ts` exists with modifications
- [x] Commit `e3d1d10` verified in git log
- [x] Commit `ef21849` verified in git log
- [x] `npx tsc --noEmit` — no new errors in modified files (3 pre-existing errors in unrelated `src/workers/`)

---

*Quick task: 260629-8pw*
*Completed: 2026-06-28*
