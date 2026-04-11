# Phase 01: Foundation — Plan

**Phase Goal:** Establish the complete infrastructure backbone — ShardingManager, PostgreSQL/Drizzle, Redis, pg-boss, i18n, CI/CD, health check — so the bot is deployable, runnable, and passes CI before any game logic is added.

**Prerequisites:**
- Oracle Cloud VM accessible at `168.138.8.160` via SSH (ubuntu user, key-based auth)
- GitHub repository exists with secrets: `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`
- Discord application created at discord.com/developers; bot token generated
- Node.js 22 LTS available on dev machine (`node --version` ≥ 22.12.0)

**Success Criteria:**

| # | Criterion | Maps To |
|---|-----------|---------|
| SC-01 | `npm start` launches ShardingManager; bot appears online in Discord with zero shard crash loops | INFRA-01 |
| SC-02 | `npx drizzle-kit migrate` completes from zero; `users` and `seasons` tables present | INFRA-02 |
| SC-03 | Redis health check passes; cooldown key set and retrieved from running bot | INFRA-03 |
| SC-04 | pg-boss `pgboss.schedule` table contains `vwap-recalc` with `0 * * * *` cron | INFRA-04 |
| SC-05 | All locale files loaded; zero hardcoded user-facing strings in `src/` | INFRA-05, I18N-01, I18N-02 |
| SC-06 | Push to `main` triggers lint → build → test → SSH deploy pipeline; zero failures | INFRA-06 |
| SC-07 | `GET /health` returns JSON with `status`, `db`, `redis`, `shards`, `uptime` | INFRA-07 |
| SC-08 | Pre-commit hook blocks commits with hardcoded strings in `src/**/*.ts` | I18N-03 |

---

## Tasks

---

### T-01: Repository Bootstrap & TypeScript Configuration

**Requirements:** All (foundational — every other task depends on this)
**Goal:** Create the project skeleton: `package.json` with all pinned dependencies, `tsconfig.json` with path aliases, and the complete `src/` directory structure defined in D-01.

**Files:**
- `package.json` — all production + dev dependencies at exact pinned versions; build/dev/lint/start scripts
- `tsconfig.json` — strict TypeScript, ES2022 target, Node16 module, `@/*` path alias to `src/*`
- `.nvmrc` — pin `22` for nvm users
- `.gitignore` — node_modules, dist, .env, logs, *.key
- `src/bot.ts` — empty shell (placeholder, filled in T-09)
- `src/shard.ts` — empty shell (placeholder, filled in T-09)
- `src/config.ts` — empty shell (placeholder, filled in T-02)

**Implementation:**

1. Initialize the project:
   ```bash
   npm init -y
   ```

2. Install production dependencies (exact versions — no `^` prefix):
   ```bash
   npm install \
     discord.js@14.26.2 \
     drizzle-orm@0.45.2 \
     pg@8.20.0 \
     ioredis@5.10.1 \
     pg-boss@12.15.0 \
     i18next@26.0.4 \
     i18next-fs-backend@2.6.3 \
     zod@4.3.6 \
     fastify@5.8.4 \
     dotenv@17.4.1 \
     @discordjs/rest@2.6.1
   ```

3. Install dev dependencies:
   ```bash
   npm install -D \
     typescript@5.8.4 \
     tsx@4.21.0 \
     tsc-alias@1.8.16 \
     husky@9.1.7 \
     lint-staged@16.4.0 \
     eslint@10 \
     typescript-eslint@8.58.1 \
     "@typescript-eslint/eslint-plugin@8.58.1" \
     "@typescript-eslint/parser@8.58.1" \
     eslint-plugin-i18next@6.1.3 \
     drizzle-kit@0.31.10 \
     "@types/node@22" \
     "@types/pg@8.20.0" \
     pm2@6.0.14 \
     vitest@3.1.2
   ```

4. Write `package.json` scripts section (merge with generated file):
   ```json
   {
     "type": "module",
     "scripts": {
       "build": "tsc && tsc-alias",
       "dev": "tsx --watch src/shard.ts",
       "start": "node dist/bot.js",
       "lint": "eslint src --max-warnings=0",
       "typecheck": "tsc --noEmit",
       "test": "vitest run",
       "migrate": "drizzle-kit migrate",
       "prepare": "husky"
     },
     "lint-staged": {
       "src/**/*.ts": ["eslint --max-warnings=0"]
     }
   }
   ```
   Note: `--save-exact` flag or no `^` ensures version pinning. Verify `package.json` has no `^` prefixes on any dependency version.

5. Write `tsconfig.json`:
   ```json
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
       "declaration": true,
       "paths": {
         "@/*": ["./src/*"]
       }
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

6. Create all required `src/` subdirectories (D-01):
   ```bash
   mkdir -p src/commands/game src/commands/admin
   mkdir -p src/events src/workers src/jobs
   mkdir -p src/db/schema
   mkdir -p src/i18n
   mkdir -p src/utils
   mkdir -p src/ui/embeds
   mkdir -p src/assets
   ```

7. Create `locales/` structure for i18n files (used in T-07):
   ```bash
   mkdir -p locales/vi locales/en locales/zh-cn
   ```

8. Create `migrations/` directory for drizzle-kit output:
   ```bash
   mkdir -p migrations
   ```

9. Create `.nvmrc` with content `22`.

10. Create `.gitignore`:
    ```
    node_modules/
    dist/
    .env
    .env.local
    logs/
    *.log
    *.key
    *.pem
    ```

11. Create placeholder shell files (empty exports) for `src/bot.ts`, `src/shard.ts`, `src/config.ts` so TypeScript can compile:
    ```typescript
    // src/bot.ts — placeholder
    export {};
    ```

**Verification:**
```bash
npm run typecheck   # Must exit 0 with no errors
ls src/             # Must show: bot.ts shard.ts config.ts commands/ events/ workers/ jobs/ db/ i18n/ utils/ ui/ assets/
cat package.json | grep -E '"discord\.js"'   # Must show 14.26.2 (no ^)
```

---

### T-02: Environment Config Module & Utility Helpers

**Requirements:** D-06, D-07 (all other tasks depend on this for type-safe env access)
**Goal:** Create the single typed config module that validates all environment variables at startup using Zod. Fatal crash on missing/malformed vars. Also create the `formatBalance` utility required for BigInt currency display.

**Files:**
- `src/config.ts` — Zod-validated config, re-exported typed object; crash on failure
- `.env.example` — template with all required variables and descriptions
- `src/utils/format.ts` — `formatBalance(n: bigint): string` helper (BigInt → formatted string)
- `src/utils/logger.ts` — minimal structured logger wrapper (avoids console.log raw)

**Implementation:**

1. Write `src/config.ts`:
   ```typescript
   import { z } from 'zod';
   import 'dotenv/config';

   const EnvSchema = z.object({
     // Discord
     DISCORD_TOKEN: z.string().min(50, 'DISCORD_TOKEN looks too short'),
     CLIENT_ID: z.string().min(1, 'CLIENT_ID is required for slash command registration'),

     // Database — runtime connection goes through PgBouncer (port 6432)
     DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgresql:// URL'),

     // Database direct — used ONLY by drizzle-kit migrate (bypasses PgBouncer)
     DATABASE_URL_DIRECT: z.string().url('DATABASE_URL_DIRECT must be a valid postgresql:// URL'),

     // Redis
     REDIS_URL: z.string().url('REDIS_URL must be a valid redis:// URL'),

     // App
     NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
     PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
   });

   const parsed = EnvSchema.safeParse(process.env);

   if (!parsed.success) {
     console.error('[Config] ❌ Invalid environment variables — bot cannot start:');
     const errors = parsed.error.flatten().fieldErrors;
     for (const [key, msgs] of Object.entries(errors)) {
       console.error(`  ${key}: ${msgs?.join(', ')}`);
     }
     process.exit(1);
   }

   export const config = parsed.data;
   export type Config = typeof config;
   ```

2. Write `.env.example`:
   ```
   # Discord
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_client_id

   # Database — runtime (via PgBouncer, port 6432)
   DATABASE_URL=postgresql://tutien:password@localhost:6432/tutien

   # Database — migrations only (direct PostgreSQL, port 5432)
   DATABASE_URL_DIRECT=postgresql://tutien:password@localhost:5432/tutien

   # Redis
   REDIS_URL=redis://localhost:6379

   # App
   NODE_ENV=development
   PORT=3000
   ```
   Copy this to `.env` on the VM and fill in real values. `.env` is in `.gitignore`.

3. Write `src/utils/format.ts`:
   ```typescript
   /**
    * Format a BigInt balance value for display in Discord messages.
    * Uses locale-aware number formatting with thousand separators.
    * NEVER pass BigInt directly to string templates — always use this helper.
    *
    * @example formatBalance(1234567n) → "1,234,567"
    */
   export function formatBalance(amount: bigint): string {
     // Convert to string then format with Number for locale formatting
     // Safe up to Number.MAX_SAFE_INTEGER — for larger values use custom formatter
     if (amount <= BigInt(Number.MAX_SAFE_INTEGER)) {
       return Number(amount).toLocaleString('en-US');
     }
     // For very large values: manual thousand-separator insertion
     return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
   }
   ```

4. Write `src/utils/logger.ts`:
   ```typescript
   type LogLevel = 'info' | 'warn' | 'error' | 'debug';

   function log(level: LogLevel, context: string, message: string, data?: unknown): void {
     const timestamp = new Date().toISOString();
     const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
     if (data !== undefined) {
       console[level === 'debug' ? 'log' : level](`${prefix} ${message}`, data);
     } else {
       console[level === 'debug' ? 'log' : level](`${prefix} ${message}`);
     }
   }

   export const logger = {
     info: (ctx: string, msg: string, data?: unknown) => log('info', ctx, msg, data),
     warn: (ctx: string, msg: string, data?: unknown) => log('warn', ctx, msg, data),
     error: (ctx: string, msg: string, data?: unknown) => log('error', ctx, msg, data),
     debug: (ctx: string, msg: string, data?: unknown) => log('debug', ctx, msg, data),
   };
   ```

**Verification:**
```bash
# With .env missing required vars:
node -e "import('./dist/config.js')"   # Must print errors and exit 1

# With valid .env:
npm run typecheck   # Must exit 0
```
Also verify: grep for `process.env` in `src/` — must appear ONLY in `src/config.ts`.

---

### T-03: Oracle VM Infrastructure Setup

**Requirements:** INFRA-02, INFRA-03, D-10
**Goal:** Set up all server-side infrastructure on the Oracle Cloud VM: PostgreSQL 16, Redis, PgBouncer, Node.js 22 via nvm, pm2, and all service users/databases. This is a human-action checkpoint — must be completed before database tasks.

**Files (on VM, not in repo):**
- `/etc/pgbouncer/pgbouncer.ini` — PgBouncer configuration (transaction mode, port 6432)
- `/etc/pgbouncer/userlist.txt` — PgBouncer auth file with hashed pg password
- `/etc/tutien/.env` — production secrets (not in git; sourced by deploy script)
- `/home/ubuntu/tutien-bot/` — application directory (git clone target)

**Implementation:**

SSH into the Oracle VM: `ssh ubuntu@168.138.8.160`

**Step 1: Install PostgreSQL 16**
```bash
sudo apt update && sudo apt install -y postgresql-16 postgresql-client-16
sudo systemctl enable postgresql && sudo systemctl start postgresql

# Create DB user and database
sudo -u postgres psql <<'SQL'
CREATE USER tutien WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE tutien OWNER tutien;
GRANT ALL PRIVILEGES ON DATABASE tutien TO tutien;
SQL
```

**Step 2: Configure PostgreSQL to accept local connections**
```bash
# Allow password auth from localhost
sudo nano /etc/postgresql/16/main/pg_hba.conf
# Add line: host tutien tutien 127.0.0.1/32 md5
sudo systemctl reload postgresql
```

**Step 3: Install Redis**
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server && sudo systemctl start redis-server
# Verify
redis-cli ping   # Must return PONG
```

**Step 4: Install PgBouncer**
```bash
sudo apt install -y pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
sudo tee /etc/pgbouncer/pgbouncer.ini > /dev/null <<'INI'
[databases]
tutien = host=127.0.0.1 port=5432 dbname=tutien

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
reserve_pool_size = 5
server_idle_timeout = 600
log_file = /var/log/pgbouncer/pgbouncer.log
pid_file = /var/run/pgbouncer/pgbouncer.pid
INI

# Generate password hash: echo "md5$(echo -n 'PASSWORD_HEREtutien' | md5sum | cut -d' ' -f1)"
# Replace HASHED_PASSWORD_HERE with the md5 hash output
sudo tee /etc/pgbouncer/userlist.txt > /dev/null <<'TXT'
"tutien" "md5HASHED_PASSWORD_HERE"
TXT

sudo systemctl enable pgbouncer && sudo systemctl restart pgbouncer
# Verify PgBouncer works
psql postgresql://tutien:PASSWORD@127.0.0.1:6432/tutien -c '\l'
```

**Step 5: Install Node.js 22 via nvm**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
node --version   # Must show v22.x.x (≥ 22.12.0)
```

**Step 6: Install pm2 globally**
```bash
npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the generated sudo command
```

**Step 7: Clone repository and set up secrets**
```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/tutien-bot.git
cd tutien-bot

sudo mkdir -p /etc/tutien
sudo tee /etc/tutien/.env > /dev/null <<'ENV'
DISCORD_TOKEN=your_real_bot_token
CLIENT_ID=your_real_client_id
DATABASE_URL=postgresql://tutien:PASSWORD@127.0.0.1:6432/tutien
DATABASE_URL_DIRECT=postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien
REDIS_URL=redis://127.0.0.1:6379
NODE_ENV=production
PORT=3000
ENV
sudo chmod 600 /etc/tutien/.env
sudo chown ubuntu:ubuntu /etc/tutien/.env

# Symlink to app directory for dotenv to find it
ln -sf /etc/tutien/.env /home/ubuntu/tutien-bot/.env
```

**Step 8: Configure firewall (Oracle Cloud Security List)**
- Port 22 (SSH): already open
- Port 3000 (Health check): open from monitoring IP only; block from public
- Port 5432, 6432, 6379: bind to 127.0.0.1 ONLY — never expose to internet

**Verification:**
```bash
# All services running
sudo systemctl is-active postgresql redis-server pgbouncer   # Must show 3× active

# Connections work
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien -c 'SELECT 1;'   # Direct
psql postgresql://tutien:PASSWORD@127.0.0.1:6432/tutien -c 'SELECT 1;'   # Via PgBouncer
redis-cli ping

# Node and pm2
node --version   # ≥ 22.12.0
pm2 --version    # Shows pm2 version (6.0.x expected)
```

---

### T-04: Database Schema & Drizzle Client

**Requirements:** INFRA-02, D-04, D-05
**Goal:** Define the Phase 1 database schema (users + seasons tables) with Drizzle ORM, configure the database client with PgBouncer-compatible pool settings, and set up drizzle-kit for migrations.

**Files:**
- `src/db/schema/users.ts` — users table: id, discord_id, balance BIGINT (mode: 'bigint'), locale
- `src/db/schema/seasons.ts` — seasons table: id, name, is_active, started_at, ended_at
- `src/db/schema/index.ts` — re-exports all schemas
- `src/db/client.ts` — Drizzle db instance backed by pg.Pool, configured for PgBouncer
- `drizzle.config.ts` — drizzle-kit config using `DATABASE_URL_DIRECT` (direct PG, bypasses PgBouncer)

**Implementation:**

1. Write `src/db/schema/users.ts`:
   ```typescript
   import { pgTable, serial, varchar, bigint, check } from 'drizzle-orm/pg-core';
   import { sql } from 'drizzle-orm';

   export const users = pgTable('users', {
     id: serial('id').primaryKey(),
     discordId: varchar('discord_id', { length: 20 }).notNull().unique(),
     // CRITICAL: mode: 'bigint' returns JS BigInt — never use mode: 'number' for currency
     // Display with formatBalance() from src/utils/format.ts — never embed BigInt directly
     balance: bigint('balance', { mode: 'bigint' }).notNull().default(0n),
     // Constrained to supported locales — prevents data drift in locale resolution
     locale: varchar('locale', { length: 10 }).default('vi'),
   }, (table) => [
     // DB-level guard against double-spend bugs (balance can never go negative)
     check('balance_non_negative', sql`${table.balance} >= 0`),
     // Enforce only valid locale values at DB level — matches resolveLocale() supported set
     check('locale_valid', sql`${table.locale} IN ('vi', 'en', 'zh-cn')`),
   ]);

   export type User = typeof users.$inferSelect;
   export type NewUser = typeof users.$inferInsert;
   ```

2. Write `src/db/schema/seasons.ts`:
   ```typescript
   import { pgTable, serial, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
   import { sql } from 'drizzle-orm';

   export const seasons = pgTable('seasons', {
     id: serial('id').primaryKey(),
     name: varchar('name', { length: 100 }).notNull(),
     isActive: boolean('is_active').notNull().default(false),
     startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
     endedAt: timestamp('ended_at', { withTimezone: true }),
   }, (table) => [
     // Only one active season at a time — DB-level invariant enforcement
     // Partial unique index: only applies when is_active = true, allows multiple false rows
     uniqueIndex('idx_seasons_one_active').on(table.isActive).where(sql`${table.isActive} = true`),
   ]);

   export type Season = typeof seasons.$inferSelect;
   export type NewSeason = typeof seasons.$inferInsert;
   ```

3. Write `src/db/schema/index.ts`:
   ```typescript
   export * from './users.js';
   export * from './seasons.js';
   ```

4. Write `src/db/client.ts`:
   ```typescript
   import { drizzle } from 'drizzle-orm/node-postgres';
   import { Pool } from 'pg';
   import { config } from '../config.js';
   import * as schema from './schema/index.js';

   // Runtime connections go through PgBouncer (port 6432 by convention)
   // PgBouncer handles cross-shard connection aggregation
   // max: 5 per shard — PgBouncer multiplexes to PostgreSQL max_connections
   const pool = new Pool({
     connectionString: config.DATABASE_URL,
     max: 5,
     idleTimeoutMillis: 30_000,
     connectionTimeoutMillis: 5_000,
   });

   pool.on('error', (err) => {
     console.error('[DB] Unexpected error on idle client:', err.message);
   });

   export const db = drizzle({ client: pool, schema });
   export { pool };
   ```

5. Write `drizzle.config.ts`:
   ```typescript
   import { defineConfig } from 'drizzle-kit';
   import 'dotenv/config';

   // CRITICAL: Use DATABASE_URL_DIRECT (port 5432, bypasses PgBouncer)
   // PgBouncer transaction mode breaks advisory locks used by drizzle-kit migrate
   // Runtime code uses DATABASE_URL (port 6432 via PgBouncer)
   export default defineConfig({
     dialect: 'postgresql',
     schema: './src/db/schema/index.ts',
     out: './migrations',
     dbCredentials: {
       url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!,
     },
   });
   ```

6. Generate the initial migration:
   ```bash
   npx drizzle-kit generate
   # Review the generated SQL in migrations/ — must show CREATE TABLE users + seasons
   ```

7. Apply migration to local dev database (or against VM directly):
   ```bash
   DATABASE_URL_DIRECT="postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien" \
     npx drizzle-kit migrate
   ```

**Verification:**
```bash
# TypeScript compiles
npm run typecheck

# Migration files generated
ls migrations/   # Must show *.sql file(s)

# After applying: tables exist
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien \
  -c '\dt'   # Must show: users, seasons, __drizzle_migrations

# BIGINT constraint check (should fail):
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien \
  -c "INSERT INTO users (discord_id, balance) VALUES ('000000000000000001', -1);"
# Must output: ERROR: new row for relation "users" violates check constraint "balance_non_negative"

# Locale constraint check (should fail):
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien \
  -c "INSERT INTO users (discord_id, locale) VALUES ('000000000000000002', 'fr');"
# Must output: ERROR: new row for relation "users" violates check constraint "locale_valid"

# Active season uniqueness (should fail on second active):
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien \
  -c "INSERT INTO seasons (name, is_active) VALUES ('S1', true); INSERT INTO seasons (name, is_active) VALUES ('S2', true);"
# Second INSERT must output: ERROR: duplicate key value violates unique constraint "idx_seasons_one_active"
```

---

### T-05: Redis Cache Client

**Requirements:** INFRA-03
**Goal:** Create the ioredis connection client with exponential backoff retry, event logging, and helper utilities for cooldown management and VWAP caching.

**Files:**
- `src/cache/redis.ts` — ioredis client singleton, connection event handlers, retry strategy
- `src/cache/cooldown.ts` — `tryAcquireCooldown()` and `releaseCooldown()` helpers
- `src/cache/index.ts` — re-exports

**Implementation:**

1. Create `src/cache/` directory if not already created:
   ```bash
   mkdir -p src/cache
   ```

2. Write `src/cache/redis.ts`:
   ```typescript
   import Redis from 'ioredis';
   import { config } from '../config.js';
   import { logger } from '../utils/logger.js';

   export const redis = new Redis(config.REDIS_URL, {
     retryStrategy(times) {
       // Exponential backoff: 50ms → 100ms → 200ms → ... → 2000ms max
       const delay = Math.min(times * 50, 2_000);
       logger.warn('Redis', `Retry attempt ${times}, waiting ${delay}ms`);
       return delay;
     },
     maxRetriesPerRequest: 20,
     enableOfflineQueue: true,   // Queue commands while reconnecting
     lazyConnect: false,         // Connect immediately on construction
     connectTimeout: 10_000,
   });

   redis.on('connect', () => logger.info('Redis', 'Connected'));
   redis.on('ready', () => logger.info('Redis', 'Ready'));
   redis.on('error', (err) => logger.error('Redis', err.message));
   redis.on('close', () => logger.warn('Redis', 'Connection closed'));
   redis.on('reconnecting', () => logger.info('Redis', 'Reconnecting...'));

   /**
    * Ping Redis and return true if responsive.
    */
   export async function redisHealthCheck(): Promise<boolean> {
     try {
       const pong = await redis.ping();
       return pong === 'PONG';
     } catch {
       return false;
     }
   }
   ```

3. Write `src/cache/cooldown.ts`:
   ```typescript
   import { redis } from './redis.js';

   /**
    * Atomically acquire a cooldown lock. Returns true if NOT on cooldown (lock acquired).
    * Uses Redis SET NX PX — atomic check-and-set in a single RTT.
    *
    * @param userId - Discord user snowflake
    * @param channelId - Discord channel snowflake
    * @param cooldownMs - Cooldown duration in milliseconds
    * @returns true if cooldown acquired (user may proceed), false if already on cooldown
    */
   export async function tryAcquireCooldown(
     userId: string,
     channelId: string,
     cooldownMs: number,
   ): Promise<boolean> {
     const key = `cooldown:${userId}:${channelId}`;
     // NX = only set if Not eXists; PX = expire in milliseconds
     const result = await redis.set(key, '1', 'NX', 'PX', cooldownMs);
     return result === 'OK';
   }

   /**
    * Get remaining cooldown TTL in milliseconds. Returns 0 if no active cooldown.
    */
   export async function getCooldownTTL(userId: string, channelId: string): Promise<number> {
     const key = `cooldown:${userId}:${channelId}`;
     const ttlMs = await redis.pttl(key);
     return Math.max(0, ttlMs);
   }
   ```

4. Write `src/cache/index.ts`:
   ```typescript
   export { redis, redisHealthCheck } from './redis.js';
   export { tryAcquireCooldown, getCooldownTTL } from './cooldown.js';
   ```

**Verification:**
```bash
npm run typecheck   # Must exit 0

# With Redis running locally, test connection:
node -e "
import('./dist/cache/index.js').then(async ({ redis, tryAcquireCooldown }) => {
  const ok = await redis.ping();
  console.log('Redis ping:', ok);                        // PONG
  const acquired = await tryAcquireCooldown('u1', 'c1', 5000);
  console.log('Cooldown acquired:', acquired);           // true
  const again = await tryAcquireCooldown('u1', 'c1', 5000);
  console.log('Duplicate blocked:', !again);             // true (blocked)
  await redis.quit();
});"
```

---

### T-06: pg-boss Scheduler (VWAP Cron)

**Requirements:** INFRA-04
**Goal:** Initialize pg-boss in the ShardingManager process only. Register the `vwap-recalc` job with an hourly cron schedule. Shards may enqueue jobs but must never call `boss.start()`.

**Files:**
- `src/workers/pgBoss.ts` — pg-boss lifecycle (initPgBoss, stopPgBoss); imported only by bot.ts
- `src/jobs/vwapRecalc.ts` — stub job handler for VWAP recalculation (Phase 3 fills in logic)

**Implementation:**

1. Write `src/jobs/vwapRecalc.ts`:
   ```typescript
   import type PgBoss from 'pg-boss';
   import { logger } from '../utils/logger.js';

   /**
    * VWAP recalculation job handler.
    * Phase 1: stub that logs and confirms scheduling works.
    * Phase 3: replace stub with actual VWAP recalculation logic.
    */
   export async function runVwapRecalc(job: PgBoss.Job): Promise<void> {
     logger.info('VwapRecalc', `Job started: ${job.id}`);
     // TODO (Phase 3): Fetch last 1h transactions, compute VWAP, update market_prices
     logger.info('VwapRecalc', `Job completed: ${job.id} (stub)`);
   }
   ```

2. Write `src/workers/pgBoss.ts`:
   ```typescript
   import PgBoss from 'pg-boss';
   import { config } from '../config.js';
   import { runVwapRecalc } from '../jobs/vwapRecalc.js';
   import { logger } from '../utils/logger.js';

   // IMPORTANT: This module must ONLY be imported by bot.ts (ShardingManager).
   // NEVER import this in shard.ts — each shard calling boss.start() creates
   // duplicate cron jobs and redundant maintenance workers.

   let boss: PgBoss | null = null;

   /**
    * Initialize pg-boss and register all scheduled jobs.
    * Called exactly once from bot.ts after config is loaded.
    */
   export async function initPgBoss(): Promise<void> {
     boss = new PgBoss({
       // pg-boss needs direct DB connection (not PgBouncer) for advisory locks
       connectionString: config.DATABASE_URL_DIRECT,
       schema: 'pgboss',
       schedule: true,              // Enable cron scheduling
       supervise: true,             // Enable maintenance monitoring
       migrate: true,               // Auto-run pg-boss schema migrations on start
       max: 3,                      // Internal connection pool size
       application_name: 'tutien-bot-scheduler',
       monitorStateIntervalSeconds: 120,
     });

     boss.on('error', (error) => logger.error('pgBoss', error.message, error));

     await boss.start();
     logger.info('pgBoss', 'Started');

     await registerJobs(boss);
   }

   async function registerJobs(b: PgBoss): Promise<void> {
     // Ensure queue exists before scheduling
     await b.createQueue('vwap-recalc');

     // schedule() is idempotent — safe to call on every restart
     // If a schedule already exists for this queue name, it is updated (not duplicated)
     await b.schedule('vwap-recalc', '0 * * * *', {});

     // Register the worker handler — runs in the ShardingManager process
     await b.work('vwap-recalc', { localConcurrency: 1 }, async ([job]) => {
       await runVwapRecalc(job);
     });

     logger.info('pgBoss', 'Jobs registered: vwap-recalc @ 0 * * * * (top of hour)');
   }

   /**
    * Graceful pg-boss shutdown. Call from bot.ts SIGTERM/SIGINT handler.
    */
   export async function stopPgBoss(): Promise<void> {
     if (boss) {
       await boss.stop({ graceful: true, timeout: 10_000 });
       boss = null;
       logger.info('pgBoss', 'Stopped gracefully');
     }
   }
   ```

**Verification:**
```bash
npm run typecheck   # Must exit 0

# After bot.ts is running (T-09), query the DB:
psql postgresql://tutien:PASSWORD@127.0.0.1:5432/tutien \
  -c "SELECT name, cron FROM pgboss.schedule;"
# Must show: vwap-recalc | 0 * * * *
```

---

### T-07: i18n Scaffold — Locale Files & Init Module

**Requirements:** INFRA-05, I18N-01, I18N-02, D-11, D-12
**Goal:** Initialize i18next in the shard process. Create all 15 locale files (5 namespaces × 3 locales) with representative keys. Implement locale resolution per D-11 (stored pref → Discord locale → VI default). Add a missing-key CLI script.

**Files:**
- `src/i18n/index.ts` — `initI18n()`, `resolveLocale()`, `getT()` helpers
- `locales/vi/common.json` — shared strings in Vietnamese
- `locales/vi/game.json` — game strings in Vietnamese
- `locales/vi/combat.json` — combat strings in Vietnamese
- `locales/vi/marketplace.json` — marketplace strings in Vietnamese
- `locales/vi/admin.json` — admin strings in Vietnamese
- `locales/en/common.json`, `locales/en/game.json`, `locales/en/combat.json`, `locales/en/marketplace.json`, `locales/en/admin.json` — English equivalents
- `locales/zh-cn/common.json`, `locales/zh-cn/game.json`, `locales/zh-cn/combat.json`, `locales/zh-cn/marketplace.json`, `locales/zh-cn/admin.json` — Chinese equivalents
- `scripts/check-i18n.ts` — CLI: detects keys present in one locale but missing in others

**Implementation:**

1. Write `src/i18n/index.ts`:
   ```typescript
   import i18next from 'i18next';
   import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { logger } from '../utils/logger.js';

   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   // Locale files are at project root /locales/{lng}/{ns}.json
   const LOCALES_PATH = path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json');

   export type SupportedLocale = 'vi' | 'en' | 'zh-cn';
   export const SUPPORTED_LOCALES: SupportedLocale[] = ['vi', 'en', 'zh-cn'];
   export const DEFAULT_LOCALE: SupportedLocale = 'vi';

   /**
    * Initialize i18next for a shard process. Call from shard.ts before client.login().
    * Uses preload to ensure all locales are ready before any command runs.
    * i18next is module-level singleton — each shard process has its own instance.
    */
   export async function initI18n(): Promise<void> {
     await i18next
       .use(FsBackend)
       .init<FsBackendOptions>({
         fallbackLng: DEFAULT_LOCALE,
         supportedLngs: SUPPORTED_LOCALES,
         preload: SUPPORTED_LOCALES,   // Load all 3 at startup — avoids lazy-load race conditions
         ns: ['common', 'game', 'combat', 'marketplace', 'admin'],
         defaultNS: 'common',
         fallbackNS: 'common',         // Key not found in ns → try common
         interpolation: {
           escapeValue: false,         // Discord renders plain text, not HTML
         },
         backend: {
           loadPath: LOCALES_PATH,
         },
       });

     logger.info('i18n', 'Initialized — locales: vi, en, zh-cn');
   }

   /**
    * Resolve display locale for a Discord interaction.
    * Priority order (D-11):
    *   1. User's stored locale preference (users.locale from DB)
    *   2. Discord interaction locale header
    *   3. Default: 'vi'
    */
   export function resolveLocale(
     userStoredLocale: string | null | undefined,
     interactionLocale: string | null | undefined,
   ): SupportedLocale {
     const normalize = (raw: string | null | undefined): SupportedLocale | null => {
       if (!raw) return null;
       const l = raw.toLowerCase();
       if (l === 'vi') return 'vi';
       if (l.startsWith('en')) return 'en';
       if (l.startsWith('zh')) return 'zh-cn';
       return null;
     };

     return normalize(userStoredLocale)
       ?? normalize(interactionLocale)
       ?? DEFAULT_LOCALE;
   }

   /**
    * Get a t() function bound to a specific locale.
    * Use this in every command handler after resolveLocale().
    *
    * @example
    *   const locale = resolveLocale(user?.locale, interaction.locale);
    *   const t = getT(locale);
    *   await interaction.reply(t('common:errors.notRegistered'));
    */
   export function getT(locale: SupportedLocale) {
     return i18next.getFixedT(locale);
   }
   ```

2. Write the 15 locale files. All must have matching key structures across locales.

   **`locales/vi/common.json`:**
   ```json
   {
     "errors": {
       "notRegistered": "Bạn chưa đăng ký tu tiên. Dùng /bắt_đầu để bắt đầu hành trình.",
       "noPermission": "Bạn không có quyền thực hiện lệnh này.",
       "cooldown": "Hãy chờ {{seconds}} giây trước khi dùng lại lệnh này.",
       "internalError": "Đã xảy ra lỗi nội bộ. Vui lòng thử lại sau.",
       "botOffline": "Bot đang bảo trì. Vui lòng thử lại sau."
     },
     "system": {
       "botName": "Tu Tiên Bot",
       "online": "Bot đã trực tuyến trên {{shards}} mảnh ghép",
       "healthOk": "Hệ thống hoạt động bình thường",
       "healthDegraded": "Hệ thống đang gặp sự cố"
     }
   }
   ```

   **`locales/vi/game.json`:**
   ```json
   {
     "profile": {
       "title": "Hồ Sơ Tu Sĩ",
       "tuVi": "Tu Vi",
       "canh_gioi": "Cảnh Giới",
       "linhThach": "Linh Thạch",
       "balance": "{{amount}} linh thạch"
     },
     "realms": {
       "luyen_khi_1": "Luyện Khí Tầng 1",
       "luyen_khi_9": "Luyện Khí Tầng 9",
       "truc_co": "Trúc Cơ",
       "kim_dan": "Kim Đan"
     }
   }
   ```

   **`locales/vi/combat.json`:**
   ```json
   {
     "placeholder": "Chiến đấu sẽ được thêm vào Phase 3."
   }
   ```

   **`locales/vi/marketplace.json`:**
   ```json
   {
     "placeholder": "Chợ sẽ được thêm vào Phase 3."
   }
   ```

   **`locales/vi/admin.json`:**
   ```json
   {
     "placeholder": "Quản trị sẽ được thêm vào Phase 4."
   }
   ```

   **`locales/en/common.json`:**
   ```json
   {
     "errors": {
       "notRegistered": "You haven't registered yet. Use /start to begin your journey.",
       "noPermission": "You don't have permission to use this command.",
       "cooldown": "Please wait {{seconds}} seconds before using this command again.",
       "internalError": "An internal error occurred. Please try again later.",
       "botOffline": "Bot is under maintenance. Please try again later."
     },
     "system": {
       "botName": "Tu Tien Bot",
       "online": "Bot is online across {{shards}} shards",
       "healthOk": "System operational",
       "healthDegraded": "System experiencing issues"
     }
   }
   ```

   **`locales/en/game.json`:**
   ```json
   {
     "profile": {
       "title": "Cultivator Profile",
       "tuVi": "Cultivation Points",
       "canh_gioi": "Realm",
       "linhThach": "Spirit Stones",
       "balance": "{{amount}} spirit stones"
     },
     "realms": {
       "luyen_khi_1": "Qi Refinement Stage 1",
       "luyen_khi_9": "Qi Refinement Stage 9",
       "truc_co": "Foundation Establishment",
       "kim_dan": "Core Formation"
     }
   }
   ```

   **`locales/en/combat.json`:** `{ "placeholder": "Combat will be added in Phase 3." }`
   **`locales/en/marketplace.json`:** `{ "placeholder": "Marketplace will be added in Phase 3." }`
   **`locales/en/admin.json`:** `{ "placeholder": "Admin features will be added in Phase 4." }`

   **`locales/zh-cn/common.json`:**
   ```json
   {
     "errors": {
       "notRegistered": "您尚未注册修炼。使用 /开始 来开启您的修炼之旅。",
       "noPermission": "您无权使用此命令。",
       "cooldown": "请等待 {{seconds}} 秒后再使用此命令。",
       "internalError": "发生内部错误，请稍后重试。",
       "botOffline": "机器人正在维护中，请稍后重试。"
     },
     "system": {
       "botName": "修仙机器人",
       "online": "机器人在 {{shards}} 个分片上线",
       "healthOk": "系统运行正常",
       "healthDegraded": "系统遇到问题"
     }
   }
   ```

   **`locales/zh-cn/game.json`:**
   ```json
   {
     "profile": {
       "title": "修仙档案",
       "tuVi": "修为",
       "canh_gioi": "境界",
       "linhThach": "灵石",
       "balance": "{{amount}} 灵石"
     },
     "realms": {
       "luyen_khi_1": "练气一层",
       "luyen_khi_9": "练气九层",
       "truc_co": "筑基",
       "kim_dan": "金丹"
     }
   }
   ```

   **`locales/zh-cn/combat.json`:** `{ "placeholder": "战斗系统将在第三阶段添加。" }`
   **`locales/zh-cn/marketplace.json`:** `{ "placeholder": "市场将在第三阶段添加。" }`
   **`locales/zh-cn/admin.json`:** `{ "placeholder": "管理功能将在第四阶段添加。" }`

3. Write `scripts/check-i18n.ts` (missing key CLI — I18N-02):
   ```typescript
   /**
    * Missing i18n key detector.
    * Usage: npx tsx scripts/check-i18n.ts
    * Compares keys across all locale files; reports mismatches to stdout.
    * Non-zero exit code if any keys are missing.
    */
   import { readdirSync, readFileSync } from 'node:fs';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const LOCALES_DIR = path.join(__dirname, '../locales');
   const NAMESPACES = ['common', 'game', 'combat', 'marketplace', 'admin'];
   const LOCALES = ['vi', 'en', 'zh-cn'];

   function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
     const keys: string[] = [];
     for (const [k, v] of Object.entries(obj)) {
       const fullKey = prefix ? `${prefix}.${k}` : k;
       if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
         keys.push(...getKeys(v as Record<string, unknown>, fullKey));
       } else {
         keys.push(fullKey);
       }
     }
     return keys;
   }

   let hasMissing = false;

   for (const ns of NAMESPACES) {
     const localeKeys: Record<string, Set<string>> = {};

     for (const locale of LOCALES) {
       const filePath = path.join(LOCALES_DIR, locale, `${ns}.json`);
       try {
         const content = JSON.parse(readFileSync(filePath, 'utf-8'));
         localeKeys[locale] = new Set(getKeys(content));
       } catch {
         console.error(`❌ Missing file: locales/${locale}/${ns}.json`);
         hasMissing = true;
         localeKeys[locale] = new Set();
       }
     }

     // Find keys in VI (reference) missing from other locales
     const viKeys = localeKeys['vi'] ?? new Set<string>();
     for (const locale of LOCALES.filter(l => l !== 'vi')) {
       const otherKeys = localeKeys[locale] ?? new Set<string>();
       const missing = [...viKeys].filter(k => !otherKeys.has(k));
       if (missing.length > 0) {
         console.warn(`⚠️  ${ns}/${locale} missing ${missing.length} keys from vi:`);
         missing.forEach(k => console.warn(`   - ${k}`));
         hasMissing = true;
       }
     }
   }

   if (!hasMissing) {
     console.log('✅ All locale files are in sync.');
   }

   process.exit(hasMissing ? 1 : 0);
   ```

4. Add `check-i18n` to `package.json` scripts:
   ```json
   "check-i18n": "tsx scripts/check-i18n.ts"
   ```

**Verification:**
```bash
# All locale files exist
ls locales/vi/ locales/en/ locales/zh-cn/
# Each must show: admin.json combat.json common.json game.json marketplace.json

# Missing key check passes
npm run check-i18n   # Must output: ✅ All locale files are in sync.

# TypeScript compiles
npm run typecheck
```

---

### T-08: Asset Registries & UI Theme Foundation

**Requirements:** D-14, D-15, D-16, D-17
**Goal:** Create the typed emoji registry, shared UI theme with color palette, and the base embed builder infrastructure. These establish the visual quality standard enforced for all future phases.

**Files:**
- `src/assets/emojis.ts` — typed emoji registry (`as const`)
- `src/assets/index.ts` — re-exports all asset registries
- `src/ui/theme.ts` — shared color palette, hex constants, embed footer format
- `src/ui/embeds/buildErrorEmbed.ts` — error embed builder (Phase 1 utility)
- `src/ui/embeds/buildSuccessEmbed.ts` — success embed builder
- `src/ui/index.ts` — re-exports all UI builders

**Implementation:**

1. Write `src/assets/emojis.ts`:
   ```typescript
   /**
    * Typed emoji registry. ALL custom Discord emoji strings must be declared here.
    * Never hardcode emoji IDs in command/event files.
    * Usage: import { EMOJI } from '@/assets/emojis.js'; then use EMOJI.SPIRIT_STONE
    *
    * Phase 1: placeholder values — replace with real emoji IDs after creating
    * custom emojis in the Discord Developer Portal.
    * Format: '<:name:id>' for custom server emojis, or Unicode for standard emojis.
    */
   export const EMOJI = {
     // Currency
     SPIRIT_STONE: '💎',        // TODO: Replace with custom <:linh_thach:ID>
     CULTIVATION: '✨',          // TODO: Replace with custom <:tu_vi:ID>

     // Status
     SUCCESS: '✅',
     ERROR: '❌',
     WARNING: '⚠️',
     INFO: 'ℹ️',
     LOADING: '⏳',

     // Realms (Phase 2 will expand this)
     REALM: '⛰️',
     BREAKTHROUGH: '🌟',

     // UI
     SEPARATOR: '─',
   } as const;

   export type EmojiKey = keyof typeof EMOJI;
   ```

2. Write `src/assets/index.ts`:
   ```typescript
   export * from './emojis.js';
   ```

3. Write `src/ui/theme.ts`:
   ```typescript
   /**
    * Shared UI theme for all Discord embeds.
    * ALL embed colors must come from this file.
    * Never hardcode hex values in embed builder functions.
    *
    * Color naming: describe the semantic purpose, not the hue.
    * (e.g., DANGER not RED — if we ever rebrand to blue error embeds, only this file changes)
    */
   export const COLORS = {
     PRIMARY: 0x6B46C1,      // Purple — main brand color, used for profile/info embeds
     SUCCESS: 0x10B981,      // Emerald — positive actions, rewards, level up
     DANGER: 0xEF4444,       // Red — errors, failed actions, warnings
     WARNING: 0xF59E0B,      // Amber — caution, cooldowns, partial failures
     NEUTRAL: 0x6B7280,      // Gray — system messages, help text
     GOLD: 0xF59E0B,         // Gold — currency, leaderboards, rare items
     SEASON: 0x8B5CF6,       // Violet — season-specific embeds
   } as const;

   export type ColorKey = keyof typeof COLORS;

   /**
    * Standard embed footer format.
    * @param shardId - Current shard ID for debugging
    */
   export function embedFooter(shardId?: number): { text: string } {
     const shard = shardId !== undefined ? ` • Shard ${shardId}` : '';
     return { text: `Tu Tiên Bot${shard}` };
   }
   ```

4. Write `src/ui/embeds/buildErrorEmbed.ts`:
   ```typescript
   import { EmbedBuilder } from 'discord.js';
   import { COLORS, embedFooter } from '../theme.js';
   import { EMOJI } from '../../assets/emojis.js';

   /**
    * Build a standardized error embed.
    * @param message - Localized error message (use t() before passing in)
    * @param shardId - Optional shard ID for footer
    */
   export function buildErrorEmbed(message: string, shardId?: number): EmbedBuilder {
     return new EmbedBuilder()
       .setColor(COLORS.DANGER)
       .setDescription(`${EMOJI.ERROR} ${message}`)
       .setFooter(embedFooter(shardId))
       .setTimestamp();
   }
   ```

5. Write `src/ui/embeds/buildSuccessEmbed.ts`:
   ```typescript
   import { EmbedBuilder } from 'discord.js';
   import { COLORS, embedFooter } from '../theme.js';
   import { EMOJI } from '../../assets/emojis.js';

   /**
    * Build a standardized success embed.
    * @param title - Localized embed title
    * @param description - Localized description
    * @param shardId - Optional shard ID for footer
    */
   export function buildSuccessEmbed(
     title: string,
     description: string,
     shardId?: number,
   ): EmbedBuilder {
     return new EmbedBuilder()
       .setColor(COLORS.SUCCESS)
       .setTitle(`${EMOJI.SUCCESS} ${title}`)
       .setDescription(description)
       .setFooter(embedFooter(shardId))
       .setTimestamp();
   }
   ```

6. Write `src/ui/index.ts`:
   ```typescript
   export { buildErrorEmbed } from './embeds/buildErrorEmbed.js';
   export { buildSuccessEmbed } from './embeds/buildSuccessEmbed.js';
   export { COLORS, embedFooter } from './theme.js';
   ```

**Verification:**
```bash
npm run typecheck   # Must exit 0

# Verify EMOJI is const (immutable):
# Check that src/assets/emojis.ts ends with `as const` — prevents accidental mutation
grep -n "as const" src/assets/emojis.ts   # Must show the line
```

---

### T-09: ShardingManager, Shard Entry Points & Command Infrastructure

**Requirements:** INFRA-01, D-01, D-02, D-03
**Goal:** Wire up the full bot entry architecture: `bot.ts` spawns shards + starts pg-boss + starts health server + registers slash commands once; `shard.ts` initializes i18n + auto-discovers commands (runtime loading only) + loads events; include a sample ping command and event handlers.

**Key architectural constraint:** Slash command registration with Discord REST API happens **once in `bot.ts`** (ShardingManager process), not inside each shard. This prevents N shards × REST PUT race conditions and Discord rate-limit exhaustion as the bot scales.

**Files:**
- `src/bot.ts` — ShardingManager entry point (replaces placeholder from T-01)
- `src/shard.ts` — Client entry point (replaces placeholder from T-01)
- `src/utils/commandLoader.ts` — recursively loads `dist/commands/**/*.js` into client.commands Collection (**no REST registration here**)
- `src/utils/registerCommands.ts` — collects command definitions and registers with Discord REST API (called once from bot.ts)
- `src/utils/eventLoader.ts` — loads and registers event handlers from `src/events/`
- `src/events/ready.ts` — log shard ready
- `src/events/interactionCreate.ts` — route slash command interactions to handlers
- `src/commands/game/ping.ts` — sample ping command (verifies command pipeline end-to-end)

**Implementation:**

1. Write `src/bot.ts`:
   ```typescript
   import { ShardingManager } from 'discord.js';
   import { config } from './config.js';
   import { initPgBoss, stopPgBoss } from './workers/pgBoss.js';
   import { startHealthServer } from './workers/health.js';
   import { registerCommands } from './utils/registerCommands.js';
   import { db, pool } from './db/client.js';
   import { redis } from './cache/redis.js';
   import { logger } from './utils/logger.js';
   import { sql } from 'drizzle-orm';

   const manager = new ShardingManager('./dist/shard.js', {
     token: config.DISCORD_TOKEN,
     totalShards: 'auto',   // Discord recommends ~1,000 guilds/shard
     mode: 'process',       // Separate OS processes (not worker threads)
   });

   manager.on('shardCreate', (shard) => {
     logger.info('ShardingManager', `Shard ${shard.id} launching`);
     shard.on('ready', () => logger.info('ShardingManager', `Shard ${shard.id} ready`));
     shard.on('disconnect', () => logger.warn('ShardingManager', `Shard ${shard.id} disconnected`));
     shard.on('reconnecting', () => logger.info('ShardingManager', `Shard ${shard.id} reconnecting`));
     shard.on('death', (process) => {
       logger.error('ShardingManager', `Shard ${shard.id} died (exit code: ${process.exitCode})`);
     });
   });

   async function main(): Promise<void> {
     logger.info('ShardingManager', 'Starting TuTien Bot...');

     // Step 1: Preflight — verify DB and Redis are reachable before spawning shards
     // Fail fast here rather than having shards die silently on first DB/Redis access
     logger.info('ShardingManager', 'Preflight: checking DB connection...');
     await db.execute(sql`SELECT 1`);
     logger.info('ShardingManager', 'Preflight: DB ok');

     logger.info('ShardingManager', 'Preflight: checking Redis connection...');
     const pong = await redis.ping();
     if (pong !== 'PONG') throw new Error('Redis ping failed');
     logger.info('ShardingManager', 'Preflight: Redis ok');

     // Step 2: Register slash commands with Discord REST API — ONCE here in the manager.
     // NEVER register in shard.ts/commandLoader — N shards × PUT /commands = race conditions
     // and wasted rate-limit budget. This call is idempotent; safe on every restart.
     await registerCommands();

     // Step 3: pg-boss ONLY in ShardingManager — never in shards
     await initPgBoss();

     // Step 4: Health check HTTP server ONLY in ShardingManager
     await startHealthServer(manager);

     // Step 5: Spawn all shards — manager queries Discord for optimal shard count
     await manager.spawn();

     logger.info('ShardingManager', 'All shards launched');
   }

   // Graceful shutdown — close all connections cleanly before exit
   async function shutdown(): Promise<void> {
     logger.info('ShardingManager', 'Shutting down...');
     await stopPgBoss();
     await pool.end();
     await redis.quit();
     process.exit(0);
   }

   process.on('SIGTERM', shutdown);
   process.on('SIGINT', shutdown);

   main().catch((err) => {
     logger.error('ShardingManager', 'Fatal error during startup', err);
     process.exit(1);
   });
   ```

2. Write `src/shard.ts`:
   ```typescript
   import { Client, GatewayIntentBits } from 'discord.js';
   import { config } from './config.js';
   import { initI18n } from './i18n/index.js';
   import { loadCommands } from './utils/commandLoader.js';
   import { loadEvents } from './utils/eventLoader.js';
   import { logger } from './utils/logger.js';

   // Extend Client type to include commands Collection
   declare module 'discord.js' {
     interface Client {
       commands: Map<string, { data: { name: string; toJSON(): unknown }; execute: Function }>;
     }
   }

   const client = new Client({
     intents: [
       GatewayIntentBits.Guilds,
       GatewayIntentBits.GuildMessages,
       // NOTE: MessageContent is a privileged intent — NOT requested here.
       // Phase 1 uses only slash commands; no message content processing.
       // Phase 2 will add this intent when implementing tu vi accumulation from messages.
       GatewayIntentBits.GuildVoiceStates,
       GatewayIntentBits.GuildMessageReactions,
     ],
   });

   async function main(): Promise<void> {
     // i18next init — must complete before any command runs
     // Each shard is a separate process with its own i18next instance
     await initI18n();

     // Load all commands from dist/commands/**/*.js into client.commands Collection
     // Registration with Discord API is NOT done here — bot.ts handles that once
     await loadCommands(client);

     // Load all event handlers from dist/events/*.js
     await loadEvents(client);

     await client.login(config.DISCORD_TOKEN);
   }

   main().catch((err) => {
     logger.error('Shard', 'Fatal error during startup', err);
     process.exit(1);
   });
   ```

3. Write `src/utils/registerCommands.ts`:
   ```typescript
   import { REST, Routes } from 'discord.js';
   import { readdirSync, statSync } from 'node:fs';
   import { join, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { config } from '../config.js';
   import { logger } from './logger.js';

   const __dirname = dirname(fileURLToPath(import.meta.url));

   /**
    * Register all slash commands with Discord's global application commands API.
    * Called ONCE from bot.ts (ShardingManager process) on startup.
    *
    * Uses PUT /applications/{id}/commands which is fully idempotent:
    * - Creates new commands not yet registered
    * - Updates changed command definitions
    * - Removes commands no longer in the list
    *
    * Rate limit: Discord allows ~200 global registrations/day per application.
    * Running in manager (not shards) ensures this is called exactly once per restart.
    */
   export async function registerCommands(): Promise<void> {
     const commandsPath = join(__dirname, '../commands');
     const commandData: unknown[] = [];

     const folders = readdirSync(commandsPath).filter((item) =>
       statSync(join(commandsPath, item)).isDirectory(),
     );

     for (const folder of folders) {
       const folderPath = join(commandsPath, folder);
       const files = readdirSync(folderPath).filter((f) => f.endsWith('.js'));

       for (const file of files) {
         const filePath = join(folderPath, file);
         const command = await import(filePath) as { data?: { toJSON(): unknown } };
         if (command.data) {
           commandData.push(command.data.toJSON());
         }
       }
     }

     const rest = new REST().setToken(config.DISCORD_TOKEN);
     await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body: commandData });
     logger.info('RegisterCommands', `Registered ${commandData.length} global slash commands`);
   }
   ```

4. Write `src/utils/commandLoader.ts`:
   ```typescript
   import { Client, Collection } from 'discord.js';
   import { readdirSync, statSync } from 'node:fs';
   import { join, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { logger } from './logger.js';

   const __dirname = dirname(fileURLToPath(import.meta.url));

   interface Command {
     data: { name: string; toJSON(): unknown };
     execute: (...args: unknown[]) => Promise<void>;
   }

   /**
    * Load all command modules into client.commands Collection for runtime dispatch.
    * This does NOT register commands with Discord — see registerCommands.ts for that.
    * Called in each shard process on startup.
    */
   export async function loadCommands(client: Client): Promise<void> {
     client.commands = new Collection();
     const commandsPath = join(__dirname, '../commands');

     // Recurse into category subdirectories (D-03)
     const folders = readdirSync(commandsPath).filter((item) =>
       statSync(join(commandsPath, item)).isDirectory(),
     );

     for (const folder of folders) {
       const folderPath = join(commandsPath, folder);
       const files = readdirSync(folderPath).filter((f) => f.endsWith('.js'));

       for (const file of files) {
         const filePath = join(folderPath, file);
         const command = (await import(filePath)) as Command;

         if ('data' in command && 'execute' in command) {
           client.commands.set(command.data.name, command);
           logger.debug('CommandLoader', `Loaded: ${folder}/${file}`);
         } else {
           logger.warn('CommandLoader', `Skipping ${folder}/${file} — missing data or execute export`);
         }
       }
     }

     logger.info('CommandLoader', `Loaded ${client.commands.size} commands`);
   }
   ```

4. Write `src/utils/eventLoader.ts`:
   ```typescript
   import { Client } from 'discord.js';
   import { readdirSync } from 'node:fs';
   import { join, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { logger } from './logger.js';

   const __dirname = dirname(fileURLToPath(import.meta.url));

   interface EventHandler {
     name: string;
     once?: boolean;
     execute: (...args: unknown[]) => Promise<void>;
   }

   export async function loadEvents(client: Client): Promise<void> {
     const eventsPath = join(__dirname, '../events');
     const files = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

     for (const file of files) {
       const filePath = join(eventsPath, file);
       const event = (await import(filePath)) as EventHandler;

       if (event.once) {
         client.once(event.name, (...args) => event.execute(...args));
       } else {
         client.on(event.name, (...args) => event.execute(...args));
       }

       logger.debug('EventLoader', `Loaded: ${file} (${event.once ? 'once' : 'on'})`);
     }

     logger.info('EventLoader', `Loaded ${files.length} events`);
   }
   ```

5. Write `src/events/ready.ts`:
   ```typescript
   import { Events, type Client } from 'discord.js';
   import { logger } from '../utils/logger.js';

   export const name = Events.ClientReady;
   export const once = true;

   export async function execute(client: Client): Promise<void> {
     logger.info('Ready', `Logged in as ${client.user?.tag} (Shard ${client.shard?.ids.join(', ')})`);
   }
   ```

6. Write `src/events/interactionCreate.ts`:
   ```typescript
   import { Events, type Interaction } from 'discord.js';
   import { logger } from '../utils/logger.js';
   import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';
   import { resolveLocale, getT } from '../i18n/index.js';

   export const name = Events.InteractionCreate;

   export async function execute(interaction: Interaction): Promise<void> {
     if (!interaction.isChatInputCommand()) return;

     const command = interaction.client.commands?.get(interaction.commandName);

     if (!command) {
       logger.warn('InteractionCreate', `Unknown command: ${interaction.commandName}`);
       return;
     }

     try {
       await command.execute(interaction);
     } catch (err) {
       logger.error('InteractionCreate', `Error in command ${interaction.commandName}`, err);

       // TODO (Phase 2): Fetch user locale from DB for stored preference
       const locale = resolveLocale(null, interaction.locale);
       const t = getT(locale);

       const errorEmbed = buildErrorEmbed(t('errors.internalError'));

       if (interaction.replied || interaction.deferred) {
         await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
       } else {
         await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
       }
     }
   }
   ```

7. Write `src/commands/game/ping.ts`:
   ```typescript
   import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
   import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';
   import { resolveLocale, getT } from '../../i18n/index.js';

   export const data = new SlashCommandBuilder()
     .setName('ping')
     .setDescription('Check bot latency and status');

   export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
     const locale = resolveLocale(null, interaction.locale);
     const t = getT(locale);

     const latency = interaction.client.ws.ping;
     const embed = buildSuccessEmbed(
       t('system.botName'),
       `WebSocket latency: **${latency}ms**\nShard: **${interaction.client.shard?.ids[0] ?? 'N/A'}**`,
       interaction.client.shard?.ids[0],
     );

     await interaction.reply({ embeds: [embed] });
   }
   ```

**Verification:**
```bash
# Full build passes
npm run build   # Must complete without errors

# Bot starts (requires .env with valid DISCORD_TOKEN)
node dist/bot.js &
# Must see logs:
# [INFO] [ShardingManager] Starting TuTien Bot...
# [INFO] [pgBoss] Started
# [INFO] [Health] Server listening on port 3000
# [INFO] [ShardingManager] Shard 0 ready
# [INFO] [Ready] Logged in as BotName#XXXX

# /ping command must respond with embed (test in Discord)
```

---

### T-10: Health Check HTTP Server

**Requirements:** INFRA-07
**Goal:** Create a Fastify health check server running in the ShardingManager process. Returns JSON with database status, Redis status, shard statuses, and uptime. Imported and started by `bot.ts`.

**Files:**
- `src/workers/health.ts` — Fastify server, `GET /health` endpoint with DB + Redis + shard status

**Implementation:**

1. Write `src/workers/health.ts`:
   ```typescript
   import Fastify from 'fastify';
   import type { ShardingManager } from 'discord.js';
   import { db } from '../db/client.js';
   import { redisHealthCheck } from '../cache/redis.js';
   import { config } from '../config.js';
   import { logger } from '../utils/logger.js';
   import { sql } from 'drizzle-orm';

   /**
    * Start the health check HTTP server.
    * Must only be called from bot.ts (ShardingManager process).
    * Shards do NOT expose a health endpoint.
    *
    * @param manager - ShardingManager instance for querying shard statuses
    */
   export async function startHealthServer(manager?: ShardingManager): Promise<void> {
     const fastify = Fastify({ logger: false });

     fastify.get('/health', async (_request, reply) => {
       const startTime = Date.now();

       // Run DB and Redis checks in parallel
       const [dbOk, redisOk] = await Promise.all([
         db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
         redisHealthCheck(),
       ]);

       // Collect shard WebSocket status codes (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
       let shards: { id: number; status: number }[] = [];
       if (manager) {
         try {
           const rawStatuses = await manager.fetchClientValues('ws.status') as number[];
           shards = rawStatuses.map((status, id) => ({ id, status }));
         } catch {
           shards = [];
         }
       }

       const allShardsReady = shards.length === 0 || shards.every((s) => s.status === 1);
       const healthy = dbOk && redisOk && allShardsReady;
       const statusCode = healthy ? 200 : 503;

       return reply.status(statusCode).send({
         status: healthy ? 'ok' : 'degraded',
         uptime: process.uptime(),
         responseTimeMs: Date.now() - startTime,
         db: dbOk ? 'ok' : 'error',
         redis: redisOk ? 'ok' : 'error',
         shards,
         timestamp: new Date().toISOString(),
       });
     });

     // Graceful shutdown route (for deploy script validation)
     fastify.get('/ready', async (_request, reply) => {
       return reply.status(200).send({ ready: true });
     });

     await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
     logger.info('Health', `Server listening on port ${config.PORT}`);
   }
   ```

**Verification:**
```bash
# With bot running:
curl http://localhost:3000/health

# Expected response (all ok):
# {
#   "status": "ok",
#   "uptime": 12.345,
#   "responseTimeMs": 8,
#   "db": "ok",
#   "redis": "ok",
#   "shards": [{ "id": 0, "status": 1 }],
#   "timestamp": "2026-04-11T..."
# }
# HTTP 200

# With Redis down, expect:
# { "status": "degraded", "redis": "error", ... }
# HTTP 503
```

---

### T-11: ESLint Flat Config & Husky Pre-Commit Hook

**Requirements:** I18N-03, D-13
**Goal:** Configure ESLint 9 flat config with TypeScript rules and eslint-plugin-i18next. Set up Husky v9 pre-commit hook with lint-staged. Initial i18next rule starts as `warn` (tuning in T-12).

**Files:**
- `eslint.config.mjs` — ESLint 9 flat config: TypeScript + i18next rules
- `.husky/pre-commit` — runs lint-staged
- `.husky/` — initialized by `npx husky init`

**Implementation:**

1. Write `eslint.config.mjs`:
   ```javascript
   import i18next from 'eslint-plugin-i18next';
   import tseslint from 'typescript-eslint';

   export default [
     // TypeScript recommended rules for all src/ TypeScript files
     ...tseslint.configs.recommended,

     // i18next flat config recommended (ESLint 9 / flat config format)
     i18next.configs['flat/recommended'],

     {
       files: ['src/**/*.ts'],
       rules: {
         // TypeScript: allow underscore-prefixed unused variables (e.g., _request)
         '@typescript-eslint/no-unused-vars': ['error', {
           argsIgnorePattern: '^_',
           varsIgnorePattern: '^_',
         }],

         // i18next: detect hardcoded user-facing strings
         // PHASE 1: Start as 'warn' — mode: 'all' generates false positives in Node.js
         // (console.log, new Error(), pg-boss queue names, config keys all get flagged)
         // T-12 will tune exclusion lists and promote to 'error'
         'i18next/no-literal-string': ['warn', {
           mode: 'all',
           ignoreCallee: [
             // Console / logging — these are developer-facing, not user-facing
             'console.log', 'console.error', 'console.warn', 'console.debug', 'console.info',
             'logger.info', 'logger.warn', 'logger.error', 'logger.debug',
             // Error constructors — internal errors, not user display
             'new Error', 'new TypeError', 'new RangeError',
             // pg-boss internal queue names — not user-facing
             'boss.createQueue', 'boss.schedule', 'boss.work',
             // process
             'process.exit', 'process.env',
           ],
         }],
       },
     },

     // Exclude non-source files from i18next lint
     {
       ignores: [
         'dist/**',
         'migrations/**',
         'scripts/**',
         'ecosystem.config.js',
         'drizzle.config.ts',
         'eslint.config.mjs',
       ],
     },
   ];
   ```

2. Initialize Husky:
   ```bash
   npx husky init
   # This creates .husky/ directory and adds "prepare": "husky" to package.json
   ```

3. Write `.husky/pre-commit`:
   ```sh
   npx lint-staged
   ```

4. Verify `package.json` has `lint-staged` configuration:
   ```json
   "lint-staged": {
     "src/**/*.ts": ["eslint --max-warnings=0"]
   }
   ```

**Verification:**
```bash
# ESLint runs without crash
npm run lint   # Will show warnings for hardcoded strings (expected at this stage)

# Husky hook installed
cat .husky/pre-commit   # Must show: npx lint-staged

# Test pre-commit hook fires
git add src/commands/game/ping.ts
git commit -m "test: verify hook"   # Hook must run lint-staged, may warn but not block
```

---

### T-12: ESLint i18n Rule Tuning & Promotion to Error

**Requirements:** I18N-03 (completion)
**Goal:** With all Phase 1 code written, run ESLint with `mode: 'all'` and audit every warning. Tune `ignoreCallee` and `words.exclude` patterns to eliminate false positives, then promote the rule from `warn` to `error`. Verify that actual hardcoded user-facing strings ARE caught.

**Files:**
- `eslint.config.mjs` — update: promote `warn` → `error`, finalize exclusion patterns

**Implementation:**

1. Run the linter and capture all warnings:
   ```bash
   npm run lint 2>&1 | grep "no-literal-string"
   ```

2. For each warning, determine: Is this a legitimate user-facing string (should be in locale file) or a false positive (internal identifier, debug string, technical name)?

3. **False positive patterns to add to `ignoreCallee`:**
   - Log calls: `console.*`, `logger.*` (already excluded in T-11)
   - Error constructors: `new Error`, `new TypeError` (already excluded)
   - pg-boss: `boss.createQueue`, `boss.schedule`, `boss.work` (already excluded)
   - Add any additional patterns discovered in this audit

4. **False positive patterns to add to `words.exclude`:**
   - Technical identifiers matching `^[a-z][a-z0-9\-_.:/]+$` (kebab/dot/slash paths)
   - Constant identifiers: all-caps like `DISCORD_TOKEN`, `DATABASE_URL`
   - Add discovered patterns as regex in `words.exclude`

5. Update `eslint.config.mjs` with tuned exclusion patterns:
   ```javascript
   'i18next/no-literal-string': ['error', {   // Changed from 'warn' to 'error'
     mode: 'all',
     ignoreCallee: [
       // ... (all patterns from T-11 plus newly discovered ones)
     ],
     words: {
       exclude: [
         '^[a-z][a-z0-9\\-_.:/]+$',   // kebab/dot/colon identifiers (queue names, routes, keys)
         '^[A-Z][A-Z0-9_]+$',          // SCREAMING_SNAKE_CASE constants (env var names)
       ],
     },
   }],
   ```

6. Run linter again — must show ZERO warnings/errors from `no-literal-string`:
   ```bash
   npm run lint   # Must exit 0 with no warnings
   ```

7. **Verify the rule still catches real violations.** Add a deliberate hardcoded string, confirm it's flagged:
   ```bash
   # Temporarily add to src/commands/game/ping.ts:
   # await interaction.reply('hardcoded string test');
   npm run lint   # Must show error for this line
   # Then revert the temporary change
   ```

8. Commit the tuned config:
   ```bash
   git add eslint.config.mjs
   git commit -m "chore(lint): tune i18n rule exclusions, promote to error"
   ```

**Verification:**
```bash
npm run lint    # Exit 0, zero warnings

# Pre-commit hook now blocks hardcoded strings:
# Try: echo 'interaction.reply("test");' >> src/commands/game/ping.ts
# git add src/commands/game/ping.ts && git commit -m "test"
# Must be BLOCKED by lint-staged
```

---

### T-13: pm2 Ecosystem Config

**Requirements:** D-09
**Goal:** Configure pm2 to manage the compiled bot process. Enforce fork mode (not cluster — ShardingManager spawns its own processes). Configure log paths, auto-restart limits, and memory threshold.

**Files:**
- `ecosystem.config.js` — pm2 process configuration
- `logs/` — directory for pm2 log output (gitignored)

**Implementation:**

1. Create `logs/` directory:
   ```bash
   mkdir -p logs
   echo "*.log" >> .gitignore
   ```

2. Write `ecosystem.config.js`:
   ```javascript
   // pm2 ecosystem config for TuTien Bot
   // CRITICAL: exec_mode MUST be 'fork', NOT 'cluster'
   // ShardingManager spawns its own shard child processes.
   // Using cluster mode would fork the ShardingManager itself N times = N² shards.

   module.exports = {
     apps: [
       {
         name: 'tutien-bot',
         script: './dist/bot.js',

         // Fork mode — ShardingManager is 1 process; it spawns shards internally
         instances: 1,
         exec_mode: 'fork',

         // Node flags
         node_args: '--enable-source-maps',

         // Environment
         env: {
           NODE_ENV: 'development',
         },
         env_production: {
           NODE_ENV: 'production',
         },

         // Memory guard — restart if ShardingManager process exceeds 1GB
         // (individual shard processes are separate — this only guards the manager)
         max_memory_restart: '1G',

         // Restart policy
         restart_delay: 5_000,     // 5s delay between crash restarts
         max_restarts: 10,         // Stop restarting after 10 crashes in min_uptime window
         min_uptime: '30s',        // Must stay up 30s to be considered a clean start

         // Logging
         error_file: './logs/err.log',
         out_file: './logs/out.log',
         merge_logs: true,
         time: true,               // Prefix all log lines with ISO timestamp

         // Source maps for better stack traces
         source_map_support: true,
       },
     ],
   };
   ```

3. On the Oracle VM, start the bot with pm2:
   ```bash
   cd /home/ubuntu/tutien-bot
   npm run build   # Compile TypeScript first
   pm2 start ecosystem.config.js --env production
   pm2 save        # Persist process list for system restart
   pm2 status      # Verify: tutien-bot is 'online' with 0 restarts
   ```

**Verification:**
```bash
# pm2 shows bot running
pm2 status   # Must show: tutien-bot | online | 0 restarts

# pm2 exec_mode is fork
pm2 describe tutien-bot | grep exec_mode   # Must show: fork

# Logs being written
tail -f logs/out.log   # Must show startup logs
```

---

### T-14: GitHub Actions CI/CD Pipeline

**Requirements:** INFRA-06, D-08
**Goal:** Create two GitHub Actions workflows: `ci.yml` for lint/build/test on every push/PR, and `deploy.yml` for SSH deploy to Oracle VM on push to `main`. The deploy script must source nvm PATH before executing any commands. drizzle-kit migrate must use `DATABASE_URL_DIRECT` (direct PostgreSQL, bypassing PgBouncer).

**Files:**
- `.github/workflows/ci.yml` — lint + typecheck + test on push/PR
- `.github/workflows/deploy.yml` — SSH deploy on push to `main`
- `scripts/deploy.sh` — deploy script run on Oracle VM via SSH

**Implementation:**

1. Create directories:
   ```bash
   mkdir -p .github/workflows scripts
   ```

2. Write `.github/workflows/ci.yml`:
   ```yaml
   name: CI

   on:
     push:
       branches: ['**']
     pull_request:
       branches: [main]

   jobs:
     ci:
       name: Lint, Build & Test
       runs-on: ubuntu-latest

       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup Node.js 22
           uses: actions/setup-node@v4
           with:
             node-version: '22'
             cache: 'npm'

         - name: Install dependencies
           run: npm ci

         - name: Lint
           run: npm run lint

         - name: Typecheck
           run: npm run typecheck

         - name: Check i18n keys
           run: npm run check-i18n

         - name: Test
           run: npm test

         - name: Build
           run: npm run build
   ```

3. Write `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy

   on:
     push:
       branches: [main]

   jobs:
     ci:
       name: Lint, Build & Test
       uses: ./.github/workflows/ci.yml

     deploy:
       name: Deploy to Oracle VM
       needs: ci
       runs-on: ubuntu-latest

       steps:
         - name: Deploy via SSH
           uses: appleboy/ssh-action@v1
           with:
             host: ${{ secrets.ORACLE_HOST }}
             username: ${{ secrets.ORACLE_USER }}
             key: ${{ secrets.ORACLE_SSH_KEY }}
             port: 22
             # Pin host fingerprint to prevent MITM — add this secret after first manual SSH
             # Generate: ssh-keyscan -t ed25519 168.138.8.160 | awk '{print $2, $3}'
             fingerprint: ${{ secrets.ORACLE_HOST_FINGERPRINT }}
             script_stop: true
             script: |
               # CRITICAL: Source nvm so npm/node/pm2 are in PATH
               # Non-interactive SSH sessions do NOT load ~/.bashrc
               # If Node was installed via nvm, it's not in PATH without this
               export NVM_DIR="$HOME/.nvm"
               [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
               nvm use 22   # Pin to .nvmrc version; fail fast if 22 not installed

               set -e  # Exit on any error — any failure aborts the deploy

               cd /home/ubuntu/tutien-bot

               git pull origin main

               npm ci

               npm run build

               # Load production secrets for migration
               source /etc/tutien/.env

               # CRITICAL: drizzle-kit migrate MUST use DATABASE_URL_DIRECT (port 5432)
               # PgBouncer transaction mode breaks advisory locks used during migrations
               # Runtime code uses DATABASE_URL (port 6432 via PgBouncer)
               # If migrate fails, set -e aborts before pm2 restart — app stays on old schema
               DATABASE_URL="$DATABASE_URL_DIRECT" npx drizzle-kit migrate

               pm2 restart tutien-bot

               # Wait for bot startup and verify full health (DB + Redis + shards)
               # Uses /health (not /ready) — /health verifies all dependencies are live,
               # not just that Fastify is listening
               sleep 8
               curl -f http://localhost:3000/health | grep '"status":"ok"' \
                 || (echo "Health check failed — deploy may be broken!" && exit 1)

               echo "Deploy complete."
   ```

4. Write `scripts/deploy.sh` (standalone deploy script for manual deploys):
   ```bash
   #!/usr/bin/env bash
   # Manual deploy script — mirrors what GitHub Actions runs
   # Usage: ./scripts/deploy.sh

   set -e

   # Source nvm — required if Node installed via nvm
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   nvm use 22   # Pin Node version to match .nvmrc

   echo "[deploy] Pulling latest code..."
   git pull origin main

   echo "[deploy] Installing dependencies..."
   npm ci

   echo "[deploy] Building..."
   npm run build

   echo "[deploy] Running migrations (direct PostgreSQL connection)..."
   source /etc/tutien/.env
   DATABASE_URL="$DATABASE_URL_DIRECT" npx drizzle-kit migrate

   echo "[deploy] Restarting bot..."
   pm2 restart tutien-bot

   echo "[deploy] Verifying health..."
   sleep 8
   curl -f http://localhost:3000/health | grep '"status":"ok"' \
     || (echo "[deploy] Health check failed!" && exit 1)

   echo "[deploy] ✅ Deploy complete."
   ```

5. Make it executable:
   ```bash
   chmod +x scripts/deploy.sh
   ```

6. Add required GitHub Secrets (do this in GitHub repository Settings → Secrets → Actions):
   - `ORACLE_HOST` = `168.138.8.160`
   - `ORACLE_USER` = `ubuntu`
   - `ORACLE_SSH_KEY` = private key content (generate with `ssh-keygen -t ed25519 -C "github-actions-deploy"`, add public key to VM's `~/.ssh/authorized_keys`)
   - `ORACLE_HOST_FINGERPRINT` = SSH host fingerprint for MITM protection
     ```bash
     # Generate on your local machine after first SSH to the VM:
     ssh-keyscan -t ed25519 168.138.8.160 | awk '{print $2, $3}'
     # Copy the output (e.g., "ssh-ed25519 AAAA...") into the secret
     ```

**Verification:**
```bash
# Push a commit to main and observe GitHub Actions:
git push origin main
# CI job: must pass lint + typecheck + check-i18n + build
# Deploy job: must SSH to VM, run script, pass health check

# Verify deploy completed:
ssh ubuntu@168.138.8.160 "pm2 status"   # Must show tutien-bot online
curl http://168.138.8.160:3000/health    # Must return {"status":"ok",...}
```

---

### T-15: Unit Tests for Pure Utilities

**Requirements:** INFRA-06 (CI/CD pipeline must have a working `npm test`)
**Goal:** Write a minimal vitest test suite covering pure utility functions that require no running services. Ensures CI has a real `npm test` step that validates foundation logic, not just TypeScript compilation.

**Scope:** Pure functions only — no DB, no Redis, no Discord API. Tests that need external services belong in Phase 2+ integration tests.

**Files:**
- `src/utils/__tests__/format.test.ts` — tests for `formatBalance()`
- `src/i18n/__tests__/resolveLocale.test.ts` — tests for `resolveLocale()`
- `src/config/__tests__/config.test.ts` — tests for Zod schema validation logic (using test env, not real env)
- `vitest.config.ts` — vitest configuration

**Implementation:**

1. Write `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'node',
       include: ['src/**/__tests__/**/*.test.ts'],
     },
   });
   ```

2. Write `src/utils/__tests__/format.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { formatBalance } from '../format.js';

   describe('formatBalance', () => {
     it('formats zero', () => {
       expect(formatBalance(0n)).toBe('0');
     });

     it('formats small integers', () => {
       expect(formatBalance(1000n)).toBe('1,000');
     });

     it('formats large safe integer', () => {
       expect(formatBalance(1_234_567n)).toBe('1,234,567');
     });

     it('formats values above MAX_SAFE_INTEGER with manual separator', () => {
       // 10 quadrillion — above Number.MAX_SAFE_INTEGER
       expect(formatBalance(10_000_000_000_000_000n)).toBe('10,000,000,000,000,000');
     });
   });
   ```

3. Write `src/i18n/__tests__/resolveLocale.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { resolveLocale } from '../index.js';

   describe('resolveLocale', () => {
     it('returns stored locale when present', () => {
       expect(resolveLocale('en', 'zh')).toBe('en');
     });

     it('falls back to interaction locale when stored is null', () => {
       expect(resolveLocale(null, 'en-US')).toBe('en');
     });

     it('normalizes zh-TW to zh-cn', () => {
       expect(resolveLocale(null, 'zh-TW')).toBe('zh-cn');
     });

     it('falls back to vi for unsupported locale', () => {
       expect(resolveLocale(null, 'fr')).toBe('vi');
     });

     it('falls back to vi when both are null', () => {
       expect(resolveLocale(null, null)).toBe('vi');
     });
   });
   ```

**Note:** `resolveLocale` is a pure function — it does not call i18next or touch any external service. It can be imported and tested without `initI18n()`.

**Verification:**
```bash
npm test   # Must output: all tests passed
# Expected: 9 tests across 2 test files, 0 failures

npm run typecheck   # Test files must typecheck cleanly
```

---

## Dependency Graph

```
T-01 (Bootstrap & TypeScript)
├── T-02 (Config Module)           needs: T-01
│   ├── T-04 (DB Schema)           needs: T-02 + T-03 (VM ready)
│   │   └── T-06 (pg-boss)         needs: T-04
│   ├── T-05 (Redis Client)        needs: T-02
│   └── T-09 (ShardingManager)     needs: T-02, T-04, T-05, T-06, T-07, T-08
│       ├── T-10 (Health Check)    needs: T-09, T-04, T-05
│       └── T-12 (i18n Rule Tune)  needs: T-09 (all code written), T-11
├── T-07 (i18n Scaffold)           needs: T-01
├── T-08 (Assets & UI Theme)       needs: T-01
├── T-11 (ESLint + Husky)          needs: T-01
└── T-15 (Unit Tests)              needs: T-02, T-05 (uses formatBalance, resolveLocale)

T-03 (Oracle VM Setup)             needs: nothing (parallel with T-01; human action)

T-13 (pm2 Config)                  needs: T-09
T-14 (CI/CD Pipeline)              needs: T-03, T-09, T-10, T-13, T-15
```

---

## Execution Order

Execute in this order. Tasks on the same wave can run in parallel.

| Wave | Task | Parallelizable With | Notes |
|------|------|---------------------|-------|
| 1 | **T-01** Repository Bootstrap | T-03 | Must be first code task |
| 1 | **T-03** Oracle VM Setup | T-01 | Human action — do in parallel while T-01 runs |
| 2 | **T-02** Config Module | — | Needs T-01 |
| 2 | **T-07** i18n Scaffold | T-08, T-11 | Needs T-01; parallel with T-08 and T-11 |
| 2 | **T-08** Assets & UI Theme | T-07, T-11 | Needs T-01; parallel with T-07 and T-11 |
| 2 | **T-11** ESLint + Husky (initial) | T-07, T-08 | Needs T-01; set rule as 'warn' for now |
| 3 | **T-04** DB Schema & Drizzle | T-05 | Needs T-02 + T-03 both complete |
| 3 | **T-05** Redis Client | T-04 | Needs T-02; parallel with T-04 |
| 3 | **T-15** Unit Tests | T-04, T-05 | Needs T-02 + T-07 (uses formatBalance, resolveLocale) |
| 4 | **T-06** pg-boss Scheduler | — | Needs T-04 |
| 5 | **T-09** ShardingManager Entry | — | Needs T-02, T-04, T-05, T-06, T-07, T-08 all done |
| 6 | **T-10** Health Check Server | T-12, T-13 | Needs T-09 |
| 6 | **T-12** ESLint i18n Tuning | T-10, T-13 | Needs T-09 + T-11 (all code written) |
| 6 | **T-13** pm2 Config | T-10, T-12 | Needs T-09 |
| 7 | **T-14** CI/CD Pipeline | — | Needs T-03, T-09, T-10, T-13, T-15 all done |

**Critical path:** T-01 → T-02 → T-04 → T-06 → T-09 → T-14

**Human-action checkpoint:** T-03 (Oracle VM Setup) must complete before T-04 can run migrations against the VM. Begin T-03 while T-01/T-02/T-07/T-08/T-11 are executing.

---

## Requirement Coverage Matrix

| Requirement | Tasks | Coverage |
|-------------|-------|----------|
| INFRA-01: ShardingManager startup, auto-shard | T-09 | Full |
| INFRA-02: Drizzle migrations for users + seasons | T-04 | Full |
| INFRA-03: Redis connect, cooldown + VWAP cache | T-05 | Full |
| INFRA-04: pg-boss VWAP cron 1 hour | T-06 | Full |
| INFRA-05: i18n scaffold VI/EN/ZH-CN, zero hardcoded | T-07, T-11, T-12 | Full |
| INFRA-06: CI/CD lint → build → test → SSH deploy | T-14, T-15 | Full |
| INFRA-07: Health check endpoint, shard status | T-10 | Full |
| I18N-01: Locale resolution per interaction | T-07 | Full |
| I18N-02: Locale files VI/EN/ZH-CN + missing key CLI | T-07 | Full |
| I18N-03: ESLint rule + pre-commit hook | T-11, T-12 | Full |
| D-01: src/ flat by concern | T-01 | Full |
| D-02: Two entry points bot.ts + shard.ts | T-09 | Full |
| D-03: Commands auto-discovered | T-09 | Full — runtime loading in commandLoader; registration in registerCommands (manager only) |
| D-04: users + seasons tables, BIGINT | T-04 | Full |
| D-05: Schema one file per domain | T-04 | Full |
| D-06: Zod validation at startup | T-02 | Full |
| D-07: Single config.ts, no direct process.env | T-02 | Full |
| D-08: GitHub Actions SSH deploy | T-14 | Full |
| D-09: pm2 fork mode, dist/bot.js | T-13 | Full |
| D-10: No Docker, PgBouncer from day 1 | T-03, T-04 | Full |
| D-11: Locale resolution order | T-07 | Full |
| D-12: i18n namespaces by domain | T-07 | Full |
| D-13: eslint-plugin-i18next + husky + lint-staged | T-11, T-12 | Full |
| D-14: Typed emoji registry | T-08 | Full |
| D-15: Asset registries in src/assets/ | T-08 | Full |
| D-16: Embed builders in src/ui/embeds/ | T-08 | Full |
| D-17: Shared theme at src/ui/theme.ts | T-08 | Full |

---

## Threat Model

### Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Discord → Bot | All events and interactions arrive via Discord WebSocket/REST; content is user-controlled |
| GitHub Actions → Oracle VM | Deploy pipeline SSHs to VM; key must be kept secret |
| Internet → Health Endpoint | Port 3000 exposed; must not leak secrets or internal state |
| Shard → ShardingManager | IPC over `broadcastEval` — internal, trusted |
| Bot → PostgreSQL/Redis | Local connections only (127.0.0.1); not exposed to internet |

### STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-01-01 | Information Disclosure | `DISCORD_TOKEN` | mitigate | Stored in `.env` (gitignored); in GitHub Secret; never logged; `config.ts` Zod validation ensures format |
| T-01-02 | Tampering | `balance` column | mitigate | `CHECK (balance >= 0)` DB constraint in `users.ts`; runtime uses atomic `UPDATE ... WHERE balance >= $amount` (Phase 2) |
| T-01-03 | Information Disclosure | `ORACLE_SSH_KEY` | mitigate | Stored as GitHub Secret only; never committed to repo; `.gitignore` covers `*.key`, `*.pem` |
| T-01-04 | Tampering | Config values via `process.env` | mitigate | Convention enforced: all env access through `src/config.ts`; Zod schema rejects malformed values; process exits on bad config |
| T-01-05 | Information Disclosure | `/health` endpoint | mitigate | Response excludes secrets, tokens, or DB query data; returns only status strings + numeric counters; bind to `0.0.0.0` but restrict via Oracle Security List rules |
| T-01-06 | Elevation of Privilege | pg-boss schema in DB | accept | pg-boss uses dedicated `pgboss` schema; accessible only from localhost connections; no internet exposure |
| T-01-07 | Denial of Service | Health check DB query | mitigate | `SELECT 1` query with connection timeout 5s; Fastify timeout; single lightweight check |
| T-01-08 | Spoofing | Deploy script source | mitigate | Deploy pulls from `main` branch using authenticated git; SSH key authenticates runner identity |

---

## Rollback Plan

### Per-Task Rollbacks

**T-03 (VM Setup):** All VM-level changes are additive. To undo: `sudo systemctl stop pgbouncer redis-server postgresql`, `sudo apt remove pgbouncer redis-server postgresql-16`. Data loss: entire database. Accept — Phase 1 has no production data.

**T-04 (DB Migrations):** drizzle-kit does not generate rollback SQL automatically. Keep the generated migration SQL files. Manual rollback:
```sql
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DELETE FROM __drizzle_migrations WHERE migration_name LIKE '0000%';
```

**T-09 (Bot Code):** Git revert: `git revert HEAD~N..HEAD` where N = number of commits to undo. Then redeploy: `./scripts/deploy.sh`.

**T-14 (CI/CD):** If deploy workflow fails mid-run (after `git pull` but before `pm2 restart`): SSH to VM and run `git reset --hard HEAD~1 && npm ci && npm run build && pm2 restart tutien-bot`.

**pm2 Previous Version:** pm2 keeps a process history. To restore previous binary: `pm2 stop tutien-bot && git checkout <previous-commit> && npm run build && pm2 start ecosystem.config.js --env production`.

### Emergency Recovery

If the bot is completely down and SSH is unavailable:
1. Reboot the Oracle Cloud VM from the OCI console
2. pm2 startup script auto-runs `pm2 resurrect` on boot (configured in T-03 Step 6)
3. If pm2 saved process list is valid, bot auto-starts

If the database is corrupted:
1. Phase 1 has no critical user data — full drop and re-migrate is acceptable
2. Future phases should implement PostgreSQL WAL backups before accumulating real player data

---

*Plan created: 2026-04-11*
*Phase: 01-foundation*
*Requirements covered: INFRA-01..07, I18N-01..03 (10/10)*
