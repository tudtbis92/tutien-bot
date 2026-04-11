# Architecture Patterns: TuTien Bot

**Domain:** Multi-shard Discord RPG bot (xianxia progression, global marketplace, event-driven)
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against discord.js official docs, discord-hybrid-sharding source, production patterns)

---

## Recommended Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Discord Gateway                             │
│         (WebSocket connections, ~1000 guilds per shard)            │
└──────────┬───────────────────────┬──────────────────┬─────────────┘
           │                       │                  │
    ┌──────▼──────┐         ┌──────▼──────┐    ┌──────▼──────┐
    │  Cluster 0  │   ...   │  Cluster N  │    │ (auto-scale)│
    │ Shards 0–1  │         │ Shards 2N–  │    │             │
    └──────┬──────┘         └──────┬──────┘    └─────────────┘
           │  activity events      │
           │  (messageCreate,      │
           │   voiceState,         │
           │   reactionAdd)        │
           └───────────┬───────────┘
                       │
              ┌────────▼────────┐
              │  BullMQ Queues  │◄──── Redis (connection pool)
              │                 │
              │ activity-events │
              │ marketplace     │
              │ scheduler       │
              │ notifications   │
              └────────┬────────┘
                       │
       ┌───────────────┼───────────────────┐
       │               │                   │
┌──────▼──────┐ ┌──────▼──────┐   ┌────────▼────────┐
│  Activity   │ │ Marketplace │   │   Scheduler     │
│  Worker(s)  │ │   Worker    │   │    Worker       │
│(horizontal) │ │ (singleton) │   │ (single/cron)   │
└──────┬──────┘ └──────┬──────┘   └────────┬────────┘
       │               │                    │
       └───────┬────────┘────────────────────┘
               │
       ┌───────▼────────────────────────┐
       │         PostgreSQL             │
       │   (single global database)     │
       └───────────────┬────────────────┘
                       │ reads (hot path)
               ┌───────▼───────┐
               │     Redis     │
               │  (cooldowns,  │
               │  VWAP cache,  │
               │  sessions)    │
               └───────────────┘

       ┌────────────────────────────────┐
       │   HTTP Service (standalone)    │
       │   Payment Webhook Receiver     │
       │   (Stripe / payment provider)  │
       └───────────────┬────────────────┘
                       │
                PostgreSQL (linhhthach_transactions)
```

---

## Component Boundaries

| Component | Responsibility | Does NOT touch | Communicates With |
|-----------|---------------|----------------|-------------------|
| **Cluster Manager** | Spawns/supervises shard clusters; forwards IPC | Business logic | Cluster processes (IPC) |
| **Shard Cluster** (N clusters) | Receives Discord Gateway events; dispatches slash command responses; sends interaction replies | DB directly for events | BullMQ (enqueue), PostgreSQL (read for slash commands), Redis (cooldown check) |
| **Activity Worker** | Dequeues activity events; awards tu vi; updates character; enforces per-user cooldowns | Discord Gateway | PostgreSQL (write), Redis (cooldown keys) |
| **Marketplace Worker** | Order submission, matching (buy ≥ sell price), VWAP recalculation, balance ledger, fee burn | Discord Gateway | PostgreSQL (ACID transactions), Redis (VWAP cache) |
| **Scheduler Worker** | Season reset, hourly VWAP cron, announcement triggers | Discord Gateway | PostgreSQL (season table), BullMQ (notification queue), Redis (cache bust) |
| **Notification Worker** | Sends DM/channel messages for async outcomes (order filled, season reset) | Business logic | Discord REST API (via @discordjs/rest, no gateway needed) |
| **Payment Webhook Receiver** | Receives external payment callbacks; credits linhhthach | All Discord | PostgreSQL (linhhthach_transactions), Redis (idempotency key) |

---

## Data Flow

### 1. Activity Event → Tu Vi Award

```
Discord Gateway
  └─ messageCreate fires on shard that owns the guild
       │
       ├─ [Shard] Guard checks:
       │     - author.bot? → drop
       │     - channel allowed? → check Redis guild config cache
       │     - user cooldown key in Redis? → drop (spam guard)
       │
       └─ Enqueue job to BullMQ `activity-events` queue:
             { userId, guildId, eventType, timestamp }
                  │
                  ▼
          [Activity Worker]
            1. Acquire Redis lock key: `cooldown:{userId}:{eventType}`
               SET NX EX 60 → if already set, discard (duplicate guard)
            2. Fetch character row from PostgreSQL: SELECT ... WHERE user_id=$1
               (upsert if first activity)
            3. Calculate tu vi delta:
               message: +base × profession_multiplier
               voice: calculated per minute via voiceState intervals
               reaction: +small_base
            4. UPDATE characters SET tu_vi = tu_vi + $delta, ...
            5. Check realm threshold → if tu vi crossed → trigger realm-up
               (enqueue notification job)
```

### 2. Slash Command → Immediate Response

```
Discord Interaction (slash command)
  └─ Arrives on the shard serving that guild
       │
       └─ [Shard] Command handler:
             1. Defer reply (3-second window)
             2. Read character/market data from PostgreSQL directly
                (slash commands are user-initiated; direct DB read is fine)
             3. Build embed response
             4. Edit deferred reply with result
```

**Rationale:** Activity events (fire-and-forget) go through BullMQ. Interactive slash commands respond directly from the shard, reading from DB. This keeps slash commands responsive while protecting DB from event storms.

### 3. Marketplace Order Flow

```
User: /market sell <item> <qty> <price>
  └─ [Shard] Validates:
        - price <= 2.5 × VWAP (read from Redis VWAP cache, fallback DB)
        - user owns item in sufficient quantity
        - price >= 1 linhhthach (min)
       Enqueue to BullMQ `marketplace` queue:
         { type: 'LIMIT_SELL', userId, itemId, qty, price, timestamp }

User: /market buy <item> <qty>            (instant buy at 1.2 × VWAP)
  └─ [Shard] Enqueue: { type: 'INSTANT_BUY', ... }

[Marketplace Worker — concurrency: 1 per queue]
  1. BEGIN TRANSACTION
  2. SELECT FOR UPDATE on order book rows (prevent race)
  3. Matching logic:
     - Find best sell order where sell_price <= buy_price
     - Execute match: transfer item, debit/credit linhhthach
     - Apply 10% seller fee → burn (subtract from supply, not credited to anyone)
     - INSERT into trades table: { item_id, price, qty, buyer_id, seller_id, matched_at }
     - DELETE / UPDATE matched orders
  4. COMMIT
  5. Enqueue notification jobs for buyer + seller
  6. If no immediate match: persist limit order to `market_orders` table
```

### 4. VWAP Recalculation

```
BullMQ Scheduler (repeatable job, every 1 hour)
  └─ [Scheduler Worker]
       1. Query PostgreSQL:
          SELECT SUM(price * qty) / SUM(qty) AS vwap
          FROM trades
          WHERE item_id = $itemId
            AND matched_at > NOW() - INTERVAL '1 hour'
          GROUP BY item_id
       2. If no trades in window → keep previous VWAP unchanged
       3. SET Redis key: `vwap:{itemId}` = { price, computed_at }
          TTL: 75 minutes (ensures valid until next recalc)
       4. UPDATE market_items SET market_price = $vwap WHERE item_id = $itemId
```

### 5. Season Reset Flow

```
BullMQ Scheduler (repeatable job, at season boundary)
  └─ [Scheduler Worker]
       1. INSERT new season row: { season_id, name, realm_names[], start_at }
       2. BEGIN TRANSACTION
          a. TRUNCATE characters_progression (or bulk UPDATE all to lv1)
          b. Preserve: items flagged as carry_over=true in inventory
          c. Preserve: linhhthach balances (paid currency - NEVER reset)
          d. INSERT season_archive snapshot of top players
       3. COMMIT
       4. Redis FLUSHDB relevant keyspaces (invalidate all character caches)
       5. Enqueue announcement jobs:
          - Fetch all guild_ids from DB (all active guilds)
          - POST to announcement channels via Discord REST
```

### 6. i18n Locale Resolution

```
Per event/interaction:
  1. Check user.locale_override in DB (user explicitly set /lang)
     → If set, use this. Highest priority.
  2. Check guild_settings.language in Redis cache (keyed by guild_id)
     → If cache miss → fetch from PostgreSQL guild_settings table → cache
  3. Fall back to message.guild.preferredLocale (Discord-native guild locale)
  4. Default: 'vi' (Vietnamese — this bot's primary audience)

Translation files: i18next JSON files bundled in the bot source.
  - /locales/vi/translation.json  (primary)
  - /locales/en/translation.json  (secondary)
  - /locales/zh/translation.json  (future)
  
All strings go through t('key', { vars }) — ZERO hardcoded strings.
```

---

## Shard Communication Strategy

### Principle: Database-First, Not Shard-to-Shard

| Problem | Wrong Approach | Correct Approach |
|---------|---------------|-----------------|
| "What is user X's tu vi?" | broadcastEval across shards | Read from PostgreSQL directly |
| "Does user X exist?" | broadcastEval | PostgreSQL upsert |
| "Global marketplace state" | Shard 0 owns it | Centralized marketplace worker + DB |
| "Total tu vi for leaderboard" | broadcastEval aggregate | PostgreSQL GROUP BY query |
| "User's cooldown expired?" | Shard-local Map | Redis key with TTL |

**broadcastEval is for Discord cache queries only** (member count, guild list, online status). Business data lives in PostgreSQL.

### What broadcastEval IS Used For

```javascript
// Example: Check if a user is currently online (Discord presence)
// This is genuinely shard-distributed data
const presences = await client.cluster.broadcastEval(
  (c, { userId }) => {
    return c.users.cache.get(userId)?.presence?.status ?? null;
  },
  { context: { userId } }
);
```

### Cluster Architecture (discord-hybrid-sharding)

```
ClusterManager (index.js)
  ├── Cluster 0 → [Shard 0, Shard 1] (handles guilds 0–1999)
  ├── Cluster 1 → [Shard 2, Shard 3] (handles guilds 2000–3999)
  └── Cluster N → [Shard 2N, Shard 2N+1]

Recommended ratios:
  - 2 internal shards per cluster process
  - ~1000 guilds per shard
  - Upgrade to 3–5 shards/cluster when memory allows
  
Rate limits: Shard rate limits are per-gateway-connection.
  - Use a REST proxy (nirn-proxy or @discordjs/rest with rate limit handling)
    so all clusters share a single rate limit window.
```

---

## Database Schema Approach

### Single Global PostgreSQL Database

All shards and workers share one database. **Never per-shard databases** — this would make global features (marketplace, characters) impossible without a data synchronization layer.

### Key Tables

```sql
-- Users (global character — same across all servers)
users (
  user_id        BIGINT PRIMARY KEY,      -- Discord user ID
  locale_override VARCHAR(10),            -- user's /lang preference
  linhhthach      BIGINT DEFAULT 0,        -- paid currency (NEVER reset)
  created_at     TIMESTAMPTZ
)

-- Characters (global progression)
characters (
  user_id        BIGINT PRIMARY KEY REFERENCES users,
  season_id      INT REFERENCES seasons,
  tu_vi          BIGINT DEFAULT 0,
  realm_level    SMALLINT DEFAULT 0,      -- index into seasons.realm_names
  profession     VARCHAR(50),
  skill_points   JSONB,                   -- { gathering: 3, crafting: 1, ... }
  updated_at     TIMESTAMPTZ
)

-- Guild settings (per-server config, cached in Redis)
guild_settings (
  guild_id       BIGINT PRIMARY KEY,      -- Discord guild ID
  language       VARCHAR(10) DEFAULT 'vi',
  announcement_channel_id BIGINT,
  active_channels BIGINT[],              -- channels where tu vi is earned
  created_at     TIMESTAMPTZ
)

-- Market orders (global order book)
market_orders (
  order_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        BIGINT REFERENCES users,
  item_id        INT REFERENCES items,
  order_type     VARCHAR(10),             -- 'LIMIT_BUY' | 'LIMIT_SELL' | 'INSTANT_*'
  qty            INT,
  price          BIGINT,                 -- in linhhthach (integer, no floats)
  status         VARCHAR(10) DEFAULT 'OPEN',  -- OPEN | FILLED | CANCELLED
  created_at     TIMESTAMPTZ
)

-- Trades (executed matches — VWAP source of truth)
trades (
  trade_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        INT REFERENCES items,
  buy_order_id   UUID,
  sell_order_id  UUID,
  buyer_id       BIGINT,
  seller_id      BIGINT,
  qty            INT,
  price          BIGINT,                 -- execution price
  fee_burned     BIGINT,                 -- 10% of price * qty
  matched_at     TIMESTAMPTZ            -- INDEX on (item_id, matched_at) for VWAP
)

-- Market items (catalog + VWAP cache)
market_items (
  item_id        INT PRIMARY KEY,
  name_key       VARCHAR(100),           -- i18n key, not raw string
  base_price     BIGINT,                 -- floor price
  market_price   BIGINT,                 -- last computed VWAP (denormalized)
  updated_at     TIMESTAMPTZ
)

-- Seasons
seasons (
  season_id      SERIAL PRIMARY KEY,
  name_key       VARCHAR(100),           -- i18n key
  realm_names    TEXT[],                 -- e.g. ['Luyện Khí','Trúc Cơ','Kim Đan',...]
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  active         BOOLEAN DEFAULT false   -- only one active at a time
)

-- Payment transactions (audit log)
linhhthach_transactions (
  tx_id          UUID PRIMARY KEY,
  user_id        BIGINT REFERENCES users,
  amount         BIGINT,
  type           VARCHAR(20),            -- 'PURCHASE' | 'SPEND' | 'FEE_BURN'
  reference_id   VARCHAR(100),           -- payment provider ref
  created_at     TIMESTAMPTZ
)
```

### Index Strategy

```sql
-- VWAP queries (hot path, runs every hour per item)
CREATE INDEX idx_trades_item_time ON trades (item_id, matched_at DESC);

-- Character lookups (activity worker hot path)
-- user_id is already PK, so covered

-- Open order matching (marketplace worker)
CREATE INDEX idx_orders_matching ON market_orders (item_id, order_type, price, status)
  WHERE status = 'OPEN';

-- Guild settings lookup (cached in Redis, but DB fallback)
-- guild_id is already PK
```

### Currency as Integer

All linhhthach amounts stored as `BIGINT` integers. No floating point. Fee calculation: `FLOOR(price * qty * 0.1)` with `MIN(1)` enforced at application level.

---

## Marketplace Engine Placement

**Decision: Centralized Marketplace Worker Process — NOT on any shard.**

### Why Not on a Shard

- Shards are stateless Discord event processors; they can restart, rebalance
- Order matching requires serialized execution (single writer) to prevent double-fills
- ACID transaction spanning order matching + balance update + trade recording cannot safely span shard restarts

### Why Not Embedded in DB (Triggers/Stored Procedures)

- PostgreSQL triggers can enforce constraints but matching logic is complex and iterative
- Debugging, versioning, and testing stored procedures is harder
- Business logic belongs in application code

### Marketplace Worker Design

```
BullMQ Queue: 'marketplace'
  - concurrency: 1  ← SINGLE WORKER, no parallel matching
  - FIFO ordering guaranteed by BullMQ
  - Durable: Redis persistence (AOF enabled)

Job types processed:
  PLACE_LIMIT_SELL   → validate, persist order, attempt match
  PLACE_LIMIT_BUY    → validate, persist order, attempt match
  INSTANT_BUY        → buy at 1.2× VWAP, deduct balance immediately
  INSTANT_SELL       → sell at 0.7× VWAP - 10% fee, credit immediately
  CANCEL_ORDER       → mark order CANCELLED, unfreeze held items

Matching algorithm (PLACE events):
  1. Find best counter-order: highest buy for sell, lowest sell for buy
     WHERE item_id = $item AND status = 'OPEN' AND price >= $price (for sells)
  2. If match found → execute in transaction
  3. Repeat until no more matches or order fully filled
```

---

## Event Processing Pipeline

### Activity Event Ingestion

```
Discord event (per shard):
  messageCreate     → { userId, guildId, channelId, type: 'MESSAGE' }
  voiceStateUpdate  → { userId, guildId, action: 'JOIN'|'LEAVE', type: 'VOICE' }
  messageReactionAdd → { userId, guildId, messageId, type: 'REACTION' }

Shard-side filtering (before enqueue — keeps queue clean):
  ✗ author.bot or system message
  ✗ channel NOT in guild_settings.active_channels (Redis cache hit)
  ✗ Redis cooldown key exists: `tuvi:cooldown:{userId}:{type}` (SET NX EX {ttl})
     MESSAGE: 60s cooldown
     REACTION: 30s cooldown
     VOICE: tracked via voiceState intervals (enter/leave timestamps)

On passing all guards → enqueue to BullMQ 'activity-events'
```

### Tu Vi Calculation

```
Activity Worker:
  MESSAGE:  tu_vi_delta = BASE_MESSAGE_REWARD × profession_bonus(profession)
  REACTION: tu_vi_delta = BASE_REACTION_REWARD
  VOICE:    tu_vi_delta = BASE_VOICE_REWARD_PER_MINUTE × minutes_in_voice
            (calculated from voiceState join/leave pairs stored in Redis)

Profession bonuses (example):
  Scholar: +20% message tu vi
  Warrior: +20% combat tu vi (PvP/PvE)
  Merchant: +10% marketplace sale proceeds
  Gatherer: +20% gathering yield

Update path:
  UPDATE characters
  SET tu_vi = tu_vi + $delta,
      updated_at = NOW()
  WHERE user_id = $userId AND season_id = $currentSeasonId
  RETURNING tu_vi, realm_level, (SELECT realm_names FROM seasons WHERE active=true) AS realm_names

  → If new tu_vi >= realm_threshold[realm_level + 1]:
    UPDATE characters SET realm_level = realm_level + 1
    Enqueue notification: 'REALM_UP'
```

### Voice State Tracking

Voice is continuous; Discord events are only JOIN/LEAVE, not per-minute ticks.

```
On voiceStateUpdate JOIN:
  Redis SET `voice:session:{userId}:{guildId}` = { joinedAt: unixTimestamp }
  TTL: 6 hours (max reasonable session)

On voiceStateUpdate LEAVE (or bot disconnect):
  GET `voice:session:{userId}:{guildId}`
  minutes = (now - joinedAt) / 60
  minutes = MIN(minutes, 60)  // cap at 60min per session (anti-afk)
  DEL `voice:session:{userId}:{guildId}`
  Enqueue activity event with calculated minutes
```

---

## i18n Architecture

### Where Translations Live

```
src/
  locales/
    vi/
      common.json      -- shared strings (errors, buttons, confirmations)
      progression.json -- realm names, tu vi, cultivation terms
      marketplace.json -- market-specific strings
      combat.json
    en/
      ... (mirror structure)
```

### Locale Resolution — 4-Level Priority Chain

```typescript
async function resolveLocale(ctx: {
  userId?: string;
  guildId?: string;
  interactionLocale?: string;
}): Promise<string> {
  // 1. User override (explicit /lang setting stored in DB)
  if (ctx.userId) {
    const override = await redis.get(`locale:user:${ctx.userId}`);
    if (override) return override;
  }
  // 2. Guild bot language (set by /settings language)
  if (ctx.guildId) {
    const guildLang = await redis.get(`locale:guild:${ctx.guildId}`);
    if (guildLang) return guildLang;
  }
  // 3. Discord's native interaction locale (slash commands only)
  if (ctx.interactionLocale) return ctx.interactionLocale;
  // 4. Default
  return 'vi';
}
```

### i18next Configuration

- Load all locale files at process startup
- Use `i18next-fs-backend` for file-based loading
- Namespace per feature area (progression, marketplace, combat)
- Interpolation variables for dynamic content: `t('realm.advance', { realm: '金丹' })`
- Season realm names stored in DB but translated via i18n key pattern: `t(`realm.${realmKey}`)`

---

## Suggested Build Order

Ordered by dependency. Each phase builds on the previous.

```
Phase 1: Foundation
  ├── PostgreSQL schema (users, characters, guild_settings, seasons)
  ├── Redis setup (connection pool, key conventions documented)
  ├── BullMQ queue setup (activity-events, marketplace, scheduler, notifications)
  ├── Cluster Manager (discord-hybrid-sharding, 1 cluster dev / auto prod)
  └── i18n scaffold (i18next, vi + en locale files, locale resolver)

Phase 2: Bot Shell + Guild Setup
  ├── Shard client skeleton (event handlers registered, command loader)
  ├── /start command (creates user + character, upsert)
  ├── Guild settings (active channels, language config via /settings)
  ├── Guild settings Redis cache (warm on bot join, invalidate on update)
  └── Health check endpoint (liveness probe for deployment)

Phase 3: Activity Event Pipeline (Core Loop)
  ├── messageCreate handler → guard → enqueue
  ├── voiceStateUpdate handler → Redis session tracking → enqueue on leave
  ├── messageReactionAdd handler → guard → enqueue
  ├── Activity Worker (tu vi delta, cooldown lock, DB update)
  ├── Realm advancement check (threshold table in config)
  └── /profile command (show character, tu vi, realm)

Phase 4: Profession + Progression System
  ├── Profession selection (/profession choose)
  ├── Skill point tree (JSONB column, skill effect multipliers)
  ├── Gathering system (resource nodes, gather command, cooldowns)
  ├── Crafting system (recipes table, /craft command)
  └── Inventory management (/inventory, item transfer)

Phase 5: Marketplace Engine
  ├── Market items catalog + base prices
  ├── Marketplace Worker (concurrency 1, FIFO)
  ├── VWAP calculation (hourly cron via Scheduler Worker)
  ├── VWAP Redis cache (read path for validation)
  ├── Limit sell order (/market sell, price cap validation)
  ├── Limit buy order (/market buy)
  ├── Instant buy/sell (/market instant-buy, /market instant-sell)
  ├── Order book view (/market book)
  └── Transaction history (/market history)

Phase 6: Combat System
  ├── PvE: dungeon/mob encounters (stat-based resolution, no real-time)
  ├── PvP: challenge system (/challenge @user), async resolution
  ├── Combat stat derivation from character (realm → base stats + profession mod)
  └── Combat rewards (tu vi, items, linhhthach)

Phase 7: Season System
  ├── Season definition table + active season management
  ├── Season reset job (Scheduler Worker, transaction-safe)
  ├── Carry-over item flags
  ├── Season leaderboard archive
  └── Season announcement (Notification Worker → guild announcement channels)

Phase 8: Monetization
  ├── HTTP Payment Webhook Receiver (isolated Express/Fastify service)
  ├── Idempotency (Redis key per payment provider ref)
  ├── linhhthach_transactions ledger
  ├── /balance command
  └── /purchase flow (Discord interaction → payment link generation)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shard-Local Business State
**What:** Storing user data, character state, or order book in process memory on a shard.
**Why bad:** Shard restarts (Discord gateway reconnects happen regularly) wipe all state. Cross-shard queries via broadcastEval are slow and unreliable for business data.
**Instead:** PostgreSQL for durable state, Redis for hot transient state (cooldowns, sessions).

### Anti-Pattern 2: Marketplace on Multiple Workers
**What:** Running multiple concurrent marketplace worker instances against the same queue.
**Why bad:** Order matching requires serialization. Two workers can both "see" the same open order and double-fill it, corrupting balances.
**Instead:** BullMQ marketplace queue with `concurrency: 1`. Single worker, sequential processing.

### Anti-Pattern 3: Floating-Point Currency
**What:** Storing linhhthach as `FLOAT` or `DECIMAL` and doing arithmetic in JavaScript.
**Why bad:** Floating-point rounding errors accumulate. Users end up with fractional currency that breaks downstream logic.
**Instead:** Store as `BIGINT` (integer linhhthach). All arithmetic in SQL with `FLOOR()` for fees.

### Anti-Pattern 4: Synchronous Event Processing on Shard
**What:** `await db.query(updateTuVi(...))` inside the `messageCreate` handler.
**Why bad:** At scale (thousands of messages/second across all guilds), this blocks the shard's event loop and delays Discord heartbeats, causing gateway disconnects.
**Instead:** Fire-and-forget enqueue to BullMQ. Shard only validates and enqueues; workers do DB writes.

### Anti-Pattern 5: VWAP Computed at Query Time on Every Request
**What:** Running the VWAP window query every time a user checks market price or places an order.
**Why bad:** Expensive query over trades table on every interaction. Bottleneck as trade volume grows.
**Instead:** Pre-computed by Scheduler Worker every hour, stored in Redis (`vwap:{itemId}`) and denormalized into `market_items.market_price`.

### Anti-Pattern 6: Season Realm Names Hardcoded
**What:** `const REALMS = ['Luyện Khí', 'Trúc Cơ', ...]` in source code.
**Why bad:** Season 2 might use a completely different realm aesthetic. Hardcoding ties game content to deployment.
**Instead:** Realm names stored in `seasons.realm_names TEXT[]`. Displayed through i18n keys or direct DB values.

### Anti-Pattern 7: i18n Strings Hardcoded in Bot Code
**What:** `interaction.reply('Bạn đã đạt cảnh giới Kim Đan!')`
**Why bad:** Impossible to add English/Chinese support without grep+replace across the entire codebase.
**Instead:** All user-facing strings through `t('progression.realm_advance', { realm })` from day one.

---

## Scalability Considerations

| Concern | At 1K guilds | At 10K guilds | At 100K guilds |
|---------|-------------|--------------|----------------|
| Sharding | 1 cluster, 1 shard | 10 shards / 5 clusters | 100 shards / 25+ clusters |
| Activity events/sec | Direct DB writes OK (< 100/s) | BullMQ queue required (< 1K/s) | BullMQ + horizontal workers |
| Marketplace | Single worker sufficient | Single worker sufficient (serialized by design) | DB read replicas for order book views |
| VWAP | Hourly cron sufficient | Hourly cron, add Redis cache TTL buffer | Consider per-5-min sampling |
| PostgreSQL | Single instance, connection pool (pg-pool, max 20) | Read replica for queries, primary for writes | PgBouncer, read replicas |
| i18n | In-process, all locales in RAM | Same | Same (translation files are small) |

---

## Sources

- discord-hybrid-sharding GitHub (HIGH confidence): https://github.com/meister03/discord-hybrid-sharding
- discord.js sharding guide (HIGH confidence): https://discordjs.guide/legacy/sharding
- Space-Node multi-server architecture (MEDIUM confidence): https://space-node.net/blog/discord-multi-server-bot-architecture-2026
- @commandkit/i18n docs (HIGH confidence): https://commandkit.dev/docs/guide/official-plugins/commandkit-i18n
- BullMQ rate limiting (HIGH confidence): https://docs.bullmq.io/guide/rate-limiting
- SkynetBot Redis IPC pattern (MEDIUM confidence): https://skynetbot.net/blog/5667a59a7431713aca0a204a/scale-your-discord-bot-understanding-sharding-performance
- discord-cross-hosting npm (MEDIUM confidence): https://www.npmjs.com/discord-cross-hosting
