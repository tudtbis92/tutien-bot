---
phase: 08-foundation-economy-budget-content-infrastructure
reviewed: 2026-08-11T10:30:00Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - src/services/wallet.ts
  - src/db/schema/walletTransactions.ts
  - src/db/schema/heroes.ts
  - src/db/schema/userHeroes.ts
  - src/db/schema/playerTravelState.ts
  - src/db/schema/sanguoBattles.ts
  - src/db/schema/sanguoItems.ts
  - src/db/schema/userSanguoItems.ts
  - src/db/schema/encounterRuns.ts
  - src/db/schema/mapNodes.ts
  - src/db/schema/index.ts
  - src/commands/sanguo/map.ts
  - src/commands/game/gather.ts
  - src/ui/embeds/buildSanguoMapEmbed.ts
  - src/ui/index.ts
  - src/assets/sanguoEmojis.ts
  - src/assets/index.ts
  - src/shard.ts
  - src/i18n/index.ts
  - src/utils/commandContext.ts
  - src/services/farming/subscriptionService.ts
  - src/services/football/predictionService.ts
  - src/services/football/matchLifecycleService.ts
  - scripts/gen-sanguo-emojis.ts
  - scripts/seed-sanguo.ts
  - scripts/check-i18n.ts
  - scripts/deploy.sh
  - scripts/data/sanguo-zh-names.json
  - eslint.config.mjs
  - package.json
  - migrations/0014_next_chimera.sql
  - migrations/meta/_journal.json
  - migrations/meta/0014_snapshot.json
  - migrations/0004_tiny_virginia_dare.sql
  - src/assets/__tests__/sanguoEmojis.test.ts
  - src/ui/embeds/__tests__/buildSanguoMapEmbed.test.ts
  - src/commands/sanguo/__tests__/map.test.ts
  - src/services/__tests__/wallet.test.ts
  - locales/vi/sanguo.json
  - locales/en/sanguo.json
  - locales/zh-cn/sanguo.json
  - .env.example
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-08-11T10:30:00Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Reviewed the Phase 8 execution: emoji registry generator + `heroEmoji` + startup appId hard-fail, wallet service + 7-site balance-write refactor, 7 sanguo schemas + barrel merge, migration 0014, idempotent seed, `/sanguo map` command + embed, ESLint emoji-ID rule, and migration 0004 restoration.

**Verified correct (no findings):**
- **Wallet object-identity discrimination (D-02):** `txOrDb === db` identity check (never method probing) is correct — all 5 production call sites (gather, subscription ×2, prediction, matchLifecycle) pass a transaction object, and `tx !== db` routes them to direct execution. The wallet test explicitly exercises a mockTx that also exposes `.transaction()` (nested-savepoint surface) and confirms no nested transaction is opened. The migration 0014 journal entry, FK set, and index set all match the schema files.
- **Migration 0014 purely additive:** 3 CREATE TYPE + 9 CREATE TABLE (incl. `map_nodes`) + FK `ALTER TABLE ADD CONSTRAINT` on new tables only + 4 CREATE INDEX. No DROP, no ALTER on pre-existing tables. Journal idx 14 registered; snapshot contains all 9 tables. Matches the plan's fail-closed gate (8-table 0014 would have been a failure).
- **Schema barrel merge:** Phase 8 exports appended after Phase 2.2; no exported-name collisions across the 91 schema exports (verified by scan). `map_nodes` present in the merged index, so the drizzle-kit diff includes it.
- **Seed `nameZh` clobber-safety (D-11/D-06):** the `...(zh ? { nameZh: zh } : {})` conditional spread means an entry-less re-run can never overwrite a researched value with NULL. The 132-key zh-names map covers exactly the 132-hero assert.
- **Startup appId check ordering (D-14):** `assertEmojiApplicationId` runs in `shard.ts` at line 33, before `client.login()` at line 81, and before loadCommands/loadEvents. `.env.example` CLIENT_ID matches the registry applicationId.

**Key concerns:** Two blockers — (1) the `/sanguo map` command can never render after seeding because the seed's `representativeHeroId` values (full hero ids like `dong_trac`, `cao_cao`) do not exist in the emoji registry (3-letter prefixes like `dtr`, `cao`), so `heroEmoji()` throws `EMOJI_NOT_FOUND` on every zone; (2) the deploy pipeline now runs the seed, which hard-requires a dev-only JSON at a Windows absolute path, so production deploys will abort at the seed step.

## Critical Issues

### CR-01: /sanguo map always renders the error embed — representativeHeroId is in a different id space than the emoji registry

**File:** `scripts/seed-sanguo.ts:109-166` + `src/commands/sanguo/map.ts:70-87` + `src/ui/embeds/buildSanguoMapEmbed.ts:22-23` + `src/assets/sanguoEmojis.ts:1076-1087`
**Issue:** The seed inserts `map_nodes.representative_hero_id` values `dong_trac`, `han_xian_di`, `cao_cao`, `yuan_shao`, `sun_jian`, `liu_biao`, `liu_bei` — these are **hero-id-space** values (they match `scripts/data/sanguo-zh-names.json` hero keys, which are keyed by `heroes-v1.json` ids). The emoji registry `SANSUO_EMOJIS` is keyed by **132 three-letter prefixes** (`abt_t0`, `cao_t0`, `dtr_t0`, … `zyn_t3_star` — verified programmatically: 1056 keys, 132 distinct prefixes, none matching `dong_trac`/`cao_cao`/etc.). `heroEmoji('dong_trac')` therefore looks up `dong_trac_t0`, finds nothing, and **throws `Error('EMOJI_NOT_FOUND:dong_trac')`**. In `map.ts` that throw happens inside `buildSanguoMapEmbed()` within the `try` block, so the `catch` at lines 88-92 replaces the map with the `sanguo:map.error` embed. Since `deploy.sh` seeds in production, **every `/sanguo map` invocation will show the error embed — the D-07 scaffold is completely non-functional.** The tests never catch this: `map.test.ts` covers only the empty-DB branch, and `buildSanguoMapEmbed.test.ts` uses valid 3-letter codes (`abt`, `hsd`).
**Fix:** Align the two id spaces. Either (a) seed `representative_hero_id` with the emoji-prefix codes (e.g. `dtr` for Đổng Trác, `cao` for Tào Tháo), or (b) add a `hero_id → emoji_prefix` mapping (column or lookup) used by `heroEmoji()`, or (c) regenerate the emoji registry keyed by the full hero ids. Also add a test that renders the map with the **seeded** representativeHeroId values so the contract is enforced.

### CR-02: Deploy pipeline hard-fails — seed requires a dev-only JSON at a Windows absolute path

**File:** `scripts/deploy.sh:26` + `scripts/seed-sanguo.ts:47,201-204`
**Issue:** The new deploy step `DATABASE_URL="$DATABASE_URL_DIRECT" npx tsx scripts/seed-sanguo.ts` runs on the production Linux server under `set -e`. The seed reads `HEROES_JSON_PATH = 'E:\\Saeth\\sanguo_assets\\src\\data\\heroes-v1.json'` — a hardcoded Windows dev-machine path into a **sibling repo that is not committed anywhere in this repository** (verified: no `heroes-v1.json` under the repo root). `readFileSync` throws `ENOENT` on the server → `seed().catch()` calls `process.exit(1)` → `set -e` aborts the deploy **before** `pm2 restart tutien-bot` (line 29), leaving the production bot running stale code with the new tables applied and the health check never reached. Even on a dev machine, `npm run seed:sanguo` fails hard without that sibling repo, and the `rawHeroes.length !== 132` assertion (line 202-204) turns any content drift into a hard failure. The header comment ("Dev-time source … never read at runtime") is contradicted by the deploy step.
**Fix:** Commit a snapshot of `heroes-v1.json` into the repo (e.g. `scripts/data/heroes-v1.json`) and resolve it via `import.meta.url` relative path (as is already done for `sanguo-zh-names.json`), or make the path an env var (`SANGUO_HEROES_SOURCE`) that deploy.sh points at the committed file. Consider whether the 132-count assertion should fail-closed or warn.

## Warnings

### WR-01: creditBalance dereferences `rows[0]!` without a zero-row guard — TypeError crash on missing user

**File:** `src/services/wallet.ts:96-102`
**Issue:** `deductBalance` guards the zero-row case (throws `INSUFFICIENT_BALANCE`), but `creditBalance` runs `UPDATE … WHERE user_id = …` with **no balance guard**, then unconditionally reads `rows[0]!.balance`. If the user row does not exist, the UPDATE returns `[]` and `rows[0]!` is `undefined`, producing `TypeError: Cannot read properties of undefined (reading 'balance')` — an opaque crash that rolls back the whole transaction instead of a meaningful error. All current call sites guarantee the user exists (bets/subscriptions imply a prior user row), so this is latent, but any future `creditBalance` caller (e.g. an admin grant command) hits it.
**Fix:** Add an explicit zero-row check: `if (rows.length === 0) throw new Error('USER_NOT_FOUND');` before reading `rows[0]`.

### WR-02: /sanguo map zone labels render raw snake_case zone codes — unlocalized user-facing strings

**File:** `src/commands/sanguo/map.ts:70-82`, `src/ui/embeds/buildSanguoMapEmbed.ts:22-24`
**Issue:** The zones field is built from `zoneMap` keyed by `row.zone` — the raw DB code (`trung_nguyen`, `quan_trung`, `giang_dong`, …). These codes are passed straight into the embed as the visible zone label for **all locales**. EN and ZH-CN users see Vietnamese-romanized codes like `trung_nguyen`, violating the project's core "i18n từ ngày đầu — không hardcode string nào" constraint and D-07's "content-in-DB per-locale name columns" promise. `map_nodes` has no zone-name columns at all (only a `zone` varchar code), so there is no way to localize the zone display today.
**Fix:** Add per-locale zone name columns (`zone_name_vi/en/zh`) to `map_nodes` and a `pickZoneName()` analogous to `pickName()`, or derive zone labels from the zone's nodes / i18n keys.

### WR-03: heroEmoji fallback silently drops tier/star — renders the wrong variant image

**File:** `src/assets/sanguoEmojis.ts:1076-1087`, `scripts/gen-sanguo-emojis.ts:57-74`
**Issue:** When a requested tier/star variant is missing, `heroEmoji` falls back to `${heroId}_t0` — dropping **both** the tier and the star (`heroEmoji('abt', 2, true)` with no `abt_t2_star` renders `abt_t0`). For a game where tier/star distinguishes hero progression, a silent downgrade to the base image is a display correctness bug, and there is no diagnostic. The generator's `validateEmojis()` only asserts **distinct prefix count ≥ 132** — it never validates per-hero completeness (all 4 tiers × star), so a partially-populated `emojis.json` for a new hero passes validation and the map/embed silently renders wrong tiers.
**Fix:** In `heroEmoji`, fall back in order: exact key → `${heroId}_t${tier}` (preserving tier) → `${heroId}_t0`. In the generator, validate that every prefix has `_t0`…`_t3` and `_t0_star`…`_t3_star` (8 keys) and fail on partial sets.

### WR-04: Seed is non-transactional — a mid-run failure commits partial content

**File:** `scripts/seed-sanguo.ts:199-326`
**Issue:** The seed runs 132+ sequential upserts with no wrapping transaction and the pool allows 2 concurrent connections (`max: 2`). A failure at hero N (e.g. a transient connection error) leaves heroes 0..N-1 committed and the rest missing — a partially-seeded catalog that is then served to `/sanguo map` and later features. The idempotent upsert design means a re-run heals it, but the deploy pipeline runs the seed exactly once and `set -e` aborts before any retry. Content loads of this size should be atomic.
**Fix:** Wrap the whole seed in `db.transaction(...)` (using a single client), so a failure rolls back all rows; keep the per-row `onConflictDoUpdate` idempotency.

## Info

### IN-01: Generator defaults to a machine-specific absolute source path

**File:** `scripts/gen-sanguo-emojis.ts:18`
**Issue:** `SOURCE_PATH` defaults to `'E:\\Saeth\\sanguo_assets\\assets\\emojis.json'` when `SANGUO_EMOJIS_SOURCE` is unset. Anyone regenerating on another machine either silently reads a wrong file or must know the env var exists. Worse, regeneration with a different `emojis.json` overwrites the committed registry (and its applicationId), which would then trip the D-14 startup hard-fail — confusing but safe. Make the source path required (fail with usage) or resolve relative to the repo.

### IN-02: Seed `nameZh` conditional spread treats empty string as "no value"

**File:** `scripts/seed-sanguo.ts:238,254,265,285,296,316`
**Issue:** `...(zh ? { nameZh: zh } : {})` — an empty-string researched value would be skipped in the conflict-update set while the INSERT sets `nameZh = ''`, creating an inconsistency between insert and update paths (NULL vs `''`). Real Chinese names are never empty, so this is theoretical; normalize with `zh ?? null` for consistency.

### IN-03: check-i18n.ts only detects keys missing from vi; misleading "Missing file" message

**File:** `scripts/check-i18n.ts:46-57`
**Issue:** The script flags keys present in `vi` but absent from `en`/`zh-cn`, but never flags **extra** keys in `en`/`zh-cn` (drift can accumulate silently), and a JSON parse failure is reported as `Missing file: locales/…` even when the file exists but is invalid JSON. Minor DX/correctness of the checker itself.

### IN-04: map command test covers only the empty-DB branch

**File:** `src/commands/sanguo/__tests__/map.test.ts:31-54`
**Issue:** The only `/sanguo map` test mocks `db.select` to return `[]`, so the seeded path (non-empty rows with `representativeHeroId`) — the path that CR-01 breaks — is untested. A second test with a realistic seeded row set (including a `representativeHeroId` from the seed's `MAP_NODES`) would have caught the id-space mismatch in CI.

---

_Reviewed: 2026-08-11T10:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
