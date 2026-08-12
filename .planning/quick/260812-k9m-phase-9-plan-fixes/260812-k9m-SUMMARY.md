---
quick_id: 260812-k9m
slug: phase-9-plan-fixes
date: 2026-08-12
status: complete
---

# Quick Task 260812-k9m — Phase 9 Plan Fixes (F1..F8)

Applied the 8 review findings (context7/tavily-verified) to the Phase 9 planning artifacts.
Docs-only — no source code changed.

## Fixes applied

| # | Fix | Files |
|---|-----|-------|
| F1 | Start button carries the destination in its customId (`sanguo:travel:start:{code}`); router matches `startsWith`; handler parses the code suffix. Context7 verified `StringSelectMenuComponent` (message snapshot) has no `.values` — only `StringSelectMenuInteraction` does | 09-01, PATTERNS, RESEARCH |
| F2 | `encounterPending` returns the latest pending `encounter_runs` row (indexed); added `encounter_runs_user_status_idx` to 09-01 schema edit + 09-05 migration review list | 09-01, 09-03, 09-05, RESEARCH |
| F3 | `startTravel` reads the row with `.for('update')` — closes the concurrent double-start race | 09-01, PATTERNS, RESEARCH |
| F4 | D-28 "ONLY on failed rolls" amended: hit minute IS counted (ack-pin `updatedAt + k·60` requires it); aligned CONTEXT/RESEARCH/09-03/UI-SPEC/STATE | CONTEXT, RESEARCH, 09-03, UI-SPEC, STATE |
| F5 | Sub-minute remainder loss at a hit documented as an explicit flagged assumption (per-minute granularity A5) | 09-03 |
| F6 | Zero-adjacent branch → `no_route` embed without a menu (addOptions([]) throws NO_OPTIONS) | 09-01 |
| F7 | Cap ZSET gets best-effort `redis.expire(key, 86400)` in rollMinute | 09-04 |
| F8 | `Number(rate)` conversion for hero_zone_rates numeric→string | 09-04 |

## Evidence anchors

- discord.js 14.26.2 docs (context7): `StringSelectMenuComponent` has `options`/`customId` but no `values`; `StringSelectMenuInteraction.values` is the only selection surface → F1 must encode the code in the button customId.
- discord.js API docs (context7): StringSelectMenu max 25 options — plan cap correct.
- drizzle-orm docs (context7): `.for('update')` valid; in-repo `matchLifecycleService.ts:345` uses `.for('update', { skipLocked: true })` → F3 uses the single-writer form.
- pg-boss issue #427 (tavily): sub-minute cron hard limit → pull model (no cron) confirmed correct.
- Eastern Han 12 provinces + Sili + Jiaozhou + Korean kingdoms geography (tavily) → TQC-09 dataset historically sound.

## Verification

- All edited markdown files parse; frontmatter intact.
- Grep confirms the fixed phrases are present in the owning files and stale text removed.
- No source code touched — `npm run typecheck` / `npm test` unaffected.
