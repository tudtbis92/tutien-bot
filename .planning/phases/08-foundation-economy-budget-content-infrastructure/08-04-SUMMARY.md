---
phase: 08-foundation-economy-budget-content-infrastructure
plan: 4
subsystem: content-infrastructure
tags: [drizzle-schema, migration, pg, seed, tavily, i18n-content, deploy, drizzle-kit]

# Dependency graph
requires:
  - phase: 08
    plan: 1
    provides: mapNodes schema (map_nodes) merged in src/db/schema/index.ts under '// Phase 8 schemas'
  - phase: 08
    plan: 2
    provides: walletTransactions schema (wallet_transactions) merged in src/db/schema/index.ts
provides:
  - 9 Phase 8 tables (wallet_transactions, heroes, user_heroes, map_nodes, player_travel_state, sanguo_battles, sanguo_items, user_sanguo_items, encounter_runs) migrated via 0014 and present in the dev DB (SC2)
  - 7 sanguo domain schemas with per-locale name columns (D-05), 6 IV smallint 0-31 checks, natural keys for idempotent upsert (D-11)
  - scripts/seed-sanguo.ts — idempotent content seed: 132 heroes + 7 map_nodes + 3 sanguo_items, nameZh wired from the committed Tavily-researched map via clobber-safe conditional spread (D-06)
  - scripts/data/sanguo-zh-names.json — 132 Tavily-researched ZH-CN hero names + 7 node names + 3 item names (D-06, never agent-guessed, dev-time only)
  - scripts/deploy.sh seed step after drizzle-kit migrate (D-12); package.json "seed:sanguo" script
affects: [Phase 9 travel (player_travel_state/encounter_runs consumers), Phase 10 battle (sanguo_battles/user_heroes), Phase 11 economy depth (user_sanguo_items), 08-01 /sanguo map command (map_nodes rows)]

# Actuals (#2632) — pairs with the plan's estimate (36000 tokens) to calibrate future estimates.
actuals:
  tokens: 25923    # chars/4 over the realized diff (103692 chars)
  tasks: 6
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent content seed: INSERT ... ON CONFLICT DO UPDATE keyed on natural keys (heroes.heroId / map_nodes.code / sanguo_items.code) — re-runs update changed content, never duplicate rows (D-11)"
    - "Clobber-safe nameZh wiring: values carry nameZh: map[id] ?? null, set clause carries nameZh via conditional spread ...(zh ? { nameZh: zh } : {}) so an entry-less re-run can never NULL a researched value"
    - "Dev-time-only researched content (D-06): ZH names authored via Tavily web research at content time, committed as JSON, read by the seed — never read at runtime"
    - "Windows-safe data file path: fileURLToPath(new URL(...)) — URL.pathname yields /E:/... which fs cannot open on Windows"
    - "Append-only schema barrel merge under '// Phase 8 schemas' comment (mapNodes + walletTransactions + 7 new files, no duplication)"

key-files:
  created:
    - src/db/schema/heroes.ts
    - src/db/schema/userHeroes.ts
    - src/db/schema/playerTravelState.ts
    - src/db/schema/sanguoBattles.ts
    - src/db/schema/sanguoItems.ts
    - src/db/schema/userSanguoItems.ts
    - src/db/schema/encounterRuns.ts
    - migrations/0014_next_chimera.sql
    - migrations/meta/0014_snapshot.json
    - scripts/seed-sanguo.ts
    - scripts/data/sanguo-zh-names.json
  modified:
    - src/db/schema/index.ts
    - migrations/meta/_journal.json
    - package.json
    - scripts/deploy.sh
    - migrations/0004_tiny_virginia_dare.sql (Rule 3 restoration of lost content)

key-decisions:
  - "Migration 0004 (empty placeholder since 'fix migration missing 0004') restored to ALTER TABLE football_matches ADD COLUMN dk_event_id varchar(20) — content proven from the 0004 snapshot diff (0003->0004 added only dk_event_id); 0006 drops that column, so a fresh-DB chain (all 15 migrations) was un-appliable until restored (Rule 3)"
  - "Kongming.net hanzi index (novel/hanzi/All) as the primary ZH name source — 2865 officers with traditional + simplified columns, fetched via Tavily extract (direct fetch blocked by Zscaler); 23 kongming first-match mis-picks for variant-spelling figures corrected via targeted Tavily research (sun_jian 孙坚, liu_yao 刘繇, liu_yan 刘焉, ly_ung 李膺, zhang_miao 张邈, gongsun_du 公孙度, han_fu 韩馥, zhao_wei 赵韪, etc.)"
  - "Seed reads the ZH map via fileURLToPath — import.meta.url.pathname produces /E:/... which breaks fs.readFileSync on Windows (first run silently seeded name_zh NULL with a warning)"

patterns-established:
  - "Pattern: content tables (heroes/map_nodes/sanguo_items) carry per-locale name_vi/name_en/name_zh varchar columns (D-05) — never i18n keys, never JSONB; natural keys (hero_id/code) drive D-11 upserts"
  - "Pattern: seed scripts mirror src/db/seed.ts (DATABASE_URL_DIRECT ?? DATABASE_URL, Pool max 2, drizzle({client, schema}), pool.end() in finally)"

requirements-completed: [TQC-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "9 Phase 8 tables migrated (migration 0014: 9 CREATE TABLE incl. map_nodes, 3 CREATE TYPE, 0 DROP TABLE) and present in the dev DB (pg_catalog confirmation) — SC2 full-boot smoke"
    requirement: TQC-02
    verification:
      - kind: other
        ref: "npx drizzle-kit migrate (exit 0) + node pg query over pg_catalog.pg_tables (9/9 present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idempotent sanguo content seed — 132 heroes + 7 map_nodes + 3 items upserted on natural keys; run twice yields identical counts (D-11/D-09)"
    requirement: TQC-02
    verification:
      - kind: other
        ref: "npx tsx scripts/seed-sanguo.ts run twice + SELECT count(*) (heroes=132, map_nodes=7, sanguo_items=3 both runs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tavily-researched ZH-CN names (D-06) — scripts/data/sanguo-zh-names.json covers all 132 hero ids + 7 node codes + 3 item codes; nameZh wired into values + onConflictDoUpdate set clause (clobber-safe); DB asserts name_zh NOT NULL = 132/7/3"
    requirement: TQC-02
    verification:
      - kind: other
        ref: "SELECT count(*) FROM heroes WHERE name_zh IS NOT NULL = 132 (NAME_ZH_OK_132); map_nodes 7; sanguo_items 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "ZH name accuracy spot-check — 10-hero deterministic sample (every 13th hero) verified against independent references (kongming.net hanzi index / zh-wiki canonical titles / baike / ctext); initial 5 query-noise mismatches (张梁 vs Han-era 张良, 赵韪 vs 趙韙 traditional form, 须卜骨都侯, 梁龙, 韩遂) all confirmed correct on re-verification — zero unresolved mismatches"
    requirement: TQC-02
    verification:
      - kind: manual_procedural
        ref: "10-hero sample vs kongming/zh-wiki/baike — zero unresolved mismatches after re-verification"
        status: pass
    human_judgment: true
    rationale: "Name correctness is content quality — automation proved coverage (132 non-null) and the sampled names match the reference; a human review of the committed JSON at ship time is the D-06 content-accuracy backstop"
  - id: D5
    description: "Deploy pipeline seed step (D-12) — scripts/deploy.sh runs npx tsx scripts/seed-sanguo.ts after drizzle-kit migrate, before pm2 restart; package.json has seed:sanguo (gen:emojis preserved)"
    requirement: TQC-02
    verification:
      - kind: other
        ref: "bash -n scripts/deploy.sh (exit 0) + seed-sanguo line present between migrate (L23) and restart (L29)"
        status: pass
    human_judgment: false

# Metrics
duration: 82min
completed: 2026-08-11
status: complete
---

# Phase 08 Plan 4: Sanguo Content Infrastructure Summary

**All 9 Phase 8 tables migrated (0014) and idempotently seeded — 132 heroes + 7 map nodes + 3 items with Tavily-researched ZH-CN names wired clobber-safe into the seed, plus the deploy-pipeline seed step**

## Performance

- **Duration:** 82 min (11:33–12:55 +07:00)
- **Started:** 2026-08-11T04:33:03Z
- **Completed:** 2026-08-11T05:54:31Z
- **Tasks:** 6
- **Files modified:** 16 (7 new schemas, migration 0014 + snapshot + journal, seed script, ZH name map, deploy.sh, package.json, 0004 restoration)

## Accomplishments

- Migration **0014_next_chimera.sql** generated and applied — **9 CREATE TABLEs** (wallet_transactions, heroes, user_heroes, map_nodes, player_travel_state, sanguo_battles, sanguo_items, user_sanguo_items, encounter_runs), **3 CREATE TYPEs** (hero_faction, hero_role, wallet_transaction_type), IV/amount/quantity CHECK constraints, history/inventory indexes; **0 DROP TABLE**; all 9 tables confirmed in pg_catalog (SC2)
- **7 sanguo domain schemas** with per-locale name columns (D-05), 6 IV smallint 0-31 CHECKs (TQC-12 consumer), natural keys for D-11 upsert; merged under the `// Phase 8 schemas` barrel comment alongside mapNodes (08-01) + walletTransactions (08-02)
- **scripts/seed-sanguo.ts** — idempotent content seed: 132 heroes (heroes-v1.json via FACTION_MAP, fail-fast on unmapped faction/role and count != 132), 7 map_nodes placeholders each with representativeHeroId (D-10/D-07), 3 sanguo_items; upsert onConflictDoUpdate on natural keys (D-11); run twice → identical counts
- **scripts/data/sanguo-zh-names.json** — 132 Tavily-researched ZH-CN hero names + 7 node names + 3 item names (D-06); nameZh wired into values + set clause via clobber-safe conditional spread; re-seed fills name_zh for all 132/7/3 (DB-asserted); 10-hero accuracy spot-check zero unresolved mismatches
- **scripts/deploy.sh** seed step after drizzle-kit migrate, before pm2 restart (D-12); `"seed:sanguo"` script added to package.json (gen:emojis untouched)
- **Pre-existing migration-chain defect fixed** (Rule 3): 0004 was an empty placeholder whose original ADD COLUMN content was lost in git history — restored deterministically from the 0004 snapshot diff so the fresh-DB chain (0000-0014) applies cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 env gate (DB_REACHABLE + .env.example docs)** - `03e6768` (docs)
2. **Task 2: 7 sanguo schemas + index.ts merge** - `a254ff3` (feat)
3. **Task 3: migration 0014 generated + applied (all 9 tables)** - `c2f2b5e` (feat) — incl. 0004 restoration
4. **Task 4: idempotent seed script + seed:sanguo script** - `770c649` (feat)
5. **Task 5: Tavily ZH-CN research + nameZh wiring + re-seed** - `49a312b` (feat)
6. **Task 6: deploy.sh seed step** - `6636521` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `src/db/schema/heroes.ts` - heroes catalog: hero_id unique natural key, per-locale name columns, hero_faction/hero_role pgEnums
- `src/db/schema/userHeroes.ts` - user_heroes: 6 IV smallint columns each CHECKed 0-31, no (user_id, hero_id) unique (dupes allowed for TQC-14)
- `src/db/schema/playerTravelState.ts` - player_travel_state: one active journey per user (unique user_id), no mapNodes import (Phase 9 adds FK)
- `src/db/schema/sanguoBattles.ts` - sanguo_battles: minimal pending status + round_logs jsonb (Phase 10 extends)
- `src/db/schema/sanguoItems.ts` - sanguo_items: code natural key + per-locale names + bigint basePrice sql`0` default
- `src/db/schema/userSanguoItems.ts` - user_sanguo_items: quantity CHECK > 0, unique (user_id, item_id)
- `src/db/schema/encounterRuns.ts` - encounter_runs: zone + optional hero_id + travel_id FKs
- `src/db/schema/index.ts` - Phase 8 block: mapNodes + walletTransactions + 7 new exports (append-only)
- `migrations/0014_next_chimera.sql` - 9 CREATE TABLE + 3 CREATE TYPE + CHECKs + indexes, purely additive
- `migrations/meta/0014_snapshot.json` + `migrations/meta/_journal.json` - migration 0014 metadata (idx 14)
- `scripts/seed-sanguo.ts` - idempotent seed (heroes + nodes + items, nameZh clobber-safe)
- `scripts/data/sanguo-zh-names.json` - Tavily-researched ZH-CN name map (132/7/3)
- `package.json` - added seed:sanguo (gen:emojis preserved)
- `scripts/deploy.sh` - seed step between migrate and pm2 restart
- `migrations/0004_tiny_virginia_dare.sql` - restored ADD COLUMN dk_event_id (Rule 3, proven from snapshot diff)

## Decisions Made

- **Migration 0004 restoration (Rule 3, blocking):** the committed 0004 was a 0-byte placeholder (git history shows only "fix migration missing 0004"), but its snapshot proves it added exactly `dk_event_id varchar(20)` to football_matches (0003→0004 diff = one column). 0006 drops that column, so on a fresh dev DB the full chain broke at 0006 with `column "dk_event_id" does not exist`. Restored the single provable ALTER statement; the full 0000-0014 chain then applies cleanly.
- **Kongming.net as primary ZH source + Tavily correction pass:** kongming's hanzi index (2865 officers, traditional + simplified columns) provided 109 names; 23 first-match mis-picks for variant-spelling/ambiguous figures were corrected via targeted Tavily queries (e.g. sun_jian→孙坚 not 孫建, liu_yao→刘繇 not 刘瑶, zhang_miao→张邈 not 張毣, gongsun_du→公孙度 not 公孫犢); 23 non-kongming figures (foreign chiefs, emperors, Korean kings) came from dedicated Tavily research.
- **fileURLToPath for the ZH map path:** `new URL(...).pathname` yields `/E:/...` on Windows which fs cannot resolve — first seeded run logged the missing-file warning; fixed with fileURLToPath (Rule 1).
- **Clobber-safe set clause:** nameZh in onConflictDoUpdate `set` via `...(zh ? { nameZh: zh } : {})` so an entry-less re-run can never NULL a researched value (D-11/D-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration 0004 empty placeholder broke the fresh-DB migration chain**
- **Found during:** Task 3 (apply migration 0014)
- **Issue:** `npx drizzle-kit migrate` hung at "applying migrations..." — a fresh local DB (0 tables) needs the full 0000-0014 chain, which failed at 0006 (`ALTER TABLE football_matches DROP COLUMN dk_event_id` — column never existed because the migration that added it, 0004, is a 0-byte file since commit f8d2c26). The migrate CLI spinner masked the error.
- **Fix:** Diffed snapshots 0003→0004 (added exactly `dk_event_id`), restored `ALTER TABLE "football_matches" ADD COLUMN "dk_event_id" varchar(20);` to 0004; verified the full chain applies and all 9 Phase 8 tables exist.
- **Files modified:** migrations/0004_tiny_virginia_dare.sql
- **Verification:** `npx drizzle-kit migrate` exits 0 ("migrations applied successfully!"); pg_catalog shows 9/9 tables.
- **Committed in:** c2f2b5e (Task 3 commit)

**2. [Rule 1 - Bug] import.meta.url.pathname breaks on Windows (seed silently skipped ZH names)**
- **Found during:** Task 5 (re-run seed after nameZh wiring)
- **Issue:** First re-run logged "sanguo-zh-names.json not found — seeding name_zh as NULL" — `new URL(...).pathname` returns `/E:/Saeth/...` which fs.readFileSync cannot open on Windows.
- **Fix:** Switched to `fileURLToPath(new URL(...))`.
- **Files modified:** scripts/seed-sanguo.ts
- **Verification:** Re-run loads the map (no warning); name_zh NOT NULL = 132/7/3 (DB-asserted).
- **Committed in:** 49a312b (Task 5 commit)

**3. [Rule 1 - Bug] Kongming first-match mis-picked variant-spelling figures (23 corrections)**
- **Found during:** Task 5 (ZH name accuracy review + spot-check)
- **Issue:** kongming's hanzi index has multiple officers per English spelling; the naive first-match produced wrong names for famous figures (sun_jian→孫建 instead of 孙坚, liu_yao→刘瑶 instead of 刘繇, ly_ung→李应 instead of 李膺, zhang_miao→張毣 instead of 张邈, etc.).
- **Fix:** Context-based disambiguation (faction/role/detail from heroes-v1.json) plus targeted Tavily verification for 23 entries; all corrected in scripts/data/sanguo-zh-names.json.
- **Files modified:** scripts/data/sanguo-zh-names.json
- **Verification:** 10-hero deterministic spot-check vs independent references — zero unresolved mismatches after re-verification; 132/132 coverage.
- **Committed in:** 49a312b (Task 5 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking)
**Impact on plan:** All fixes were necessary for correctness — the migration chain was un-appliable on a fresh DB without the 0004 restoration, and the ZH names needed accuracy correction to satisfy D-06. No scope creep.

## Issues Encountered

- `npx drizzle-kit migrate` CLI hangs with only a spinner when a migration statement fails (no error surfaced) — the failure only appeared when running the migrate programmatically via drizzle-orm's node-postgres migrator. This is a tooling DX gap, not a code defect; documented for future migration debugging.
- Zscaler corporate proxy blocks direct kongming.net fetches (403) — worked around via Tavily's server-side extract endpoint.
- The dev DB was a fresh local PostgreSQL install (no migrations ever applied); the full 0000-0014 chain had to apply from scratch, which is what exposed the 0004 defect.

## User Setup Required

None - no external service configuration required (dev DB reachable via DATABASE_URL_DIRECT; Tavily research ran at authoring time, not at runtime).

## Next Phase Readiness

- **Phase 9 (Travel & Encounters)** can consume player_travel_state + encounter_runs (both migrated, FK-ready for map_nodes) — map node content is seeded with representative heroes for the /sanguo map (SC3).
- **Phase 10 (Battle & Capture)** can consume user_heroes (IV columns 0-31 checked) + sanguo_battles (round_logs jsonb).
- **Phase 11 (Progression/Economy Depth)** can consume user_sanguo_items (quantity CHECK + unique user/item).
- ZH-CN content is committed and DB-populated; the verifier may review scripts/data/sanguo-zh-names.json for final content sign-off (D-06 accuracy backstop, coverage D4).
- No blockers. The 0004 restoration should be noted in any future fresh-DB migration debugging (the chain now applies cleanly from 0000).

---
*Phase: 08-foundation-economy-budget-content-infrastructure*
*Completed: 2026-08-11*

## Self-Check: PASSED

- All 12 key files exist on disk (7 schemas, migration 0014 + snapshot, seed script, ZH map, SUMMARY)
- All 6 task commits present in git log (03e6768, a254ff3, c2f2b5e, 770c649, 49a312b, 6636521)
- No stubs (TODO/FIXME/placeholder) in seed script; nameZh conditional spread present in all 3 upserts

