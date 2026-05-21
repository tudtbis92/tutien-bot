# Roadmap: TuTien Bot

**Project:** TuTien Bot — Discord RPG xianxia game bot  
**Granularity:** Coarse  
**Coverage:** 48/48 v1 requirements mapped ✓  
**Created:** 2026-04-11

---

## Phases

- [x] **Phase 1: Foundation** — Infrastructure, database, Redis, CI/CD, i18n scaffold (completed 2026-04-11)
- [x] **Phase 2: Core Game Loop + Progression** — Active game: tu vi accumulation, anti-farming, character system, cảnh giới, professions (completed 2026-04-12)
- [ ] **Phase 3: Combat + Marketplace** — Economy loop: hunting/dueling for loot, global VWAP marketplace trading
- [ ] **Phase 4: Season System + Admin** — Durable game: season resets, hall of fame, abuse reporting

---

## Phase Details

### Phase 1: Foundation

**Goal:** A runnable bot shell with all load-bearing infrastructure in place — database migrated, Redis connected, i18n wired, CI/CD deployed — so every downstream phase can build features without retrofitting
**UI hint:** no
**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, I18N-01, I18N-02, I18N-03

### Success Criteria
1. `npm start` launches the bot; it appears online in Discord with ShardingManager and zero shard crash loops
2. `drizzle-kit migrate` runs all schema migrations from zero without errors (users, characters, items, orders, transactions, seasons tables present)
3. Redis health check passes; a cooldown key can be set and retrieved from the running bot
4. pg-boss initializes and the VWAP hourly cron job is registered (visible in pg-boss job table)
5. Any user-facing string rendered in Discord comes from a locale file — the pre-commit ESLint rule blocks hardcoded strings and the CI pipeline enforces it on every push

### Notes
- Architecture: stateless shards from day one — no game state in shard memory, ever. Redis is for hot transient data (cooldowns, VWAP cache, voice sessions, guild config), not as a backbone.
- i18n must be fully wired before Phase 2 writes a single user-facing string. Retrofitting i18n costs 3-5× the original effort.
- DB schema must include `BIGINT` for all currency columns (never float). `CHECK (balance >= 0)` constraint on the users table is a safety net against double-spend bugs.
- `discord-hybrid-sharding` installed now but 1-cluster mode until ~25K guilds. Don't over-engineer shard topology at launch.
- Pin exact versions: `discord.js@14.26.2`, `drizzle-orm@0.45.2`, etc. No `^` prefixes — breaking changes are common on 0.x packages.
- PgBouncer or equivalent connection pooler is mandatory once shard count > 1. Add to docker-compose now, configure later.
- **Plans:** 1/1 plans complete

---

### Phase 2: Core Game Loop + Progression

**Goal:** A playable game — players register a character, accumulate tu vi passively through real Discord activity, level up through cảnh giới, develop profession skills, and gather/craft items
**UI hint:** yes
**Requirements:** CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06, PROG-07, PROG-08

### Success Criteria
1. A new user runs `/start`, selects a spiritual root, and `/profile` immediately shows their character with 0 tu vi, correct spiritual root affinity, and realm Luyện Khí Tầng 1
2. Sending a valid message (≥10 chars, non-spam) in a configured channel visibly increases tu vi in `/profile`; sending identical spam messages or rapid-fire short messages awards zero additional tu vi (anti-farming enforced, DB-backed, survives bot restart)
3. A user with sufficient tu vi can attempt `/đột_phá`; success advances their realm, failure may cost tu vi — both outcomes are shown with thematic text from locale files
4. A user can allocate profession skill points, run a gathering command, and craft an item from materials using a recipe
5. `/bxh` renders a ranked leaderboard of cultivators in the current server with realm and tu vi visible

### Notes
- **CRITICAL: anti-farming ships WITH accumulation, never after.** DB-backed cooldowns (60s minimum, stored in DB not Redis alone) must be live from the first message event handler. In-memory cooldowns are wiped on shard restart = free exploit window on every deploy.
- All 5 anti-farming layers required: (1) DB-backed per-channel cooldown, (2) daily tu vi hard cap, (3) message content quality gate (≥10 chars, no repeating character runs, no duplicate-in-5-min), (4) anomaly detection flag for review, (5) voice session minimum activity check (mute/deaf detection to prevent AFK farming).
- Activity event pipeline must be fire-and-forget async. Synchronous DB writes inside Discord event handlers block the gateway at scale and cause disconnects. Pattern: event → cooldown guard (Redis fast path) → enqueue to pg-boss Activity Worker → return immediately.
- Realm identifiers are stable integer IDs in the DB. Display names come from i18n lookup + `seasons.realm_names TEXT[]` — not hardcoded strings.
- Spiritual root (ngũ linh căn: Kim/Mộc/Thủy/Hỏa/Thổ) assigned at `/start` affects tu vi accumulation rate multiplier and profession affinity — store as enum, display from locale.
- Breakthrough failure chance values (probability per realm tier, tu vi loss on fail, retry cooldown) must be designed before implementing PROG-02. Suggest: Luyện Khí→Trúc Cơ 0% fail, Trúc Cơ→Kim Đan 20%, Kim Đan→Nguyên Anh 40%, higher realms 60%+.
- Two-tier currency question (earned `linh thạch trong` vs purchased `linh thạch ngoài`) must be resolved before writing the economy columns on the users table. Recommendation: single currency for v1, two-tier as v2 if inflation materializes.
- **Plans:** 7 plans

Plans:
- [x] 02-01-PLAN.md — DB schema (characters, items, recipes, guild_activity) + game constants + i18n keys
- [x] 02-02-PLAN.md — Activity pipeline (messageCreate/voiceStateUpdate/reactionAdd) + anti-farming workers
- [x] 02-03-PLAN.md — /start character registration + /profile command
- [x] 02-04-PLAN.md — Breakthrough service layer + /đột_phá command
- [x] 02-05-PLAN.md — Leaderboard /leaderboard command + pagination
- [x] 02-06-PLAN.md — /profession skill tree command
- [x] 02-07-PLAN.md — /gather gathering + /craft crafting commands

---

### Phase 02.2: Add football prediction event system (INSERTED)

**Goal:** Players bet linh thạch on real football matches — predict results (Win/Draw/Lose) and exact scores via message components, with automated payouts from real bookmaker odds
**Requirements**: PRED-01, PRED-02, PRED-03, PRED-04, PRED-05, PRED-06, PRED-07, PRED-08, PRED-09, PRED-10, PRED-11, PRED-12
**Depends on:** Phase 2
**Plans:** 5/5 plans complete

Plans:
- [x] 02.2-01-PLAN.md — DB schema (football_matches, football_bets, api_cache, guild_settings) + constants
- [x] 02.2-02-PLAN.md — API-Football client with key rotation + BIGINT-safe odds calculator
- [x] 02.2-03-PLAN.md — Prediction embed builder + message component handlers (result, score, confirm)
- [x] 02.2-04-PLAN.md — pg-boss cron jobs (fetch fixtures, poll scores, resolve matches) + lifecycle service
- [x] 02.2-05-PLAN.md — i18n translations (VI/EN/ZH-CN) + /predictions + /config commands + env setup

### Phase 02.1: Gather & Craft — Seed Data + Cơ Chế Chi Tiết (INSERTED)

**Goal:** Hoàn thiện vòng lặp gather/craft bằng cách thiết kế và seed game data thực tế (items catalog, recipes, recipe_ingredients), đồng thời review và điều chỉnh các cơ chế chi tiết (tier gates, cooldown, yield formula, unique roll) để đảm bảo gameplay cân bằng và playable
**Requirements**: PROG-06, PROG-07 (unblocked by real data)
**Depends on:** Phase 2
**Directory:** `.planning/phases/02.1-gather-craft-seed-data/`
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 02.1 to break down)

### Phase 3: Combat + Marketplace

**Goal:** A living economy loop — players hunt yêu thú and duel each other to acquire items, then trade on a global VWAP-priced marketplace where every transaction is automatically matched
**UI hint:** yes
**Requirements:** COMBAT-01, COMBAT-02, COMBAT-03, COMBAT-04, MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, MKT-06, MKT-07, MKT-08, MKT-09, MKT-10, MKT-11, MKT-12

### Success Criteria
1. A user runs a hunting command, encounters a yêu thú appropriate to their realm, and receives loot drops from combat resolution (turn-based dice + stats)
2. A user can place a limit sell order for an item they own; the order appears in the order book; when another user's buy order meets the price, the trade executes automatically, balances update atomically, and the 10% seller fee is burned
3. Instant buy (`1.2 × market_price`) and instant sell (`0.7 × market_price`) execute immediately with correct price calculations; limit sell orders above `2.5 × market_price` are rejected at placement time
4. VWAP updates after each 1-hour window only when ≥5 transactions occurred; outlier trades (±2σ from session VWAP) are excluded from the recalculation; if no transactions occurred, market_price is unchanged
5. Two users can opt into a PvP duel, wager linh thạch or items, fight a text-based combat sequence, and the winner receives the staked items/currency

### Notes
- **Marketplace Worker must run at `concurrency: 1` — always.** Multiple concurrent workers with order matching create double-fill race conditions that are functionally impossible to debug post-facto. The architectural constraint is non-negotiable.
- Order matching pattern: `SELECT FOR UPDATE SKIP LOCKED` in a serialized transaction. Never read-then-write for balance checks — use atomic `UPDATE users SET balance = balance - $amount WHERE id = $1 AND balance >= $amount RETURNING balance`.
- VWAP wash-trading prevention (MKT-12): minimum 5 transactions to update VWAP, outlier rejection at ±2σ, velocity limit per account (cannot buy and sell same item in same 1h window), flag same-IP account pairs for admin review.
- PvE boss events (COMBAT-02): implement as pg-boss scheduled events that post to guild announcement channels. Multiple users contribute damage; boss HP is a shared DB value (optimistic lock). Boss spawn interval configurable per guild.
- PvP dueling (COMBAT-03): opt-in only via challenge command. Realm-gating: max ±1 realm boundary (Luyện Khí cannot challenge Kim Đan). Wager escrow held in a neutral DB table until combat resolves.
- Combat resolution (COMBAT-04): text-based turn-by-turn. Stats: base ATK/DEF derived from realm tier + spiritual root affinity + equipped items. Dice roll adds variance. Each turn result comes from locale string templates.
- Needs phase research before planning: VWAP outlier rejection algorithm, PostgreSQL advisory lock patterns for order matching, wash-trading detection heuristics.
- **Plans:** TBD

---

### Phase 4: Season System + Admin

**Goal:** A durable, self-governing game — seasons end cleanly with archived leaderboards and rewards, the economy resets without data loss, and admins can handle reported abuse
**UI hint:** yes
**Requirements:** SEASON-01, SEASON-02, SEASON-03, SEASON-04, SEASON-05, ADMIN-01

### Success Criteria
1. Season countdown announcements post automatically to all guild announcement channels at T-7 days, T-24h, and T-1h before reset — without manual admin action
2. A season reset executes the full multi-phase sequence: all open marketplace orders are canceled and linh thạch refunded; all tu vi and non-legacy resources are wiped to zero; legacy-flagged items survive the reset; the reset completes as an atomic DB transaction or fully rolls back
3. After a season ends, the final leaderboard snapshot is permanently archived and visible via a Hall of Fame command; the top-N players receive their season rewards
4. A user can submit an abuse report; an admin can view the pending queue and mark reports resolved via slash commands

### Notes
- SEASON-05 multi-phase reset state machine sequence: (T-7d) announce + disable new limit orders → (T-24h) cancel + refund all open orders, drain crafting queue → (T-0) atomic snapshot transaction → (T+0 to T+24h) freeze gameplay + verify DB consistency → open new season.
- Paid linh thạch (`linhhthach_transactions` ledger) is **never** wiped by a season reset. The reset touches earned currency and season-scoped assets only.
- SEASON-02 "what persists" design must be specified before implementing: cosmetics only? title history? small heirloom linh thạch (1–5% season-end balance)? This decision must be communicated to players from Season 1 launch. Recommend: cosmetics + titles + legacy-flagged crafted heirlooms only.
- Notification Worker handles all season announcements via `@discordjs/rest` REST calls (no gateway connection needed). Posts to `guild_settings.announcement_channel_id`.
- ADMIN-01 is intentionally minimal: a report queue viewable via `/admin reports`, bulk-resolve action. No web dashboard. Aligns with PROJECT.md "slash commands sufficient for v1".
- Needs phase research before planning: multi-phase reset transaction safety, "what persists" design and player communication strategy.
- **Plans:** TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/1 | Complete   | 2026-04-11 |
| 2. Core Game Loop + Progression | 7/7 | Complete   | 2026-04-12 |
| 02.1. Gather & Craft — Seed Data + Cơ Chế Chi Tiết | 0/? | Not started (INSERTED) | - |
| 02.2. Football Prediction Event System | 5/5 | Complete   | 2026-05-21 |
| 3. Combat + Marketplace | 0/? | Not started | - |
| 4. Season System + Admin | 0/? | Not started | - |

---

*Roadmap created: 2026-04-11*  
*Last updated: 2026-05-21 — Phase 02.2 P05 complete: i18n + commands + .env.example*
