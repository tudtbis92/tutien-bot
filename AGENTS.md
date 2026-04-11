<!-- GSD:project-start source:PROJECT.md -->
## Project

**TuTien Bot**

Discord bot RPG thể loại tu tiên (xianxia), hoạt động trên nhiều server đồng thời (multi-shard). Người chơi tích lũy tu vi thụ động thông qua mọi hoạt động Discord (chat, voice, react...), lên cảnh giới, thu thập tài nguyên, phát triển nghề nghiệp và giao dịch vật phẩm qua marketplace kinh tế động. Hỗ trợ đa ngôn ngữ từ đầu (i18n full).

**Core Value:** Mọi hoạt động Discord đều có ý nghĩa — mỗi tin nhắn, mỗi phút voice, mỗi reaction đều âm thầm xây dựng hành trình tu tiên của người chơi.

### Constraints

- **Platform**: Discord API — mọi interaction qua slash commands và message components
- **Runtime**: Node.js 22 LTS — discord.js 14.26.2 yêu cầu Node.js ≥22.12.0
- **Sharding**: ShardingManager từ ngày đầu; migrate sang discord-hybrid-sharding tại ~25K guilds
- **Currency**: Linh thạch là currency duy nhất; có thể nạp bằng tiền thật
- **Language**: i18n từ ngày đầu — không hardcode string nào; VI mặc định, EN + ZH-CN cùng lúc
- **TypeScript**: 5.8.x (không nâng TS 6.x cho đến khi ecosystem sẵn sàng)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| discord.js | **14.26.2** | Discord Gateway + REST API | Industry-standard, 100% Discord API coverage, best ecosystem. v15 vẫn pre-release ("should be usable" nhưng không khuyến nghị production — breaking changes chưa ổn định). discord.js 14.26.2 docs yêu cầu Node.js **≥22.12.0**. |
| Node.js | **22 LTS** ("Jod") | Runtime | v22 là Active LTS hiện tại (LTS đến 2027-04-30). v20 chuyển sang Maintenance LTS. v18 đã EOL. v24 là "Current", vào LTS tháng 10/2025. Target: **v22 LTS** cho production stability. |
| TypeScript | **5.x** (khuyến nghị 5.8.x) | Language | TS 6.0 đã ra (6.0.2) nhưng có breaking changes: `strict: true` default, bỏ ES5 target, bỏ `--outFile`. discord.js và nhiều ecosystem packages chưa fully migrate. Dùng **TypeScript 5.8.x** cho stability. Nâng cấp TS 6 trong Phase 2+. |
| @discordjs/rest | **2.6.1** | REST-only Discord API calls | Dùng cho Notification Worker (gửi DM, channel posts) mà không cần gateway connection. Cùng major version với discord.js 14. |
| @discordjs/voice | **0.19.2** | Voice state tracking | Cần cho voice activity tu vi accumulation nếu cần detailed voice tracking. Optional — basic voice state dùng `voiceStateUpdate` event đủ. |
### Sharding Strategy
#### When to shard
#### Shard count formula
#### Option A: discord.js built-in `ShardingManager` (RECOMMENDED khi khởi đầu)
#### Option B: `discord-hybrid-sharding` v3.0.1 (scale lớn)
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | **16+** | Primary data store | ACID transactions thiết yếu cho order matching, currency burns, global state cross-shard. |
| Drizzle ORM | **0.45.2** | Database client | Thin layer, SQL-proximity, `FOR UPDATE SKIP LOCKED` native, VWAP raw SQL expressions tự nhiên. Xem lý do chi tiết bên dưới. |
| drizzle-kit | **0.31.10** | Migrations + schema tooling | CLI cho `drizzle-kit migrate`, `drizzle-kit generate`, `drizzle-kit studio`. |
| `pg` (node-postgres) | **8.20.0** | PostgreSQL driver | Drizzle sử dụng `pg` dưới hood. |
#### ORM Decision: Drizzle vs Prisma vs TypeORM
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
### Job Queue / Scheduler
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **pg-boss** | **12.15.0** | VWAP recalculation mỗi 1h, season transitions, scheduled burns | PostgreSQL-native, ACID guarantees, không cần Redis cho jobs. `SKIP LOCKED` internally. |
#### Job Queue Decision: BullMQ vs pg-boss
| Criterion | pg-boss 12 | BullMQ |
|-----------|-----------|--------|
| Infrastructure dependency | PostgreSQL only | Redis required |
| ACID guarantees | Yes (same DB transaction) | No (Redis eventually consistent) |
| Cron scheduling | Native (`schedule()`) | Native (`upsertJobScheduler`) |
| Throughput | ~100–500 jobs/sec | ~10,000+ jobs/sec |
| Job visibility/audit | Native (jobs are DB rows) | Manual setup |
| Failure recovery | ACID, jobs survive restarts | Needs separate idempotency setup |
### Caching Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **ioredis** | **5.10.1** | Cooldowns, VWAP cache, voice session tracking, guild settings cache | Xem lý do chi tiết bên dưới |
#### Redis Client Decision: ioredis vs node-redis (package: `redis`)
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
- Toàn bộ Discord bot ecosystem (discord.js guides, community bots) sử dụng `ioredis` — code samples phổ biến hơn đáng kể.
- `defineCommand` cho custom Lua scripts (cooldown atomic check-and-set) ergonomics tốt hơn.
- Hoàn toàn production-ready; ioredis 5.10.1 cập nhật 12 ngày gần đây.
### i18n
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **i18next** | **26.0.4** | Full internationalization | Framework i18n mature nhất cho Node.js, pluralization, namespaces, fallbacks. |
| **i18next-fs-backend** | latest | Load translation files từ disk | Không cần HTTP backend trong bot. |
### Validation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | **4.3.6** | Runtime schema validation | Zod v4 stable (v4.0.1+ trở lên là stable). 14× faster hơn v3, TypeScript-native, top-level format validators (`z.email()`, `z.uuid()`). |
### Command Framework
| Option | Verdict |
|--------|---------|
| Raw discord.js | More control, less magic, recommended cho complex RPG với custom middleware |
| @sapphire/framework v5.5.0 | Feature-rich, `@sapphire/plugin-i18next` tích hợp sẵn. Viable nếu team quen. |
| discord-akairo | Archived/unmaintained |
| discord.js Commando | Unmaintained |
### Web Server (Payment Webhook)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Fastify** | **5.8.4** | HTTP server cho payment webhook receiver | Fastest Node.js web framework, schema-based validation tích hợp sẵn, TypeScript-first. v5 là latest stable (April 2025). |
### Infrastructure / Deployment
| Technology | Purpose | Notes |
|------------|---------|-------|
| **Docker** | Containerization | ShardingManager container + PostgreSQL + Redis |
| **Docker Compose** | Local dev | `docker-compose.yml` cho local dev |
| **Railway / Fly.io** | Cloud hosting | Hỗ trợ persistent containers; Railway đơn giản nhất cho PostgreSQL + Redis managed |
| **PgBouncer** | Connection pooling | CRITICAL: nhiều shards × Drizzle pool → exhaust PostgreSQL max_connections. Dùng PgBouncer transaction mode. |
## Full Dependency List
# Production dependencies
# Dev dependencies
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
## Architecture Integration Notes
### High-Frequency Event Handling (Every Message / Reaction / Voice State)
### Order Matching Engine
### Cross-Shard Global State
## Sharding Decision Tree
## Version Pinning Strategy
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
