# Project Research Summary

**Project:** TuTien Bot — Discord RPG (xianxia / tu tiên theme)
**Domain:** Multi-shard Discord RPG bot with global economy and passive activity tracking
**Researched:** 2026-04-11
**Confidence:** HIGH

---

## Executive Summary

TuTien Bot is a multi-shard Discord RPG bot in the xianxia/tu tiên genre, where players accumulate cultivation progress ("tu vi") passively through normal Discord activity — messaging, voice, and reactions. The product occupies a genuinely unique market position: no existing bot combines Vietnamese-first i18n, passive activity-driven progression, a global VWAP-priced marketplace, and hard seasonal resets. The closest competitor (DaoVerse) is English-only, requires active commands, and has no global market. The recommended build approach is discord.js v14 + TypeScript on Node 22 LTS, PostgreSQL (Drizzle ORM) as the single global state store, Redis for hot transient data, and pg-boss for scheduled jobs — no Redis required for queuing, keeping infrastructure lean at launch.

The architecture must be stateless-shard from day one: all game state lives in PostgreSQL (never in shard memory), Redis handles cooldowns and VWAP cache, and the marketplace runs through a dedicated single-threaded worker to prevent order double-fills. The activity event pipeline (messageCreate → cooldown guard → DB write) is the hottest code path and must be designed for fire-and-forget async — synchronous DB writes inside Discord event handlers will block the gateway at scale and cause disconnects. i18n must be wired before any user-facing string is written; retrofitting it later costs 3–5× the original effort and is the most common technical debt trap for multilingual bots.

The top risks are economy inflation (real-money purchases as an uncapped faucet will collapse the market if not constrained), tu vi farming via message spam (in-memory cooldowns are wiped on shard restart — must be DB-backed from day one), and VWAP wash trading (1-hour window is narrow enough that coordinated accounts can manipulate prices). All three require architectural decisions before the first line of feature code. The season reset mechanism is a moderate-complexity edge case — pending orders, in-flight payments, and crafting sessions must be explicitly handled before the reset transaction commits or real-money disputes follow.

---

## Key Findings

### Recommended Stack

discord.js v14 is the clear choice: full Discord API coverage, the largest ecosystem, and maintained TypeScript types. v15 is in unstable preview — avoid. **Node 22 LTS** is the target — discord.js 14.26.2 officially requires Node.js ≥22.12.0 (v20 is now Maintenance LTS, v18 is EOL). **Drizzle ORM** beats Prisma 7 for this project because the hot path (tu vi writes on every message) benefits from minimal ORM overhead, and complex queries like `SELECT FOR UPDATE SKIP LOCKED` (marketplace order claiming) and VWAP aggregation are awkward in Prisma's query API but natural in Drizzle's `sql` template tag. TypeORM is explicitly ruled out — ~600ms cold start, decorator-based schema fragile under strict TypeScript, effectively in maintenance mode.

**pg-boss** replaces BullMQ for scheduled jobs: it reuses the existing PostgreSQL connection and provides ACID guarantees, which means a crashed VWAP recalculation job rolls back cleanly rather than leaving partial state. BullMQ would require Redis and brings Redis-level eventual consistency to job processing. Redis IS still needed — but only as a caching layer (cooldowns, VWAP cache, voice session tracking, guild settings), not as an infrastructure backbone. **PgBouncer** (or equivalent) is mandatory once shards exceed 1 — each shard spawns its own `pg` connection pool, and without connection pooling you hit PostgreSQL's `max_connections` ceiling quickly.

**Core technologies (verified 2026-04-11 via npm registry + Context7 + Tavily):**
- `discord.js@14.26.2`: Discord Gateway + REST — industry standard, v15 vẫn pre-release (không dùng production)
- `@discordjs/rest@2.6.1`: REST-only Discord client — cho Notification Worker (DM, channel posts) không cần gateway
- `Node.js 22 LTS` ("Jod"): Runtime — discord.js 14.26.2 **yêu cầu Node.js ≥22.12.0** (không phải v20!). v20 xuống Maintenance LTS, v18 EOL
- `TypeScript 5.8.4` (không dùng 6.x): Language — TS 6.0 có breaking changes (strict default, no ES5), ecosystem chưa sẵn sàng
- `PostgreSQL 16+`: Primary data store — ACID transactions required for order matching, currency operations, global state
- `drizzle-orm@0.45.2` + `drizzle-kit@0.31.10`: DB client + migrations — `.for('update', { skipLocked: true })` native
- `pg@8.20.0`: PostgreSQL driver — used by Drizzle
- `pg-boss@12.15.0`: Job queue + cron scheduler — PostgreSQL-native, ACID, no Redis dependency for jobs
- `ioredis@5.10.1`: Redis client — cooldowns, VWAP cache, voice sessions. ioredis compatible với cả Redis và Valkey server
- `i18next@26.0.4` + `i18next-fs-backend`: i18n — pluralization, namespaces, per-user locale resolution
- `zod@4.3.6`: Runtime validation — v4 stable, 14× faster than v3, top-level format validators
- `fastify@5.8.4`: HTTP server — payment webhook receiver (isolated service)
- `discord-hybrid-sharding@3.0.1`: Future-proof shard clustering — install now, activate at ~25K guilds

**Version pinning:** Pin exact versions (no `^`). discord.js minor versions can break event types; Drizzle is 0.x semver (breaking changes permitted). Upgrade deliberately.

### Expected Features

**Must have — table stakes (v1 launch blockers):**
- **Character registration** (`/bắt_đầu`) — entry point for all other features; first impression
- **Passive tu vi accumulation** — chat + voice + reaction, with cooldown-bucketed awards; THE core value proposition
- **Anti-farming protection** — DB-backed cooldowns, message content quality gate, daily cap, session minimum; must co-ship with accumulation
- **Cảnh giới progression** (Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh at minimum) — fundamental RPG loop
- **Breakthrough mechanic** (`/đột_phá`) — manual command with failure chance at major realm boundaries; authentic xianxia tension
- **Profile display** (`/profile`) — players need to see their state constantly
- **Linh thạch balance + daily reward** (`/điểm_danh`) — all successful economy bots have daily claims; streak multiplier drives retention
- **Leaderboard** — social competition; without it the game feels single-player
- **Help system** (`/help`) — reduces abandonment and support burden
- **Cooldown notifications** — opt-in DM when accumulation is ready; EPIC RPG spawned a reminder-bot ecosystem by omitting this
- **i18n infrastructure (vi primary)** — must be wired before any user-facing string is written; non-negotiable constraint per PROJECT.md
- **Slash commands interface** — prefix commands are deprecated UX; all interactions via components
- **Onboarding flow** — first-time user experience; first 5 minutes determines retention
- **Season/reset announcement** — 7 days, 24h, 1h warnings before reset; no-warning resets cause mass uninstalls

**Should have — competitive differentiators:**
- **Global cross-server marketplace (VWAP)** — no other Discord bot uses VWAP; genuine differentiator; requires full marketplace engine
- **Dynamic VWAP price discovery** — `base_price` floor + 1h VWAP `market_price`; instant buy at 1.2×, instant sell at 0.7×, order cap at 2.5×
- **Professions with skill trees** (gathering + crafting) — vs. EPIC RPG's flat work commands; branching trees create long-term specialization identity
- **Hard season reset with partial persistence** — analogous to Path of Exile leagues; resets cảnh giới, persists cosmetics/paid currency
- **Vietnamese-first i18n** — underserved market; DaoVerse is English-only; massive competitive advantage
- **Voice activity cultivation** — rare in Discord RPGs; natural fit for gaming/study communities
- **Realm breakthrough failure/bottleneck** — configurable failure chance at major realm transitions; authentic xianxia narrative tension
- **Global character identity** — Discord snowflake = character ID, not guild-scoped; encourages multi-server join

**Defer to v2+:**
- Guild/sect system (môn phái) — significant scope; validate player base first
- Web dashboard/admin panel — slash commands cover 95% of admin needs
- Traditional Chinese (zh-TW) locale — derive from zh-CN after v1
- Multi-player raids/dungeons — coordination features add enormous scope
- Gacha mechanics — regulatory and community toxicity risk
- ELO ranked PvP — matchmaking infrastructure not justified at launch
- Per-guild economy (custom currency) — would kill global marketplace liquidity
- NFT/blockchain cosmetics — reputational risk far outweighs revenue

### Architecture Approach

The architecture is a **stateless-shard event pipeline + centralized workers** pattern. Discord gateway shards are pure event routers — they validate incoming events, apply fast Redis-based cooldown checks, and enqueue to pg-boss job queues. All business logic lives in dedicated worker processes: an Activity Worker handles tu vi calculations and DB writes, a Marketplace Worker (concurrency: 1) handles order matching with ACID transactions, a Scheduler Worker runs VWAP recalculation and season transitions, and a Notification Worker sends async DMs and channel announcements via Discord REST (no gateway connection needed). Slash commands bypass the queue and read directly from PostgreSQL with `deferReply()` called as the first line to claim the 15-minute response window. A standalone HTTP service handles payment webhook callbacks in isolation.

**Major components:**
1. **Cluster Manager** — spawns/supervises shard clusters via `discord-hybrid-sharding` (start with 1 cluster, auto-scale at 25K guilds)
2. **Shard Cluster(s)** — stateless Discord event receivers; apply Redis cooldown guards; enqueue to pg-boss; handle slash command replies directly from DB
3. **Activity Worker** — dequeues activity events; awards tu vi with DB-backed cooldown lock; triggers realm advancement
4. **Marketplace Worker (concurrency: 1)** — ACID order matching via `SELECT FOR UPDATE SKIP LOCKED`; VWAP fee burns; balance ledger
5. **Scheduler Worker** — VWAP hourly cron via pg-boss; season reset state machine; announcement triggers
6. **Notification Worker** — async DMs and channel posts via `@discordjs/rest` (no gateway); handles order fills, realm-ups, season warnings
7. **Payment Webhook Receiver** — isolated Fastify/Express service; idempotency key per payment ref; credits linh thạch ledger
8. **PostgreSQL** — single global DB (never per-shard); all game state; `BIGINT` for all currency (never float)
9. **Redis** — cooldowns (TTL keys), VWAP cache, voice session tracking, guild settings cache

**Key database design decisions:**
- All currency (`linhhthach`) stored as `BIGINT` integers — no floats anywhere
- Realm identifiers are stable integer IDs — display names come from i18n lookup, not DB values
- `guild_settings.active_channels` controls where tu vi is earned (per-server config)
- `seasons.realm_names TEXT[]` — realm display names are season data, not hardcoded

### Critical Pitfalls

1. **Tu vi farming via message spam** — DB-backed cooldowns ONLY (in-memory cooldowns reset on shard restart = free exploit window every deployment). Implement all layers: 60s min cooldown stored in DB, message content quality gate (≥10 chars, no repeating characters, no duplicate-in-5-min), daily hard cap per user, anomaly detection flags. Implement on day one, not as a retrofit.

2. **Economy inflation — faucet stronger than sink** — Real-money linh thạch purchases are an uncapped faucet; without sufficient sinks the market inflates until newcomers can't participate and quit. Design requires: minimum 3 meaningful sinks (marketplace fee burn already planned, PLUS breakthrough ritual cost burn, PLUS crafting component burn, PLUS combat repair burn); faucet/sink tracking dashboard from day one; consider two-tier currency (earned vs. purchased linh thạch with different sink eligibility) to constrain IAP inflation.

3. **VWAP wash trading** — 1-hour VWAP window with few transactions is vulnerable to alt-account price manipulation. Prevention: require minimum N≥5 transactions to update VWAP (fallback to prior VWAP or base_price); outlier rejection (±2σ); velocity limit per account (cannot buy and sell same item in same window); flag transactions between accounts sharing IP in last 7 days for human review.

4. **Cross-shard race conditions / double-spend** — Multiple shards can see a sufficient balance simultaneously. Prevention: use atomic `UPDATE users SET balance = balance - $amount WHERE id = $1 AND balance >= $amount RETURNING balance` — zero rows returned = insufficient balance, no two-step read-then-write. Marketplace order matching uses `SELECT FOR UPDATE SKIP LOCKED`. Add `CHECK (balance >= 0)` DB constraint as a safety net.

5. **Season reset with in-flight real money** — A season reset that cancels orders mid-session or interrupts pending payments creates chargeback disputes and Discord bot suspension risk. Prevention: multi-phase reset (T-7 days: announce + disable new limit orders; T-1 day: cancel + refund all open orders, drain crafting queue, flush payment queue; T-0: atomic snapshot transaction; T+0 to T+24h: freeze gameplay + verify consistency). Paid linh thạch (`linhhthach_transactions` ledger) is NEVER wiped by a season reset.

---

## Implications for Roadmap

Based on the combined research, eight phases are implied by architectural dependencies. The order is non-negotiable in most cases: you cannot build the activity pipeline without infrastructure, cannot build the marketplace without the economy foundation, and cannot build monetization without the economy being stable.

### Phase 1: Infrastructure Foundation
**Rationale:** Everything else depends on this. DB schema (users, characters, guild_settings, seasons), Redis setup with documented key conventions, pg-boss queue scaffold, cluster manager skeleton, i18n scaffold. Zero features, but all the load-bearing walls.
**Delivers:** Runnable bot shell, DB migrations, locale files, queue connections
**Features addressed:** i18n infrastructure (non-negotiable per PROJECT.md)
**Pitfalls avoided:** In-memory state (MIN-1), hardcoded i18n strings (MOD-3), realm name conflicts (MIN-5)
**Research flag:** Standard patterns — skip research phase. Discord.js startup, Drizzle migrations, i18next setup are all well-documented.

### Phase 2: Bot Shell + Guild Registration
**Rationale:** Can't deploy without a working bot. Discord event loop, command loader, health check, `/start` (upsert user + character), guild settings config. Establishes the shard-worker separation pattern that everything downstream follows.
**Delivers:** Deployable bot, `/start` command, guild settings (active channels, language), Redis guild config cache
**Features addressed:** Character registration, onboarding flow (partial), help system (scaffold)
**Pitfalls avoided:** Slash command timeout pattern (MIN-4) established as code convention; shard-local state pattern eliminated

### Phase 3: Activity Tracking + Core Loop
**Rationale:** This IS the product — the passive tu vi accumulation loop. Must ship with full anti-farming from day one (not as a later retrofit). Profile display gives players immediate feedback.
**Delivers:** messageCreate/voiceStateUpdate/messageReactionAdd pipeline → tu vi awards; realm advancement check; `/profile`; DB-backed cooldowns; daily reward (`/điểm_danh`)
**Features addressed:** Passive tu vi accumulation, anti-farming, cảnh giới progression, profile display, daily rewards, cooldown notifications
**Pitfalls avoided:** CRITICAL-1 (tu vi farming) — implement all 5 anti-farming layers here
**Research flag:** May need phase research for voice anti-AFK patterns (2-person requirement, mute/deaf detection) — these are non-standard Discord.js patterns.

### Phase 4: Progression + Professions
**Rationale:** Progression depth hooks players before economy features arrive. Breakthrough mechanic, profession selection, skill trees, gathering, crafting, and inventory. Professions supply items that the marketplace (Phase 5) will trade.
**Delivers:** `/đột_phá` with failure chance, profession selection + skill tree, gathering commands, basic alchemy crafting, inventory management, leaderboard
**Features addressed:** Breakthrough mechanic, professions with skill trees, leaderboard
**Pitfalls avoided:** Newcomer dominance (MOD-4) — early-game exclusive content designed here; invisible progress anti-pattern

### Phase 5: Marketplace Engine
**Rationale:** The global VWAP marketplace is the primary differentiator. Requires professions (supply side) and economy (demand side) already established. Marketplace worker architecture (concurrency: 1) must be implemented exactly as designed.
**Delivers:** Market items catalog, Marketplace Worker (single-threaded), VWAP hourly cron, Redis VWAP cache, limit/instant buy/sell orders, order book view, transaction history
**Features addressed:** Global cross-server marketplace, VWAP price discovery
**Pitfalls avoided:** CRITICAL-3 (wash trading) — minimum transaction count + outlier rejection for VWAP; CRITICAL-4 (double-spend) — `SELECT FOR UPDATE SKIP LOCKED`; Anti-Pattern 2 (multi-worker marketplace) — `concurrency: 1`
**Research flag:** Needs phase research. VWAP outlier rejection algorithm, PostgreSQL advisory lock strategy for order matching, and wash-trading detection heuristics need careful design before implementation.

### Phase 6: Combat System
**Rationale:** PvE completes the item economy loop (loot feeds crafting). PvP provides social engagement. Neither is a launch blocker for the marketplace but both are table stakes per competitive analysis.
**Delivers:** PvE hunting (`/săn_bắt`) with yêu thú encounters, stat-based resolution, loot drops; PvP duel system (opt-in, realm-gated); combat rewards
**Features addressed:** Basic PvE combat, PvP dueling (opt-in, no MMR)
**Pitfalls avoided:** Veteran dominance (MOD-4) — PvP must be realm-gated (±1 realm only); no complex matchmaking

### Phase 7: Season System
**Rationale:** Must be designed and tested before monetization ships. The season reset process touches paid currency (linhhthach_transactions), pending orders, and crafting sessions — all need explicit handling. The announcement system is also required for launch-readiness.
**Delivers:** Season definition table, multi-phase reset state machine (announcement → wind-down → snapshot → verify), carry-over item flags, season archive leaderboard, announcement Notification Worker to all guild announcement channels
**Features addressed:** Hard season reset with partial persistence, season identity/theming, season/reset announcement system
**Pitfalls avoided:** MOD-2 (pending orders at reset), CRITICAL-2 (real money in-flight at reset)
**Research flag:** Needs phase research. The multi-phase reset with real-money payment protection, and the "what persists" design (cosmetics, heirloom linh thạch amount) need careful specification before implementation.

### Phase 8: Monetization
**Rationale:** Last phase because it requires a stable economy to price correctly and a stable season system to handle payment persistence across resets. Discord native monetization SKU path is strongly preferred over custom Stripe integration for compliance and chargeback risk.
**Delivers:** HTTP Payment Webhook Receiver (isolated service), idempotency per payment ref, linhhthach_transactions ledger, `/balance`, `/purchase` flow, Discord SKU entitlement handling
**Features addressed:** Linh thạch purchase, fiat monetization
**Pitfalls avoided:** MOD-5 (payment compliance) — Discord native SKU preferred; chargeback handling; real-money never reset
**Research flag:** Needs phase research. Discord monetization SKU API setup, Stripe webhook idempotency patterns, and jurisdiction-specific compliance requirements need legal/technical review before implementation.

### Phase Ordering Rationale

- **Infrastructure before features** (Ph1 → Ph2): Schema and i18n must be wired before any feature code or debt accumulates immediately.
- **Core loop before economy** (Ph3 → Ph4 → Ph5): Players need a reason to accumulate currency before a marketplace exists to spend it in. Marketplace liquidity requires active players first.
- **Professions before marketplace** (Ph4 → Ph5): Professions are the supply side of the marketplace; listing items requires crafted items to exist.
- **Season system before monetization** (Ph7 → Ph8): Paid linh thạch cannot be in-flight when the season reset process hasn't been designed. Fix the order of operations or you will have real-money disputes.
- **Combat is parallel-capable**: Phase 6 (combat) has no hard dependency on the marketplace engine and could be built in parallel with Phase 5 if team size allows.

### Research Flags

Phases likely needing `/gsd-research-phase` during planning:
- **Phase 5 (Marketplace):** VWAP outlier rejection algorithm, PostgreSQL advisory lock patterns, wash-trading detection heuristics — non-standard, complex intersection of finance and game design
- **Phase 7 (Season System):** Multi-phase reset with real-money protection, "what persists" design — high stakes, limited prior art in Discord bots specifically
- **Phase 8 (Monetization):** Discord SKU API, Stripe webhooks, payment compliance, chargeback handling — legal and API-level complexity

Phases with standard patterns (research optional):
- **Phase 1 (Infrastructure):** discord.js startup, Drizzle migrations, i18next, pg-boss — all well-documented
- **Phase 2 (Bot Shell):** Slash command loading, guild settings, Redis caching — standard patterns
- **Phase 3 (Activity Tracking):** Cooldown bucketing, BullMQ event pipeline — standard patterns with good references in STACK.md and ARCHITECTURE.md
- **Phase 6 (Combat):** Stat-based turn resolution, opt-in PvP — no real-time requirements, async resolution is straightforward

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies verified via Context7 official docs + npm registry. Drizzle vs Prisma comparison from multiple independent sources. PgBouncer requirement is well-established. |
| Features | HIGH | Competitive analysis based on live top.gg data + official bot sites. Player psychology grounded in academic research (Hwang 2025, UC Santa Cruz). DaoVerse is the validated closest competitor. |
| Architecture | HIGH | Shard-stateless + centralized worker pattern is well-established for production Discord bots. PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` is canonical for order books at this scale. Verified against discord.js official docs. |
| Pitfalls | HIGH | Economy inflation precedents from New World + Diablo 3 are well-documented. Discord rate limit values are from official docs. VWAP manipulation pattern is well-understood in trading systems. |

**Overall confidence:** HIGH

### Gaps to Address

The following areas are unresolved and need decisions before or during specific phases:

- **"What persists" across season reset:** PROJECT.md defers this to detailed design. Must be specified before Phase 7. Options: cosmetics only; cosmetics + title history; small "heirloom" linh thạch amount (1–5% of season-end balance); pets/companions (if added). Whatever is chosen must be communicated to players from Season 1 launch.
- **Two-tier currency decision (earned vs. purchased linh thạch):** PITFALLS.md recommends considering separate `linh thạch trong` (earned in-game) and `linh thạch ngoài` (purchased with fiat) to constrain IAP-driven inflation. PROJECT.md describes a single `linh thạch` currency. This architectural decision affects the schema design and must be resolved before Phase 3 (economy columns on the users table).
- **Newcomer protection zone specifics:** Double tu vi rate for first 7 days? Separate newcomer leaderboard? Exact PvP realm-gating threshold? These details affect Phase 3 and Phase 6 implementation.
- **Breakthrough failure chance values:** The failure mechanic is planned but failure probability per realm, tu vi loss on failure, and retry cooldown are unspecified. Balance-critical; need design before Phase 4.
- **Minimum marketplace transaction count for VWAP:** Set too low → vulnerable to wash trading; set too high → new items never get price discovery. This parameter needs simulation before Phase 5.
- **Discord SKU vs. Stripe:** PROJECT.md mentions Stripe; PITFALLS.md recommends Discord native SKU for compliance. This is an open decision that affects Phase 8 architecture significantly.

---

## Sources

### Primary (HIGH confidence)
- `/discordjs/guide` (Context7) — sharding, slash commands, event handling
- `/drizzle-team/drizzle-orm` (Context7) — transactions, raw SQL, migrations
- `/timgit/pg-boss` (Context7) — cron scheduling, SKIP LOCKED patterns
- `/websites/i18next` (Context7) — Node.js i18n setup, fs-backend
- Discord official docs — rate limits, monetization ToS, API
- npm registry — version verification (discord.js 14.26.2, drizzle 0.45.2, etc.)
- PostgreSQL official docs — explicit locking, advisory locks

### Secondary (MEDIUM confidence)
- makerkit.dev/blog — Drizzle vs Prisma 2026 comparison
- pkgpulse.com/blog — BullMQ vs pg-boss 2026 comparison
- top.gg ecosystem surveys — competitive bot landscape
- Hwang, D. (2025) UC Santa Cruz — idle game player engagement research
- github.com/meister03/discord-hybrid-sharding — architecture patterns
- space-node.net/blog — multi-server bot architecture 2026
- cultivationgames.com/wiki — realm naming reference

### Tertiary (LOW confidence / needs validation during implementation)
- VWAP outlier rejection parameters — need simulation before Phase 5
- Wash trading detection thresholds — need playtesting data
- Economy faucet/sink balance ratios — need simulation or conservative-then-buff approach

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
