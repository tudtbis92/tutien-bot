---
phase: 01-foundation
verified: 2026-04-11T15:57:00Z
status: human_needed
score: 5/5
overrides_applied: 0
deferred:
  - truth: "drizzle-kit migrate creates all tables: users, characters, items, orders, transactions, seasons"
    addressed_in: "Phase 2 + Phase 3"
    evidence: "Phase 2 SC-1 implies characters table; Phase 3 SC-2 explicitly requires orders table; Phase 3 SC-1 implies items table; Phase 3 SC-4 implies transactions table. characters/items/orders/transactions are Phase 2-3 domain objects, not Phase 1 infrastructure."
human_verification:
  - test: "npm start and verify bot appears online in Discord"
    expected: "ShardingManager spawns, shard connects to Discord Gateway, bot status shows 'online' in server, zero crash loops in logs"
    why_human: "Requires DISCORD_TOKEN + CLIENT_ID, live Discord API, Oracle VM running"
  - test: "Redis cooldown key set and retrieved from running bot"
    expected: "redisHealthCheck() returns true, tryAcquireCooldown returns true on first call and false on second identical call within TTL"
    why_human: "Requires live Redis instance at REDIS_URL — cannot mock in static analysis"
  - test: "pg-boss registers vwap-recalc cron in pgboss.schedule table"
    expected: "SELECT name, cron FROM pgboss.schedule returns: vwap-recalc | 0 * * * *"
    why_human: "Requires live PostgreSQL + DATABASE_URL_DIRECT — pg-boss.start() must run against actual DB"
  - test: "Push to main branch triggers CI/CD pipeline"
    expected: "GitHub Actions runs lint → typecheck → check-i18n → test → build, then deploys via SSH to Oracle VM and health check passes"
    why_human: "Requires GitHub secrets (ORACLE_HOST, ORACLE_USER, ORACLE_SSH_KEY), Oracle VM provisioned (T-03 human-action task pending), live Discord token"
---

# Phase 01: Foundation — Verification Report

**Phase Goal:** A runnable bot shell with all load-bearing infrastructure in place — database migrated, Redis connected, i18n wired, CI/CD deployed — so every downstream phase can build features without retrofitting  
**Verified:** 2026-04-11T15:57:00Z  
**Status:** human_needed  
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm start` launches ShardingManager; bot appears online in Discord with zero shard crash loops | ✓ VERIFIED (code) / ? HUMAN (live) | `bot.ts` has full ShardingManager setup with `totalShards: 'auto'`, preflight DB+Redis checks, graceful shutdown. Wired: `initPgBoss → startHealthServer → manager.spawn()`. Build succeeds. Live Discord test requires DISCORD_TOKEN. |
| 2 | `drizzle-kit migrate` runs from zero; required Phase 1 tables present | ✓ VERIFIED (users + seasons) | Migration `0000_pale_ultimo.sql` creates `users` (BIGINT balance, CHECK constraints) and `seasons` (partial unique index). `npm run typecheck` passes. Remaining tables (characters, items, orders, transactions) deferred — see Deferred section. |
| 3 | Redis health check passes; cooldown key set and retrieved from running bot | ✓ VERIFIED (code) / ? HUMAN (live) | `redisHealthCheck()` pings Redis and validates PONG. `tryAcquireCooldown()` uses atomic `SET NX PX`. `getCooldownTTL()` uses `PTTL`. All wired in `cache/index.ts`. Requires live Redis to test end-to-end. |
| 4 | pg-boss initializes; VWAP hourly cron job registered in pgboss.schedule | ✓ VERIFIED (code) / ? HUMAN (live) | `initPgBoss()`: `createQueue('vwap-recalc')` + `schedule('vwap-recalc', '0 * * * *', {})` + `work(...)` all present. Uses `DATABASE_URL_DIRECT` (bypasses PgBouncer for advisory locks). `runVwapRecalc` is intentional Phase 1 stub — logs only, VWAP logic deferred to Phase 3. |
| 5 | All user-facing strings come from locale files; ESLint rule blocks hardcoded strings; CI enforces on every push | ✓ VERIFIED | `npm run lint` → 0 errors, 0 warnings. `eslint-plugin-i18next/no-literal-string` at `'error'` level. `.husky/pre-commit` runs lint-staged. `ci.yml` runs lint + check-i18n. `npm run check-i18n` → ✅ all locale files in sync. interactionCreate.ts uses `getT(locale)` + `t('errors.internalError')`. |

**Score:** 5/5 truths verified (all code artifacts complete; 4 items also require live environment testing)

---

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `characters` table in initial migration | Phase 2 | Phase 2 SC-1: "user runs /start... /profile shows character" implies characters table |
| 2 | `items` table in initial migration | Phase 3 | Phase 3 SC-1: "user encounters yêu thú and receives loot drops" implies items table |
| 3 | `orders` table in initial migration | Phase 3 | Phase 3 SC-2: "user places limit sell order; trade executes automatically" implies orders table |
| 4 | `transactions` table in initial migration | Phase 3 | Phase 3 SC-4: "VWAP updates after each 1-hour window only when ≥5 transactions occurred" implies transactions table |

> **Note:** ROADMAP SC-2 lists all 6 tables as Phase 1 deliverables, but the PLAN correctly scoped Phase 1 to users + seasons only — these 4 tables have no Phase 1 consumers. Phase 2 and Phase 3 will add these tables when their domain code is implemented.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bot.ts` | ShardingManager entry, preflight, graceful shutdown | ✓ VERIFIED | Full implementation — ShardingManager, DB+Redis preflight, registerCommands, initPgBoss, startHealthServer, spawn, SIGTERM/SIGINT handlers |
| `src/shard.ts` | Discord Client, i18n init, command/event loaders | ✓ VERIFIED | Full implementation — initI18n → loadCommands → loadEvents → client.login (correct order) |
| `src/config.ts` | Zod env validation, fatal crash on bad config | ✓ VERIFIED | Zod schema with 6 env vars, `safeParse`, `process.exit(1)` on failure — confirmed working in spot-check |
| `src/db/schema/users.ts` | users table with BIGINT balance, CHECK constraints | ✓ VERIFIED | BIGINT with `sql\`0\`` default (drizzle-kit BigInt fix), `balance_non_negative` + `locale_valid` CHECK constraints |
| `src/db/schema/seasons.ts` | seasons table with one-active constraint | ✓ VERIFIED | Partial unique index `idx_seasons_one_active` WHERE `is_active = true` |
| `src/db/client.ts` | Drizzle + pg.Pool, PgBouncer-compatible | ✓ VERIFIED | Pool max:5, idleTimeout 30s, `DATABASE_URL` (PgBouncer port 6432) |
| `src/cache/redis.ts` | ioredis singleton, exponential backoff, events | ✓ VERIFIED | `{ Redis }` named import (ESM fix), retryStrategy with `Math.min(times*50, 2000)`, all connection event listeners |
| `src/cache/cooldown.ts` | tryAcquireCooldown, getCooldownTTL | ✓ VERIFIED | Atomic `SET NX PX`, PTTL helper |
| `src/workers/pgBoss.ts` | pg-boss lifecycle (ShardingManager only) | ✓ VERIFIED | `{ PgBoss }` named import (ESM fix), `DATABASE_URL_DIRECT`, schedule + work registered, graceful stop |
| `src/jobs/vwapRecalc.ts` | VWAP job stub (Phase 3 fills logic) | ✓ VERIFIED (intentional stub) | Logs job start/complete, TODO Phase 3 comment — intentional, documented in SUMMARY |
| `src/workers/health.ts` | Fastify /health + /ready endpoints | ✓ VERIFIED | Returns `{ status, uptime, responseTimeMs, db, redis, shards, shardsQueryFailed, timestamp }`, status 503 when degraded |
| `src/i18n/index.ts` | initI18n, resolveLocale, getT | ✓ VERIFIED | All 3 locales preloaded, 5 namespaces, resolveLocale priority chain verified in tests and spot-check |
| `src/assets/emojis.ts` | typed emoji registry (as const) | ✓ VERIFIED | `as const` confirmed, all emoji keys accessible |
| `src/ui/theme.ts` | color palette, embedFooter | ✓ VERIFIED | 7 semantic colors (COLORS), embedFooter with shard ID |
| `src/ui/embeds/buildErrorEmbed.ts` | standardized error embed | ✓ VERIFIED | Uses COLORS.DANGER, EMOJI.ERROR, embedFooter, setTimestamp |
| `src/ui/embeds/buildSuccessEmbed.ts` | standardized success embed | ✓ VERIFIED | Uses COLORS.SUCCESS, EMOJI.SUCCESS, embedFooter, setTimestamp |
| `src/commands/game/ping.ts` | sample slash command (end-to-end test) | ✓ VERIFIED | Uses resolveLocale, getT, buildSuccessEmbed, t('system.pingDescription') with params |
| `src/events/ready.ts` | shard ready logger | ✓ VERIFIED | Logs shard ready event |
| `src/events/interactionCreate.ts` | command dispatch + i18n error handler | ✓ VERIFIED | Routes to command.execute(), error catches use getT + buildErrorEmbed |
| `src/utils/commandLoader.ts` | runtime command discovery (dist/commands/**) | ✓ VERIFIED | Exists, loaded by shard.ts |
| `src/utils/registerCommands.ts` | Discord REST registration (manager only) | ✓ VERIFIED | Called once from bot.ts, never from shard.ts |
| `src/utils/eventLoader.ts` | event handler autodiscovery | ✓ VERIFIED | Exists, loaded by shard.ts |
| `src/utils/format.ts` | formatBalance (BigInt → locale string) | ✓ VERIFIED | `formatBalance(1234567n)` → `"1,234,567"` confirmed in spot-check |
| `src/utils/logger.ts` | structured logger wrapper | ✓ VERIFIED | 4 log levels, ISO timestamp prefix |
| `locales/vi/*.json` (5 files) | Vietnamese locale (5 namespaces) | ✓ VERIFIED | All 5 files exist, check-i18n passes |
| `locales/en/*.json` (5 files) | English locale (5 namespaces) | ✓ VERIFIED | All 5 files exist, check-i18n passes |
| `locales/zh-cn/*.json` (5 files) | Chinese locale (5 namespaces) | ✓ VERIFIED | All 5 files exist, check-i18n passes |
| `scripts/check-i18n.ts` | missing key CLI detector | ✓ VERIFIED | `npm run check-i18n` → ✅ All locale files are in sync. |
| `migrations/0000_pale_ultimo.sql` | initial schema migration | ✓ VERIFIED | Creates users + seasons with all constraints |
| `.github/workflows/ci.yml` | CI pipeline (lint → typecheck → check-i18n → test → build) | ✓ VERIFIED | 5-step pipeline, `workflow_call` trigger for deploy.yml |
| `.github/workflows/deploy.yml` | Deploy pipeline (CI gate → SSH deploy → health check) | ✓ VERIFIED | Calls ci.yml as reusable workflow, SSH deploy, pm2 restart, curl health check |
| `ecosystem.config.cjs` | pm2 fork-mode process config | ✓ VERIFIED | `exec_mode: 'fork'`, 1G memory guard, 10 max restarts, `.cjs` extension (type:module fix) |
| `.husky/pre-commit` | pre-commit hook runs lint-staged | ✓ VERIFIED | `npx lint-staged`, lint-staged config targets `src/**/*.ts` |
| `eslint.config.mjs` | TypeScript + i18next rules at error level | ✓ VERIFIED | `i18next/no-literal-string: 'error'`, test files excluded |
| `drizzle.config.ts` | drizzle-kit config using DATABASE_URL_DIRECT | ✓ VERIFIED | Uses `process.env.DATABASE_URL_DIRECT` (bypasses PgBouncer) |
| `.env.example` | all required vars documented | ✓ VERIFIED | 6 vars with descriptions |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bot.ts` | `workers/pgBoss.ts` | `initPgBoss()` | ✓ WIRED | Imported + called after DB/Redis preflight, before shard spawn |
| `bot.ts` | `workers/health.ts` | `startHealthServer(manager)` | ✓ WIRED | Imported + called with manager instance for shard status queries |
| `bot.ts` | `utils/registerCommands.ts` | `registerCommands()` | ✓ WIRED | Imported + called once in manager (not shard) |
| `bot.ts` | `db/client.ts` | `db.execute(sql\`SELECT 1\`)` preflight | ✓ WIRED | DB preflight check before spawn |
| `bot.ts` | `cache/redis.ts` | `redis.ping()` preflight | ✓ WIRED | Redis preflight check before spawn |
| `shard.ts` | `i18n/index.ts` | `initI18n()` | ✓ WIRED | Called before loadCommands and client.login |
| `shard.ts` | `utils/commandLoader.ts` | `loadCommands(client)` | ✓ WIRED | Loads dist/commands/**/*.js into client.commands |
| `shard.ts` | `utils/eventLoader.ts` | `loadEvents(client)` | ✓ WIRED | Loads and registers event handlers |
| `events/interactionCreate.ts` | `i18n/index.ts` | `resolveLocale + getT` | ✓ WIRED | Error handler uses i18n for error messages |
| `events/interactionCreate.ts` | `ui/embeds/buildErrorEmbed.ts` | `buildErrorEmbed(t(...))` | ✓ WIRED | Error responses use standardized embed builder |
| `commands/game/ping.ts` | `i18n/index.ts` | `resolveLocale + getT + t(...)` | ✓ WIRED | Response uses `t('system.pingDescription')` with params |
| `commands/game/ping.ts` | `ui/embeds/buildSuccessEmbed.ts` | `buildSuccessEmbed(...)` | ✓ WIRED | Response uses standardized embed builder |
| `workers/health.ts` | `db/client.ts` | `db.execute(sql\`SELECT 1\`)` | ✓ WIRED | Health check queries DB on each request |
| `workers/health.ts` | `cache/redis.ts` | `redisHealthCheck()` | ✓ WIRED | Health check pings Redis on each request |
| `workers/pgBoss.ts` | `jobs/vwapRecalc.ts` | `runVwapRecalc(job)` | ✓ WIRED | pg-boss work handler calls runVwapRecalc |
| `.husky/pre-commit` | `eslint.config.mjs` | `lint-staged → eslint src/**/*.ts` | ✓ WIRED | Pre-commit hook enforces i18n rule |
| `ci.yml` | `npm run lint` + `check-i18n` | GitHub Actions steps | ✓ WIRED | CI pipeline runs both checks on every push |

---

### Data-Flow Trace (Level 4)

Not applicable for Phase 1 — no user-facing dynamic data rendering (no game state, no database reads exposed to users). All Phase 1 components are infrastructure (connection pools, schedulers, CLI tools) or skeleton event handlers. The ping command's data flow is: `interaction.client.ws.ping` (Discord.js built-in) → `buildSuccessEmbed` → `interaction.reply` — no DB read required.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Config validation fails on missing env vars | `node -e "import('./dist/config.js')"` | Printed 5 error messages, process exited | ✓ PASS |
| formatBalance handles large BigInt | `formatBalance(1234567n)` | `"1,234,567"` | ✓ PASS |
| resolveLocale priority chain | `resolveLocale('en', 'zh')` | `'en'` (stored pref wins) | ✓ PASS |
| resolveLocale VI default fallback | `resolveLocale(null, null)` | `'vi'` | ✓ PASS |
| UI module exports complete | `import('./dist/ui/index.js')` | `COLORS, buildErrorEmbed, buildSuccessEmbed, embedFooter` | ✓ PASS |
| Emoji registry accessible | `EMOJI.SUCCESS` / `EMOJI.ERROR` | `✅` / `❌` | ✓ PASS |
| i18n resolveLocale test suite | `npm test` | 5/5 resolveLocale tests pass | ✓ PASS |
| formatBalance test suite | `npm test` | 4/4 formatBalance tests pass | ✓ PASS |
| TypeScript compilation | `npm run typecheck` | 0 errors | ✓ PASS |
| ESLint with i18n rule | `npm run lint` | 0 errors, 0 warnings | ✓ PASS |
| i18n key sync | `npm run check-i18n` | ✅ All locale files are in sync. | ✓ PASS |
| Build produces runnable output | `npm run build` | dist/ populated with .js + .d.ts + .map | ✓ PASS |
| All 15 task commits verified | `git log --oneline` | All commits 28a0f43..bd8159e present | ✓ PASS |

---

### Requirements Coverage

| Requirement | Phase Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | T-09 | ShardingManager, auto-shard | ✓ SATISFIED | ShardingManager with totalShards:'auto', shard lifecycle events wired |
| INFRA-02 | T-04 | DB schema with Drizzle migrations | ✓ SATISFIED (partial) | users + seasons tables created; characters/items/orders/transactions deferred to Phase 2-3 |
| INFRA-03 | T-05 | Redis cooldown + VWAP cache | ✓ SATISFIED | ioredis singleton, redisHealthCheck, tryAcquireCooldown (atomic SET NX PX) |
| INFRA-04 | T-06 | pg-boss VWAP cron every 1h | ✓ SATISFIED | schedule('vwap-recalc', '0 * * * *'), createQueue, work handler registered |
| INFRA-05 | T-07 | i18n scaffold VI/EN/ZH-CN | ✓ SATISFIED | 15 locale files, initI18n, resolveLocale, getT, check-i18n CLI |
| INFRA-06 | T-14 | CI/CD: build, test, deploy | ✓ SATISFIED | ci.yml (5 steps) + deploy.yml (SSH + health check) |
| INFRA-07 | T-10 | Health check + monitoring | ✓ SATISFIED | GET /health returns status/db/redis/shards/uptime JSON |
| I18N-01 | T-07/T-09 | Bot responds in user language | ✓ SATISFIED | resolveLocale(stored, Discord) → VI/EN/ZH-CN, getT bound to locale |
| I18N-02 | T-07 | Locale files complete, missing-key CLI | ✓ SATISFIED | 15 files, scripts/check-i18n.ts, npm run check-i18n → ✅ |
| I18N-03 | T-11/T-12 | ESLint rule + pre-commit hook | ✓ SATISFIED | i18next/no-literal-string:'error', husky pre-commit, CI lint step |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/jobs/vwapRecalc.ts` | 11 | `// TODO (Phase 3): Fetch last 1h transactions...` | ℹ️ Info | Intentional Phase 1 stub — documented in SUMMARY Known Stubs. VWAP logic is Phase 3 work. Function logs job execution (confirms scheduling works). Not a blocker. |
| `src/assets/emojis.ts` | 11-12 | `// TODO: Replace with custom <:linh_thach:ID>` | ℹ️ Info | Unicode emoji placeholders until custom emojis are created in Discord Developer Portal. Bot functions correctly with Unicode. Not a blocker. |
| `src/events/interactionCreate.ts` | 23 | `// TODO (Phase 2): Fetch user locale from DB` | ℹ️ Info | Phase 1 passes `null` for stored locale — resolveLocale falls through to Discord locale → VI default. Phase 2 will add DB lookup. Correct behavior for Phase 1. Not a blocker. |

All TODOs are intentional Phase 1 stubs. None prevent Phase 1 goal achievement.

---

### Human Verification Required

#### 1. Bot Online in Discord

**Test:** On Oracle VM: ensure T-03 infrastructure is provisioned → set up `.env` with real credentials → `npm start` → check Discord server shows bot as "online"  
**Expected:** ShardingManager logs "All shards launched", shards log "Shard N ready", bot appears with green online indicator in Discord member list, no crash loops in logs within 60 seconds  
**Why human:** Requires live DISCORD_TOKEN, CLIENT_ID, Discord API connectivity, and Oracle VM with Node.js 22 + PM2 installed (T-03 is a pending human-action task)

#### 2. Redis Live Health Check

**Test:** With Redis running at `REDIS_URL` → start bot → check `/health` endpoint → verify cooldown behavior  
**Expected:** `curl http://localhost:3000/health` returns `{"status":"ok","redis":"ok",...}` — and running two identical Discord commands in quick succession results in the second being rate-limited (cooldown applied)  
**Why human:** Requires live Redis instance — static analysis confirms the code is correct but can't execute Redis protocol commands

#### 3. pg-boss VWAP Cron Registration

**Test:** With real `DATABASE_URL_DIRECT` → start bot → query DB  
**Expected:** `SELECT name, cron FROM pgboss.schedule` returns row: `vwap-recalc | 0 * * * *`; `pgboss.job` table exists with pg-boss infrastructure tables  
**Why human:** Requires live PostgreSQL — pg-boss must actually run `boss.start()` against the DB to create its schema tables

#### 4. CI/CD Pipeline End-to-End

**Test:** Push any commit to `main` branch on GitHub  
**Expected:** GitHub Actions triggers `deploy.yml` → runs CI job (lint → typecheck → check-i18n → test → build all pass) → SSH deploy job deploys to Oracle VM → `curl http://localhost:3000/health | grep '"status":"ok"'` passes → "Deploy complete." logged  
**Why human:** Requires GitHub secrets configured (ORACLE_HOST, ORACLE_USER, ORACLE_SSH_KEY) + Oracle VM provisioned (T-03), active network path from GitHub Actions runners to Oracle VM

---

### Gaps Summary

No gaps found. All code deliverables are complete, substantive, and properly wired. The 4 human verification items above are live environment tests — not missing code. All automated checks pass:

- `npm run typecheck` → 0 errors ✓
- `npm run lint` → 0 errors, 0 warnings ✓  
- `npm run test` → 9/9 tests pass ✓
- `npm run build` → dist/ built successfully ✓
- `npm run check-i18n` → all 15 locale files in sync ✓
- All 15 task commits confirmed in git history ✓

The only outstanding item from Phase 1 is **T-03: Oracle VM Setup** — a human-action checkpoint documented in the SUMMARY as intentionally skipped. VM provisioning (PostgreSQL 16, Redis, PgBouncer, Node.js 22, pm2) must be completed before `npm start` can run in production.

---

*Verified: 2026-04-11T15:57:00Z*  
*Verifier: the agent (gsd-verifier)*
