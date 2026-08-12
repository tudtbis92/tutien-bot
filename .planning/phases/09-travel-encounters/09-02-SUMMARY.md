---
phase: 09-travel-encounters
plan: 02
subsystem: game (sanguo map data layer)
tags: [drizzle, map_zones, hero_zone_rates, dataset, seed, D-20, TQC-09, map.ts]

# Dependency graph
requires:
  - phase: 09-travel-encounters
    provides: 09-01 map_edges table + travel subcommand wiring in map.ts (re-exported + preserved here)
provides:
  - map_zones + hero_zone_rates schema tables (TQC-09 D-19/D-16) with index.ts Phase 9 re-exports (mapEdges included, migration-ready for 09-05)
  - The committed TQC-09 dataset scripts/data/sanguo-map-data.json (18 zones / 73 nodes / 162 edges / 208 hero_zone_rates)
  - Idempotent D-20 full-replace seed flow (delete mapEdges+heroZoneRates+mapNodes child→parent → re-insert) in scripts/seed-sanguo.ts
  - /sanguo map zone labels sourced from map_zones per-locale names (A8) with pickName fallback
affects: [09-03 (check-in engine consumes edges/nodes), 09-04 (encounter roll reads hero_zone_rates + zone rates at tick time), 09-05 (drizzle-kit generate 0018 migration + seed RUN gate), 10 (battle/capture), 12 (monitoring)]

actuals:
  tokens: 21845    # chars/4 over the 7 files actually changed (87381 chars) — plan estimate 64000 (plan's raw_tokens 32000); under estimate: the dataset generation was scripted from the RESEARCH text rather than hand-transcribed, and no migration RUN was needed this plan
  tasks: 3         # tasks executed (checkpoint:decision D-21/D-20 was pre-approved by the orchestrator)
  commits: 3

tech-stack:
  added: []   # no new packages — plan prohibition honored
  patterns:
    - "Reference-table schema shape (mapZones) mirroring heroFactions: code unique + per-locale names + sortOrder + clobber-safe nameZh nullable"
    - "Many-to-many weighted mapping (heroZoneRates) mirroring heroRelations: FK + unique composite index for idempotent onConflictDoNothing"
    - "D-20 full-replace seed flow (B3): delete child collections first (mapEdges, heroZoneRates, mapNodes) inside the seed, then re-insert — idempotent across re-runs because fresh serial ids can never collide with prior rows"
    - "Dataset-as-source-of-truth: scripts/data/sanguo-map-data.json consumed by a FATAL-on-missing loader (mirrors loadClassifications), never read at runtime"

key-files:
  created:
    - src/db/schema/mapZones.ts — zone reference table (code unique, name_vi/en, name_zh nullable, sort_order, encounter_rate 0.35, boss_rate 0.07)
    - src/db/schema/heroZoneRates.ts — hero→zone weighted mapping (hero_id FK, zone, rate numeric(4,2), unique hero+zone index)
    - scripts/data/sanguo-map-data.json — full TQC-09 dataset: 18 zones / 73 nodes (zone-grouped nodeOrder 1-73) / 162 edges / 208 hero_zone_rates
  modified:
    - src/db/schema/index.ts — Phase 9 re-export block (mapZones/mapEdges/heroZoneRates)
    - scripts/seed-sanguo.ts — loadSanguoMapData() loader + D-20 full-replace map-data flow replacing the hardcoded 7-node MAP_NODES placeholder
    - src/commands/sanguo/map.ts — zone labels from map_zones (pickZoneName + fallback pickName)
    - src/commands/sanguo/__tests__/map.test.ts — two-chain db.select mock + zone-label assertions

key-decisions:
  - "D-21/D-20 gate confirmed by the orchestrator (pre-approved): the TQC-09 dataset is approved for seeding and the one-way placeholder replacement proceeds — hero seed (132) untouched"
  - "Dataset generated programmatically from RESEARCH.md §TQC-09 Dataset Design (the canonical copy) rather than hand-transcribed — guarantees the machine-verified counts 18/73/162/208 and the research distribution (7 edges 5-10min, 126 10-30min, 27 30-60min, 2 60-90min, avg 26 min)"
  - "nodeOrder assigned zone-grouped (B4): zones in sortOrder 1-18, nodes within each zone in RESEARCH §2 table order — deterministic ordering for map_nodes NOT NULL + map.ts asc(nodeOrder)"
  - "NameZh carried in the dataset where RESEARCH provides it (18 zone nameZh; node nameZh only where the D-06 researched zh-map supplies it — 7 nodes) — the seed's clobber-safe spread tolerates the 66 missing values (Pitfall 6, never empty string)"

patterns-established:
  - "Full-replace map-data seeding: child-first deletes then deterministic re-insert produces identical row counts every run (B3 idempotency)"
  - "Dataset loader FATAL-on-missing for REQUIRED content (mirrors loadClassifications), warning-only for optional content (zh-names)"

requirements-completed: [TQC-09]

coverage:
  - id: D1
    description: "map_zones + hero_zone_rates schema tables with the researched column contracts (code unique, per-locale names, sort_order, encounter_rate/boss_rate defaults; hero_id FK, zone, rate numeric(4,2), unique hero+zone) and Phase 9 index.ts re-exports including the 09-01 mapEdges module"
    requirement: TQC-09
    verification:
      - kind: other
        ref: "npm run typecheck == 0; grep gates on mapZones/heroZoneRates/index.ts column + re-export presence"
        status: pass
    human_judgment: false
  - id: D2
    description: "TQC-09 dataset committed at scripts/data/sanguo-map-data.json with exact counts (18 zones, 73 nodes, 162 edges, 208 hero_zone_rates), 132/132 hero coverage, every node carrying a deterministic nodeOrder, and the research-matching travel-time distribution"
    requirement: TQC-09
    verification:
      - kind: other
        ref: "node -e dataset count gate prints 'dataset counts OK 18 73 162 208'"
        status: pass
      - kind: other
        ref: "generator validation: distribution {5-10:7, 10-30:126, 30-60:27, 60-90:2}, avg 26 min, 0 missing/0 extra hero codes, 0 nodes missing nodeOrder"
        status: pass
    human_judgment: false
  - id: D3
    description: "Idempotent D-20 full-replace seed flow in scripts/seed-sanguo.ts: FATAL-on-missing loader, child→parent deletes (mapEdges, heroZoneRates, mapNodes) then zones/nodes/edges/hero_zone_rates upserts keyed on natural keys — re-runs never accumulate duplicates; hero/faction/family/relation/item seeding untouched; clobber-safe nameZh (never '')"
    requirement: TQC-09
    verification:
      - kind: other
        ref: "grep gates: db.delete(schema.mapEdges/heroZoneRates/mapNodes) present, no MAP_NODES placeholder refs, 'nameZh: \\'\\'' count == 0, heroIdToDbId built before the rates loop"
        status: pass
      - kind: other
        ref: "npm run typecheck == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "/sanguo map zone labels sourced from map_zones per-locale names (A8) with pickName fallback for missing zone rows; the 09-01 travel subcommand wiring intact"
    requirement: TQC-09
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/map.test.ts#renders heroEmoji markers for seeded snake_case representative_hero_id values (zone label now Trung Nguyên/Quan Trung from map_zones)"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/map.test.ts#replies via editReply with sanguo:map.empty_hint when map_nodes is empty (two-chain mock)"
        status: pass
      - kind: other
        ref: "npm run typecheck == 0; npx vitest run map.test.ts == 0 (2/2); full suite 159/159"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-08-12
status: complete
---

# Phase 9 Plan 2: TQC-09 Map/Zone Data Layer Summary

**Full TQC-09 map data layer shipped: map_zones + hero_zone_rates schema tables, the committed 18-zone/73-node/162-edge/208-rate dataset (scripts/data/sanguo-map-data.json), the idempotent D-20 full-replace seed flow, and /sanguo map zone labels sourced from map_zones (A8)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-12T16:00:00Z (approx)
- **Completed:** 2026-08-12T16:04:30Z (approx)
- **Tasks:** 3 (checkpoint:decision D-21/D-20 pre-approved by the orchestrator — not re-presented)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- **map_zones reference table (D-19):** `code` unique (18 researched zone codes), `name_vi/en` required + `name_zh` nullable (clobber-safe), `sort_order`, and the A7 zone-configurable `encounter_rate` (default 0.35) / `boss_rate` (default 0.07) — tunable data, never code.
- **hero_zone_rates mapping (D-16 / A3):** per-zone granularity — `hero_id` FK → heroes, `zone` varchar keyed on the same code space as `map_nodes.zone` and `map_zones.code`, `rate` numeric(4,2), and the `(hero_id, zone)` unique index that makes seeding idempotent. 208 rows covering 132/132 roster heroes.
- **index.ts Phase 9 re-export block:** `mapZones` + `mapEdges` (the 09-01-authored module, re-exported not recreated) + `heroZoneRates` — so `npx drizzle-kit generate` at 09-05 sees all three tables.
- **TQC-09 dataset committed** (`scripts/data/sanguo-map-data.json`): generated from the RESEARCH §TQC-09 Dataset Design canonical text, verified to match every research metric — 18 zones / 73 nodes / 162 edges / 208 rates, hero coverage 132/132 (0 missing, 0 extra), travel-time distribution {5-10: 7, 10-30: 126, 30-60: 27, 60-90: 2}, avg 26 min. Every node carries a deterministic zone-grouped `nodeOrder` (1-73, B4).
- **D-20 full-replace seed flow (B3 idempotency):** `loadSanguoMapData()` FATAL-on-missing (dataset REQUIRED); deletes `mapEdges` → `heroZoneRates` → `mapNodes` (child→parent) then re-inserts zones (upsert on code), nodes (upsert on code + code→id map), edges (canonical min/max pair + onConflictDoNothing), hero_zone_rates (heroId via heroIdToDbId + onConflictDoNothing). Re-running always ends at exactly 18/73/162/208 rows. Hero/faction/family/relation/item seeding untouched (D-20 scope). Final log line reports all five counts.
- **/sanguo map zone labels from map_zones (A8):** execute() loads `map_zones` ordered by `sortOrder`, builds a `zoneCodeToLabel` map via a per-locale `pickZoneName` (nameEn / nameZh??nameVi / nameVi), and renders each zone marker with the zone-table label — `zoneCodeToLabel.get(row.zone) ?? pickName(row, locale)` keeps label-only rendering safe if a zone row is missing (D-07). heroId stays the first node's representativeHeroId (marker unchanged). The 09-01 travel subcommand wiring is untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: map_zones + hero_zone_rates schema + index re-exports** - `dc3396f` (feat)
2. **Task 2: TQC-09 dataset + seed D-20 full-replace** - `2acb02f` (feat)
3. **Task 3: /sanguo map zone labels + test update** - `946f700` (feat)

**Plan metadata:** committed separately after SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/db/schema/mapZones.ts` - Zone reference table (D-19): code unique, per-locale names, sort_order, encounter_rate/boss_rate defaults
- `src/db/schema/heroZoneRates.ts` - Hero→zone weighted mapping (D-16/A3): hero_id FK, zone, rate numeric(4,2), unique (hero_id, zone)
- `src/db/schema/index.ts` - Phase 9 block: mapZones/mapEdges/heroZoneRates re-exports (mapEdges from 09-01)
- `scripts/data/sanguo-map-data.json` - Full TQC-09 dataset (18/73/162/208, machine-verified)
- `scripts/seed-sanguo.ts` - loadSanguoMapData() + D-20 full-replace flow (B3) + zone/edge/rate upserts
- `src/commands/sanguo/map.ts` - Zone labels from map_zones (A8) with pickName fallback
- `src/commands/sanguo/__tests__/map.test.ts` - Two-chain db.select mock + zone-label assertions

## Decisions Made

- **D-21/D-20 confirmed (pre-approved gate):** the dataset is approved for seeding; the one-way placeholder replacement (7 Phase 8 nodes → 73 researched nodes) proceeds. Hero seed (132) untouched.
- **Dataset generated from RESEARCH text, not hand-transcribed:** a temp generator parsed the RESEARCH §TQC-09 tables/clusters/rate-list and emitted the JSON — this is what guarantees the exact machine-verified counts and the research's own distribution metrics (7/126/27/2, avg 26 min) rather than risking silent transcription drift on 162 edges + 208 rates.
- **nodeOrder zone-grouped (B4):** zones in sortOrder 1-18, nodes in RESEARCH §2 order within each zone → nodeOrder 1-73. Deterministic for the map_nodes NOT NULL constraint and map.ts `asc(nodeOrder)`.
- **nameZh where RESEARCH provides it:** all 18 zone nameZh from the §1 table; node nameZh only for the 7 nodes the D-06 researched zh-map covers — the clobber-safe conditional spread leaves the other 66 NULL, never '' (Pitfall 6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RESEARCH §3 edge text lists 170 pairs, not 162 — 8 cross-listed duplicates**
- **Found during:** Task 2 (dataset transcription)
- **Issue:** The RESEARCH §3 cluster prose lists pairs redundantly across clusters (e.g. Kiến Nghiệp–Quảng Lăng appears in both the Duyện/Từ/Thanh and Kinh/Dương/Ích clusters; 7 pairs appear in both the Ký/U/Tỉnh and Giao/Triều/Steppe clusters) — 170 raw pairs but the plan/research contract requires exactly 162 unique edges ("0 duplicate pairs").
- **Fix:** The generator canonicalizes each pair (sorted node codes) and dedupes to the unique 162-edge set — counts verified to match the research's stated distribution exactly (7/126/27/2, avg 26 min). One cross-listed pair (`dai|shanggu`, 20 vs 15 min in the two clusters) kept the first occurrence (20) which preserves the exact 26-min average.
- **Files modified:** scripts/data/sanguo-map-data.json (generator output)
- **Verification:** count gate prints `dataset counts OK 18 73 162 208`; distribution check matches research
- **Committed in:** 2acb02f (Task 2 commit)

**2. [Rule 1 - Bug] map.test.ts emoji assertion didn't account for the emoji ID suffix**
- **Found during:** Task 3 (test run)
- **Issue:** `heroEmoji()` emits full `<a:dtr_t0:1536202416767111219>` markup; my initial assertion `# <a:dtr_t0: Trung Nguyên` failed because the ID sits between the prefix and the label.
- **Fix:** Changed the assertions to regex `/# <a:dtr_t0:\d+> Trung Nguyên/` matching the real markup shape.
- **Files modified:** src/commands/sanguo/__tests__/map.test.ts
- **Verification:** vitest 2/2 green; full suite 159/159
- **Committed in:** 946f700 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were necessary for correctness (dataset count gate) and test reliability. No scope creep — no new packages, no architecture changes, migration/seed RUN correctly deferred to 09-05.

## Issues Encountered

- **Research edge-count discrepancy (170 raw vs 162 unique):** resolved via canonical-pair dedupe in the generator; verified against the research's own distribution metrics. Documented above as a deviation.
- **Windows PowerShell + rg unavailable:** used node/Select-String equivalents for grep gates — all green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 09-03:** travelCheckInService consumes `getAdjacentNodes`/`getCurrentPosition` which read the now-committed map_edges + map_nodes dataset (73 nodes, 162 edges) — the graph is real at seed time.
- **Ready for 09-04:** the encounter roll math reads `hero_zone_rates` (208 rows, per-zone weights 1.0/0.5/0.3) and `map_zones.encounter_rate/boss_rate` (zone-configurable defaults 0.35/0.07) — the D-15 position-blend pool has its data source.
- **Ready for 09-05:** the [BLOCKING] task runs `npx drizzle-kit generate` (schema = index.ts → picks up map_zones/map_edges/hero_zone_rates), migrates, and runs `npm run seed:sanguo` — the D-20 replacement executes against the real DB there.
- **Blockers/concerns:** none. The migration + seed RUN gate is deliberately deferred to 09-05 per the plan's verification note.

---

*Phase: 09-travel-encounters*
*Completed: 2026-08-12*

## Self-Check: PASSED

- Files verified on disk: mapZones.ts, heroZoneRates.ts, sanguo-map-data.json, 09-02-SUMMARY.md — all FOUND.
- Commits verified in git log: `dc3396f` (Task 1 schema), `2acb02f` (Task 2 dataset+seed), `946f700` (Task 3 map labels) — all FOUND.
- Dataset count gate re-run at close-out: `dataset counts OK 18 73 162 208`.
- Full suite re-run at close-out: 22 files / 159 tests passed; `npm run typecheck` green.
