# Technology Stack

**Project:** TuTien Bot — Discord RPG (xianxia/tu tiên theme)
**Researched:** 2026-04-11
**Research mode:** Ecosystem

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| discord.js | **14.26.2** | Discord Gateway + REST API | Industry-standard, 100% Discord API coverage, best ecosystem. v15 exists in dev preview but not stable — use v14. Requires Node.js ≥18. |
| Node.js | **≥20 LTS** | Runtime | discord.js requires ≥18; Node 20 adds native `fetch`, performance improvements. Target 20 LTS for production stability. |
| TypeScript | **5.x** | Language | Type safety critical for complex game state. discord.js ships full types. |

**Why not Eris / Oceanic.js?** Both have narrower ecosystems, less maintained community plugins, and significantly fewer resources. discord.js dominates the production Discord bot space in 2025–2026. The performance difference Eris once had over djs v12/v13 has narrowed significantly in v14.

---

### Sharding Strategy

**Confidence: HIGH** (verified via Context7 + Discord official docs)

#### When to shard

Discord **requires** sharding at **2,500 guilds**. You will be rate-limited from logging in without it. Recommended: start implementing sharding architecture from day one even if you launch with <100 servers — retrofitting sharding into a non-sharding codebase is painful.

#### Shard count formula

Discord's API returns `recommended_shard_count` via `GET /gateway/bot`. Default ratio: **1 shard per 1,000 guilds**. For launch (<100 guilds): 1 shard is fine, but the `ShardingManager` must exist.

#### Option A: discord.js built-in `ShardingManager` (RECOMMENDED for this project)

```typescript
// shard-manager.ts
import { ShardingManager } from 'discord.js';

const manager = new ShardingManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  totalShards: 'auto',  // Discord recommends shard count
});

manager.on('shardCreate', shard => {
  console.log(`Launched shard ${shard.id}`);
});

manager.spawn({ amount: 'auto', delay: 5_500, timeout: 30_000 });
```

**Pros:** Zero extra dependencies, maintained by discord.js team, supports `broadcastEval` and `fetchClientValues` for cross-shard communication.

**Cons:** Single-process manager (all shards in-process via `child_process`). For extremely large bots (100K+ guilds), you'd split to multi-machine.

#### Option B: `discord-hybrid-sharding` v3.0.1

```typescript
import { ClusterManager } from 'discord-hybrid-sharding';

const manager = new ClusterManager('./dist/bot.js', {
  totalShards: 'auto',
  shardsPerClusters: 4,  // 4 gateway shards per OS process (cluster)
});
```

**Use when:** Bot exceeds ~50 shards and process memory becomes an issue. Combines OS-level clustering with gateway sharding — e.g., 4 clusters × 10 shards each = 40 total gateway connections across 4 processes. Fully compatible with discord.js v14.

**Recommendation for TuTien Bot:** Start with **discord.js built-in `ShardingManager`**. Migrate to `discord-hybrid-sharding` when you exceed 25–30 shards (roughly 25,000+ guilds). Architecture at that point will require refactoring anyway.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | **16+** | Primary data store | ACID transactions essential for order matching, currency burns, market operations. Global shared state across shards requires a single source of truth. |
| Drizzle ORM | **0.45.2** + drizzle-kit 0.31.10 | Database client + migrations | See rationale below |
| `pg` (node-postgres) | **8.20.0** | PostgreSQL driver | Drizzle uses this under the hood; also needed for raw query escape hatches |

#### ORM Decision: Drizzle vs Prisma vs TypeORM

**Recommendation: Drizzle ORM** — Confidence: HIGH

| Criterion | Drizzle | Prisma 7 | TypeORM |
|-----------|---------|----------|---------|
| Bundle size | ~50ms cold start | ~300ms cold start | ~600ms cold start |
| Raw SQL control | First-class (`sql` template) | `$queryRaw` (awkward) | Possible but verbose |
| PostgreSQL-specific features | Full (RETURNING, FOR UPDATE, etc.) | Partial | Partial |
| Transaction API | Native, clean | Works, but mixing with `$queryRaw` breaks boundaries | Verbose |
| Type safety | Inferred from schema | Generated client | Decorator-based |
| Migration tooling | drizzle-kit (excellent) | Prisma Migrate (excellent) | typeorm-cli (dated) |
| 2025–2026 trajectory | Cloud-native future | Comprehensive platform | Fading into maintenance |

**Why Drizzle for this project specifically:**

1. **High-frequency writes**: Every message/reaction/voice event writes `tu_vi` points. Drizzle's thin layer over pg means minimal overhead per query — critical at scale.
2. **Order matching needs raw SQL**: `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent order claim is awkward to express in Prisma; Drizzle's `sql` template makes it natural.
3. **VWAP calculation**: A complex aggregation query (`SUM(price * qty) / SUM(qty) WHERE ts > NOW() - INTERVAL '1 hour'`) maps directly to Drizzle's raw SQL expressions.
4. **No `prisma generate` ceremony**: No build step required when schema changes; just update TypeScript schema file.

> **Note:** Prisma 7 improved edge performance and the "Drizzle for edge, Prisma for Node" rule is weaker than before. But for a high-frequency event-driven bot with complex SQL queries, Drizzle's SQL-proximity wins.

**TypeORM: explicitly avoid.** Cold start ~600ms, decorator-based schema (fragile with TS strict mode), effectively in maintenance mode as of 2025.

---

### Job Queue / Scheduler

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **pg-boss** | **12.15.0** | VWAP recalculation every 1h, season transitions, scheduled burns | Already using PostgreSQL — no Redis needed. Uses `SKIP LOCKED` internally for safe concurrent job processing. |

#### Job Queue Decision: BullMQ vs pg-boss

**Recommendation: pg-boss** — Confidence: HIGH

| Criterion | pg-boss | BullMQ |
|-----------|---------|--------|
| Infrastructure dependency | PostgreSQL only | Redis required |
| ACID guarantees | Yes (same DB transaction) | No (Redis is eventually consistent) |
| Cron scheduling | Native (`schedule()`) | Native (`upsertJobScheduler`) |
| Throughput | ~100-500 jobs/sec | ~10,000+ jobs/sec |
| Job visibility/audit | Native (jobs are DB rows) | Manual |
| Failure recovery | ACID, jobs survive restarts | Needs separate setup |

**Why pg-boss wins for TuTien Bot:**

- **No Redis in stack** = one fewer infrastructure dependency. The bot already has PostgreSQL; pg-boss uses the same connection pool.
- **VWAP recalculation is low-frequency** (every 1h per item). pg-boss's throughput (hundreds/sec) is more than sufficient.
- **ACID correctness**: If a VWAP update job crashes mid-transaction, it rolls back cleanly. With BullMQ/Redis, you'd need idempotency keys manually.
- **Cross-shard single-scheduler**: With multiple shard processes, only one worker should run VWAP recalculation. pg-boss's `SKIP LOCKED` pattern naturally ensures exactly-once execution.

**BullMQ: use if** you later need high-throughput async jobs (e.g., >10,000 combat resolution jobs/sec), but that's not needed at launch.

```typescript
// scheduler.ts
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

// VWAP recalculation — every hour
await boss.schedule('vwap-recalc', '0 * * * *', {}, { tz: 'UTC' });

// Season check — daily
await boss.schedule('season-check', '0 0 * * *', {}, { tz: 'UTC' });

boss.work('vwap-recalc', async (job) => {
  // recalculate market_price for all active items
});
```

---

### Caching Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **ioredis** | **5.10.1** | In-memory cache for hot data | Player stats cache (avoid DB read on every message event), rate limiting per user/guild, cooldown tracking |

**Wait — didn't we just avoid Redis for job queues?**  
Yes. But Redis serves a different purpose here: **L1 cache** for hot game data read on every Discord event. With every message writing tu_vi points, you need:
- A **cooldown check** (has this user sent a message in the last X seconds?): Redis TTL-based key is the canonical pattern here.
- **Rate limiting** per shard/guild to comply with Discord API limits.
- **In-memory player profile cache** to avoid a DB round-trip on every single `messageCreate` event.

Without Redis, every message event fires a PostgreSQL query. At 10K active users across 100 servers, that's potentially thousands of queries/second for the cooldown check alone.

**Redis vs PostgreSQL unlogged tables for caching:** Redis is faster (confirmed by benchmarks). For sub-millisecond cooldown checks on every message event, Redis wins.

**Recommendation:** Run a single Redis instance (or Upstash/Render Redis). ioredis is the preferred client (vs the older `redis` package) for its Promise API and cluster support.

---

### i18n

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **i18next** | **26.0.4** | Full internationalization | Most mature i18n framework for Node.js, rich feature set |
| **i18next-fs-backend** | latest | Load translation files from disk | No HTTP backend needed in a bot |

**Why i18next over custom:**

- Supports **pluralization** (critical for Vietnamese — "1 linh thạch" vs "nhiều linh thạch"), **interpolation**, **namespaces** (separate by game system).
- Lookup pattern: `t('market.order.matched', { count: qty, item: itemName })` with automatic locale resolution per user/guild.
- Discord bots need per-user locale resolution, not a global `Accept-Language` header. i18next supports custom language detectors.

```typescript
// i18n.ts
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';

await i18next.use(Backend).init({
  fallbackLng: 'vi',         // Vietnamese as default
  supportedLngs: ['vi', 'en'],
  ns: ['common', 'market', 'combat', 'cultivation'],
  defaultNS: 'common',
  backend: {
    loadPath: './locales/{{lng}}/{{ns}}.json',
  },
  interpolation: { escapeValue: false },
});

// Per-interaction resolution
export function t(key: string, lng: string, options?: object) {
  return i18next.t(key, { lng, ...options });
}
```

**Locale detection strategy for Discord:** Read `interaction.locale` (Discord sends the user's Discord client language) and map to your supported locales.

---

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | **4.3.6** | Runtime schema validation | Validate command inputs, config objects, market order parameters |

Zod v4 brings 14x performance improvements over v3 and is the de-facto standard for TypeScript runtime validation in 2025–2026.

---

### Command Framework

**Recommendation: Raw discord.js interactions (no framework)** — Confidence: MEDIUM

| Option | Verdict |
|--------|---------|
| Raw discord.js | More control, less magic, recommended for complex RPG with custom middleware needs |
| @sapphire/framework (v5.5.0) | Feature-rich, good for standard slash commands, adds ~4MB to bundle, may conflict with custom shard lifecycle |
| discord-akairo | Archived/unmaintained |
| discord.js Commando | Unmaintained |

For a complex RPG bot, Sapphire is genuinely useful (plugin system, preconditions, i18n integration). However, its abstractions over interaction handling can conflict with custom sharding lifecycle management. **Verdict: use Sapphire only if the team is already familiar with it; otherwise raw discord.js with a simple command registry is more controllable.**

If using Sapphire, install `@sapphire/framework@5.5.0` + `@sapphire/plugin-i18next`.

---

### Infrastructure / Deployment

| Technology | Purpose | Notes |
|------------|---------|-------|
| **Docker** | Containerization | One `ShardingManager` container + PostgreSQL + Redis |
| **Docker Compose** | Local dev | Single `docker-compose.yml` for local dev |
| **Railway / Render / Fly.io** | Cloud hosting | All support persistent containers; Railway simplest for PostgreSQL + Redis managed services |
| **PgBouncer** | Connection pooling | CRITICAL: with multiple shards each holding their own Drizzle pool, you risk exhausting PostgreSQL's max_connections. Use PgBouncer in transaction mode between shards and the database. |

**PgBouncer is mandatory once you have multiple shard processes.** Each shard spawns its own `pg` connection pool. At 10 shards × 10 pool connections = 100 connections against PostgreSQL's typical default of 100. Use PgBouncer (or Prisma Accelerate if on Prisma, but since we chose Drizzle, use PgBouncer or Supabase/Neon connection poolers).

---

## Full Dependency List

```bash
# Production dependencies
npm install discord.js@14.26.2
npm install drizzle-orm@0.45.2 pg@8.20.0
npm install bullmq@5.73.4          # only if high-throughput jobs needed later
npm install pg-boss@12.15.0        # primary scheduler
npm install ioredis@5.10.1
npm install i18next@26.0.4 i18next-fs-backend
npm install zod@4.3.6
npm install discord-hybrid-sharding@3.0.1  # future-proofing, keep as dep

# Dev dependencies
npm install -D drizzle-kit@0.31.10
npm install -D typescript tsx
npm install -D @types/node @types/pg
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Discord framework | discord.js 14 | Eris, Oceanic.js | Smaller ecosystem, narrower community support in 2025–2026 |
| Discord framework | discord.js 14 | discord.js v15 (dev) | Not stable; API-breaking changes in progress |
| ORM | Drizzle ORM | Prisma 7 | Prisma 7 is fine but heavier, `prisma generate` ceremony, SQL-opacity for complex queries |
| ORM | Drizzle ORM | TypeORM | Effectively in maintenance mode, slowest cold start |
| Job scheduler | pg-boss | BullMQ | BullMQ requires Redis; pg-boss reuses existing PostgreSQL, sufficient throughput |
| Job scheduler | pg-boss | node-cron | node-cron is in-process only — breaks in multi-shard environments (every shard would run the cron) |
| Cache | Redis (ioredis) | PostgreSQL unlogged tables | Redis is measurably faster for sub-millisecond cooldown checks |
| i18n | i18next | Custom JSON loader | i18next has pluralization, contexts, fallbacks — critical for correctness |
| Shard manager | Built-in ShardingManager | kurasuta | kurasuta is abandoned; discord-hybrid-sharding is the modern equivalent |
| Validation | Zod v4 | Joi, Yup | Zod v4 is fastest, most TypeScript-native |

---

## Architecture Integration Notes

### High-Frequency Event Handling (Every Message / Reaction / Voice State)

The hot path: `messageCreate` → check cooldown (Redis) → if eligible, write tu_vi (PostgreSQL).

```
Discord Gateway
  └── Shard N (discord.js client)
        ├── messageCreate handler
        │     ├── [FAST] Redis GET cooldown:userId:guildId   (~0.3ms)
        │     ├── if cooldown hit → skip (no DB write)
        │     └── if eligible → Drizzle UPDATE players SET tu_vi += X  (~2-5ms)
        ├── voiceStateUpdate handler
        │     └── similar pattern, longer cooldown window (per minute)
        └── interactionCreate handler
              └── slash command dispatch
```

**Anti-pattern to avoid:** Queuing every single message event into BullMQ/Redis for batch processing. While this sounds clever, it adds latency to what users expect to be instant feedback and creates queue backpressure during server spam events.

### Order Matching Engine

The marketplace runs through PostgreSQL — no separate matching service needed at this scale.

```sql
-- Claim a matching sell order atomically
BEGIN;
  SELECT id, price, qty, seller_id
  FROM market_orders
  WHERE item_id = $1
    AND type = 'SELL'
    AND price <= $2        -- buyer's limit price
    AND status = 'OPEN'
  ORDER BY price ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;   -- skip orders being claimed by another concurrent request

  -- If found: execute match, update balances, mark order filled/partial
COMMIT;
```

`FOR UPDATE SKIP LOCKED` ensures two concurrent buyers for the same item don't race and double-spend. This is the canonical PostgreSQL pattern for order books at this scale.

### Cross-Shard Global State

Since tu_vi is a global character (works across all servers), **all game state lives in PostgreSQL, not in shard memory**. No cross-shard `broadcastEval` is needed for game data. `broadcastEval` is only used for administrative Discord stats (server count, etc.).

This is the correct architecture for a game bot: **Discord shards = stateless gateway workers**. All state in the database.

---

## Sharding Decision Tree

```
Bot is live and growing:

< 100 guilds  → 1 shard (ShardingManager with totalShards: 1 or 'auto')
100–2,500     → ShardingManager with totalShards: 'auto' (Discord recommends)
2,500–25,000  → REQUIRED by Discord; ShardingManager, ~3–25 shards
25,000+       → Migrate to discord-hybrid-sharding (clusters × shards per cluster)
100,000+      → Large bot sharding (requires Discord partnership), shard count = multiple of 16
```

Discord requires sharding at **2,500 guilds** — not 1,000, not 500. This is verified from Context7 official docs.

---

## Version Pinning Strategy

Pin exact versions in `package.json` (not `^`). discord.js minor versions occasionally introduce breaking changes to event types. Drizzle ORM is in active development (0.x semver means breaking changes allowed). Upgrade deliberately, not automatically.

---

## Sources

| Source | Confidence | URL |
|--------|------------|-----|
| discord.js sharding docs | HIGH | Context7 `/discordjs/guide` — sharding/README.md |
| discord.js latest version | HIGH | npm registry (verified: 14.26.2) |
| Drizzle ORM transactions + raw SQL | HIGH | Context7 `/drizzle-team/drizzle-orm` |
| Drizzle vs Prisma 2026 comparison | HIGH | makerkit.dev/blog/tutorials/drizzle-vs-prisma |
| ORM performance benchmarks 2025 | MEDIUM | thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/ |
| discord-hybrid-sharding | HIGH | github.com/meister03/discord-hybrid-sharding |
| pg-boss cron scheduling | HIGH | Context7 `/timgit/pg-boss` |
| BullMQ vs pg-boss 2026 | MEDIUM | pkgpulse.com/blog/bullmq-vs-bee-queue-vs-pg-boss-job-queues-nodejs-2026 |
| i18next Node.js setup | HIGH | Context7 `/websites/i18next` |
| PostgreSQL SKIP LOCKED pattern | HIGH | inferable.ai/blog/posts/postgres-skip-locked |
| Redis vs PostgreSQL caching | MEDIUM | dizzy.zone/2025/09/24/Redis-is-fast-Ill-cache-in-Postgres/ |
| Sharding threshold (2,500 guilds) | HIGH | Context7 discordjs/guide + space-node.net/blog |
