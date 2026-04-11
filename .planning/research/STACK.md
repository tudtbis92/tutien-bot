# Technology Stack

**Project:** TuTien Bot — Discord RPG (xianxia/tu tiên theme)
**Researched:** 2026-04-11
**Last updated:** 2026-04-11 (verified via Context7 + npm registry + Tavily live search)
**Research mode:** Ecosystem

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| discord.js | **14.26.2** | Discord Gateway + REST API | Industry-standard, 100% Discord API coverage, best ecosystem. v15 vẫn pre-release ("should be usable" nhưng không khuyến nghị production — breaking changes chưa ổn định). discord.js 14.26.2 docs yêu cầu Node.js **≥22.12.0**. |
| Node.js | **22 LTS** ("Jod") | Runtime | v22 là Active LTS hiện tại (LTS đến 2027-04-30). v20 chuyển sang Maintenance LTS. v18 đã EOL. v24 là "Current", vào LTS tháng 10/2025. Target: **v22 LTS** cho production stability. |
| TypeScript | **5.x** (khuyến nghị 5.8.x) | Language | TS 6.0 đã ra (6.0.2) nhưng có breaking changes: `strict: true` default, bỏ ES5 target, bỏ `--outFile`. discord.js và nhiều ecosystem packages chưa fully migrate. Dùng **TypeScript 5.8.x** cho stability. Nâng cấp TS 6 trong Phase 2+. |
| @discordjs/rest | **2.6.1** | REST-only Discord API calls | Dùng cho Notification Worker (gửi DM, channel posts) mà không cần gateway connection. Cùng major version với discord.js 14. |
| @discordjs/voice | **0.19.2** | Voice state tracking | Cần cho voice activity tu vi accumulation nếu cần detailed voice tracking. Optional — basic voice state dùng `voiceStateUpdate` event đủ. |

**discord.js v15 status:** Docs official tại discordjs.guide/v15 ghi rõ "in a pre-release state, should be usable — do NOT update production without careful testing." Vẫn dùng v14.26.2.

**Node.js requirement:** discord.js 14.26.2 docs ghi **"Node.js 22.12.0 or newer is required"** — không phải v20 như trước. Dùng **Node.js 22 LTS**.

---

### Sharding Strategy

**Confidence: HIGH** (verified via Context7 official docs + discord.js 14.26.0 API docs)

#### When to shard

Discord **requires** sharding tại **2,500 guilds**. Nên implement ShardingManager từ ngày đầu — retrofit sau rất đau.

#### Shard count formula

Discord's API trả về `recommended_shard_count` qua `GET /gateway/bot`. Ratio mặc định: 1 shard per 1,000 guilds.

#### Option A: discord.js built-in `ShardingManager` (RECOMMENDED khi khởi đầu)

```typescript
import { ShardingManager } from 'discord.js';

const manager = new ShardingManager('./dist/bot.js', {
  token: process.env.DISCORD_TOKEN,
  totalShards: 'auto',
  mode: 'worker', // Worker threads — ít overhead hơn child_process
});

manager.on('shardCreate', shard => {
  console.log(`Launched shard ${shard.id}`);
});

manager.spawn({ amount: 'auto', delay: 5_500, timeout: 30_000 });
```

discord.js 14 hỗ trợ `mode: 'worker'` (Worker threads) hoặc `mode: 'process'` (child_process). Worker threads nhẹ hơn và được recommend từ discord.js 14.

#### Option B: `discord-hybrid-sharding` v3.0.1 (scale lớn)

```typescript
import { ClusterManager } from 'discord-hybrid-sharding';

const manager = new ClusterManager('./dist/bot.js', {
  totalShards: 'auto',
  shardsPerClusters: 4,
});
```

Battle-tested đến 600K guilds, giảm 40-60% resource overhead so với ShardingManager. Compatible với discord.js v14.14.1+.

**Recommendation:** Dùng built-in `ShardingManager` khi bắt đầu. Migrate sang `discord-hybrid-sharding` khi vượt ~25K guilds.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | **16+** | Primary data store | ACID transactions thiết yếu cho order matching, currency burns, global state cross-shard. |
| Drizzle ORM | **0.45.2** | Database client | Thin layer, SQL-proximity, `FOR UPDATE SKIP LOCKED` native, VWAP raw SQL expressions tự nhiên. Xem lý do chi tiết bên dưới. |
| drizzle-kit | **0.31.10** | Migrations + schema tooling | CLI cho `drizzle-kit migrate`, `drizzle-kit generate`, `drizzle-kit studio`. |
| `pg` (node-postgres) | **8.20.0** | PostgreSQL driver | Drizzle sử dụng `pg` dưới hood. |

#### ORM Decision: Drizzle vs Prisma vs TypeORM

**Recommendation: Drizzle ORM** — Confidence: HIGH

| Criterion | Drizzle 0.45 | Prisma 7 | TypeORM |
|-----------|-------------|----------|---------|
| Cold start | ~50ms | ~300ms | ~600ms |
| Raw SQL control | First-class (`sql` template) | `$queryRaw` (awkward) | Possible but verbose |
| `FOR UPDATE SKIP LOCKED` | Native (`.for('update', { skipLocked: true })`) | Partial, awkward | Verbose |
| Transaction API | Native, clean | Works, `$queryRaw` breaks boundaries | Verbose |
| Type safety | Inferred từ schema | Generated client | Decorator-based |
| Migration tooling | drizzle-kit (excellent) | Prisma Migrate (excellent) | typeorm-cli (dated) |
| TS 5.x/6.x compat | Tốt | Tốt | Fragile với strict mode |
| 2025–2026 trajectory | Cloud-native focus | Comprehensive platform | Maintenance mode |

**Drizzle cho TuTien Bot:**

```typescript
// FOR UPDATE SKIP LOCKED — marketplace order matching
const order = await db
  .select()
  .from(marketOrders)
  .where(and(eq(marketOrders.itemId, itemId), eq(marketOrders.status, 'OPEN'), eq(marketOrders.type, 'SELL'), lte(marketOrders.price, buyerPrice)))
  .orderBy(asc(marketOrders.price), asc(marketOrders.createdAt))
  .limit(1)
  .for('update', { skipLocked: true });

// VWAP calculation
const vwap = await db.execute(sql`
  SELECT SUM(price * quantity)::NUMERIC / SUM(quantity) AS vwap
  FROM market_transactions
  WHERE item_id = ${itemId}
    AND executed_at > NOW() - INTERVAL '1 hour'
    AND is_outlier = false
`);
```

**TypeORM: explicitly avoid.** ~600ms cold start, decorator-based schema fragile với TS strict mode, maintenance mode.

---

### Job Queue / Scheduler

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **pg-boss** | **12.15.0** | VWAP recalculation mỗi 1h, season transitions, scheduled burns | PostgreSQL-native, ACID guarantees, không cần Redis cho jobs. `SKIP LOCKED` internally. |

#### Job Queue Decision: BullMQ vs pg-boss

**Recommendation: pg-boss** — Confidence: HIGH

| Criterion | pg-boss 12 | BullMQ |
|-----------|-----------|--------|
| Infrastructure dependency | PostgreSQL only | Redis required |
| ACID guarantees | Yes (same DB transaction) | No (Redis eventually consistent) |
| Cron scheduling | Native (`schedule()`) | Native (`upsertJobScheduler`) |
| Throughput | ~100–500 jobs/sec | ~10,000+ jobs/sec |
| Job visibility/audit | Native (jobs are DB rows) | Manual setup |
| Failure recovery | ACID, jobs survive restarts | Needs separate idempotency setup |

```typescript
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

await boss.createQueue('vwap-recalc');
await boss.createQueue('season-check');

// VWAP recalculation — mỗi giờ
await boss.schedule('vwap-recalc', '0 * * * *', {}, { tz: 'UTC' });

// Season check — hàng ngày
await boss.schedule('season-check', '0 0 * * *', {}, { tz: 'UTC' });

boss.work('vwap-recalc', async ([job]) => {
  // recalculate market_price for all active items with ≥5 transactions
});
```

---

### Caching Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **ioredis** | **5.10.1** | Cooldowns, VWAP cache, voice session tracking, guild settings cache | Xem lý do chi tiết bên dưới |

#### Redis Client Decision: ioredis vs node-redis (package: `redis`)

**Recommendation: ioredis 5.10.1** — Confidence: HIGH (cho project mới trong Discord bot context)

| Criterion | ioredis 5.10.1 | node-redis (redis@5.11.0) |
|-----------|---------------|--------------------------|
| Maintained by | Luin / community | Redis Ltd (officially maintained) |
| API style | Promise-based + callbacks | Promise-based only |
| Cluster support | Yes (better ergonomics, more config options) | Yes |
| Sentinel support | Yes | Yes |
| Lua scripting (defineCommand) | Yes — native, clean | Yes |
| Auto-pipelining | Yes | Yes |
| TypeScript types | Built-in | Built-in |
| Weekly downloads | ~8M | ~12M |
| Recommendation (new project) | Strong for Discord bots (vast community code samples) | Official recommendation from Redis Ltd |

**Lý do chọn ioredis cho TuTien Bot:**
- Toàn bộ Discord bot ecosystem (discord.js guides, community bots) sử dụng `ioredis` — code samples phổ biến hơn đáng kể.
- `defineCommand` cho custom Lua scripts (cooldown atomic check-and-set) ergonomics tốt hơn.
- Hoàn toàn production-ready; ioredis 5.10.1 cập nhật 12 ngày gần đây.

**Về Valkey:** Valkey là Redis fork BSD-licensed bởi Linux Foundation, perf tốt hơn 37-60% (SET/GET benchmarks trên AWS). Tuy nhiên ecosystem nhỏ hơn và Redis (AGPLv3 từ 8.0) đã add lại open-source license. **Verdict:** Valkey là viable alternative cho infrastructure layer nhưng **client code hoàn toàn tương thích** — ioredis hoạt động với cả Redis và Valkey server. Decision về server (Redis vs Valkey) là infrastructure concern, không ảnh hưởng code.

---

### i18n

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **i18next** | **26.0.4** | Full internationalization | Framework i18n mature nhất cho Node.js, pluralization, namespaces, fallbacks. |
| **i18next-fs-backend** | latest | Load translation files từ disk | Không cần HTTP backend trong bot. |

```typescript
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';

await i18next.use(Backend).init({
  fallbackLng: 'vi',
  supportedLngs: ['vi', 'en', 'zh-CN'],
  ns: ['common', 'market', 'combat', 'cultivation', 'profession'],
  defaultNS: 'common',
  backend: {
    loadPath: './locales/{{lng}}/{{ns}}.json',
  },
  interpolation: { escapeValue: false },
});

// Per-interaction resolution (user locale priority chain)
export function t(key: string, lng: string, options?: object) {
  return i18next.t(key, { lng, ...options });
}
```

**Locale resolution priority:** user override → `interaction.locale` (Discord client language) → default `'vi'`

---

### Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | **4.3.6** | Runtime schema validation | Zod v4 stable (v4.0.1+ trở lên là stable). 14× faster hơn v3, TypeScript-native, top-level format validators (`z.email()`, `z.uuid()`). |

**Zod v4 có gì mới:** `z.email()`, `z.uuid()`, `z.httpUrl()` là top-level thay vì `z.string().email()`. Import bằng `import * as z from "zod"` (Zod 4 style).

---

### Command Framework

**Recommendation: Raw discord.js interactions** — Confidence: MEDIUM

| Option | Verdict |
|--------|---------|
| Raw discord.js | More control, less magic, recommended cho complex RPG với custom middleware |
| @sapphire/framework v5.5.0 | Feature-rich, `@sapphire/plugin-i18next` tích hợp sẵn. Viable nếu team quen. |
| discord-akairo | Archived/unmaintained |
| discord.js Commando | Unmaintained |

---

### Web Server (Payment Webhook)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Fastify** | **5.8.4** | HTTP server cho payment webhook receiver | Fastest Node.js web framework, schema-based validation tích hợp sẵn, TypeScript-first. v5 là latest stable (April 2025). |

---

### Infrastructure / Deployment

| Technology | Purpose | Notes |
|------------|---------|-------|
| **Docker** | Containerization | ShardingManager container + PostgreSQL + Redis |
| **Docker Compose** | Local dev | `docker-compose.yml` cho local dev |
| **Railway / Fly.io** | Cloud hosting | Hỗ trợ persistent containers; Railway đơn giản nhất cho PostgreSQL + Redis managed |
| **PgBouncer** | Connection pooling | CRITICAL: nhiều shards × Drizzle pool → exhaust PostgreSQL max_connections. Dùng PgBouncer transaction mode. |

---

## Full Dependency List

```bash
# Production dependencies
npm install discord.js@14.26.2
npm install @discordjs/rest@2.6.1
npm install drizzle-orm@0.45.2 pg@8.20.0
npm install pg-boss@12.15.0
npm install ioredis@5.10.1
npm install i18next@26.0.4 i18next-fs-backend
npm install zod@4.3.6
npm install fastify@5.8.4                          # payment webhook service
npm install discord-hybrid-sharding@3.0.1          # future-proof, activate at ~25K guilds

# Dev dependencies
npm install -D drizzle-kit@0.31.10
npm install -D typescript@5.8.4 tsx@4.21.0
npm install -D @types/node @types/pg
```

**Node.js requirement:** **22 LTS** (v22.12.0+) — discord.js 14.26.2 docs requirement.

---

## Version Changes vs Previous Research

| Package | Previous | Current | Change |
|---------|---------|---------|--------|
| Node.js | ≥20 LTS | **≥22 LTS** | BREAKING — discord.js 14.26.2 chính thức yêu cầu 22.12.0+ |
| TypeScript | 5.x | **5.8.4** (not 6.x) | CLARIFIED — TS 6.0 có breaking changes, hold ở 5.8.x |
| discord.js | 14.26.2 | 14.26.2 | Unchanged ✓ — v15 vẫn pre-release |
| drizzle-orm | 0.45.2 | 0.45.2 | Unchanged ✓ |
| drizzle-kit | 0.31.10 | 0.31.10 | Unchanged ✓ |
| pg-boss | 12.15.0 | 12.15.0 | Unchanged ✓ |
| ioredis | 5.10.1 | 5.10.1 | Unchanged ✓ — node-redis v5 là alternative cho new projects |
| i18next | 26.0.4 | 26.0.4 | Unchanged ✓ |
| zod | 4.3.6 | **4.3.6 (v4 stable)** | CONFIRMED — v4 là stable release |
| fastify | — | **5.8.4** | ADDED — payment webhook HTTP server |
| @discordjs/rest | — | **2.6.1** | ADDED — Notification Worker needs REST-only client |

---

## Architecture Integration Notes

### High-Frequency Event Handling (Every Message / Reaction / Voice State)

Hot path: `messageCreate` → Redis cooldown check → Drizzle UPDATE tu_vi

```
Discord Gateway
  └── Shard N (discord.js 14 client, Node.js 22 Worker thread)
        ├── messageCreate handler
        │     ├── [FAST] ioredis GET cooldown:userId:guildId   (~0.3ms)
        │     ├── if hit → skip (no DB write)
        │     └── if eligible → Drizzle UPDATE characters SET tu_vi += X  (~2–5ms)
        ├── voiceStateUpdate handler
        │     └── same pattern, per-minute window
        └── interactionCreate handler
              └── slash command dispatch, deferReply() first
```

### Order Matching Engine

```typescript
// Drizzle — FOR UPDATE SKIP LOCKED (marketplace order claiming)
const [matchedOrder] = await db
  .select()
  .from(marketOrders)
  .where(and(
    eq(marketOrders.itemId, itemId),
    eq(marketOrders.type, 'SELL'),
    lte(marketOrders.price, buyerMaxPrice),
    eq(marketOrders.status, 'OPEN'),
  ))
  .orderBy(asc(marketOrders.price), asc(marketOrders.createdAt))
  .limit(1)
  .for('update', { skipLocked: true });
```

### Cross-Shard Global State

All game state in PostgreSQL — shards are stateless event routers. Zero `broadcastEval` for game data.

---

## Sharding Decision Tree

```
Bot là live và đang grow:

< 100 guilds  → 1 shard (ShardingManager, mode: 'worker')
100–2,500     → ShardingManager, totalShards: 'auto'
2,500–25,000  → REQUIRED by Discord; ShardingManager, ~3–25 shards
25,000+       → Migrate sang discord-hybrid-sharding (clusters × shards/cluster)
100,000+      → Large bot sharding (Discord partnership), shards = multiple of 16
```

---

## Version Pinning Strategy

Pin exact versions (`npm install --save-exact`). discord.js minor versions có thể break event types. Drizzle là 0.x semver (breaking changes permitted). TypeScript 5.x hold — không upgrade TS 6 cho đến khi discord.js và ecosystem confirm compatibility.

---

## Sources

| Source | Confidence | Verified |
|--------|------------|---------|
| discord.js 14.26.2 official docs | HIGH | ✓ Node.js ≥22.12.0 requirement confirmed |
| discord.js v15 guide | HIGH | ✓ Pre-release only, không recommend production |
| npm registry — all packages | HIGH | ✓ Verified 2026-04-11 |
| Node.js release schedule | HIGH | ✓ v22 Active LTS đến 2027-04-30 |
| TypeScript 6.0 breaking changes | HIGH | ✓ `strict: true` default, no ES5, needs ecosystem migration |
| oneuptime.com — node-redis vs ioredis (2026-03-31) | HIGH | ✓ Both production-ready; node-redis là official new project recommendation |
| Valkey vs Redis comparison 2025–2026 | MEDIUM | ✓ Valkey perf better, ecosystem smaller; ioredis client compatible với both |
| drizzle-orm Context7 docs | HIGH | ✓ `.for('update', { skipLocked: true })` verified |
| pg-boss Context7 docs | HIGH | ✓ `schedule()` API confirmed |
| discord-hybrid-sharding npm | HIGH | ✓ v3.0.1, battle-tested 600K guilds |
