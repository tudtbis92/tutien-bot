<!-- GSD:project-start source:PROJECT.md -->
## Project

**TuTien Bot**

Discord bot RPG thể loại tu tiên (xianxia), hoạt động trên nhiều server đồng thời (multi-shard). Người chơi tích lũy tu vi thụ động thông qua mọi hoạt động Discord (chat, voice, react...), lên cảnh giới, thu thập tài nguyên, phát triển nghề nghiệp và giao dịch vật phẩm qua marketplace kinh tế động. Hỗ trợ đa ngôn ngữ từ đầu (i18n full).

**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

### Constraints

- **Platform**: Discord API — mọi interaction qua slash commands và message components
- **Sharding**: Phải tuân thủ Discord's gateway sharding requirements (research needed)
- **Currency**: Linh thạch là currency duy nhất; có thể nạp bằng tiền thật
- **Language**: i18n từ ngày đầu — không hardcode string nào
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| discord.js | **14.26.2** | Discord Gateway + REST API | Industry-standard, 100% Discord API coverage, best ecosystem. v15 exists in dev preview but not stable — use v14. Requires Node.js ≥18. |
| Node.js | **≥20 LTS** | Runtime | discord.js requires ≥18; Node 20 adds native `fetch`, performance improvements. Target 20 LTS for production stability. |
| TypeScript | **5.x** | Language | Type safety critical for complex game state. discord.js ships full types. |
### Sharding Strategy
#### When to shard
#### Shard count formula
#### Option A: discord.js built-in `ShardingManager` (RECOMMENDED for this project)
#### Option B: `discord-hybrid-sharding` v3.0.1
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | **16+** | Primary data store | ACID transactions essential for order matching, currency burns, market operations. Global shared state across shards requires a single source of truth. |
| Drizzle ORM | **0.45.2** + drizzle-kit 0.31.10 | Database client + migrations | See rationale below |
| `pg` (node-postgres) | **8.20.0** | PostgreSQL driver | Drizzle uses this under the hood; also needed for raw query escape hatches |
#### ORM Decision: Drizzle vs Prisma vs TypeORM
| Criterion | Drizzle | Prisma 7 | TypeORM |
|-----------|---------|----------|---------|
| Bundle size | ~50ms cold start | ~300ms cold start | ~600ms cold start |
| Raw SQL control | First-class (`sql` template) | `$queryRaw` (awkward) | Possible but verbose |
| PostgreSQL-specific features | Full (RETURNING, FOR UPDATE, etc.) | Partial | Partial |
| Transaction API | Native, clean | Works, but mixing with `$queryRaw` breaks boundaries | Verbose |
| Type safety | Inferred from schema | Generated client | Decorator-based |
| Migration tooling | drizzle-kit (excellent) | Prisma Migrate (excellent) | typeorm-cli (dated) |
| 2025–2026 trajectory | Cloud-native future | Comprehensive platform | Fading into maintenance |
### Job Queue / Scheduler
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **pg-boss** | **12.15.0** | VWAP recalculation every 1h, season transitions, scheduled burns | Already using PostgreSQL — no Redis needed. Uses `SKIP LOCKED` internally for safe concurrent job processing. |
#### Job Queue Decision: BullMQ vs pg-boss
| Criterion | pg-boss | BullMQ |
|-----------|---------|--------|
| Infrastructure dependency | PostgreSQL only | Redis required |
| ACID guarantees | Yes (same DB transaction) | No (Redis is eventually consistent) |
| Cron scheduling | Native (`schedule()`) | Native (`upsertJobScheduler`) |
| Throughput | ~100-500 jobs/sec | ~10,000+ jobs/sec |
| Job visibility/audit | Native (jobs are DB rows) | Manual |
| Failure recovery | ACID, jobs survive restarts | Needs separate setup |
- **No Redis in stack** = one fewer infrastructure dependency. The bot already has PostgreSQL; pg-boss uses the same connection pool.
- **VWAP recalculation is low-frequency** (every 1h per item). pg-boss's throughput (hundreds/sec) is more than sufficient.
- **ACID correctness**: If a VWAP update job crashes mid-transaction, it rolls back cleanly. With BullMQ/Redis, you'd need idempotency keys manually.
- **Cross-shard single-scheduler**: With multiple shard processes, only one worker should run VWAP recalculation. pg-boss's `SKIP LOCKED` pattern naturally ensures exactly-once execution.
### Caching Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **ioredis** | **5.10.1** | In-memory cache for hot data | Player stats cache (avoid DB read on every message event), rate limiting per user/guild, cooldown tracking |
- A **cooldown check** (has this user sent a message in the last X seconds?): Redis TTL-based key is the canonical pattern here.
- **Rate limiting** per shard/guild to comply with Discord API limits.
- **In-memory player profile cache** to avoid a DB round-trip on every single `messageCreate` event.
### i18n
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **i18next** | **26.0.4** | Full internationalization | Most mature i18n framework for Node.js, rich feature set |
| **i18next-fs-backend** | latest | Load translation files from disk | No HTTP backend needed in a bot |
- Supports **pluralization** (critical for Vietnamese — "1 linh thạch" vs "nhiều linh thạch"), **interpolation**, **namespaces** (separate by game system).
- Lookup pattern: `t('market.order.matched', { count: qty, item: itemName })` with automatic locale resolution per user/guild.
- Discord bots need per-user locale resolution, not a global `Accept-Language` header. i18next supports custom language detectors.
### Validation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | **4.3.6** | Runtime schema validation | Validate command inputs, config objects, market order parameters |
### Command Framework
| Option | Verdict |
|--------|---------|
| Raw discord.js | More control, less magic, recommended for complex RPG with custom middleware needs |
| @sapphire/framework (v5.5.0) | Feature-rich, good for standard slash commands, adds ~4MB to bundle, may conflict with custom shard lifecycle |
| discord-akairo | Archived/unmaintained |
| discord.js Commando | Unmaintained |
### Infrastructure / Deployment
| Technology | Purpose | Notes |
|------------|---------|-------|
| **Docker** | Containerization | One `ShardingManager` container + PostgreSQL + Redis |
| **Docker Compose** | Local dev | Single `docker-compose.yml` for local dev |
| **Railway / Render / Fly.io** | Cloud hosting | All support persistent containers; Railway simplest for PostgreSQL + Redis managed services |
| **PgBouncer** | Connection pooling | CRITICAL: with multiple shards each holding their own Drizzle pool, you risk exhausting PostgreSQL's max_connections. Use PgBouncer in transaction mode between shards and the database. |
## Full Dependency List
# Production dependencies
# Dev dependencies
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
## Architecture Integration Notes
### High-Frequency Event Handling (Every Message / Reaction / Voice State)
### Order Matching Engine
### Cross-Shard Global State
## Sharding Decision Tree
## Version Pinning Strategy
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
