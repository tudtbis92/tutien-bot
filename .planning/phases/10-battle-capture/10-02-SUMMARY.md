---
phase: 10-battle-capture
plan: 02
subsystem: database
tags: drizzle-kit, migration-0019, schema, heroes, user-heroes, sanguo-battles, encounter-runs, capture-attempts, user-sanguo-state, TQC-10, TQC-11, TQC-12, TQC-13

# Dependency graph
requires:
  - phase: 08-foundation
    provides: heroes/userHeroes/sanguoBattles/encounterRuns base schema, IV columns (TQC-02 final), walletTransactions audit-table analog, playerTravelState one-row-per-user analog
  - phase: 10-battle-capture (10-01)
    provides: battleEngine CombatantInput/BattleResult types — the replay record (seed/input/result jsonb) stores the exact shapes the engine consumes
provides:
  - heroes: 8 base-stat columns (str/agi/int/mov/lea/cha/hp/mp) + hidden rarity (D-08) + public tier (UI-SPEC) + rarity_range/tier_range checks
  - user_heroes: hp_current (0=fainted) + captured_zone (A5 zone snapshot); IV columns untouched (TQC-02 final)
  - sanguo_battles: encounter_id FK + type ('encounter'|'spar') + seed bigint mode 'number' + input/result jsonb — the D-06 replay record
  - encounter_runs: pity_count (D-11) + extended status vocabulary comment (A7, varchar kept)
  - capture_attempts: NEW first-class audit table (TQC-11/SC2 — every attempt incl. failures) + (user_id, created_at) index
  - user_sanguo_state: NEW one-row-per-user table (A4/D-14 active companion + starter_views)
  - migrations/0019_green_snowbird.sql: generated + applied (schema push gate closed)
affects: 10-04 (content seed fills base stats/rarity/tier), 10-05 (captureService tx — pity/audit in same tx; battleCheckInService runBattle(seed)), 10-06/10-07 (collection queries tier + captured_zone; starter/companion via user_sanguo_state)

actuals:
  tokens: 30660    # chars/4 over realized diff (estimate was 38000)
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - drizzle bigint REQUIRES a mode — currency uses { mode: 'bigint' }, replay seed uses { mode: 'number' }
    - First-class audit table (capture_attempts) mirroring walletTransactions — every attempt row incl. failures (TQC-11/SC2 repudiation)
    - One-row-per-user state table (user_sanguo_state) mirroring playerTravelState — userId .unique()
    - Schema push gate: drizzle-kit generate → npm run migrate → information_schema probe (never typecheck-only)

key-files:
  created:
    - src/db/schema/captureAttempts.ts
    - src/db/schema/userSanguoState.ts
    - migrations/0019_green_snowbird.sql
    - migrations/meta/0019_snapshot.json
  modified:
    - src/db/schema/heroes.ts
    - src/db/schema/userHeroes.ts
    - src/db/schema/sanguoBattles.ts
    - src/db/schema/encounterRuns.ts
    - src/db/schema/index.ts
    - migrations/meta/_journal.json

key-decisions:
  - "capture_attempts.fee uses bigint { mode: 'bigint' } (not the plan's bare bigint) — drizzle 0.45.2 rejects mode-less bigint at typecheck; mode 'bigint' matches users.balance currency discipline"
  - "Migration 0019 verified with an information_schema probe spanning ALL tables, not just heroes — the plan's literal one-liner only queried heroes columns + table names, so it could never see hp_current/captured_zone (user_heroes), seed/input/result (sanguo_battles), pity_count (encounter_runs); the corrected probe confirms every artifact live"

patterns-established:
  - "Schema evolution order: edit schema files → typecheck → verify IV columns untouched via grep → generate → review generated SQL once (no hand-edit) → migrate → DB probe → commit"
  - "drizzle-kit generate writes 3 artifacts: the SQL, meta snapshot json, and a _journal.json entry — all three commit together"

requirements-completed: [TQC-10, TQC-11, TQC-12, TQC-13]

coverage:
  - id: D1
    description: "heroes carries the 8 base-stat columns STR/AGI/INT/MOV/LEA/CHA + HP + MP, hidden rarity (1-5) with check constraint, and public display tier (★1-5) with check constraint — combatStat = base + IV, HP/MP base-only (D-02/D-05/D-08)"
    requirement: TQC-12
    verification:
      - kind: other
        ref: "grep: heroes.ts contains str/agi/int/mov/lea/cha/hp/mp + rarity: smallint + tier: smallint + rarity_range/tier_range checks; typecheck exits 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "user_heroes carries hp_current (0 = fainted) + captured_zone (zone snapshot at capture); the six iv_* columns and 0-31 checks remain Phase-8-final (TQC-02)"
    requirement: TQC-12
    verification:
      - kind: other
        ref: "grep: hp_current + captured_zone present; iv_str_range count == 1 (all IV checks untouched); typecheck exits 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "sanguo_battles carries the D-06 replay record — encounter_id nullable FK, type ('encounter'|'spar'), seed bigint mode 'number', input/result jsonb"
    requirement: TQC-10
    verification:
      - kind: other
        ref: "grep: sanguoBattles.ts contains encounter_id/type/seed { mode: 'number' }/input/result; DB probe confirms columns live"
        status: pass
    human_judgment: false
  - id: D4
    description: "encounter_runs carries pity_count (smallint default 0) — the per-encounter bad-luck counter (D-11); status vocabulary extends to captured/fled/skipped/escaped in the comment (A7, kept varchar)"
    requirement: TQC-11
    verification:
      - kind: other
        ref: "grep: pity_count present; encounter_runs_user_status_idx count == 1 (untouched); DB probe confirms pity_count live"
        status: pass
    human_judgment: false
  - id: D5
    description: "capture_attempts audit table records EVERY attempt — user_id, encounter_id, tier, fee, displayed_chance, roll, outcome, pity_before, created_at + (user_id, created_at) index (TQC-11/SC2 repudiation)"
    requirement: TQC-11
    verification:
      - kind: other
        ref: "DB probe: capture_attempts cols = created_at, displayed_chance, encounter_id, fee, id, outcome, pity_before, roll, tier, user_id; index capture_attempts_user_created_idx in migration SQL"
        status: pass
    human_judgment: false
  - id: D6
    description: "user_sanguo_state holds one row per user — active_hero_id FK user_heroes.id + starter_views counter (A4/D-14 rotation)"
    requirement: TQC-13
    verification:
      - kind: other
        ref: "grep: user_sanguo_state with active_hero_id references userHeroes.id, starter_views default 0, userId .unique(); DB probe confirms table live"
        status: pass
    human_judgment: false
  - id: D7
    description: "Migration 0019 generated via drizzle-kit (not hand-written) and applied to the dev DB — all new columns/tables observable via information_schema probe (schema push gate)"
    verification:
      - kind: other
        ref: "npm run migrate exits 0; migrations/0019_*.sql exists (count == 1, generated untouched); corrected all-table probe prints MIGRATION 0019 VERIFIED; npm run typecheck exits 0"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-08-13
status: complete
---

# Phase 10 Plan 2: Migration 0019 — Battle/Capture Schema Foundation Summary

**Migration 0019 applied: heroes gains 8 base-stat columns + hidden rarity + public tier with range checks, user_heroes gains hp_current/captured_zone (IV columns untouched), sanguo_battles gains the D-06 replay record (encounter_id/type/seed/input/result), encounter_runs gains pity_count, and two new first-class tables are live — capture_attempts (TQC-11 audit incl. failures) and user_sanguo_state (active companion + starter-views) — closing the schema push gate for all Phase 10 services**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-13T07:25:00Z
- **Completed:** 2026-08-13T07:43:00Z
- **Tasks:** 2
- **Files modified:** 10 (7 schema + 3 migration artifacts)

## Accomplishments
- **heroes** now carries the locked battle stat contract: `str/agi/int/mov/lea/cha/hp/mp` integer columns (defaults placeholder-safe, content-seeded in 10-04), hidden `rarity` smallint 1-5 with `rarity_range` check (D-08 — engine/economy only, never rendered per D-12), and public `tier` smallint ★1-5 with `tier_range` check (UI-SPEC resolution — the collection renders stars from tier, never rarity)
- **user_heroes** gains `hp_current` (smallint, 0 = fainted; capture/starter paths write base HP explicitly) + `captured_zone` (varchar(50), zone snapshot at capture for the TQC-13 zone filter); the six `iv_*` columns and all six `iv_*_range` 0-31 checks remain Phase-8-final (grep gate: `iv_str_range` count == 1)
- **sanguo_battles** gains the D-06 replay record: nullable `encounter_id` FK to encounter_runs (NULL for spar), `type` varchar ('encounter'|'spar'), `seed` bigint with `mode: 'number'` (drizzle-required, keeps JS number for `runBattle(seed: number)`), `input`/`result` jsonb storing the full stat snapshot + battle result
- **encounter_runs** gains `pity_count` (smallint default 0, D-11); the status vocabulary comment documents 'pending'|'captured'|'fled'|'skipped'|'escaped' (A7 — kept varchar, service-enforced, no enum migration); the `encounter_runs_user_status_idx` F2 re-fetch index untouched
- **capture_attempts** — new first-class audit table mirroring walletTransactions: every attempt row (user_id, encounter_id, tier, fee, displayed_chance, roll, outcome, pity_before, created_at) with an (user_id, created_at) index — the TQC-11/SC2 repudiation proof (exact chance + roll stored, failures included)
- **user_sanguo_state** — new one-row-per-user table mirroring playerTravelState: user_id unique, nullable active_hero_id FK, starter_views counter (D-14 starter-set rotation)
- **Schema push gate closed:** drizzle-kit generated `0019_green_snowbird.sql` untouched-by-hand, `npm run migrate` applied it, and an information_schema probe verified every new column/table live in the dev DB

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema evolution — heroes base stats/rarity/tier, user_heroes HP/zone, sanguo_battles replay record, encounter_runs pity, new capture_attempts + user_sanguo_state tables** - `3bf9c9a` (feat)
2. **Task 2: [BLOCKING] generate + apply migration 0019 (schema push gate)** - `3555809` (feat)

**Plan metadata:** `docs(10-02): complete schema evolution plan` (pending)

## Files Created/Modified

- `src/db/schema/heroes.ts` - +8 base-stat columns + hidden rarity (D-08) + public tier (UI-SPEC) + rarity_range/tier_range checks; header documents D-12 never-render for rarity
- `src/db/schema/userHeroes.ts` - +hpCurrent (0=fainted) + capturedZone (A5); IV columns untouched
- `src/db/schema/sanguoBattles.ts` - +encounterId FK/type/seed (mode 'number')/input/result jsonb — the D-06 replay contract
- `src/db/schema/encounterRuns.ts` - +pityCount (D-11); extended status vocabulary comment (A7)
- `src/db/schema/captureAttempts.ts` - NEW audit table (TQC-11/SC2) — 10 columns + user_created index
- `src/db/schema/userSanguoState.ts` - NEW one-row-per-user table (A4/D-14) — active companion + starter_views
- `src/db/schema/index.ts` - captureAttempts + userSanguoState re-exports (Phase 8 group)
- `migrations/0019_green_snowbird.sql` - drizzle-kit generated migration (49 lines, untouched)
- `migrations/meta/0019_snapshot.json` - drizzle-kit snapshot for 0019
- `migrations/meta/_journal.json` - 0019 journal entry appended

## Decisions Made

- **`capture_attempts.fee` uses `bigint('fee', { mode: 'bigint' })`** — the plan's literal `bigint('fee')` fails drizzle 0.45.2 typecheck (bigint REQUIRES a mode). Chose `mode: 'bigint'` (not 'number') to match the users.balance/walletTransactions currency discipline — fee is currency, never a JS-number stat.
- **Migration probe spans all tables** — the plan's literal information_schema one-liner only queried `heroes` columns + table names, so it could never match hp_current/captured_zone/seed/input/result/pity_count (columns on other tables). The corrected probe (per-table column checks + capture_attempts full shape) confirms all 19 artifacts live; `MIGRATION 0019 VERIFIED` printed.
- **Verified the DB, not just typecheck** — per the plan's own schema-push-gate philosophy: typecheck alone would have passed against config types even with the DB missing columns; the probe proves the live DB state.

## Deviations from Plan

None - plan executed exactly as written (both flagged assumptions adopted as planned; the two code-level adjustments below are acceptance-criteria-level corrections, not scope changes).

## Issues Encountered

- **drizzle bigint typecheck failure (Task 1):** `bigint('fee')` in captureAttempts.ts failed `tsc --noEmit` (`PgBigIntConfig` requires a mode). Fixed with `{ mode: 'bigint' }` — a required drizzle-0.45.2 syntax detail, resolved within the task's own typecheck gate. Committed in `3bf9c9a`.
- **Plan's verification one-liner could not pass as written (Task 2):** the probe queried only `heroes` columns + table names, so cross-table columns (hp_current, captured_zone, encounter_id, seed, input, result, pity_count) were unreachable by its own name list. Wrote a corrected all-table probe; all 19 names + capture_attempts audit shape verified live. Not a DB problem — the migration is complete and observable.
- **PowerShell quoting mangled the inline tsx one-liner** — ran the probe as a temporary project-root script file instead (removed after verification).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **10-04 (content seed)** can fill `sanguo-base-stats.json` against the live heroes.str/agi/int/mov/lea/cha/hp/mp + rarity + tier columns — the column names are the contract
- **10-05 (captureService + battleCheckInService)** runs capture attempts against real columns: pity read/write + capture_attempts audit row + fee live in the same tx; `runBattle(seed, input)` consumes sanguo_battles.seed (JS number) + input jsonb directly
- **10-07 (collection / starter / companion)** queries tier (public stars), captured_zone (zone filter), hp_current (faint gate) and user_sanguo_state.active_hero_id (companion switch) — all single-writer FOR UPDATE on the same rows
- No blockers; the schema push gate (phase-level blocker per PLAN verification) is closed

---
*Phase: 10-battle-capture*
*Completed: 2026-08-13*

## Self-Check: PASSED

- Files exist: `src/db/schema/captureAttempts.ts`, `src/db/schema/userSanguoState.ts`, `migrations/0019_green_snowbird.sql`, `src/db/schema/heroes.ts`, `src/db/schema/userHeroes.ts`, `src/db/schema/sanguoBattles.ts`, `src/db/schema/encounterRuns.ts`, `src/db/schema/index.ts`, `.planning/phases/10-battle-capture/10-02-SUMMARY.md`
- Commits exist: `3bf9c9a` (Task 1 schema evolution), `3555809` (Task 2 migration 0019)
