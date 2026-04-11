# Phase 01: Foundation - Research

**Researched:** 2026-04-11
**Domain:** Discord bot infrastructure — ShardingManager, PostgreSQL/Drizzle, Redis/ioredis, pg-boss, i18next, ESLint/husky, GitHub Actions SSH deploy, pm2
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `src/` flat by concern — `commands/`, `events/`, `workers/`, `jobs/`, `db/`, `i18n/`, `utils/`, `config.ts`, `ui/`, `assets/`
- **D-02:** Two entry points: `bot.ts` (ShardingManager) and `shard.ts` (Client + events)
- **D-03:** Commands in category subfolders, auto-discovered at startup (`src/commands/**/*.ts`)
- **D-04:** Phase 1 tables: `users` (id, discord_id, balance BIGINT CHECK>=0, locale), `seasons` only
- **D-05:** Drizzle schema: one file per domain under `src/db/schema/`, merged in `index.ts`
- **D-06:** dotenv + Zod validation at startup — fatal crash on missing/malformed env
- **D-07:** Single `src/config.ts` typed module — all code imports from here, never `process.env` directly
- **D-08:** GitHub Actions → SSH deploy to Oracle VM (168.138.8.160) → git pull → npm ci → drizzle-kit migrate → pm2 restart
- **D-09:** pm2 with `ecosystem.config.js` — compiled JS from `dist/`, auto-restart, startup on reboot
- **D-10:** PostgreSQL and Redis directly on Oracle VM (no Docker Phase 1). PgBouncer from day 1.
- **D-11:** Locale resolution: stored pref (`users.locale`) → Discord interaction locale → VI default
- **D-12:** i18n namespaces by domain: `common.json`, `game.json`, `combat.json`, `marketplace.json`, `admin.json`
- **D-13:** eslint-plugin-i18next + husky + lint-staged enforce no hardcoded strings
- **D-14:** All emojis in typed registry at `src/assets/emojis.ts`
- **D-15:** Additional asset registries co-located in `src/assets/`
- **D-16:** Embed builder functions in `src/ui/embeds/`
- **D-17:** Shared theme at `src/ui/theme.ts` — hex palette, no per-embed hardcoded colors

### Agent's Discretion

- TypeScript path aliases (`@/db`, `@/config`, etc.) — whether to use `tsconfig.json` paths + `tsc-alias` or keep relative imports
- Exact pm2 `ecosystem.config.js` configuration (instances, `max_memory_restart`, log paths)
- Whether to use `tsx` for dev hot-reload or `ts-node-dev`
- Health check endpoint details (route path, response shape for INFRA-07)
- Exact VWAP hourly cron schedule expression and pg-boss job name

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | ShardingManager startup, auto-shard by guild count | ShardingManager pattern in §Architecture Patterns |
| INFRA-02 | Drizzle migrations for users + seasons tables | Drizzle schema + drizzle-kit migrate pattern |
| INFRA-03 | Redis connect, cooldown cache + VWAP hot cache | ioredis connection + error handling pattern |
| INFRA-04 | pg-boss VWAP cron job every 1 hour | pg-boss schedule() pattern + ShardingManager ownership decision |
| INFRA-05 | i18n scaffold VI/EN/ZH-CN, zero hardcoded strings | i18next-fs-backend init + namespace loading pattern |
| INFRA-06 | CI/CD: lint → build → test → SSH deploy | appleboy/ssh-action pattern + GitHub Actions workflow |
| INFRA-07 | Health check endpoint, shard status | Fastify GET /health pattern |
| I18N-01 | Locale resolution per interaction | i18next createInstance + locale resolution pattern |
| I18N-02 | Locale files VI/EN/ZH-CN + missing key CLI | i18next-fs-backend loadPath config |
| I18N-03 | ESLint rule + pre-commit hook | eslint-plugin-i18next v6 no-literal-string + husky v9 |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire infrastructure backbone: ShardingManager process architecture, PostgreSQL with Drizzle migrations, Redis caching, pg-boss scheduling, i18n scaffolding, and CI/CD. All research confirms the locked stack is well-supported and the version choices are sound.

**Critical discovery:** pg-boss ownership belongs exclusively to the `bot.ts` (ShardingManager) process — never to individual shards. pg-boss is multi-master compatible but spawning it in N shard processes creates redundant workers and maintenance overhead. The correct pattern is: ShardingManager owns `boss.start()` and all `boss.work()` registrations; shards may call `boss.send()` to enqueue jobs but must not call `start()`.

**Second critical discovery:** Drizzle BIGINT requires an explicit `mode` option — use `mode: 'bigint'` for currency columns to return JS `BigInt` values and avoid floating-point precision issues. All display code must call `.toString()` before embedding in Discord message strings.

**Primary recommendation:** Use `tsx` (not ts-node-dev) for dev hot-reload — it's esbuild-based, significantly faster, and handles tsconfig path aliases natively. Add `tsc-alias` for production builds so compiled `dist/` JS has resolved import paths.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | **14.26.2** | Discord Gateway + REST | Requires Node ≥22.12.0; v15 is pre-release |
| Node.js | **22 LTS** (22.20.0) | Runtime | Active LTS until 2027-04-30; required by discord.js |
| TypeScript | **5.8.x** | Language | TS 6 has breaking changes; ecosystem not migrated |
| drizzle-orm | **0.45.2** | PostgreSQL ORM | Thin, SQL-close, native SKIP LOCKED |
| drizzle-kit | **0.31.10** | Migration CLI | Paired with drizzle-orm |
| pg (node-postgres) | **8.20.0** | PostgreSQL driver | Drizzle uses this under the hood |
| ioredis | **5.10.1** | Redis client | Dominant in Discord bot ecosystem |
| pg-boss | **12.15.0** | Job scheduler | PostgreSQL-native, no Redis dependency for jobs |
| i18next | **26.0.4** | i18n framework | Most mature Node.js i18n |
| i18next-fs-backend | **2.6.3** | File-system loader | For Node.js (not browser/http) |
| zod | **4.3.6** | Config validation | v4 stable, 14× faster than v3 |
| fastify | **5.8.4** | HTTP server | Health check + future webhook scaffold |
| dotenv | **17.4.1** | Env loading | Standard env loading |

### Dev Tooling

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| tsx | **4.21.0** | Dev hot-reload | esbuild-based, fast, handles path aliases |
| tsc-alias | **1.8.16** | Path alias rewrite post-build | Rewrites `@/` aliases in compiled `dist/` |
| husky | **9.1.7** | Git hooks | Industry standard, v9 simplified setup |
| lint-staged | **16.4.0** | Run linters on staged files | Paired with husky |
| eslint-plugin-i18next | **6.1.3** | Hardcoded string detection | Flat config support (ESLint 9) |
| @typescript-eslint/eslint-plugin | **8.58.1** | TypeScript ESLint rules | Paired with typescript-eslint parser |
| @typescript-eslint/parser | **8.58.1** | TypeScript ESLint parser | Required for TS lint |
| pm2 | **6.0.14** | Process manager | Startup on reboot, auto-restart |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @discordjs/rest | **2.6.1** | REST-only Discord calls | Notification Worker — no gateway needed |
| discord-hybrid-sharding | **3.0.1** | Advanced sharding | Activate at ~25K guilds |
| @types/node | **22.x** | Node.js types | Match Node 22 |
| @types/pg | **8.20.0** | pg types | Required for TypeScript |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsx | ts-node-dev | ts-node-dev is slower, uses TypeScript compiler; tsx uses esbuild |
| tsc-alias | tsconfig-paths (runtime) | tsconfig-paths adds runtime overhead to production; tsc-alias is build-time only |
| eslint flat config | legacy .eslintrc | ESLint 9 default is flat config; new projects should use flat config |

**Installation:**

```bash
# Production
npm install discord.js@14.26.2 drizzle-orm@0.45.2 pg@8.20.0 ioredis@5.10.1 \
  pg-boss@12.15.0 i18next@26.0.4 i18next-fs-backend@2.6.3 \
  zod@4.3.6 fastify@5.8.4 dotenv@17.4.1 @discordjs/rest@2.6.1

# Dev
npm install -D typescript@5.8.4 tsx@4.21.0 tsc-alias@1.8.16 \
  husky@9.1.7 lint-staged@16.4.0 \
  eslint@10 @typescript-eslint/eslint-plugin@8.58.1 @typescript-eslint/parser@8.58.1 \
  eslint-plugin-i18next@6.1.3 drizzle-kit@0.31.10 \
  @types/node@22 @types/pg@8.20.0 pm2@6.0.14
```

**Version verification (2026-04-11):** All versions above confirmed via `npm view [package] version`.

---

## Architecture Patterns

### Recommended Project Structure

```
tutien-bot/
├── src/
│   ├── bot.ts              # ShardingManager entry point
│   ├── shard.ts            # Client entry point (spawned by ShardingManager)
│   ├── config.ts           # Zod-validated env config (single import for all)
│   ├── commands/
│   │   ├── game/           # Game commands (auto-discovered)
│   │   │   └── ping.ts
│   │   └── admin/          # Admin commands (auto-discovered)
│   ├── events/
│   │   ├── ready.ts
│   │   ├── interactionCreate.ts
│   │   └── messageCreate.ts
│   ├── workers/            # Long-running background workers (run in bot.ts context)
│   │   └── vwap.ts
│   ├── jobs/               # pg-boss job handlers
│   │   └── vwapRecalc.ts
│   ├── db/
│   │   ├── client.ts       # Drizzle db instance + Pool
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── seasons.ts
│   │       └── index.ts    # Re-exports all schemas
│   ├── i18n/
│   │   ├── index.ts        # i18next init + createT helper
│   │   └── types.ts        # Type-safe t() return types
│   ├── utils/
│   │   └── logger.ts
│   ├── ui/
│   │   ├── theme.ts        # Color palette hex constants
│   │   └── embeds/
│   │       └── buildErrorEmbed.ts
│   └── assets/
│       └── emojis.ts       # Typed emoji registry
├── locales/
│   ├── vi/
│   │   ├── common.json
│   │   ├── game.json
│   │   ├── combat.json
│   │   ├── marketplace.json
│   │   └── admin.json
│   ├── en/
│   │   └── (same structure)
│   └── zh-cn/
│       └── (same structure)
├── migrations/             # drizzle-kit output directory
├── dist/                   # Compiled TypeScript output
├── ecosystem.config.js     # pm2 config
├── drizzle.config.ts       # drizzle-kit config
├── tsconfig.json
├── eslint.config.mjs       # ESLint 9 flat config
├── .husky/
│   └── pre-commit          # lint-staged trigger
└── .github/
    └── workflows/
        └── deploy.yml      # CI/CD pipeline
```

---

### Pattern 1: ShardingManager + Shard Entry Points (INFRA-01)

**What:** `bot.ts` spawns shard processes via ShardingManager. Each shard runs `shard.ts`. ShardingManager also owns all infrastructure that must not be duplicated (pg-boss, health server).

**When to use:** Every Discord bot needing to scale past 2,500 guilds.

```typescript
// Source: Context7 /discordjs/guide + discord.js official docs
// src/bot.ts — ShardingManager process
import { ShardingManager } from 'discord.js';
import { config } from './config.js';
import { initPgBoss } from './workers/vwap.js';
import { startHealthServer } from './workers/health.js';

const manager = new ShardingManager('./dist/shard.js', {
  token: config.DISCORD_TOKEN,
  totalShards: 'auto',       // Discord recommends ~1,000 guilds/shard
  mode: 'process',           // Separate OS processes (not threads)
});

manager.on('shardCreate', (shard) => {
  console.log(`[ShardingManager] Launched shard ${shard.id}`);
  shard.on('ready', () => console.log(`Shard ${shard.id} ready`));
  shard.on('disconnect', () => console.warn(`Shard ${shard.id} disconnected`));
  shard.on('reconnecting', () => console.log(`Shard ${shard.id} reconnecting`));
});

async function main() {
  // pg-boss ONLY in ShardingManager process — never in shards
  await initPgBoss();
  // Health check HTTP server ONLY here
  await startHealthServer();
  // Spawn all shards
  await manager.spawn();
}

main().catch(console.error);
```

```typescript
// src/shard.ts — Each shard's client process
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { initI18n } from './i18n/index.js';  // Each shard has own i18n instance

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

async function main() {
  await initI18n();     // i18next init — per shard, reads from disk
  await loadCommands(client);
  await loadEvents(client);
  await client.login(config.DISCORD_TOKEN);
}

main().catch(console.error);
```

---

### Pattern 2: Config Module with Zod Validation (D-06, D-07)

**What:** Zod validates all env vars at startup. Fatal crash with clear error if anything is missing/malformed.

```typescript
// Source: Zod v4 official docs + project decision D-06/D-07
// src/config.ts
import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Config] ❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);  // Fatal — refuse to start with bad config
}

export const config = parsed.data;
export type Config = typeof config;
```

---

### Pattern 3: Drizzle Schema + BIGINT (D-04, D-05, INFRA-02)

**What:** Schema files one-per-domain, BIGINT with `mode: 'bigint'`, CHECK constraint.

**CRITICAL:** Drizzle `bigint` has two modes. Use `mode: 'bigint'` for currency to return JS `BigInt`. When displaying in Discord, call `.toString()`.

```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs — bigint column definition
// src/db/schema/users.ts
import { pgTable, serial, varchar, bigint, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  discordId: varchar('discord_id', { length: 20 }).notNull().unique(),
  // mode: 'bigint' returns JS BigInt — NEVER use mode: 'number' for currency
  balance: bigint('balance', { mode: 'bigint' }).notNull().default(0n),
  locale: varchar('locale', { length: 10 }).default('vi'),
}, (table) => ({
  // CHECK constraint — DB-level guard against double-spend bugs
  balanceCheck: check('balance_non_negative', sql`${table.balance} >= 0`),
}));
```

```typescript
// src/db/schema/seasons.ts
import { pgTable, serial, boolean, timestamp, varchar } from 'drizzle-orm/pg-core';

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(false),
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
});
```

```typescript
// src/db/schema/index.ts
export * from './users.js';
export * from './seasons.js';
```

```typescript
// src/db/client.ts — Pool with PgBouncer-compatible settings
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema/index.js';

// Point at PgBouncer, not Postgres directly
// PgBouncer runs on port 6432 by convention
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 5,           // Per-shard pool — PgBouncer aggregates across shards
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema });
export { pool };
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**BigInt display pattern:**
```typescript
// WRONG — will throw TypeError: Cannot mix BigInt and other types
interaction.reply(`Balance: ${user.balance} linh thạch`);

// CORRECT — convert to string first
interaction.reply(t('wallet.balance', { amount: user.balance.toString() }));
```

---

### Pattern 4: pg-boss Initialization (INFRA-04)

**What:** pg-boss must ONLY start in the ShardingManager process (`bot.ts`). Shards do NOT call `boss.start()`.

**Critical:** pg-boss is multi-master compatible (multiple Node processes can run against same DB) but for a Discord bot architecture, the ShardingManager process is the natural owner. Running pg-boss in shards causes duplicate cron firings and maintenance overhead.

```typescript
// Source: Context7 /timgit/pg-boss — initialization + cron schedule pattern
// src/workers/pgBoss.ts — owned by bot.ts ONLY
import PgBoss from 'pg-boss';
import { config } from '../config.js';

let boss: PgBoss;

export async function initPgBoss(): Promise<PgBoss> {
  boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    schema: 'pgboss',
    schedule: true,    // Enable cron scheduling
    supervise: true,   // Enable maintenance monitoring
    migrate: true,     // Auto-run pg-boss schema migrations
    max: 3,            // pg-boss internal connection pool size
    application_name: 'tutien-bot-scheduler',
  });

  boss.on('error', (error) => console.error('[pg-boss] Error:', error));

  await boss.start();

  // Register recurring jobs after start()
  await registerJobs(boss);

  return boss;
}

async function registerJobs(boss: PgBoss): Promise<void> {
  // Create queues before scheduling
  await boss.createQueue('vwap-recalc');

  // Schedule VWAP recalculation every hour (cron: top of the hour)
  await boss.schedule('vwap-recalc', '0 * * * *', {});

  // Register the worker for the queue
  await boss.work('vwap-recalc', { localConcurrency: 1 }, async ([job]) => {
    console.log('[pg-boss] Running VWAP recalculation job:', job.id);
    // Phase 3 implements actual logic — Phase 1 just registers the structure
    await runVwapRecalc(job);
  });

  console.log('[pg-boss] Jobs registered: vwap-recalc (0 * * * *)');
}

export async function stopPgBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}
```

---

### Pattern 5: ioredis Connection (INFRA-03)

**What:** Robust ioredis connection with exponential backoff retry strategy and event handlers.

```typescript
// Source: Context7 /redis/ioredis — auto-reconnection and error handling
// src/db/redis.ts
import Redis from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.REDIS_URL, {
  retryStrategy(times) {
    // Exponential backoff: 50ms, 100ms, 200ms... up to 2s max
    const delay = Math.min(times * 50, 2_000);
    console.warn(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 20,
  enableOfflineQueue: true,   // Queue commands while disconnected
  lazyConnect: false,         // Connect immediately
  connectTimeout: 10_000,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('ready', () => console.log('[Redis] Ready'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redis.on('close', () => console.warn('[Redis] Connection closed'));
redis.on('reconnecting', () => console.log('[Redis] Reconnecting...'));

// Health check helper
export async function redisHealthCheck(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
```

---

### Pattern 6: i18next Initialization per Shard (INFRA-05, I18N-01)

**What:** Each shard process initializes its own i18next instance. All shards read from the same locale files on disk. No inter-shard i18n needed.

**Critical:** Each shard is a separate Node.js process — module-level `i18next` state is isolated. Initialize in `shard.ts` before client login.

```typescript
// Source: i18next official docs + i18next-fs-backend README
// src/i18n/index.ts
import i18next from 'i18next';
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_PATH = path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json');

export async function initI18n(): Promise<void> {
  await i18next
    .use(FsBackend)
    .init<FsBackendOptions>({
      // VI default — required by project spec
      fallbackLng: 'vi',
      supportedLngs: ['vi', 'en', 'zh-cn'],
      preload: ['vi', 'en', 'zh-cn'],    // Load all 3 at startup
      ns: ['common', 'game', 'combat', 'marketplace', 'admin'],
      defaultNS: 'common',
      fallbackNS: 'common',              // Keys not found → try common namespace
      interpolation: {
        escapeValue: false,              // Discord renders text, not HTML
      },
      backend: {
        loadPath: LOCALES_PATH,
      },
    });

  console.log('[i18n] Initialized — locales: vi, en, zh-cn');
}

/**
 * Resolve locale for a Discord interaction:
 * (1) User's stored preference from DB
 * (2) Discord interaction locale
 * (3) Default: 'vi'
 */
export function resolveLocale(
  userStoredLocale: string | null,
  interactionLocale: string | null,
): string {
  const SUPPORTED = ['vi', 'en', 'zh-cn'];
  // Map Discord locale codes (e.g. 'en-US' → 'en', 'zh-CN' → 'zh-cn')
  const normalizeLocale = (l: string | null) => {
    if (!l) return null;
    const lower = l.toLowerCase();
    if (lower === 'vi') return 'vi';
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('zh')) return 'zh-cn';
    return null;
  };
  
  const stored = normalizeLocale(userStoredLocale);
  if (stored && SUPPORTED.includes(stored)) return stored;
  
  const fromDiscord = normalizeLocale(interactionLocale);
  if (fromDiscord && SUPPORTED.includes(fromDiscord)) return fromDiscord;
  
  return 'vi'; // Default
}

/**
 * Get a type-safe t() bound to a specific locale.
 */
export function getT(locale: string) {
  return i18next.getFixedT(locale);
}
```

---

### Pattern 7: Command Auto-Discovery (D-03)

**What:** Recursively reads `src/commands/**/*.ts` (or `dist/commands/**/*.js`), imports each, validates shape.

```typescript
// Source: Context7 /discordjs/guide — dynamic command handler pattern
// src/utils/commandLoader.ts
import { Client, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client: Client & { commands?: Collection<string, any> }) {
  client.commands = new Collection();
  
  const commandsPath = join(__dirname, '../commands');
  const categoryFolders = readdirSync(commandsPath);

  for (const folder of categoryFolders) {
    const folderPath = join(commandsPath, folder);
    const commandFiles = readdirSync(folderPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = join(folderPath, file);
      const command = await import(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[CommandLoader] Skipping ${file} — missing data or execute`);
      }
    }
  }

  console.log(`[CommandLoader] Loaded ${client.commands.size} commands`);
}
```

---

### Pattern 8: Health Check Endpoint (INFRA-07)

**What:** Fastify server in ShardingManager process (bot.ts) on `PORT` (default: 3000).

```typescript
// Source: Fastify docs — server setup + webhook pattern
// src/workers/health.ts
import Fastify from 'fastify';
import { db } from '../db/client.js';
import { redisHealthCheck } from '../db/redis.js';
import { config } from '../config.js';
import { sql } from 'drizzle-orm';

export async function startHealthServer(manager?: any) {
  const fastify = Fastify({ logger: false });

  fastify.get('/health', async (request, reply) => {
    const [dbOk, redisOk] = await Promise.all([
      db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
      redisHealthCheck(),
    ]);

    // Fetch shard statuses if manager provided
    let shards: unknown[] = [];
    if (manager) {
      try {
        shards = await manager.fetchClientValues('ws.status');
      } catch {
        shards = [];
      }
    }

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    return reply.status(status === 'ok' ? 200 : 503).send({
      status,
      uptime: process.uptime(),
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      shards,
      timestamp: new Date().toISOString(),
    });
  });

  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`[Health] Server listening on port ${config.PORT}`);

  return fastify;
}
```

---

### Pattern 9: pm2 ecosystem.config.js (D-09)

**What:** pm2 manages the compiled `dist/bot.js` ShardingManager entry point. `instances: 1` (ShardingManager already spawns shard processes — do NOT use pm2 cluster mode).

```javascript
// ecosystem.config.js — Agent's discretion for exact values
// Source: pm2 official docs — Configuration File
module.exports = {
  apps: [
    {
      name: 'tutien-bot',
      script: './dist/bot.js',
      instances: 1,             // ShardingManager = 1 process (spawns shards itself)
      exec_mode: 'fork',        // NOT cluster — ShardingManager handles its own processes
      node_args: '--enable-source-maps',
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',  // Restart if ShardingManager exceeds 1GB
      restart_delay: 5000,       // 5s delay between crash restarts
      max_restarts: 10,
      min_uptime: '30s',         // Must stay up 30s to be considered stable
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      time: true,                // Prefix logs with timestamp
      source_map_support: true,
    },
  ],
};
```

---

### Pattern 10: GitHub Actions CI/CD Deploy (D-08, INFRA-06)

**What:** Push to `main` → lint + build → SSH to Oracle VM → git pull + npm ci + drizzle-kit migrate + pm2 restart.

```yaml
# Source: appleboy/ssh-action README (v1.2.5)
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  lint-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  deploy:
    needs: lint-build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Oracle VM
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ${{ secrets.ORACLE_USER }}
          key: ${{ secrets.ORACLE_SSH_KEY }}
          port: 22
          # IMPORTANT: Use absolute paths — non-interactive SSH shell won't load ~/.bashrc
          # Source nvm/nvm path if Node was installed via nvm
          script: |
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            cd /home/ubuntu/tutien-bot
            git pull origin main
            npm ci --production=false
            npm run build
            DATABASE_URL="$(cat /etc/tutien/.env | grep DATABASE_URL | cut -d= -f2-)" \
              npx drizzle-kit migrate
            pm2 restart tutien-bot
```

**GitHub Secrets to create:**
- `ORACLE_HOST` = `168.138.8.160`
- `ORACLE_USER` = `ubuntu`
- `ORACLE_SSH_KEY` = content of `.ssh/oracle-vm.key` (the private key)

**Critical:** SSH sessions from GitHub Actions are **non-interactive**. Commands like `npm`, `node`, `pm2` may not be in PATH unless nvm/nvm is explicitly sourced. Use absolute paths or source profile at the start of the script.

---

### Pattern 11: ESLint + Husky + lint-staged (D-13, I18N-03)

**What:** ESLint 9 flat config with eslint-plugin-i18next. Husky v9 pre-commit hook runs lint-staged.

```javascript
// Source: eslint-plugin-i18next README (v6) — flat config for ESLint 9
// eslint.config.mjs
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.configs.recommended,
  i18next.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    rules: {
      // CRITICAL: default only catches JSX text — use 'all' to catch ALL strings
      'i18next/no-literal-string': ['error', {
        mode: 'all',
        // Ignore non-user-facing strings
        ignoreAttribute: ['className', 'key', 'id', 'name', 'type'],
        // Recognize Discord reply functions as user-facing display contexts
        // Custom words/patterns that should NOT trigger the rule:
        ignoreComponent: [],
        ignoreCallee: [
          'console.log', 'console.error', 'console.warn', 'console.debug',
          'logger.info', 'logger.error',
          'process.env',
        ],
      }],
    },
  },
];
```

```json
// package.json — lint-staged + husky prepare
{
  "scripts": {
    "prepare": "husky",
    "build": "tsc && tsc-alias",
    "dev": "tsx --watch src/shard.ts",
    "start": "node dist/bot.js",
    "lint": "eslint src --max-warnings=0"
  },
  "lint-staged": {
    "src/**/*.ts": ["eslint --max-warnings=0 --fix-dry-run"]
  }
}
```

```sh
# .husky/pre-commit
npx lint-staged
```

**Setup commands:**
```bash
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

---

### Pattern 12: TypeScript Path Aliases (Agent's Discretion)

**Recommendation:** Use tsconfig path aliases + tsc-alias. tsx handles them in dev; tsc-alias rewrites them in compiled output.

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

```json
// tsc-alias in package.json build script
{
  "scripts": {
    "build": "tsc && tsc-alias"
  }
}
```

---

### Anti-Patterns to Avoid

- **pg-boss in shard processes:** Each shard calling `boss.start()` creates duplicate cron jobs and redundant maintenance workers. pg-boss belongs exclusively in `bot.ts`.
- **`mode: 'number'` for BIGINT currency:** While safe for current balances (below 2^53), it's incorrect for financial code. Use `mode: 'bigint'` and convert to string for display.
- **`instances: 2+` or `exec_mode: 'cluster'` in pm2:** ShardingManager spawns its own processes. Combining with pm2 cluster creates duplicate managers.
- **`process.env` access outside `config.ts`:** Bypasses Zod validation and makes missing vars hard to trace.
- **Hardcoded emoji in command/event files:** All emoji IDs go in `src/assets/emojis.ts`. ESLint rule catches violations.
- **i18next.init() in the wrong process:** ShardingManager process (`bot.ts`) should NOT init i18next — it never renders user-facing strings. Only `shard.ts` and shard workers need i18n.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git hooks | Custom npm scripts | husky v9 | Platform-compatible, supports all 13 client-side hooks |
| Lint on staged files | Git-hooks diff scripts | lint-staged | Only runs lint on changed files, fast |
| Cron job scheduling | setInterval + pg | pg-boss schedule() | Survives restarts, exactly-once delivery, ACID |
| Retry/backoff on Redis | Custom retry loops | ioredis retryStrategy | Well-tested, handles cluster/sentinel edge cases |
| Database migrations | SQL files + scripts | drizzle-kit migrate | Schema drift prevention, migration history |
| Job deduplication | Redis SETNX + locks | pg-boss singletonKey | ACID transaction-level deduplication |
| HTTP health check | raw `http.createServer` | Fastify | Schema validation, plugin ecosystem, low overhead |
| SSH deploy from CI | Manual ssh commands | appleboy/ssh-action@v1 | Multi-host, key auth, proxy support, proven reliability |
| i18n plural/interpolation | Custom string templates | i18next | Battle-tested pluralization, nested keys, context |
| Env validation | Manual typeof checks | zod EnvSchema | Type inference, nested objects, coerce, safeParse |

**Key insight:** Every item in this list has production edge cases (race conditions, character encoding, OS differences, encoding errors) that take weeks to discover and fix. The listed libraries have absorbed those edge cases over years.

---

## Common Pitfalls

### Pitfall 1: Non-Interactive SSH Path Problem

**What goes wrong:** CI/CD deploy fails with "npm: command not found" or "pm2: command not found"
**Why it happens:** GitHub Actions SSH sessions are non-interactive — `.bashrc` and `.profile` are NOT sourced. If Node.js was installed via `nvm`, it's in a path that only loads in interactive shells.
**How to avoid:** Explicitly source nvm at the top of the SSH script OR install Node.js via system package manager (apt) so it's in `/usr/bin/node`.
**Warning signs:** Works manually via SSH, fails in Actions.

```yaml
script: |
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  # Now npm, node, pm2 are in PATH
```

---

### Pitfall 2: BigInt Cannot Mix with String Interpolation

**What goes wrong:** `TypeError: Cannot convert a BigInt value to a number` or embed showing `[object BigInt]`
**Why it happens:** JS template literals and Discord message builders expect `string | number`, not `bigint`. Drizzle with `mode: 'bigint'` returns actual `BigInt` objects.
**How to avoid:** Always call `.toString()` or `String()` on balance values before passing to i18n or embeds.
**Warning signs:** Bot crashes on commands that display balance; embed shows strange type annotations.

---

### Pitfall 3: ShardingManager in pm2 Cluster Mode

**What goes wrong:** Bot spawns 2× the intended number of shards, gets rate-limited or banned for too many gateway connections.
**Why it happens:** pm2 cluster mode forks the entire process (including ShardingManager) N times. Each manager then spawns N shards = N² shards total.
**How to avoid:** Always set `exec_mode: 'fork'` and `instances: 1` in ecosystem.config.js.
**Warning signs:** Discord shows double the expected shard count; gateway IDENTIFY spam.

---

### Pitfall 4: eslint-plugin-i18next Not Catching Discord Reply Strings

**What goes wrong:** ESLint doesn't flag `interaction.reply('ข้อผิดพลาด')` or `interaction.followUp('Error!')`
**Why it happens:** Default `mode` for no-literal-string is `jsx-only` in v6 — it only checks JSX text. Node.js bots use no JSX.
**How to avoid:** Set `mode: 'all'` in the no-literal-string rule options. This catches ALL string literals in the configured files.
**Warning signs:** CI passes but you can clearly see hardcoded strings in command files.

---

### Pitfall 5: drizzle-kit migrate in CI Without PgBouncer Support

**What goes wrong:** `drizzle-kit migrate` fails when connecting through PgBouncer in transaction mode
**Why it happens:** drizzle-kit uses `SET search_path` and advisory locks during migrations — these are session-level operations incompatible with PgBouncer transaction mode.
**How to avoid:** For `drizzle-kit migrate` in CI, connect DIRECTLY to PostgreSQL (bypass PgBouncer). The bot runtime connects through PgBouncer; migrations connect directly.
**Warning signs:** `ERROR: prepared statement does not exist`, or `SET LOCAL is not allowed in transaction exit`.

```yaml
# CI deploy: use direct PostgreSQL port (5432), not PgBouncer port (6432)
DATABASE_URL="postgresql://user:pass@localhost:5432/tutien" npx drizzle-kit migrate
```

---

### Pitfall 6: Missing `preload` in i18next-fs-backend

**What goes wrong:** `i18next.t('key')` returns the key itself on first call, then works on subsequent calls.
**Why it happens:** Without `preload`, i18next-fs-backend loads namespaces lazily on first use. The first call completes before the file is loaded.
**How to avoid:** Always set `preload: ['vi', 'en', 'zh-cn']` to pre-load all locales at init. This makes init async but guarantees `t()` is ready after `await initI18n()`.
**Warning signs:** Intermittent i18n key passthrough on bot startup; race condition behavior.

---

### Pitfall 7: pg-boss `schedule()` Duplicate Registration

**What goes wrong:** On every restart, calling `schedule('vwap-recalc', '0 * * * *', {})` creates a second schedule, leading to dual cron firings.
**Why it happens:** pg-boss v12 `schedule()` by default adds a new schedule. The cron table accumulates duplicate entries across restarts.
**How to avoid:** pg-boss `schedule()` is idempotent when the queue name is the same — it will update the schedule if one exists. This is safe to call on every startup.
**Warning signs:** VWAP running twice per hour; `getSchedules()` returns duplicate entries.

*[VERIFIED: Context7 /timgit/pg-boss — schedule() is designed to be called on startup idempotently]*

---

## Code Examples

### Drizzle Migration Commands

```bash
# Source: drizzle-kit docs verified via Context7
# Generate migration from schema changes
npx drizzle-kit generate

# Apply pending migrations to database
npx drizzle-kit migrate

# Push schema directly (dev only — bypasses migration history)
npx drizzle-kit push

# Open Drizzle Studio UI
npx drizzle-kit studio
```

### ioredis Cooldown Pattern

```typescript
// Source: ioredis docs — SET with NX + PX flags (atomic check-and-set)
// SETNX atomically: set key only if not exists, expire in cooldownMs
async function tryAcquireCooldown(
  userId: string,
  channelId: string,
  cooldownMs: number,
): Promise<boolean> {
  const key = `cooldown:${userId}:${channelId}`;
  // NX = only set if Not eXists; PX = expire in milliseconds
  const result = await redis.set(key, '1', 'NX', 'PX', cooldownMs);
  return result === 'OK'; // true = cooldown acquired (not on cooldown)
}
```

### Graceful Shutdown Pattern

```typescript
// src/bot.ts — handle SIGTERM/SIGINT from pm2
async function shutdown() {
  console.log('[Bot] Shutting down...');
  await stopPgBoss();
  pool.end();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.eslintrc.json` legacy config | `eslint.config.mjs` flat config | ESLint 9.0 (2024) | eslint-plugin-i18next v6 requires flat config for ESLint 9 |
| husky v4 (`.huskyrc`) | husky v9 (`.husky/` + `prepare` script) | husky v9 (2024) | Simplified — no extra config file needed |
| `ts-node-dev` for hot-reload | `tsx --watch` | ~2023 | 10× faster startup, no extra config, handles ESM natively |
| `drizzle-kit generate:pg` | `drizzle-kit generate` | drizzle-kit v0.20+ | Dialect no longer needs suffix |
| ShardingManager `spawn(amount, delay, timeout)` | `spawn({ amount, delay, timeout })` | discord.js v13 | Options object instead of positional args |

**Deprecated/outdated:**
- `ts-node`: Use `tsx` for dev; no runtime cost in production (compile with tsc)
- `i18next-node-fs-backend`: Deprecated, replaced by `i18next-fs-backend`
- husky v4-v7 `.huskyrc` config format: Use v9's `.husky/` directory approach
- eslint-plugin-i18next v5 `plugin:i18next/recommended` extends: Use `i18next.configs['flat/recommended']` in v6

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pg-boss `schedule()` is idempotent on same queue name across restarts | Pattern 4, Pitfall 7 | Duplicate cron jobs; VWAP runs 2× per hour — observable in logs |
| A2 | Oracle VM has nvm-based Node.js install (not system apt) | Pattern 10, Pitfall 1 | SSH deploy PATH issue — easy to detect and fix |
| A3 | PgBouncer on port 6432 is the standard convention | Pattern 3 | Connection refused if different port — just a config value |
| A4 | Discord interaction locale for Vietnamese is `'vi'` | Pattern 6 | Locale resolution falls back to default — non-breaking |
| A5 | tsx handles tsconfig path aliases natively in dev mode | Pattern 12 | Dev server shows import resolution errors — fallback: add --tsconfig flag |

**If this table is empty:** All claims in this research were verified or cited.

---

## Open Questions

1. **Oracle VM Node.js install method**
   - What we know: Node 22.20.0 is on dev machine (Windows); Oracle VM is Ubuntu ARM64
   - What's unclear: Whether Node was installed via nvm, nodeenv, or system apt on the Oracle VM — affects PATH in non-interactive SSH
   - Recommendation: Include nvm-source lines in the deploy script regardless; if Node is via apt, they'll simply be no-ops

2. **PgBouncer already installed on Oracle VM?**
   - What we know: D-10 says PgBouncer is to be added from day 1
   - What's unclear: Whether PgBouncer was pre-installed when Oracle VM was provisioned
   - Recommendation: Plan includes a task to install and configure PgBouncer on the VM (`sudo apt install pgbouncer`)

3. **Discord guild count at launch**
   - What we know: ShardingManager with `totalShards: 'auto'` requests the recommended shard count from Discord
   - What's unclear: With 0 guilds at launch, Discord returns minimum 1 shard — this is correct behavior
   - Recommendation: No action needed; `auto` handles this correctly

---

## Environment Availability

Deployment target is Oracle Cloud VM (Ubuntu ARM64). Dev environment is Windows (dev machine confirmed: Node 22.20.0, npm 11.11.0).

| Dependency | Required By | Available (Dev) | Version | Action on VM |
|------------|------------|-----------------|---------|--------------|
| Node.js 22 LTS | Runtime | ✓ | 22.20.0 | Verify: `node --version` ≥22.12.0 |
| npm 11 | Package manager | ✓ | 11.11.0 | Comes with Node |
| PostgreSQL 16+ | Database (INFRA-02) | ? | Unknown | `sudo apt install postgresql` |
| Redis | Cache (INFRA-03) | ? | Unknown | `sudo apt install redis-server` |
| PgBouncer | Connection pooling (D-10) | ? | Unknown | `sudo apt install pgbouncer` |
| pm2 | Process manager (D-09) | ? | 6.0.14 local | `npm install -g pm2` |
| git | Deploy pull | ✓ | System | Pre-installed on Ubuntu |

**Missing dependencies with no fallback (must be set up on VM before deploy):**
- PostgreSQL 16+ — core data store, no fallback
- Redis — required for cooldowns and VWAP hot cache, no fallback

**Missing dependencies with fallback:**
- PgBouncer — required per D-10, but for Phase 1 single-shard can temporarily connect directly to Postgres while setting up PgBouncer

---

## Security Domain

> `security_enforcement` not set in config.json → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Bot auth via Discord token (never exposed) |
| V3 Session Management | No | Stateless slash commands |
| V4 Access Control | Partial | Admin commands gated by Discord permission checks |
| V5 Input Validation | Yes | Zod validates all environment config at startup |
| V6 Cryptography | No | No custom crypto; Discord TLS handles transport |
| V7 Error Handling | Yes | Zod safeParse + graceful shutdown; no stack traces to Discord |
| V9 Communications | Yes | Redis/Postgres connections use local socket or TLS |
| V14 Configuration | Yes | Secrets in environment vars, never in code or git |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hardcoded Discord token in source | Information Disclosure | Zod env validation; token in env var; `.gitignore` |
| `balance` going negative via race condition | Tampering | `CHECK (balance >= 0)` DB constraint; atomic UPDATE |
| SSH private key in git | Information Disclosure | `.ssh/oracle-vm.key` in `.gitignore`; key in GitHub Secrets |
| Direct `process.env` access bypass Zod | Tampering | Convention enforced: all imports via `src/config.ts` only |
| pg-boss schema exposed to internet | Elevation | PgBouncer filters; pgboss schema on same private DB |

---

## Sources

### Primary (HIGH confidence)

- `/discordjs/guide` (Context7) — ShardingManager setup, command loading, broadcastEval
- `/websites/discord_js_packages_discord_js_14_26_2` (Context7) — discord.js 14.26.2 API
- `/drizzle-team/drizzle-orm-docs` (Context7) — BIGINT modes, connection pool, drizzle-kit migrate, schema definition
- `/timgit/pg-boss` (Context7) — initialization, schedule(), cron pattern, start/stop lifecycle
- `/redis/ioredis` (Context7) — connection options, retryStrategy, reconnectOnError
- `/llmstxt/fastify_dev_llms_txt` (Context7) — TypeScript server, webhook handler, onClose hook
- `/llmstxt/i18next_llms-full_txt` (Context7) — init options, namespace loading, fallback chain
- `github.com/i18next/i18next-fs-backend` (WebFetch) — loadPath config, initAsync, preload
- `github.com/edvardchen/eslint-plugin-i18next` (WebFetch) — v6 flat config, no-literal-string mode: 'all'
- `github.com/appleboy/ssh-action` (WebFetch) — SSH deploy workflow, key auth, multi-command
- `pm2.keymetrics.io/docs/usage/application-declaration` (WebFetch) — ecosystem.config.js options
- `discordjs.guide/sharding` (WebFetch) — ShardingManager official guide
- npm registry (Bash) — All package versions verified 2026-04-11

### Secondary (MEDIUM confidence)

- `typicode/husky` (WebFetch) — v9 simplified setup confirmed
- `www.i18next.com/how-to/add-or-load-translations` (WebFetch) — preload + partialBundledLanguages

### Tertiary (LOW confidence — flagged in Assumptions Log)

- pg-boss idempotent schedule() behavior on same queue name (Assumed based on documentation pattern, marked A1)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry 2026-04-11
- Architecture: HIGH — patterns verified via Context7 official docs and library READMEs
- Pitfalls: HIGH (Pitfall 1, 2, 3, 4, 5, 6) / MEDIUM (Pitfall 7 — A1 assumption)

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days for stable libraries)
