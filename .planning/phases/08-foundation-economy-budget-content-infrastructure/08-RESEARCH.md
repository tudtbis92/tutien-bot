# Phase 8: Foundation, Economy Budget & Content Infrastructure - Research

**Researched:** 2026-08-10
**Domain:** Shared wallet service, Drizzle schema + idempotent seed, i18n namespace infrastructure, generated emoji registry, economy design-gate documentation
**Confidence:** HIGH

## Summary

Phase 8 is an **integration/refactor phase over existing, verified code** — not a greenfield build with new external dependencies. Every pattern it needs (WHERE-guard balance mutation, `db.transaction` + `FOR UPDATE`/`SKIP LOCKED`, Drizzle upsert with composite targets and `targetWhere`, i18next namespace registration, vitest module mocking, embed builders) already exists in the repo and was verified this session with exact file:line references. **No new npm packages are required** for any of the five workstreams — the wallet service, seed script, emoji generator, and `/sanguo map` command are all built on the current dependency set (drizzle-orm 0.45.2, pg, i18next 26.3.6, discord.js 14.27.0, vitest 4.1.10, tsx).

Four findings materially affect planning and were not obvious from CONTEXT.md:

1. **`.env` `CLIENT_ID` is still the placeholder `your_application_client_id`** [VERIFIED: read .env this session] — the D-16/D-14 contract (applicationId `1381818375633899562` === CLIENT_ID) is **currently unsatisfied**, so the startup hard-fail check would kill boot until `.env` is fixed. The planner MUST include a `.env` update task (and the check must be structured so tests can exercise it without the real ID).
2. **There is NO existing ESLint rule blocking direct emoji-ID embedding.** `eslint.config.mjs` contains only `i18next/no-literal-string` (plus TS recommended). D-15's "mirrors the Phase 1 `EMOJI` registry pattern" is today a **doc-comment convention, not an enforced rule**. Enforcing D-15 requires either a small custom rule in `eslint.config.mjs` or an explicit decision to rely on review + the typed-const pattern.
3. **The VWAP bands (1.2×/0.7×/2.5×) exist only as spec text in REQUIREMENTS.md (MKT-02/03/04), not in code** — `src/jobs/vwapRecalc.ts` is a stub (`// TODO (Phase 3)`) and the marketplace (Phase 3) is PAUSED. The economy budget doc (TQC-05/D-20) must cite REQUIREMENTS.md as the source for these, and treat the marketplace fee sink (MKT-07 10% burn) as a *future* sink, not a live one.
4. **`scripts/check-i18n.ts` `NAMESPACES` is missing `football`** (line 13) even though `football` is a registered i18next namespace and has locale files. D-08's "register sanguo in BOTH places" should also repair this pre-existing gap (add `football`) or the lint remains silently incomplete for one namespace.

**Primary recommendation:** Split planning into 5 workstreams matching TQC-01…TQC-05, sequenced so TQC-01 (wallet) and TQC-02 (schemas + seed) land first (they are prerequisites for SC1/SC2), with TQC-04's `.env` CLIENT_ID fix and TQC-03 namespace registration as hard early tasks. The economy budget doc (TQC-05) is a design-gate deliverable that can be authored in parallel — its numbers are now verified (see TQC-05 section).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** **Ledger table `wallet_transactions` from day one.** Every `deductBalance` / `creditBalance` call writes one ledger row (userId, type, amount, balance_after, reason, metadata, created_at) in the same DB transaction as the balance update.
- **D-02:** **Wallet manages the transaction.** API shape is `wallet.deductBalance(tx, userId, amount, { reason, metadata })` (and symmetric `creditBalance`), accepting a transaction object so the ledger write and balance update are atomic. The wallet service drives `db.transaction` internally where a flow has no other write needs.
- **D-03:** **Wallet is the single source of truth for ALL `users.balance` changes.** All existing flows (gather, farming subscription purchase/upgrade, football prediction/matchLifecycle payouts) are refactored through it; all future flows MUST go through it. No new call site may write `users.balance` directly.
- **D-04:** **Ledger recorded in Phase 8; `/profile` history UI deferred.** SC1 is met via the refactor (no drift, no double-spend) — history visualization is not required for SC1.
- **D-05:** **Three separate locale columns on content rows** — `name_vi`, `name_en`, `name_zh` (varchar) on `heroes`, `map_nodes`, `sanguo_items` (and any other content-bearing table). Not JSONB, not a translations table.
- **D-06:** **ZH-CN hero/zone/item names sourced via Tavily web research for accuracy** — not agent-guessed, not deferred. VI from `heroes-v1.json` `name`, EN from its `en` field, ZH-CN researched via Tavily during Phase 8 content work.
- **D-07:** **Strict content-vs-UI boundary: content names = DB columns, UI strings = i18next `sanguo` namespace.** No lore/title exception.
- **D-08:** **`sanguo` namespace registered in BOTH `src/i18n/index.ts` `ns` array AND `scripts/check-i18n.ts` `NAMESPACES`.**
- **D-09:** **Seed all 132 heroes from `heroes-v1.json` in Phase 8.**
- **D-10:** **`map_nodes` schema fully defined, but only a minimal placeholder seed (≈5–10 nodes) in Phase 8.** Full node structure + hero-per-zone distribution is Phase 9 research (TQC-09).
- **D-11:** **Upsert full (ON CONFLICT DO UPDATE) for idempotent seed.** Requires a unique natural key per entity (e.g., hero `hero_id`, node `code`).
- **D-12:** **One idempotent seed script: `scripts/seed-sanguo.ts`**, covering heroes + map nodes (placeholder) + items in a single re-runnable script. Run in CI/deploy pipeline.
- **D-13:** **Build-time generation, committed file.** `scripts/gen-sanguo-emojis.ts` reads `emojis.json` from the sibling repo (`E:\Saeth\sanguo_assets\assets\emojis.json`) at build/dev time and emits committed `src/assets/sanguoEmojis.ts`. Runtime NEVER reads the sibling repo.
- **D-14:** **Startup check `applicationId === CLIENT_ID` fails hard.** In shard.ts before `client.login()`; mismatch → fatal exit.
- **D-15:** **`heroEmoji(heroId, tier)` is the SOLE render point** for sanguo emoji (default tier `t0`, `_star` variant supported). ESLint rule blocks direct emoji-ID embedding.
- **D-16:** **Confirmed: applicationId of the emoji set (`1381818375633899562`) IS the bot's CLIENT_ID.** `.env` `CLIENT_ID` must equal `1381818375633899562` (or `emojis.json` regenerated).
- **D-17:** **Standalone ADR-style artifact: `docs/economy-budget.md`.** Not embedded in planning docs.
- **D-18:** **Design-gate closes in Phase 8 with concrete numbers.** Blocks faucet → marketplace arbitrage.
- **D-19:** **Net-sink/neutral is a HARD constraint for the sub-game.** Total outflow ≥ total inflow; free starter hero (TQC-12, Phase 10) is the only faucet exception.
- **D-20:** **Phase 8 researcher collects/verifies the comparison numbers** (daily tu vi cap 10,000, VWAP bands 1.2×/0.7×/2.5×, existing sinks) from the current codebase and feeds them into `docs/economy-budget.md`.

### the agent's Discretion

- Exact `wallet_transactions` column set beyond the core (userId, type, amount, balance_after, reason, metadata, created_at) and index design.
- `/sanguo map` read-only scaffold implementation detail (SC3) — command registration, embed layout, which placeholder nodes to show.
- Exact 5–10 placeholder map node set (names/zones/order).
- Exact `sanguoEmojis.ts` key format and `heroEmoji()` signature details.
- Exact upsert conflict target / natural keys per entity in `seed-sanguo.ts`.
- The `sanguo` namespace file organization (single `sanguo.json` per locale vs sub-structure).

### Deferred Ideas (OUT OF SCOPE)

- **`/profile` transaction history UI** — ledger data accumulates from Phase 8 (D-01), visualization later.
- **Full map/zone structure + hero-per-zone distribution** — Phase 9 research (TQC-09); Phase 8 ships placeholder nodes only (D-10).
- **Boss server + PvP** — post-v1.
- **t3 evolution tiers / `tiers.json` forms (mecha/god/sexy)** — potential future expansion, not Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TQC-01 | Extract shared wallet service (`services/wallet.ts`): `deductBalance` (WHERE guard + rowCount) + `creditBalance`; refactor gather, farming, football call sites | All 6 balance write sites located and quoted (see TQC-01 section); exact refactor shape for each call site documented; ledger schema pattern from existing tables |
| TQC-02 | Schemas: `heroes`, `user_heroes`, `map_nodes`, `player_travel_state`, `sanguo_battles`, `sanguo_items`, `user_sanguo_items`, `encounter_runs` + migration + idempotent seed | Schema file layout, merge pattern, migration tooling (next = 0014), seed script pattern (`src/db/seed.ts`), upsert semantics verified; deploy.sh seed gap identified |
| TQC-03 | i18n `sanguo` namespace (VI/EN/ZH-CN); content in DB per-locale columns; UI strings in i18next | Namespace registration points quoted (i18n/index.ts:28, check-i18n.ts:13); locale file layout (6 ns × 3 locales); check-i18n `football` gap found; eslint i18next rule verified |
| TQC-04 | Emoji registry generator from `emojis.json` (1056 emoji) → `src/assets/sanguoEmojis.ts` + `heroEmoji()` + startup `applicationId === CLIENT_ID` check; no sibling-repo runtime read | emojis.json structure + applicationId verified; 132/132 hero↔emoji key 1:1 coverage verified; CLIENT_ID points (config.ts, registerCommands.ts, shard.ts main(), testSetup.ts, .env) all located; NO existing ESLint emoji rule (gap) |
| TQC-05 | Economy budget document: expected Linh thạch/hour below tu vi caps, convertibility decisions, net-sink/neutral — design-gate before content | All comparison numbers verified: DAILY_CAP 10_000 (game.ts:14), GATHER_FEES 12 tiers, farming prices, football MIN/MAX bet, VWAP bands spec-only (marketplace stubbed) — see TQC-05 section |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Balance mutation (deduct/credit + ledger) | API / Backend (service layer) | Database / Storage | Wallet service is an in-process TS service over `users.balance`; ledger row written in the same DB transaction (D-01/D-02) — no HTTP/UI tier involved |
| Content storage (hero/zone/item per-locale names) | Database / Storage | — | D-05 per-locale columns on content tables; read by commands, written by seed |
| UI string localization (`sanguo` namespace) | API / Backend (i18next in-process) | — | i18next singleton per shard process; `getT(locale)` bound in command handlers; zero-hardcoded-string enforcement via eslint-plugin-i18next |
| Emoji rendering (`heroEmoji()`) | Browser / Client (Discord embed output surface) | API / Backend (generated registry + startup check) | Emoji strings are rendered by the Discord client; the bot's embed builder must call `heroEmoji()` only (D-15); the registry is a generated source file; the appId check lives in the shard startup path |
| Schema migrations + seed | Database / Storage | CI / deploy pipeline | `drizzle-kit migrate` at deploy (deploy.sh:23); seed must be added to deploy pipeline (D-12) — currently absent |
| `/sanguo map` command | API / Backend (interaction handler) | Discord client | Standard slash command via commandLoader autodiscovery + interactionCreate dispatch |
| Economy budget document | — (design artifact) | — | `docs/economy-budget.md` (D-17); authored in phase, consumed by Phase 12 monitoring |

## Standard Stack

> **Version note:** package.json (read this session) differs from AGENTS.md/STACK.md for several pinned packages. The **actual installed versions** below are authoritative for this phase — do not "upgrade" to the STACK.md figures. TypeScript is already 6.0.3 in this repo (AGENTS.md's "hold at 5.8.x" was superseded); this phase does not change it.

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| discord.js | 14.27.0 [VERIFIED: package.json:37] | Gateway + REST + embed building for `/sanguo map` | Existing platform dependency; embed/command patterns verified in repo |
| drizzle-orm | 0.45.2 [VERIFIED: package.json:40] | 9 new tables (8 sanguo + wallet_transactions), upserts, `FOR UPDATE SKIP LOCKED` | Existing ORM; upsert + transaction patterns verified in seed.ts/gather.ts/football services |
| drizzle-kit | 0.31.10 [VERIFIED: package.json:56] | `generate`/`migrate` for the new schemas | Existing migration tooling; next migration = 0014 |
| pg | 8.23.0 [VERIFIED: package.json:45] | Postgres driver (Pool max 5 via PgBouncer) | Existing driver under drizzle |
| i18next | 26.3.6 [VERIFIED: package.json:42] | `sanguo` namespace (7th) for all UI strings | Existing i18n engine; namespace init verified (i18n/index.ts:28) |
| i18next-fs-backend | 2.6.7 [VERIFIED: package.json:43] | Load `locales/{lng}/{ns}.json` | Existing backend |
| zod | 4.4.3 [VERIFIED: package.json:49] | `src/config.ts` env validation (CLIENT_ID check source) | Existing; no schema changes needed for config |
| vitest | 4.1.10 [VERIFIED: package.json:66] | Wallet + seed + check tests | Existing test runner; mock patterns verified (subscriptionService.test.ts) |
| tsx | 4.23.12 [VERIFIED: package.json:63] | Run `scripts/seed-sanguo.ts`, `scripts/gen-sanguo-emojis.ts`, `scripts/check-i18n.ts` | Existing runner for TS scripts |
| eslint + eslint-plugin-i18next | 10.8.1 / 6.1.5 [VERIFIED: package.json:57-58] | Zero-hardcoded-string enforcement + (to be added) emoji-ID rule | Existing config at eslint.config.mjs |

### Supporting
| Library | Version (installed) | Purpose | When to Use |
|---------|---------------------|---------|-------------|
| @types/node | 22.19.17 | node:fs / node:path for generator + seed scripts | Generator/seed dev |
| ioredis | 6.0.0 | NOT needed this phase (no sanguo cron/cooldown in Phase 8) | Phase 9+ (travel cooldowns) |
| pg-boss | 12.27.0 | NOT used in Phase 8 — "pg-boss jobs only in bot.ts / manager"; sanguoTick is Phase 9 | Phase 9 (TQC-07) |
| fastify | 5.11.3 | NOT used in Phase 8 | Payment webhook (later) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-repo wallet service | prisma/client abstraction | Wallet is a thin service over existing drizzle `db.transaction` — a new ORM would rewrite every call site (D-02 locked the API shape) |
| Committed generated `sanguoEmojis.ts` | Runtime generation from a copied emojis.json | D-13 locked build-time generation + commit; runtime read of sibling repo is explicitly forbidden (TQC-04) |
| Translation-table / JSONB content names | Per-locale columns (`name_vi/en/zh`) | D-05 locked 3 columns; simpler queries, indexable, matches TQC-03 wording |

**Installation:** No new packages are required by this phase. If the team wants a custom ESLint rule for emoji-ID blocking (D-15 enforcement gap), it is a ~30-line addition to `eslint.config.mjs` using `@eslint/plugin-kit`-style helpers or a plain `createRule` from `typescript-eslint` (already a dependency) — no new package needed.

**Version verification:** All versions above were read from `E:\Saeth\tutien-bot\package.json` this session (lines cited). No registry lookups were required because no new package is being introduced.

## Package Legitimacy Audit

> **No new external packages are introduced by TQC-01…TQC-05.** Every workstream builds on dependencies already installed and verified in the repo. The package-legitimacy gate therefore has nothing new to vet; the table below records the existing packages the phase *uses* for traceability.

| Package | Registry | Ecosystem | Verdict | Disposition |
|---------|----------|-----------|---------|-------------|
| drizzle-orm 0.45.2 | npm (installed) | Node | OK — existing dep, in use since Phase 1 | Approved (no action) |
| drizzle-kit 0.31.10 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| pg 8.23.0 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| i18next 26.3.6 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| i18next-fs-backend 2.6.7 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| discord.js 14.27.0 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| vitest 4.1.10 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| tsx 4.23.12 | npm (installed) | Node | OK — existing dep | Approved (no action) |
| eslint-plugin-i18next 6.1.5 | npm (installed) | Node | OK — existing dep | Approved (no action) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none — no new packages enter the dependency graph this phase. If the planner later adds a package (e.g., a CSV/JSON helper for the seed), it must be vetted via `gsd-tools query package-legitimacy check` before inclusion.

*No packages were discovered via WebSearch or training data — every package above was confirmed by reading `package.json` and `node_modules` presence this session.*

## Per-Workstream Findings & Integration Points

> All `[VERIFIED]` citations below were read in full this session; the verbatim quotes are from the cited files. A grep alone was never relied on for a value claim.

### TQC-01 — Wallet Service (`services/wallet.ts`) & Balance History

**Complete inventory of `users.balance` WRITE sites (must all be refactored through the wallet — D-03):**

| # | File:lines | Operation | Pattern today | Refactor shape |
|---|-----------|-----------|---------------|----------------|
| 1 | `src/commands/game/gather.ts:158-166` | Deduct gather fee (atomic with item grant) | `UPDATE users SET balance = balance - X WHERE discord_id = $1 AND balance >= X`, `rowCount === 0` → throw `'INSUFFICIENT_BALANCE'`; catch at 183-199 re-uses pre-fetched `userBalance` for the error message | Replace the inline update with `wallet.deductBalance(tx, user.id, totalFee, { reason: 'gather', metadata: { amount, feePerRoll, majorRealmIndex } })` inside the SAME `db.transaction` (lines 155-182) so item grant + ledger + deduct stay atomic. Note `gather.ts` matches on `users.discordId` while farming/football match on `users.id` — wallet should take the numeric `users.id` (callers already have it via `char.discordId` → fetch, or `user.id`) |
| 2 | `src/services/farming/subscriptionService.ts:76-87` | Deduct purchase price (`purchasePlan`) | `UPDATE users SET balance = balance - price WHERE id = $1 AND balance >= price` + `.returning({id})`, empty → throw `'INSUFFICIENT_BALANCE'`; inside `db.transaction` with Redis lock (`lock:purchase:${userId}`, lines 39-43) and `FOR UPDATE` idempotency check (62-73) | Replace with `wallet.deductBalance(tx, userId, price, { reason: 'farming_subscription', metadata: { planType, durationDays } })`. Prices: 7D basic = `10000n`, 30D basic = `35000n`, 30D VIP = `50000n` [VERIFIED: subscriptionService.ts:50-56] |
| 3 | `src/services/farming/subscriptionService.ts:150-161` | Deduct upgrade fee (`upgradePlan`) | Same WHERE-guard + returning pattern; fee = `BigInt(daysLeft * 1000)` from `calculateUpgradeFee` (lines 19-32) | `wallet.deductBalance(tx, userId, fee, { reason: 'farming_upgrade', metadata: { planType: 'premium' } })` |
| 4 | `src/services/football/predictionService.ts:163-178` | Wager deduct + edit-refund in ONE UPDATE (`balanceDiff = oldWagerAmount - wagerAmount`) | `UPDATE users SET balance = balance + balanceDiff WHERE id = $1 AND balance + balanceDiff >= 0` + `.returning()`; preceding `SELECT ... FOR UPDATE` on user row (115-119); `InsufficientBalanceError` thrown (176-178) | **The tricky call site.** `placeBet(db, ...)` receives `db` as a parameter (line 49) — callers pass the shared client (`src/components/predictions/predictModal.ts:71-78`). The edit case writes TWO ledger rows conceptually (refund of old wager + new wager). Recommended: call `wallet.creditBalance(tx, userId, oldWagerAmount, { reason: 'bet_refund', ... })` then `wallet.deductBalance(tx, userId, wagerAmount, { reason: 'bet_wager', ... })` inside the existing transaction — or a single net row with `metadata.edit = true`. Agent's discretion, but the ledger MUST remain reconcilable per SC1 |
| 5 | `src/services/football/matchLifecycleService.ts:357-360` | Void-refund credit | `UPDATE users SET balance = balance + wagerAmount WHERE id = $1` (no guard — credit can't go negative); inside `resolveMatchBets(match, txDb = db)` transaction with `for('update', { skipLocked: true })` (line 345) | `wallet.creditBalance(tx, bet.userId, bet.wagerAmount, { reason: 'bet_void', metadata: { betId, matchId } })` |
| 6 | `src/services/football/matchLifecycleService.ts:417-420` | Push-refund credit | Same as #5 | `wallet.creditBalance(tx, bet.userId, bet.wagerAmount, { reason: 'bet_push', ... })` |
| 7 | `src/services/football/matchLifecycleService.ts:433-436` | Winning payout credit | `UPDATE users SET balance = balance + payout WHERE id = $1` (payout = `bet.potentialPayout` from BIGINT-safe `calculatePayout`) | `wallet.creditBalance(tx, bet.userId, payout, { reason: 'bet_payout', metadata: { betId, matchId } })` |

**Not balance writes (do NOT touch):**
- `src/commands/game/language.ts:97-100` — updates `users.locale` only. [VERIFIED: language.ts:96-100]
- `src/commands/game/start.ts:75-79` — inserts `users` row with only `discordId`; **no starting balance** (column default `sql`0``). New users start at 0 linh thạch; the only *planned* faucet is the Phase 10 starter hero (TQC-12) per D-19.
- `src/commands/game/farming.ts` (lines 202/293/326/359/391) — reads `users.balance` for display only; writes happen inside `subscriptionService`.

**Ledger schema (`wallet_transactions`) — core columns locked by D-01:** userId, type, amount, balance_after, reason, metadata, created_at. Discretion: exact column types + indexes. Recommendations grounded in in-repo conventions:
- `type` as `varchar` (matches `footballBets.status` varchar style [VERIFIED: footballBets.ts:21]) or a `pgEnum` (`pgEnum` pattern exists at farming.ts:6-8); values like `'deduct' | 'credit'`.
- `amount` + `balance_after` as `bigint({ mode: 'bigint' })` — mandatory (users.ts:10 comment: *"CRITICAL: mode: 'bigint' returns JS BigInt — never use mode: 'number' for currency"*).
- `metadata` as `jsonb` with `.$type<Record<string, unknown>>()` (farming.ts:33 pattern).
- `reason` as `varchar(50)` — first-class column (queried by future `/profile` history + Phase 12 audit TQC-19).
- FK `references(() => users.id)` (footballBets.ts:10-12 pattern) + index on `(user_id, created_at desc)` for history queries.
- DB-level guard on the wallet is already provided by `users` `balance_non_negative` check [VERIFIED: users.ts:15].

**Atomicity contract:** D-02 says wallet accepts `tx` so ledger + balance write share the caller's transaction. `db.transaction` typing: `db` from `src/db/client.ts:21` is `drizzle({ client: pool, schema })`; the tx parameter type can be derived as `Parameters<typeof db.transaction>[0]` or the `PgTransaction` type from `drizzle-orm/pg-core`. Note `predictionService.ts` uses loose `db: any` — the new wallet should be properly typed so future flows (Phase 9–11) get compile-time safety.

**Behavior preservation requirements:** (1) insufficient-balance MUST roll back the transaction and surface the same errors the call sites catch today (`'INSUFFICIENT_BALANCE'` string in gather/farming, `InsufficientBalanceError` class in football); (2) `gather.ts` and `subscriptionService` messages embed the *pre-deduct* balance for "current" display — the refactor must keep supplying that value (fetch before deduct or return `balanceAfter` from the wallet).

### TQC-02 — 8 Sanguo Schemas + Migration + Idempotent Seed

**Schema layout (verified):** one file per domain under `src/db/schema/`, all re-exported from `src/db/schema/index.ts` via `export * from './X.js';` [VERIFIED: index.ts:1-25]. `drizzle.config.ts` points `schema: './src/db/schema/index.ts'`, `out: './migrations'` [VERIFIED: drizzle.config.ts:9-10]. New files: `heroes.ts`, `user_heroes.ts`, `map_nodes.ts`, `player_travel_state.ts`, `sanguo_battles.ts`, `sanguo_items.ts`, `user_sanguo_items.ts`, `encounter_runs.ts` (+ `walletTransactions.ts` from TQC-01), each added to `index.ts` under a `// Phase 8 schemas` comment.

**Migration tooling (verified):** journal version 7, 14 migrations (`0000_…`–`0013_…`), snapshots present. Next generated migration is `0014_*` via `npx drizzle-kit generate` (package.json script `migrate` = `drizzle-kit migrate`). **CRITICAL (from drizzle.config.ts:4-6):** migrations require `DATABASE_URL_DIRECT` (port 5432, bypasses PgBouncer); runtime uses `DATABASE_URL` (port 6432). Same split is used by the seed script pattern.

**Seed pattern to mirror — `src/db/seed.ts` (verified, 570 lines):**
- Standalone script run via `npx tsx src/db/seed.ts` (NOT in package.json scripts — runner is tsx directly).
- Connection: `DATABASE_URL_DIRECT ?? DATABASE_URL`, `new Pool({ connectionString, max: 2 })`, `drizzle({ client: pool, schema })`, `pool.end()` in `.finally()` [VERIFIED: seed.ts:24-31, 565-570].
- Idempotency: `onConflictDoUpdate` with simple target + `targetWhere` (seed.ts:459-470, partial unique index `is_unique = false`) and delete-then-reinsert for child rows (seed.ts:510-525).
- D-11 upsert-full semantics confirmed by drizzle docs: composite target array `target: [colA, colB]` + optional `targetWhere` for partial indexes [CITED: drizzle-orm-docs upsert.mdx; matches in-repo gather.ts:177-180].

**D-12 seed location decision:** CONTEXT says `scripts/seed-sanguo.ts`; the existing precedent is `src/db/seed.ts`. Either is executable via tsx; `scripts/` is what D-12 locked — recommend `scripts/seed-sanguo.ts` importing schema from `src/db/schema/index.js`, and adding a `"seed:sanguo": "tsx scripts/seed-sanguo.ts"` script to package.json. **Deploy integration gap:** `scripts/deploy.sh` runs `drizzle-kit migrate` but has NO seed step [VERIFIED: deploy.sh:21-23] — D-12 "run in CI/deploy pipeline" requires adding the seed invocation after migrate (and it must be idempotent-safe, which D-11 guarantees).

**Per-locale columns (D-05):** `name_vi varchar`, `name_en varchar`, `name_zh varchar` on content tables. The ZH column starts empty/partial in the first seed run and gets filled by a re-run after Tavily research (D-06 + D-11 upsert semantics make this safe).

**Content source (verified this session, dev-time only):** `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` — 132 heroes, each `{ id (snake_case), name (VI), en, title, faction (VI), weapon, detail (EN), gender, people, role }`. Distinct values for enum design: 10 factions (Hoàng tộc, Thập Thường Thị, Triều đình, Đảng nhân, Tướng triều, Khăn Vàng, Lương Châu, Quần hùng, Châu mục, Ngoại tộc), 5 roles (`royal|eunuch|military|civil|religious`), 2 genders, 10 peoples. All 132 have non-empty `name` + `en` [VERIFIED via node count this session].

**`user_heroes` IV note (TQC-02 → Phase 10 TQC-12):** schema must carry 6 IV stats (0–31). Recommendation from game design note: IVs roll at capture (Phase 10); Phase 8 defines the columns (e.g., `iv_hp, iv_atk, iv_def, iv_spd, iv_crit, iv_luck smallint` with a `check` 0–31) so Phase 10 only writes values.

**`map_nodes` minimal-but-complete (D-10):** schema supports `id, code (natural key), name_vi/en/zh, zone, coordinates/order`; seed ships 5–10 placeholder nodes. Exact set is agent's discretion.

### TQC-03 — i18n `sanguo` Namespace & Content/UI Split

**Registration points (D-08, both verified):**
- `src/i18n/index.ts:28` — verbatim: `ns: ['common', 'game', 'combat', 'marketplace', 'admin', 'football'],` → append `'sanguo'` (7th namespace). i18next init also has `fallbackLng: 'vi'`, `supportedLngs: ['vi','en','zh-cn']`, `preload` all 3, `lowerCaseLng: true` (zh-cn, NOT zh-CN) [VERIFIED: i18n/index.ts:24-28].
- `scripts/check-i18n.ts:13` — verbatim: `const NAMESPACES = ['common', 'game', 'combat', 'marketplace', 'admin'];` → append `'sanguo'`. **Pre-existing gap:** `football` is missing from this list despite being a registered namespace with locale files — recommend adding `'football'` in the same change (one-line fix, makes the lint actually cover all 6 existing + 1 new namespaces). The check compares VI (reference) keys against EN/ZH-CN and exits non-zero on missing keys [VERIFIED: check-i18n.ts:31-62].
- New locale files: `locales/vi/sanguo.json`, `locales/en/sanguo.json`, `locales/zh-cn/sanguo.json` (directory layout verified: `locales/{lng}/{ns}.json`, 6 namespaces × 3 locales today).

**Zero-hardcoded-strings enforcement (verified):** `eslint.config.mjs:23-92` promotes `i18next/no-literal-string` to `'error'` with a `callees.exclude` + `words.exclude` allowlist; test files disable it (lines 97-102); `scripts/**` is ignored (line 109) — so the *generator/seed scripts* are exempt, but ALL `src/**/*.ts` command/event/service code is enforced. `npm run lint` = `eslint src --max-warnings=0`; lint-staged pre-commit runs eslint on `src/**/*.ts` [VERIFIED: package.json:11, 18-22; .husky/pre-commit].

**Content/UI split (D-07) implementation note:** the existing `items` table stores `nameI18nKey` (i18n key, e.g., `game:items.raw.linh_thao_so_khai` [VERIFIED: seed.ts:430]) — the OLD pattern. The NEW sanguo pattern is per-locale DB columns (D-05). The map embed and all future sanguo UI must read `name_vi/en/zh` from DB, NOT build i18n keys. The `/sanguo map` embed title/labels/errors come from `sanguo:...` keys per UI-SPEC.

**UI-SPEC keys (approved contract, implemented via `sanguo` namespace):** `sanguo:cmd.map.description`, `sanguo:map.title`, `sanguo:map.current_position`, `sanguo:map.zones`, `sanguo:map.nodes`, `sanguo:map.empty`, `sanguo:map.empty_hint`, `sanguo:map.error`; reuse `common:errors.notRegistered` for the not-registered error [CITED: 08-UI-SPEC.md:96-110 — phase artifact].

### TQC-04 — Emoji Registry Generator, `heroEmoji()`, Startup AppId Check

**Source asset (verified this session):** `E:\Saeth\sanguo_assets\assets\emojis.json` — top-level `{ applicationId: "1381818375633899562", applicationName: "Sux Vật Tư Bản", uploadedAt: "2026-08-10T02:48:50.591Z", total: 1056, failed: 0, emojis: { "<hero_id>_t0": "<emojiId>", ... } }`. Key shape: `<hero_id>_t0` … `<hero_id>_t3`, plus `_star` variants (`<hero_id>_t0_star` …). **Coverage verified by node count this session: 1056 keys = 132 distinct hero prefixes × 8 (4 tiers × 2 star/normal); 0 hero ids missing an emoji prefix; 0 emoji prefixes unknown to heroes; 528 star variants.** This 1:1 correspondence means `heroEmoji(heroId, tier)` can safely key off `hero_id` alone.

**Generator (D-13):** `scripts/gen-sanguo-emojis.ts` — dev/build-time only. Reads the sibling JSON (absolute or env-var path), emits `src/assets/sanguoEmojis.ts` (committed). Emitted shape recommendation: `export const SANSUO_EMOJIS = { "<hero_id>_t0": "1536202064185524378", ... } as const;` + `export const SANSUO_EMOJI_APPLICATION_ID = '1381818375633899562' as const;`. Add to `src/assets/index.ts` barrel (current barrel: `export * from './emojis.js';` [VERIFIED: src/assets/index.ts:1]). Runtime must NEVER touch the sibling repo — the committed file is the only runtime source (D-13).

**`heroEmoji()` (D-15):** sole render point. Signature (discretion): `heroEmoji(heroId: string, tier: 0|1|2|3 = 0, star = false): string` — returns the full `<:name:id>` string or falls back to tier-default `t0` on missing key (UI-SPEC: never empty string, never raw ID literal). The generated file + helper live where UI-SPEC says: `src/assets/sanguoEmojis.ts` + helper either in the same file or `src/ui/` — recommendation: keep helper next to the registry (`src/assets/sanguoEmojis.ts` exports both) so the ESLint rule can target one module.

**ESLint enforcement GAP (important):** D-15 says "ESLint rule blocks direct emoji-ID embedding… mirroring the Phase 1 `EMOJI` registry pattern" — but **no such rule exists today**. `eslint.config.mjs` has only TS-recommended + i18next rules [VERIFIED: eslint.config.mjs:4-9, 11-94]. The Phase 1 "pattern" is a doc comment + typed const (`src/assets/emojis.ts:1-9`: *"ALL custom Discord emoji strings must be declared here. Never hardcode emoji IDs in command/event files"*). Options for the planner:
1. Add a custom rule in `eslint.config.mjs` (e.g., ban string literals matching `^\d{17,20}$`-containing emoji markup `<a?:\w+:\d+>` outside `src/assets/sanguoEmojis.ts` / `heroEmoji` module) — ~30-40 lines, `typescript-eslint` `createRule` is already available.
2. Accept convention-only enforcement + code review.
Given D-15 wording ("blocks"), option 1 is the faithful implementation; the emoji-ID literal pattern is also already partially blocked by the i18next rule's word excludes (a bare `1536202064185524378` matches nothing and would trigger `no-literal-string`, but `<:name:id>` markup inside a template string would pass the i18next exclusions — so the i18next rule is NOT sufficient).

**Startup check (D-14/D-16):** `src/shard.ts` `main()` sequence [VERIFIED: shard.ts:26-67]: `initI18n()` (29) → `initPgBossForShard()` (35) → `loadCommands` (39) → `loadEvents` (42) → `client.login(config.DISCORD_TOKEN)` (66). Insert the check in `main()` BEFORE line 66 (recommended: immediately after imports/module scope or as the first statement of `main()`), comparing `SANSUO_EMOJI_APPLICATION_ID` vs `config.CLIENT_ID`; mismatch → `logger.error` + `process.exit(1)`. `config.CLIENT_ID` is a validated zod string [VERIFIED: config.ts:7]. `registerCommands()` in bot.ts also uses `config.CLIENT_ID` for `PUT /applications/{id}/commands` [VERIFIED: registerCommands.ts:34] — the same contract protects both.

**CLIENT_ID state (verified):** `.env` currently has `CLIENT_ID=your_application_client_id` — **the D-16 contract is not satisfied yet**. `.env` is gitignored; the code-side change is `.env.example` documentation + a local `.env` update (or the team's real CLIENT_ID may differ — then `emojis.json` must be regenerated for the correct app per D-16). `testSetup.ts:3` sets `CLIENT_ID = '1234567890'` for vitest — so any test importing the generated registry will fail the equality check unless the check is extracted into a pure, testable function (e.g., `assertEmojiApplicationId(registryAppId, clientId)` returning boolean / throwing), with tests passing explicit args. Recommend the check live in a small pure module (e.g., `src/assets/sanguoEmojis.ts` or `src/utils/`) so `shard.ts` calls it and vitest tests it without env coupling.

**`/sanguo map` command (SC3):** new folder `src/commands/sanguo/map.ts` — commandLoader auto-discovers `src/commands/**/` subfolders and loads files exporting `data` + `execute` [VERIFIED: commandLoader.ts:18-53]; interactionCreate dispatches by `interaction.commandName` → `client.commands.get(...)` [VERIFIED: interactionCreate.ts:450-458]. Two registration options (agent's discretion):
- **(a) Top-level `sanguo` command with `addSubcommand('map')`** — forward-compatible with TQC-13's `/sanguo heroes` in Phase 10; one file, one `data` export named `sanguo`; `execute` branches on `interaction.options.getSubcommand()`. **Recommended** — matches UI-SPEC "no subcommands in Phase 8" only in the sense that only one subcommand is shipped.
- (b) Flat `sanguo-map` name — simpler but `/sanguo heroes` later cannot join the same top-level command.
Embed: `buildSanguoMapEmbed` following `buildProfileEmbed` conventions (data object + bound `t`, `COLORS.SEASON` 0x8B5CF6 [VERIFIED: theme.ts:40], footer via `embedFooter(shardId)`, `\u200b` separator [VERIFIED: buildProfileEmbed.ts:72], emoji-prefixed field names), exported via `src/ui/index.ts` barrel [VERIFIED: ui/index.ts:1-3]. Errors via existing `buildErrorEmbed` (COLORS.DANGER) [VERIFIED: buildErrorEmbed.ts:10-16]. Non-ephemeral reply per UI-SPEC; no message components in Phase 8.

### TQC-05 — Economy Budget Document (`docs/economy-budget.md`)

**All comparison numbers verified this session (feed into D-20):**

| Number | Value | Source (verified) | Status |
|--------|-------|-------------------|--------|
| Daily tu vi cap | `DAILY_CAP: 10_000` — *"Hard daily ceiling, resets at midnight UTC"* | `src/constants/game.ts:14` [VERIFIED] | **In code** |
| Tu vi rates (for cap-context) | `MESSAGE_TV: 10`, `VOICE_TV_PER_MIN: 5`, `REACTION_TV: 2`, `VOICE_MAX_MINUTES: 60` | `src/constants/game.ts:11-15` [VERIFIED] | In code |
| Streak bonus (bypasses cap, tu vi only) | 200/600/1,200/2,000/3,000 by tier | `src/constants/game.ts:50-56` [VERIFIED] | In code (tu vi, NOT linh thạch) |
| Instant-buy band | `1.2 × market_price` | REQUIREMENTS.md MKT-02 [CITED] | **Spec only — marketplace NOT implemented** (`src/jobs/vwapRecalc.ts:11` is a TODO stub [VERIFIED]) |
| Instant-sell band | `0.7 × market_price` | REQUIREMENTS.md MKT-03 [CITED] | Spec only |
| Limit-sell cap | `2.5 × market_price` | REQUIREMENTS.md MKT-04 [CITED] | Spec only |
| Marketplace fee | 10% seller, min 1, all burn | REQUIREMENTS.md MKT-07 [CITED] | Spec only — future sink |
| Gather fee per roll (12 realm tiers) | `200n → 400_000n` (LK 200, TC 400, KD 800, NA 1,500, HT 3,000, LH 6,000, VĐ 12,000, ĐT 25,000, BT 50,000, ĐTi 100,000, CT 200,000, ĐLT 400,000) | `src/constants/gatherFees.ts:17-30` [VERIFIED] | **Live sink** |
| Farming subscription prices | 7D basic `10000n`; 30D basic `35000n`; 30D VIP `50000n`; upgrade `BigInt(daysLeft * 1000)` | `src/services/farming/subscriptionService.ts:50-56, 19-32` [VERIFIED] | **Live sink** |
| Football wager bounds | `MIN_BET: 100n`, `MAX_BET: 1_000_000n` | `src/constants/footballConfig.ts:8-11` [VERIFIED] | **Live sink/source** (wager = sink, payout = source; BIGINT-safe `calculatePayout` at oddsCalculator.ts:24-27) |
| Gather EV invariant | 99.8%+ net loss at all fee tiers (D-04) | `src/constants/gatherFees.ts:10` comment [VERIFIED] | Design intent |
| New-user starting balance | **0** (no faucet) | `src/commands/game/start.ts:75-79` [VERIFIED] | Fact for the doc |

**Economy-model observations the doc must record (from verified code):**
- The **current live economy has nearly zero sources**: the only balance *credits* in the codebase are football winnings/refunds (matchLifecycleService lines 357-436). Gather is a pure sink (gacha), farming subscriptions are pure sinks, and there is no marketplace yet. The TQC-05 doc must therefore frame the sanguo sub-game's net-sink/neutral constraint (D-19) against a system whose only existing source is football (bookmaker-margin → roughly neutral in expectation, but variance is a player-visible source).
- Tu vi cap relevance (D-20 framing): the sub-game economy is denominated in **linh thạch** (users.balance), while tu vi caps (10,000/day) bound the *main* game's progression, not currency. The budget doc must present expected linh thạch/hour of the optimal sanguo loop **and** state the relationship to the tu vi cap explicitly (they are different resource pools; SC5's "below tu vi caps" comparison is a design-sanity check, not a currency cap).
- The VWAP band values and marketplace fee are **spec-only** until Phase 3/Phase 12 land — the doc should label them "planned (MKT-02/03/04/07), not yet live" to avoid Phase 12 auditing against nonexistent numbers.
- `docs/` directory does not exist yet [VERIFIED: Test-Path false] — the doc task must create it.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────────────┐
                        │            Deploy pipeline (deploy.sh)          │
                        │  npm ci → build → drizzle-kit migrate (0014+)  │
                        │        → [NEW] npx tsx scripts/seed-sanguo.ts  │
                        └───────────────┬────────────────────────────────┘
                                        │ DATABASE_URL_DIRECT (5432, no PgBouncer)
                                        ▼
┌─────────────────────────────────────┐        ┌──────────────────────────────┐
│  PostgreSQL                          │        │  Redis (not used in Ph 8)   │
│  • users.balance (bigint, check ≥0)  │◀───────│                              │
│  • wallet_transactions (NEW ledger)  │        └──────────────────────────────┘
│  • 8 sanguo tables (heroes,          │
│    map_nodes, sanguo_items, …)       │
│  • existing tables (items, bets…)    │
└──────────────▲──────────────┬────────┘
               │ DATABASE_URL (6432 PgBouncer) │
        ┌──────┴───────────────────────────────┴──────────┐
        │  ShardingManager (bot.ts) — manager process       │
        │  preflight → registerCommands(CLIENT_ID) →        │
        │  initPgBoss → spawn shards                        │
        └───────────────────────┬───────────────────────────┘
                                │ spawns N shard processes
        ┌───────────────────────▼───────────────────────────┐
        │  Shard process (shard.ts main())                    │
        │  1. [NEW] assertEmojiApplicationId(                 │
        │       SANSUO_EMOJI_APPLICATION_ID, config.CLIENT_ID)│ ← hard fail D-14
        │  2. initI18n()  (sanguo ns preloaded)               │
        │  3. initPgBossForShard()                            │
        │  4. loadCommands (src/commands/sanguo/map.ts)       │
        │  5. client.login()                                  │
        │                                                      │
        │  interactionCreate → command.execute:               │
        │   /sanguo map → buildSanguoMapEmbed(t, data)        │
        │     data.names ← DB per-locale columns (D-07)       │
        │     emoji ← heroEmoji(heroId, tier) (D-15)          │
        └───────────────────────────────┬─────────────────────┘
                                        │
        ┌───────────────────────────────▼─────────────────────┐
        │  Wallet service (services/wallet.ts) — all flows     │
        │  gather / farming / football / future sanguo         │
        │  deductBalance(tx,userId,amt,{reason,metadata})      │
        │  creditBalance(tx,userId,amt,{reason,metadata})      │
        │  → UPDATE users.balance ± amt  (WHERE guard on −)    │
        │  → INSERT wallet_transactions row  (same tx)         │
        └─────────────────────────────────────────────────────┘

        Dev-time only (never runtime):
        E:\Saeth\sanguo_assets\assets\emojis.json   → gen-sanguo-emojis.ts → src/assets/sanguoEmojis.ts (committed)
        E:\Saeth\sanguo_assets\src\data\heroes-v1.json → seed-sanguo.ts   → heroes table (name_vi/en/zh)
        Tavily web search (D-06)                     → ZH-CN names → seed re-run (upsert)
```

### Recommended Project Structure (deltas for this phase)

```
src/
├── services/
│   └── wallet.ts                  # NEW — deductBalance/creditBalance + ledger write (TQC-01)
├── db/schema/
│   ├── walletTransactions.ts      # NEW — ledger table (TQC-01)
│   ├── heroes.ts                  # NEW — hero catalog, name_vi/en/zh, faction/role (TQC-02)
│   ├── userHeroes.ts              # NEW — IV 6 stats (TQC-02, consumed Phase 10)
│   ├── mapNodes.ts                # NEW — node schema, name_vi/en/zh, zone, order (TQC-02)
│   ├── playerTravelState.ts       # NEW (TQC-02, consumed Phase 9)
│   ├── sanguoBattles.ts           # NEW (TQC-02, consumed Phase 10)
│   ├── sanguoItems.ts             # NEW — item catalog, name_vi/en/zh (TQC-02)
│   ├── userSanguoItems.ts         # NEW (TQC-02, consumed Phase 11)
│   ├── encounterRuns.ts           # NEW (TQC-02, consumed Phase 9)
│   └── index.ts                   # EDIT — export * from each new file
├── assets/
│   ├── sanguoEmojis.ts            # NEW — GENERATED, committed (TQC-04)
│   └── index.ts                   # EDIT — barrel
├── i18n/index.ts                  # EDIT — ns array + 'sanguo'
├── commands/sanguo/
│   └── map.ts                     # NEW — /sanguo map (SC3)
├── ui/embeds/
│   └── buildSanguoMapEmbed.ts     # NEW — embed builder (SC3)
├── ui/index.ts                    # EDIT — barrel export
├── commands/game/gather.ts        # EDIT — wallet refactor (TQC-01)
├── services/farming/subscriptionService.ts   # EDIT — wallet refactor (TQC-01)
├── services/football/predictionService.ts    # EDIT — wallet refactor (TQC-01)
├── services/football/matchLifecycleService.ts# EDIT — wallet refactor (TQC-01)
└── shard.ts                       # EDIT — appId startup check (D-14)
scripts/
├── seed-sanguo.ts                 # NEW — idempotent content seed (TQC-02)
├── gen-sanguo-emojis.ts           # NEW — build-time emoji generator (TQC-04)
└── check-i18n.ts                  # EDIT — NAMESPACES + 'sanguo' (+ fix 'football')
locales/{vi,en,zh-cn}/sanguo.json  # NEW — UI strings (TQC-03)
docs/
└── economy-budget.md              # NEW — design-gate doc (TQC-05)
deploy.sh                          # EDIT — add seed step after migrate (D-12)
package.json                       # EDIT — "seed:sanguo" script (+ "gen:emojis" optional)
```

### Pattern 1: WHERE-Guard Atomic Balance Mutation (existing → wallet)
**What:** `UPDATE users SET balance = balance - X WHERE id = $1 AND balance >= X` — the atomic anti-double-spend guard; zero rows returned = insufficient balance → rollback.
**When to use:** Every deduction path (gather.ts:158-166, subscriptionService.ts:76-87/150-161, predictionService.ts:163-178). Credits add without guard (matchLifecycleService.ts:357-360, 417-420, 433-436).
**Example (refactor target — the wallet replaces this inline block):**
```typescript
// Source: src/commands/game/gather.ts:158-166 (verbatim — current pattern to replace)
const deductResult = await tx
  .update(users)
  .set({ balance: sql`${users.balance} - ${totalFee}` })
  .where(
    and(
      eq(users.discordId, char.discordId),
      sql`${users.balance} >= ${totalFee}`, // race condition guard
    ),
  );
if ((deductResult.rowCount ?? 0) === 0) {
  throw new Error('INSUFFICIENT_BALANCE');
}
```

### Pattern 2: Idempotent Upsert Seed (existing → `scripts/seed-sanguo.ts`)
**What:** `INSERT ... ON CONFLICT DO UPDATE` keyed on a natural key; re-runs update changed content without duplicating rows.
**When to use:** All content seeding (D-11); re-run after Tavily ZH research fills `name_zh`.
**Example:**
```typescript
// Source: src/db/seed.ts:456-471 (verbatim — existing pattern; composite target per gather.ts:177-180)
const [row] = await db
  .insert(schema.items)
  .values(itemDef)
  .onConflictDoUpdate({
    target: schema.items.nameI18nKey,
    targetWhere: sql`is_unique = false`,
    set: { type: itemDef.type, tier: itemDef.tier, basePrice: itemDef.basePrice, customEmoji: itemDef.customEmoji },
  })
  .returning({ id: schema.items.id });
// Natural key for heroes: hero_id (varchar, unique). For map_nodes: code.
// targetWhere only needed for partial indexes — sanguo tables use plain unique constraints.
```

### Pattern 3: SKIP LOCKED Payout Resolution (existing → wallet credits)
**What:** `SELECT ... FOR UPDATE SKIP LOCKED` inside `db.transaction`, then per-row credit — used by football payouts today, the template for Phase 9's `sanguoTick` (TQC-07).
**When to use:** Any batch-credit job that must not block on concurrent rows.
**Example:**
```typescript
// Source: src/services/football/matchLifecycleService.ts:336-345 (verbatim)
const pendingBets = await tx
  .select()
  .from(footballBets)
  .where(and(eq(footballBets.fixtureId, match.id), eq(footballBets.status, 'pending')))
  .for('update', { skipLocked: true });
```

### Pattern 4: Typed Emoji Registry + Startup Contract (new — mirrors emojis.ts)
**What:** A typed const registry is the only place emoji IDs live; a startup check ties the registry's applicationId to `config.CLIENT_ID`.
**When to use:** TQC-04; `heroEmoji()` is the only consumer-facing accessor.
**Example (recommended shape for `src/assets/sanguoEmojis.ts` — generator emits this):**
```typescript
// Generated by scripts/gen-sanguo-emojis.ts from emojis.json — DO NOT EDIT BY HAND.
export const SANSUO_EMOJI_APPLICATION_ID = '1381818375633899562' as const;
export const SANSUO_EMOJIS = {
  abt_t0: '1536202064185524378',
  abt_t0_star: '1536202066702245969',
  // … 1056 entries …
} as const;
export type SanguoEmojiKey = keyof typeof SANSUO_EMOJIS;
export type SanguoTier = 0 | 1 | 2 | 3;
export function heroEmoji(heroId: string, tier: SanguoTier = 0, star = false): string {
  const key = `${heroId}_t${tier}${star ? '_star' : ''}` as SanguoEmojiKey;
  const id = SANSUO_EMOJIS[key] ?? SANSUO_EMOJIS[`${heroId}_t0` as SanguoEmojiKey]; // fallback to t0 — never empty
  return id ?? ''; // callers render via discord.js; registry guarantees a value
}
export function assertEmojiApplicationId(registryAppId: string, clientId: string): boolean {
  return registryAppId === clientId;
}
```
*(Values shown are verbatim from emojis.json lines 8-15 this session; the exact export shape is the agent's discretion — D-13 only locks generation + commit.)*

### Anti-Patterns to Avoid
- **Direct `users.balance` write anywhere** — D-03's invariant is structural. Add a code-review checklist item AND (optionally) a grep-based CI check (`grep -r "users.balance" src | filter to wallet.ts`) since there is no ESLint rule today.
- **Editing the generated `sanguoEmojis.ts` by hand** — it's a build artifact (D-13); edits vanish on regeneration. Regenerate from the sibling repo instead.
- **Adding `sanguo` to only one of the two i18n registration points** — D-08 requires both; check-i18n exits non-zero in CI.
- **Seeding ZH names from agent memory** — D-06 mandates Tavily research; invented names are user-facing content errors. Seed structure must allow partial ZH + re-run (upsert full handles this).
- **New table without `mode: 'bigint'` on money columns** — users.ts:7-10 documents the BigInt rule; the ledger's amount/balance_after MUST follow it.
- **`/sanguo map` reading the sibling repo at runtime** — forbidden by TQC-04/D-13; the committed registry is the only runtime source.
- **Registering `/sanguo map` from shard processes** — command registration is manager-only (bot.ts:56-59 comment); shards only load for dispatch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic balance mutation + guard | Custom SQL scattered per flow | `services/wallet.ts` with WHERE-guard + rowCount (D-02/D-03) | The anti-double-spend guarantee must be one choke point; 7 verified write sites today, more in Phase 9–11 |
| Ledger/audit trail for money flows | Separate audit service / event bus | `wallet_transactions` row in the same DB transaction (D-01) | ACID guarantees ledger == balance; an external bus would break on crash between the two writes |
| i18n key coverage | Hand-checking locale files | `npm run check-i18n` (scripts/check-i18n.ts) | Existing tool exits non-zero on missing keys; extends to `sanguo` via NAMESPACES (D-08) |
| Hardcoded user-facing strings | Trusting convention | `i18next/no-literal-string: 'error'` in eslint.config.mjs | Already enforced repo-wide with an allowlist; zero-hardcoded-string is SC4 |
| Emoji-ID embedding discipline | Review-by-memory | Typed `SANSUO_EMOJIS` + `heroEmoji()` + (to-add) ESLint rule | The registry makes misuse visible; a rule makes it impossible |
| Emoji/app identity integrity | Relying on correct env values | Startup `applicationId === CLIENT_ID` hard fail (D-14) | .env is gitignored and was verified to hold a placeholder — only a boot-time check catches it |
| Content seeding idempotency | Truncate-and-reinsert | `ON CONFLICT DO UPDATE` upsert (D-11) | Re-runnable in CI; updates ZH names after Tavily research without duplicating rows |
| Migration safety through PgBouncer | Running `drizzle-kit migrate` on DATABASE_URL | `DATABASE_URL_DIRECT` (drizzle.config.ts:4-6, deploy.sh:23) | Advisory locks break under PgBouncer transaction mode — documented in-repo |

**Key insight:** This phase is *entirely* about consolidating patterns that already exist in the codebase. Every "don't hand-roll" above maps to an existing, verified implementation (seed.ts, subscriptionService, football services, i18n tooling) — the risk is not missing technology, it's the refactor silently changing behavior (error types, balance display, rollback semantics) at 7 call sites.

## Runtime State Inventory

> This phase contains a **refactor** (TQC-01 wallet extraction over live money flows) — runtime state audit required. No renames of user-visible strings occur; the wallet refactor is code-level.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.balance` values in PostgreSQL across all shards (currency state). No renaming occurs — column name stays `balance`; the wallet only centralizes the UPDATE. `wallet_transactions` is a NEW table (additive). | **Code edit only — NO data migration.** Ledger starts empty; existing balances are preserved untouched. Do NOT backfill ledger rows for past transactions (D-01 writes ledger from day one going forward; backfill is unnecessary and would invent reasons for historical flows) |
| Live service config | `.env` (gitignored, local) holds `CLIENT_ID=your_application_client_id` [VERIFIED this session] — the D-16 contract is unsatisfied. Also `registerCommands` (bot.ts startup) PUTs commands using this value, so the bot cannot correctly register `/sanguo map` (or any commands) until it is a real application ID. | **Manual .env update** (or regenerate `emojis.json` for the real app per D-16). Code change: document in `.env.example`. Tests use `testSetup.ts` mock — unaffected |
| OS-registered state | None — pm2 process name `tutien-bot` (deploy.sh:26), no rename in this phase. No Windows Task Scheduler / systemd units reference phase-8 strings. | None — verified by inspection (deploy.sh read this session) |
| Secrets / env vars | `CLIENT_ID` value changes (see above). `DATABASE_URL_DIRECT` required by migrate + seed (drizzle.config.ts, seed.ts:24). No secret keys are renamed by this phase. | `.env` CLIENT_ID update; no key renames |
| Build artifacts | `dist/` is a build output of `src/` (tsc + tsc-alias, package.json:8). New files (wallet.ts, sanguo schemas, sanguoEmojis.ts, map command, embeds) compile in automatically. `scripts/` files are NOT compiled into dist (tsx runs them directly). `src/assets/sanguoEmojis.ts` must be committed BEFORE `npm run build` so dist/assets/sanguoEmojis.js exists at runtime. | Regenerate + rebuild after generating the emoji file; commit the generated source. `dist/` refreshes via `npm run build` |

**Canonical question answered:** After every file is updated, the only runtime system still holding "old" state is the local `.env` (CLIENT_ID placeholder) — everything else is code/build-level and self-heals on rebuild/restart.

## Common Pitfalls

### Pitfall 1: Wallet refactor silently changes error semantics
**What goes wrong:** Callers catch `'INSUFFICIENT_BALANCE'` (gather.ts:184, subscriptionService) or `InsufficientBalanceError` (predictionService.ts:176) to render localized embeds; a wallet that throws a different error shape breaks every UI path and rolls back flows that previously succeeded.
**Why it happens:** The 7 write sites use three different guard patterns (rowCount vs returning-length vs class-based errors) and two different user identifiers (`discordId` vs `id`).
**How to avoid:** Preserve each caller's contract: wallet throws the same error types; accepts the same identifier type used per call site (or standardize on numeric `users.id` and adapt gather which currently matches `discordId`). Keep the `gather.ts:201` `remainingBalance` display working (it computes from the pre-fetch).
**Warning signs:** Tests for `subscriptionService.test.ts` / `predictionService.test.ts` fail with changed messages; gather multi-embed shows wrong remaining balance.

### Pitfall 2: `.env` CLIENT_ID still a placeholder → boot hard-fail (D-14) or command registration failure
**What goes wrong:** With `CLIENT_ID=your_application_client_id`, the new startup check exits fatally; even without the check, `registerCommands` PUT fails or registers to the wrong app.
**Why it happens:** `.env` is gitignored; nothing in the repo enforces the D-16 contract today.
**How to avoid:** Make the check's contract explicit in `.env.example`; add the `.env` update as an explicit plan task; extract the check into a pure function so vitest can test it with mock IDs (testSetup CLIENT_ID `1234567890`).
**Warning signs:** Bot won't boot after this phase lands; `registerCommands` errors at deploy.

### Pitfall 3: `heroEmoji()` fallback returns empty / raw ID → broken embeds
**What goes wrong:** A missing key yields `''` or a literal `<:name:id>` string; the map embed renders blank emoji or exposes internal IDs (SC3 fails).
**Why it happens:** Key-shape drift between `emojis.json` and `heroes-v1.json` ids (currently 0 drift — verified), or callers bypassing `heroEmoji()` (no ESLint rule exists today).
**How to avoid:** `heroEmoji` falls back to `t0` per UI-SPEC; add the ESLint emoji-ID rule (see TQC-04 gap); regenerate when assets change.
**Warning signs:** Map embed shows empty emoji slots; grep finds `<:\w+:\d+>` outside the generated file.

### Pitfall 4: check-i18n NAMESPACES diverges from i18n/index.ts ns
**What goes wrong:** `sanguo` added to one but not the other → either runtime "namespace not loaded" or CI lint silently skips it (exactly the current `football` situation — registered but un-linted).
**Why it happens:** Two independent lists; D-08 names both but nothing forces sync.
**How to avoid:** Update both in the same task/commit; also add `'football'` to repair the pre-existing gap.
**Warning signs:** `npm run check-i18n` passes while `sanguo` keys are missing from EN/ZH-CN; runtime warns "key not found".

### Pitfall 5: Seed run against PgBouncer connection
**What goes wrong:** `seed-sanguo.ts` connects to `DATABASE_URL` (6432, PgBouncer) → long transactions / advisory-lock issues; drizzle-kit migrate already documents this (drizzle.config.ts:4-6).
**Why it happens:** Copying the runtime client import (`src/db/client.ts`) into the seed instead of the standalone Pool pattern.
**How to avoid:** Follow seed.ts:24-31 exactly: `DATABASE_URL_DIRECT ?? DATABASE_URL`, standalone `Pool({ max: 2 })`, `pool.end()` in finally.
**Warning signs:** Seed hangs or "transaction is aborted" errors in CI.

### Pitfall 6: Migration + seed ordering at deploy
**What goes wrong:** Seed runs before migrate (tables missing) or migrate runs on the wrong URL; deploy.sh currently has no seed step at all.
**Why it happens:** deploy.sh:23 migrates; D-12 adds seeding but the script is untouched today.
**How to avoid:** Insert `DATABASE_URL="$DATABASE_URL_DIRECT" npx tsx scripts/seed-sanguo.ts` AFTER the migrate line; keep it idempotent (D-11) so every deploy re-runs safely.
**Warning signs:** Fresh deploy boots with empty `heroes` → SC2 fails; `/sanguo map` shows the empty state.

## Code Examples

### Wallet service skeleton (TQC-01 — recommended shape consistent with D-02 and in-repo patterns)
```typescript
// src/services/wallet.ts (NEW) — the ONE place users.balance changes (D-03)
import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '../db/schema/users.js';
import { walletTransactions } from '../db/schema/walletTransactions.js';
import * as schema from '../db/schema/index.js';

export type WalletTx = PgTransaction<typeof schema, 'basic'>; // shape of db.transaction(tx => …)
export class InsufficientBalanceError extends Error { … } // or reuse string contract per caller

export async function deductBalance(
  tx: WalletTx,
  userId: number,
  amount: bigint,
  opts: { reason: string; metadata?: Record<string, unknown> },
): Promise<{ balanceAfter: bigint }> {
  if (amount < 0n) throw new Error('NEGATIVE_AMOUNT');
  const rows = await tx
    .update(users)
    .set({ balance: sql`${users.balance} - ${amount}` })
    .where(and(eq(users.id, userId), sql`${users.balance} >= ${amount}`))
    .returning({ balance: users.balance });
  if (rows.length === 0) throw new InsufficientBalanceError(); // caller maps to its contract
  const balanceAfter = rows[0]!.balance;
  await tx.insert(walletTransactions).values({
    userId, type: 'deduct', amount, balanceAfter, reason: opts.reason,
    metadata: opts.metadata ?? {}, createdAt: new Date(),
  });
  return { balanceAfter };
}
// creditBalance is symmetric WITHOUT the WHERE guard (credits cannot go negative), type: 'credit'.
```
*Pattern sources: gather.ts:158-166 (guard), subscriptionService.ts:76-87 (returning), footballBets.ts:9-24 (table conventions), farming.ts:33 (jsonb $type). Composite-target upsert semantics per [CITED: drizzle-orm-docs upsert.mdx].*

### `heroEmoji()` + startup check usage (TQC-04)
```typescript
// src/shard.ts — inside main(), BEFORE client.login() (line 66)
import { SANSUO_EMOJI_APPLICATION_ID, assertEmojiApplicationId } from './assets/sanguoEmojis.js';
if (!assertEmojiApplicationId(SANSUO_EMOJI_APPLICATION_ID, config.CLIENT_ID)) {
  logger.error('Shard', `Emoji registry applicationId ${SANSUO_EMOJI_APPLICATION_ID} ≠ CLIENT_ID ${config.CLIENT_ID}. Refusing to boot (D-14).`);
  process.exit(1);
}
```
*Verified insertion point: shard.ts main() sequence lines 26-66 [VERIFIED: shard.ts:26-67].*

### `/sanguo map` embed skeleton (SC3)
```typescript
// src/ui/embeds/buildSanguoMapEmbed.ts (NEW) — follows buildProfileEmbed(data, t) convention
import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';

export interface SanguoMapEmbedData {
  currentZoneName: string;          // from map_nodes.name_vi/en/zh (D-07) — never from i18next
  zones: { label: string; heroId: string }[]; // heroId only; emoji via heroEmoji()
  nodes: string[];                  // node names from DB per-locale columns
  shardId?: number;
}
export function buildSanguoMapEmbed(data: SanguoMapEmbedData, t: TFunction): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)                      // theme.ts:40 — never hardcode hex (UI-SPEC)
    .setTitle(t('sanguo:map.title'))
    .addFields(
      { name: t('sanguo:map.current_position'), value: data.currentZoneName, inline: true },
      { name: t('sanguo:map.zones'), value: data.zones.map(z => `${heroEmoji(z.heroId)} ${z.label}`).join('\n') || t('sanguo:map.empty'), inline: false },
      { name: t('sanguo:map.nodes'), value: data.nodes.join('\n') || t('sanguo:map.empty_hint'), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
  return embed;
}
```
*Conventions verified: buildProfileEmbed.ts:41-84 (data + t signature, COLORS, embedFooter, \u200b separator), buildErrorEmbed.ts:10-16 (error path), theme.ts:40 (SEASON 0x8B5CF6), UI-SPEC copy keys.*

### Seed upsert for heroes (TQC-02 — D-11 full upsert on natural key)
```typescript
// scripts/seed-sanguo.ts (NEW) — pattern from src/db/seed.ts:456-471
for (const hero of HEROES) { // HEROES loaded from heroes-v1.json (dev-time)
  await db.insert(schema.heroes).values({
    heroId: hero.id,               // natural key — unique constraint
    nameVi: hero.name,             // heroes-v1.json "name"
    nameEn: hero.en,               // heroes-v1.json "en"
    nameZh: hero.zh ?? null,       // Tavily-researched (D-06); null until research done
    faction: hero.faction, role: hero.role, weapon: hero.weapon, gender: hero.gender,
  }).onConflictDoUpdate({
    target: schema.heroes.heroId,
    set: { nameVi: hero.name, nameEn: hero.en, nameZh: hero.zh ?? null,
           faction: hero.faction, role: hero.role, weapon: hero.weapon, gender: hero.gender },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Balance mutations inline per flow (gather/farming/football) | Shared `services/wallet.ts` + `wallet_transactions` ledger (D-01/D-03) | Phase 8 | Single anti-double-spend choke point; audit trail for Phase 12 (TQC-19) |
| Content names as i18n keys (`items.nameI18nKey`, seed.ts:430) | Per-locale DB columns `name_vi/en/zh` (D-05) | Phase 8 (sanguo only) | Content queries become locale-parameterized; the old pattern stays for legacy items |
| Emoji strings hand-maintained in typed const (`src/assets/emojis.ts`) | Generated `sanguoEmojis.ts` + `heroEmoji()` + appId check (D-13/D-14/D-15) | Phase 8 | 1056 emoji stay in sync with the asset repo without manual copying |
| 6 i18n namespaces | 7th `sanguo` namespace + fixed `football` lint gap | Phase 8 | Full CI coverage of all user-facing strings |

**Deprecated/outdated:**
- **`items.nameI18nKey` content pattern**: still used by legacy gather/craft content — do NOT migrate it in Phase 8 (out of scope), but do NOT copy it into new sanguo tables (D-05/D-07).
- **STACK.md "TypeScript 5.8.x" guidance**: superseded — repo is on TypeScript 6.0.3 [VERIFIED: package.json:64]; no TS work in this phase.
- **STACK.md discord.js 14.26.2 / ioredis 5.10.1 / zod 4.3.6**: superseded by installed 14.27.0 / 6.0.0 / 4.4.3 — no changes planned; versions are locked in package.json.

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research. Planner/discuss-phase confirmation needed before locking.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | VWAP bands (1.2×/0.7×/2.5×) and 10% marketplace fee, absent from code, will eventually be implemented per REQUIREMENTS.md MKT-02/03/04/07 — the economy doc cites them as "planned" | TQC-05 | If marketplace values change before Phase 3/12, the budget doc's convertibility section becomes stale — mitigable by citing REQUIREMENTS.md explicitly |
| A2 | The discord.js application that owns the 1056 emojis (`1381818375633899562`) is the intended production bot app; local `.env` simply hasn't been set yet | TQC-04 | If the real bot app differs, `emojis.json` must be regenerated for the correct app (D-16 allows this) — boot check makes the mismatch visible, not silent |
| A3 | A custom ESLint rule for emoji-ID blocking can be implemented with `typescript-eslint`'s `createRule` (already a dependency) without a new package | TQC-04 | If rule authoring is deemed too costly, D-15 degrades to convention-only — planner should confirm enforcement level with the user |
| A4 | `/sanguo map` should register as top-level command `sanguo` with one `map` subcommand (option a) to stay forward-compatible with `/sanguo heroes` in Phase 10 | TQC-04 | Flat name (option b) would need a rename/registration change in Phase 10 — minor, but better decided now |
| A5 | Wallet ledger needs no backfill of historical transactions | Runtime State Inventory | If the user later wants full history from day one, backfill becomes a data migration — low risk, recorded as an open question |
| A6 | `scripts/` (vs `src/db/`) is the correct home for `seed-sanguo.ts` per D-12, despite the existing precedent at `src/db/seed.ts` | TQC-02 | Cosmetic; either location executes via tsx — keep D-12's stated path |
| A7 | Tavily MCP (available in this environment) is the research tool used for ZH-CN hero names during the phase | TQC-03 | If Tavily is unavailable to the executor, D-06's mandate stalls the content step — plan a fallback (documented manual research) |
| A8 | Node v26.3.0 locally (vs .nvmrc 22) is compatible with all pinned packages | Environment | If a package misbehaves on 26, `nvm use 22` per deploy.sh:10 resolves it — no code impact |

## Open Questions (RESOLVED)

All five open questions are resolved during planning and mapped to plan tasks below. Q1–Q4 were resolved by the plan set; Q5 is resolved by the wave-0 dev-DB environment task (plan 08-04 Task 1), which is a blocking prerequisite for migration 0014 and the seed.

1. **Is `1381818375633899562` the bot's real production CLIENT_ID?** (D-16) — **RESOLVED (plan 08-01, Task 1 + user_setup)**
   - What we know: emojis.json applicationId = `1381818375633899562`; local `.env` CLIENT_ID = placeholder `your_application_client_id`.
   - What's unclear: whether the production bot application is the same as the emoji-owning app.
   - Recommendation: update `.env` to the emoji app's ID (per D-16's stated contract) OR regenerate emojis.json for the correct app. The startup check (D-14) will catch a wrong choice at boot — decide before Phase 9 depends on emoji rendering.
   - Resolution: plan 08-01 Task 1 updates `.env` CLIENT_ID to `1381818375633899562` after the user confirms the production app in user_setup; the D-14 startup hard-fail makes any divergence visible at boot, never silent.

2. **How is `/sanguo` structured — top-level with subcommands vs flat names?** (SC3) — **RESOLVED (plan 08-01, Task 3)**
   - What we know: UI-SPEC ships only `/sanguo map`; TQC-13 (Phase 10) needs `/sanguo heroes` and `/sanguo map`.
   - What's unclear: none technically — subcommand structure (option a) is forward-compatible and recommended (A4).
   - Recommendation: top-level `sanguo` command + `map` subcommand in `src/commands/sanguo/map.ts`.
   - Resolution: implemented as option (a) — top-level `sanguo` + `map` subcommand (plan 08-01 Task 3), forward-compatible with `/sanguo heroes` in Phase 10.

3. **Wallet error contract — string errors or error classes?** — **RESOLVED (plan 08-02, Task 1 + Task 2)**
   - What we know: gather/farming throw `new Error('INSUFFICIENT_BALANCE')`; football throws `InsufficientBalanceError`.
   - What's unclear: whether the wallet should standardize (recommended: keep a single exported `InsufficientBalanceError` class AND preserve message compatibility, since call sites check `err.message`).
   - Recommendation: wallet throws a class with `message === 'INSUFFICIENT_BALANCE'` so both existing call patterns keep working; new flows use the class.
   - Resolution: wallet throws `Error` with `message === 'INSUFFICIENT_BALANCE'` (plan 08-02 Task 1) — message compatibility keeps gather/farming call sites working; predictionService preserves its `InsufficientBalanceError` class by catching and rethrowing the wallet error (plan 08-02 Task 2).

4. **Historical ledger backfill?** — **RESOLVED (plan 08-02, Task 1)**
   - What we know: ledger starts empty at Phase 8 (A5); `/profile` history UI is deferred (D-04).
   - Recommendation: no backfill — record it as a conscious decision in the plan; revisit when the history UI ships.
   - Resolution: no backfill — recorded as a conscious decision in plan 08-02; ledger starts empty at Phase 8 per D-04/A5.

5. **Does the real deployment run Postgres/Redis via Docker, and where is docker-compose.yml?** — **RESOLVED (plan 08-04, Task 1)**
   - What we know: no docker-compose.yml in the repo; local probes show 5432/6432/6379 closed this session; deploy.sh targets an existing server environment (`source /etc/tutien/.env`, pm2).
   - What's unclear: how the developer boots local DB/Redis for migration + seed + boot smoke tests.
   - Recommendation: plan task = "start local Postgres+Redis" (or document the external dev DB); migration/seed smoke tests are impossible without one.
   - Resolution: plan 08-04 Task 1 (wave-0, blocking) provisions or verifies a reachable dev PostgreSQL — creates docker-compose.yml (postgres 16 + redis 7 with pg_isready healthcheck) when Docker is available, or accepts a local PostgreSQL install / external dev DB as documented alternatives; the node pg probe (`SELECT 1` against DATABASE_URL_DIRECT) is the blocking `<verify>` before migration 0014 + seed. See also the Missing dependencies note below.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All workstreams | ✅ | v26.3.0 (local); .nvmrc pins 22 for deploy | `nvm use 22` (deploy.sh:10) |
| npm | Build/scripts | ✅ | 11.16.0 | — |
| PostgreSQL (5432) | `drizzle-kit migrate`, `seed-sanguo.ts`, wallet refactor tests | ❌ not running locally | — | Start via external dev DB or Docker (no compose file in repo — see OQ5) |
| PgBouncer (6432) | Runtime `DATABASE_URL` | ❌ not running locally | — | Same as above |
| Redis (6379) | Not needed in Phase 8 (no sanguo cron/cooldown yet) | ❌ not running locally | — | Not required this phase |
| Sibling asset repo `E:\Saeth\sanguo_assets` | `gen-sanguo-emojis.ts`, `seed-sanguo.ts` (dev-time only) | ✅ | heroes-v1.json (132), emojis.json (1056) | Committed `sanguoEmojis.ts` after first generation — runtime never needs it |
| Tavily (MCP) | ZH-CN name research (D-06) | ✅ (MCP tools available in this environment) | — | Manual research fallback (A7) |
| `gsd-tools` seam | package-legitimacy / research-store | ✅ at `C:\Users\901107\.config\opencode\gsd-core\bin\gsd-tools.cjs` | — | — |
| vitest | All new tests | ✅ | 4.1.10 | — |
| eslint | SC4 lint gate | ✅ | 10.8.1 | — |

**Missing dependencies with no fallback:**
- **PostgreSQL (5432) + PgBouncer (6432)** — blocking for SC2 (bot boots with schemas migrated + seeded) and for any DB-touching verification. The planner MUST include an environment task (start dev DB) or target a reachable dev database before migration/seed steps. **→ RESOLVED: plan 08-04 Task 1 (wave-0, blocking) provisions/verifies a reachable dev PostgreSQL via docker-compose.yml (postgres 16 + redis 7), local install, or external DB — the node pg probe against DATABASE_URL_DIRECT is the gate before migration 0014 + seed (see OQ5 RESOLVED).**

**Missing dependencies with fallback:**
- Redis — not used in Phase 8; nothing blocked.
- Node 26 vs 22 — deploy script pins 22; local 26 is fine for this phase's pure-TS work.

## Validation Architecture

> **Config note:** `.planning/config.json:19` sets `workflow.nyquist_validation: false` — formal per-requirement test mapping is NOT enforced by the workflow. The repo nonetheless has an established vitest suite (19 test files verified under `src/**/__tests__/`), and the success criteria below are best verified with tests + deterministic commands. The planner should treat this section as **recommended verification**, not a workflow gate.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 [VERIFIED: package.json:66] |
| Config file | `vitest.config.ts` — `include: ['src/**/__tests__/**/*.test.ts']`, `setupFiles: ['./src/testSetup.ts']` [VERIFIED: vitest.config.ts:6-7] |
| Quick run command | `npx vitest run src/services/__tests__/wallet.test.ts` (per-file) |
| Full suite command | `npm test` (= `vitest run`) |
| Lint/type gates | `npm run lint` (= `eslint src --max-warnings=0`), `npm run typecheck` (= `tsc --noEmit`), `npm run check-i18n` |

### Success Criteria → Verification Map
| SC | Behavior | Verification | Type |
|----|----------|--------------|------|
| SC1 | No balance drift / no double-spend after wallet refactor | Unit: `src/services/__tests__/wallet.test.ts` — deduct success, insufficient-balance rollback (rowCount 0 → throw), credit, ledger row written with balance_after == updated balance, atomicity (ledger insert + balance update same tx — assert both or neither via mocked tx). Regression: existing `subscriptionService.test.ts`, `predictionService.test.ts` suites keep passing post-refactor (they assert error strings + tx usage). Grep gate: no `users.balance` write outside `wallet.ts` | unit + regression + static check |
| SC2 | 8 sanguo schemas migrated + idempotent seed | Migration: `npx drizzle-kit migrate` against dev DB (DATABASE_URL_DIRECT). Seed: run `npx tsx scripts/seed-sanguo.ts` **twice** → row counts identical (`SELECT count(*) FROM heroes` = 132; `map_nodes` = 5–10). Idempotency: `hero_id` unique + upsert (D-11). Schema sanity: `npx drizzle-kit check` (or `tsc --noEmit` covers Drizzle types) | integration (DB required) + idempotency check |
| SC3 | `/sanguo map` renders heroEmoji() + startup appId check | Unit: `heroEmoji()` fallback-to-t0 behavior; `assertEmojiApplicationId('1381818375633899562', '1381818375633899562') === true`, mismatch === false. Boot smoke: shard boots with matching CLIENT_ID; exits non-zero with mismatched ID (testable via the pure function + a thin shard call). Command: manual/interaction test — invoke `/sanguo map`, embed shows SEASON color + emoji + localized labels | unit + boot smoke (DB required for full boot) |
| SC4 | Zero hardcoded strings; content names from DB per-locale | `npm run check-i18n` (sanguo + football namespaces in sync VI/EN/ZH-CN); `npm run lint` (i18next rule errors on hardcoded strings in src); unit: `buildSanguoMapEmbed` takes names from data object (DB columns), labels via `t()` | lint + i18n lint + unit |
| SC5 | Economy budget doc with verified numbers | Review gate: `docs/economy-budget.md` exists, contains the verified numbers table (DAILY_CAP 10,000; VWAP bands spec-cited; sinks list; net-sink/neutral statement; linh thạch/hour estimate for the optimal loop). No automated test — document review + sign-off (design gate) | manual review (design gate) |

### Wave 0 Gaps (recommended, given nyquist_validation=false — create with the phase)
- [ ] `src/services/__tests__/wallet.test.ts` — covers SC1 (new; follows `subscriptionService.test.ts` mock pattern: `vi.mock('../../../db/client.js')` + chainable mockTx)
- [ ] `src/assets/__tests__/sanguoEmojis.test.ts` — covers SC3 (heroEmoji fallback + assertEmojiApplicationId with explicit args; avoids env coupling via testSetup CLIENT_ID `1234567890`)
- [ ] `src/ui/embeds/__tests__/buildSanguoMapEmbed.test.ts` — covers SC4 (localized labels via mocked t, SEASON color, no raw emoji IDs)
- [ ] No framework install needed — vitest + testSetup already present

## Security Domain

> `security_enforcement` is not set to false in `.planning/config.json` — treat as enabled. This phase touches currency mutation (wallet) and adds content ingestion (seed), so the two relevant ASVS areas are input validation and data integrity around the ledger.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord interactions are authenticated by Discord (interaction tokens); no new auth surface in Phase 8 |
| V3 Session Management | no | No sessions; stateless shard processes |
| V4 Access Control | no | No new admin surfaces; existing adminGuard (utils/adminGuard.ts) unchanged |
| V5 Input Validation | yes | Wager/slash input already validated (`wagerSchema` zod, predictModal.ts:57); wallet validates `amount >= 0` and relies on DB check `balance_non_negative` [VERIFIED: users.ts:15]; seed input is dev-time static JSON, not user input |
| V6 Cryptography | no | No new crypto; `crypto.randomInt` mandate is Phase 10 (battle/capture), not Phase 8 |

### Known Threat Patterns for the Wallet/Seed Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double-spend via concurrent deducts | Tampering | WHERE-guard `balance >= amount` + single tx (wallet); DB check `balance_non_negative` as final backstop [VERIFIED: users.ts:15] |
| Ledger/balance divergence (crash between update and insert) | Tampering | Ledger insert inside the SAME transaction as the balance update (D-01) — atomic commit or full rollback |
| SQL injection via reason/metadata strings | Tampering | Parameterized drizzle inserts (all in-repo queries use bind params — `sql` template with `${}`), metadata as typed jsonb |
| Emoji/app identity spoof | Spoofing | Startup `applicationId === CLIENT_ID` hard fail (D-14) |
| Seed idempotency failure duplicating content | Integrity | `ON CONFLICT DO UPDATE` on natural keys (D-11) — re-runs update, never insert duplicates |
| Content tampering via dev-time sibling repo path | Tampering | Sibling repo is dev-time only; committed `sanguoEmojis.ts` + hero seed are the runtime source (D-13); generator path is a dev script, not runtime code |

## Sources

### Primary (HIGH confidence — verified by reading files this session)
- `src/db/schema/users.ts` (balance bigint + checks), `src/db/schema/footballBets.ts`, `src/db/schema/gather_pool_items.ts`, `src/db/schema/farming.ts` — schema conventions
- `src/commands/game/gather.ts:153-199`, `src/services/farming/subscriptionService.ts:38-181`, `src/services/football/predictionService.ts:47-222`, `src/services/football/matchLifecycleService.ts:333-471` — all 7 balance write sites
- `src/db/seed.ts` (idempotent seed pattern), `src/db/client.ts`, `drizzle.config.ts`, `migrations/meta/_journal.json`
- `src/i18n/index.ts:28`, `scripts/check-i18n.ts:13` — namespace registration + the `football` gap
- `eslint.config.mjs` — i18next enforcement + absence of an emoji rule
- `src/assets/emojis.ts`, `src/assets/index.ts`, `src/shard.ts:26-67`, `src/config.ts:7`, `src/bot.ts`, `src/utils/registerCommands.ts:34`, `src/utils/commandLoader.ts`, `src/events/interactionCreate.ts:450-458`
- `src/constants/game.ts:14` (DAILY_CAP), `src/constants/gatherFees.ts:17-30`, `src/constants/footballConfig.ts:8-11`, `src/services/football/oddsCalculator.ts:24-27`
- `src/ui/theme.ts:33-41`, `src/ui/embeds/buildProfileEmbed.ts`, `src/ui/embeds/buildErrorEmbed.ts`, `src/ui/index.ts`
- `package.json` (all versions), `vitest.config.ts`, `src/testSetup.ts`, `scripts/deploy.sh`, `.env` (CLIENT_ID), `.env.example`, `src/commands/game/start.ts:75-79`, `src/commands/game/language.ts:96-100`
- `E:\Saeth\sanguo_assets\assets\emojis.json` (applicationId, 1056 keys), `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` (132 heroes, name/en/faction/role) — verified via Read + node counts

### Secondary (MEDIUM confidence)
- Context7 (library IDs `/drizzle-team/drizzle-orm-docs`, `/vitest-dev/vitest`, `/i18next/i18next`) — upsert composite target + targetWhere, vi.mock factory patterns, i18next ns config [CITED: github.com/drizzle-team/drizzle-orm-docs upsert.mdx; vitest mock-functions.md; i18next configuration.md]
- `.planning` artifacts (08-CONTEXT.md decisions D-01…D-20, 08-UI-SPEC.md copy contract) — locked decisions and UI keys, treated as authoritative project documents

### Tertiary (LOW confidence)
- None — no WebSearch-only claims were used; the one [ASSUMED] external dependency (VWAP bands as future marketplace values) is drawn from REQUIREMENTS.md MKT-02/03/04, a project document, and is labeled as such

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from package.json this session; no new packages
- Architecture: HIGH — every integration point verified with file:line + verbatim quotes; patterns are existing in-repo implementations
- Pitfalls: HIGH — grounded in verified code states (.env placeholder, missing check-i18n football, missing ESLint emoji rule, stubbed VWAP) rather than speculation

**Research date:** 2026-08-10
**Valid until:** 2026-09-09 (30 days — stable project-internal stack; re-verify package versions if the phase slips beyond that)






