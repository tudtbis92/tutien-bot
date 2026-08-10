# Phase 8: Foundation, Economy Budget & Content Infrastructure - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers the shared foundation for Milestone v3 (Tam Quốc Collection): a wallet service extracted from the 3 existing money flows (gather, farming, football), 8 new `sanguo` schemas + idempotent seed, the `sanguo` i18n namespace, an emoji registry generated from the sibling asset repo, and the economy design-gate document — plus a read-only `/sanguo map` scaffold.

**Requirements in scope:** TQC-01, TQC-02, TQC-03, TQC-04, TQC-05

**Not in scope:** Travel & encounters (Phase 9), battle & capture (Phase 10), progression/shop/legion (Phase 11), anti-abuse & marketplace gating (Phase 12). Map/zone hero distribution research is explicitly Phase 9 (TQC-09).

</domain>

<decisions>
## Implementation Decisions

### Wallet Service & Balance History (TQC-01)

- **D-01:** **Ledger table `wallet_transactions` from day one.** Every `deductBalance` / `creditBalance` call writes one ledger row (userId, type, amount, balance_after, reason, metadata, created_at) in the same DB transaction as the balance update. This satisfies SC1 "no balance drift, no double-spend" and makes history data available for the future `/profile` history UI. — **Reversibility:** reversible — additive migration; existing flows gain auditability without breaking behavior.
- **D-02:** **Wallet manages the transaction.** API shape is `wallet.deductBalance(tx, userId, amount, { reason, metadata })` (and symmetric `creditBalance`), accepting a transaction object so the ledger write and balance update are atomic. The wallet service drives `db.transaction` internally where a flow has no other write needs. — **Reversibility:** costly — API shape touches every call site and future Phase 9–11 money flows.
- **D-03:** **Wallet is the single source of truth for ALL `users.balance` changes.** All existing flows (gather, farming subscription purchase/upgrade, football prediction/matchLifecycle payouts) are refactored through it, and all future flows (travel, shop, boss drops) MUST go through it. No new call site may write `users.balance` directly. — **Reversibility:** one-way — the no-direct-write invariant is the core anti-double-spend guarantee; a direct write anywhere reintroduces drift.
- **D-04:** **Ledger recorded in Phase 8; `/profile` history UI deferred.** The ledger accumulates data from Phase 8, but displaying transaction history in `/profile` is a later phase. SC1 is met via the refactor (no drift, no double-spend, correct balance) — history visualization is not required for SC1. — **Reversibility:** reversible.

### Per-Locale Content Storage (TQC-03)

- **D-05:** **Three separate locale columns on content rows** — `name_vi`, `name_en`, `name_zh` (varchar) on `heroes`, `map_nodes`, `sanguo_items` (and any other content-bearing table). Not JSONB, not a separate translations table. Simple queries, indexable, matches "per-locale columns" in TQC-03. — **Reversibility:** one-way — converting columns ↔ JSONB ↔ translation table later requires a migration and rewrites of every content query.
- **D-06:** **ZH-CN hero/zone/item names sourced via Tavily web research for accuracy** — not agent-guessed, not deferred. VI names come from `heroes-v1.json` `name` field, EN from its `en` field, ZH-CN researched via Tavily (web search) during Phase 8 content work, then filled into the seed data. — **Reversibility:** reversible — names can be corrected in the seed and re-upserted.
- **D-07:** **Strict content-vs-UI boundary: content names = DB columns, UI strings = i18next `sanguo` namespace.** Hero/zone/item names (and any DB content) live in per-locale DB columns. Command descriptions, embed labels, errors, flavor text live in the i18next `sanguo` namespace. No lore/title exception — DB content stays in DB. — **Reversibility:** costly — relaxing the boundary later scatters content across two systems.
- **D-08:** **`sanguo` namespace registered in BOTH `src/i18n/index.ts` `ns` array AND `scripts/check-i18n.ts` `NAMESPACES`.** This ensures the CI i18n lint (`npm run check-i18n`) catches missing VI/EN/ZH-CN keys for the new namespace from day one. — **Reversibility:** reversible.

### Seed Scope & Map Nodes (TQC-02)

- **D-09:** **Seed all 132 heroes from `heroes-v1.json` in Phase 8.** SC2 requires "heroes + map nodes present" at boot; all heroes are the content foundation for every downstream phase. — **Reversibility:** reversible.
- **D-10:** **`map_nodes` schema fully defined, but only a minimal placeholder seed (≈5–10 nodes) in Phase 8.** Full node structure and hero-per-zone distribution is Phase 9 research (TQC-09). The Phase 8 schema must support the eventual structure (id, name_*, zone, coordinates/order), but the seed only ships enough nodes to satisfy SC2 + SC3 map scaffold. — **Reversibility:** reversible — placeholder nodes are replaced by real ones in Phase 9.
- **D-11:** **Upsert full (ON CONFLICT DO UPDATE) for idempotent seed.** Re-running the seed updates changed content (e.g., new ZH names after Tavily research) rather than skipping existing rows. Requires a unique natural key per entity (e.g., hero `hero_id`, node `code`). — **Reversibility:** reversible.
- **D-12:** **One idempotent seed script: `scripts/seed-sanguo.ts`**, covering heroes + map nodes (placeholder) + items in a single re-runnable script. Re-run after Tavily research fills ZH names to update content. Run in CI/deploy pipeline. — **Reversibility:** reversible.

### Emoji Registry & AppId Check (TQC-04)

- **D-13:** **Build-time generation, committed file.** `scripts/gen-sanguo-emojis.ts` reads `emojis.json` from the sibling repo (`E:\Saeth\sanguo_assets\assets\emojis.json`) at build/dev time and emits `src/assets/sanguoEmojis.ts` — a typed map `{hero_tier: emojiId}` (e.g., `abt_t0`, `abt_t1_star`) that is committed to the repo. Runtime NEVER reads the sibling repo. — **Reversibility:** one-way — the committed-generated-file + no-sibling-runtime-read is a hard constraint of TQC-04; switching to runtime generation later breaks the deployment model.
- **D-14:** **Startup check `applicationId === CLIENT_ID` fails hard.** At startup (shard.ts, before `client.login()`), compare the applicationId baked into `sanguoEmojis.ts` against `config.CLIENT_ID`. On mismatch → fatal exit (bot does not boot). Protects emoji rendering integrity per SC3. — **Reversibility:** reversible — relaxing to warn later is trivial.
- **D-15:** **`heroEmoji(heroId, tier)` is the SOLE render point** for sanguo emoji (default tier `t0`, `_star` variant supported). ESLint rule blocks direct emoji-ID embedding in command/event code, mirroring the Phase 1 `EMOJI` registry pattern. — **Reversibility:** reversible.
- **D-16:** **Confirmed: applicationId of the emoji set (`1381818375633899562`) IS the bot's CLIENT_ID.** The `.env` `CLIENT_ID` must equal `1381818375633899562` (or `emojis.json` must be regenerated for the correct app). The hard startup check enforces this contract. — **Reversibility:** one-way — a contract between the asset repo and bot identity; divergence breaks all emoji rendering.

### Economy Budget Document (TQC-05)

- **D-17:** **Standalone ADR-style artifact: `docs/economy-budget.md`.** An approved, independently reviewable design doc (sink/source model, linh thạch/hour of the optimal loop, convertibility matrix, caps vs tu vi), referenced by Phase 12 monitoring/audit. Not embedded in planning docs. — **Reversibility:** reversible.
- **D-18:** **Design-gate closes in Phase 8 with concrete numbers.** Specific sink/source values, expected linh thạch/hour, and caps are decided and written before any content is authored. This blocks faucet → marketplace arbitrage (the "Linh thạch printing press"). — **Reversibility:** one-way — the design gate is the milestone's economic guardrail; later rebalancing would ripple through Phase 9–11 content.
- **D-19:** **Net-sink/neutral is a HARD constraint for the sub-game.** Total linh thạch outflow (travel, items, evolution) ≥ total inflow (boss drops, if any). The free starter hero (TQC-12, Phase 10) is the only faucet exception. Phase 11 must comply; no net-source in v1. — **Reversibility:** one-way — an economic contract enforced across the milestone; allowing net-source later risks global inflation.
- **D-20:** **Phase 8 researcher collects/verifies the comparison numbers** (daily tu vi cap 10,000, VWAP bands 1.2×/0.7×/2.5× market price, existing sinks) from the current codebase and feeds them into `docs/economy-budget.md`. — **Reversibility:** reversible.

### the agent's Discretion

- Exact `wallet_transactions` column set beyond the core (userId, type, amount, balance_after, reason, metadata, created_at) and index design.
- `/sanguo map` read-only scaffold implementation detail (SC3) — command registration, embed layout, which placeholder nodes to show.
- Exact 5–10 placeholder map node set (names/zones/order).
- Exact `sanguoEmojis.ts` key format and `heroEmoji()` signature details.
- Exact upsert conflict target / natural keys per entity in `seed-sanguo.ts`.
- The `sanguo` namespace file organization (single `sanguo.json` per locale vs sub-structure).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/ROADMAP.md` §Phase 8 — Goal, Success Criteria (5), Depends, Requirements mapping, UI hint
- `.planning/REQUIREMENTS.md` §v3 — TQC-01..05 with full acceptance detail
- `.planning/PROJECT.md` — Stack constraints, Key Decisions table, currency/infrastructure context
- `.planning/STATE.md` — Milestone v3 state, pending todos (economy budget numbers, emoji smoke-test)
- `.planning/notes/sanguo-game-design.md` — Tam Quốc Collection game design: core loop, progression, assets, phase scope
- `AGENTS.md` — Technology Stack (Drizzle, ioredis, pg-boss, i18next versions and rationale)

### Existing Code (Integration Points)
- `src/db/schema/users.ts` — `users.balance` BIGINT + `balance_non_negative` check — wallet must preserve this
- `src/commands/game/gather.ts` — Existing deduct pattern (WHERE guard + rowCount) → refactor to wallet
- `src/services/farming/subscriptionService.ts` — Purchase/upgrade deduct pattern → refactor to wallet
- `src/services/football/predictionService.ts` — Wager deduct/refund → refactor to wallet
- `src/services/football/matchLifecycleService.ts` — Payout credits → refactor to wallet
- `src/i18n/index.ts` — `ns` array + `resolveLocale()` — add `sanguo` namespace
- `scripts/check-i18n.ts` — `NAMESPACES` list — add `sanguo`
- `src/assets/emojis.ts` — Phase 1 typed EMOJI registry pattern to mirror
- `src/utils/commandLoader.ts` — command autodiscovery — `/sanguo` commands drop into `src/commands/`
- `src/ui/theme.ts` + `src/ui/embeds/` — embed builder pattern + theme for `/sanguo map` scaffold
- `src/config.ts` — Zod env validation — `CLIENT_ID` used for the appId startup check

### External Content Sources (dev-time only — NEVER at runtime)
- `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` — 132 heroes: id, name (VI), en, title, faction, weapon, detail, gender, people, role
- `E:\Saeth\sanguo_assets\assets\emojis.json` — 1056 emoji mapping `{hero_id}_{t0..t3}[_star]` → emojiId, applicationId `1381818375633899562`
- `E:\Saeth\sanguo_assets\src\data\tiers.json` — 4-tier visual data (potential future expansion, not Phase 8)

### No external specs
No ADRs beyond the milestone design gates captured in `.planning/STATE.md` and this document. `docs/economy-budget.md` (D-17) is created in this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema/users.ts` — balance + check constraint already enforces non-negative; wallet builds on this
- `src/services/farming/subscriptionService.ts` — proven pattern: `db.transaction` + WHERE-guard deduct + `returning()` empty = insufficient balance; the template for `wallet.deductBalance`
- `src/commands/game/gather.ts:153-199` — atomic transaction deduct + rowCount check; refactor target
- `src/assets/emojis.ts` — typed `EMOJI` const registry + ESLint enforcement pattern to mirror for `sanguoEmojis.ts`
- `src/i18n/index.ts` + `scripts/check-i18n.ts` — namespace registration and missing-key detection; `sanguo` slots into both
- `src/utils/commandLoader.ts` — auto-discovers `src/commands/**/*.ts` — `/sanguo map` and future commands drop in place
- `src/ui/embeds/buildProfileEmbed.ts` + `src/ui/theme.ts` — embed builder pattern + theme for `/sanguo map` scaffold

### Established Patterns
- **Balance mutation pattern**: `UPDATE users SET balance = balance ± X WHERE id = $1 AND balance >= X` + rowCount guard — wallet extracts and centralizes this (D-03)
- **pg-boss jobs only in bot.ts / manager** — relevant later (sanguoTick in Phase 9); Phase 8 has no cron
- **Schema per domain**: `src/db/schema/*.ts` one file per domain, merged in `index.ts` — 8 sanguo schemas follow this
- **i18n zero-hardcoded-strings**: eslint-plugin-i18next + CI check — sanguo namespace joins this enforcement
- **Content/UI split**: game content in DB per-locale columns, UI strings in i18next (D-07)

### Integration Points
- `services/wallet.ts` (new) ← replaces direct `users.balance` writes in gather/farming/football
- `src/db/schema/*.ts` (new sanguo files) → merged in `src/db/schema/index.ts`, migrated + seeded at boot
- `src/i18n/index.ts` `ns` + `scripts/check-i18n.ts` `NAMESPACES` ← `sanguo` namespace
- `src/assets/sanguoEmojis.ts` (generated) + `heroEmoji()` ← used by `/sanguo map` and all future sanguo UI
- `shard.ts` ← startup appId check (D-14)
- `src/commands/` ← `/sanguo map` scaffold command

</code_context>

<specifics>
## Specific Ideas

- **Wallet = single choke point**: user emphasized wallet is the ONE place `users.balance` changes — enforcement is structural, not convention.
- **Economy gate before content is non-negotiable**: the milestone's core protection against "Linh thạch printing press" (faucet → marketplace arbitrage). Numbers decided in Phase 8, not later.
- **ZH-CN accuracy matters**: user explicitly chose Tavily web research over agent-guessing for 132 hero names — the content is user-facing and must be correct, not invented.
- **Emoji integrity**: hard fail on `applicationId === CLIENT_ID` mismatch — emoji rendering correctness is treated as boot-critical (SC3).
- **Hidden mechanics philosophy carries over (Phase 2)**: economy budget numbers document design; players see outcomes, not formulas.

</specifics>

<deferred>
## Deferred Ideas

- **`/profile` transaction history UI** — ledger data accumulates from Phase 8 (D-01), but the history visualization belongs in a later phase (wallet/monitoring work).
- **Full map/zone structure + hero-per-zone distribution** — Phase 9 research (TQC-09); Phase 8 only ships placeholder nodes (D-10).
- **Boss server + PvP** — post-v1 per game design note.
- **t3 evolution tiers / `tiers.json` forms (mecha/god/sexy)** — potential future expansion, not Phase 8.

</deferred>

---

*Phase: 08-foundation-economy-budget-content-infrastructure*
*Context gathered: 2026-08-10*
