# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 01-foundation
**Areas discussed:** Project structure, DB schema scope, Config & secrets, CI/CD pipeline, i18n wiring, Emoji/asset registry, Discord embed UX

---

## Project & Source Structure

### Q1: How should the src/ directory be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat by concern | src/commands/, src/events/, src/workers/, src/jobs/, src/db/, src/i18n/, src/utils/ | ✓ |
| Feature modules | src/core/, src/modules/character/, src/modules/marketplace/ — feature modules own their commands + events + db queries | |
| Process-first separation | Top-level: bot/, worker/, webhook/ — three independent entry points with shared src/lib/ | |

**User's choice:** Flat by concern

---

### Q2: How should ShardingManager vs. shard client be split as entry points?

| Option | Description | Selected |
|--------|-------------|----------|
| bot.ts + shard.ts (standard) | Two distinct entry points — standard discord.js ShardingManager pattern | ✓ |
| Single index.ts branching | Single index.ts checks DISCORD_SHARD_ID env to decide manager vs client | |
| index.ts + client.ts named | src/index.ts (manager), src/client.ts (shard client) with explicit named exports | |

**User's choice:** bot.ts + shard.ts (standard)

---

### Q3: How should slash commands be discovered and registered?

| Option | Description | Selected |
|--------|-------------|----------|
| File-per-command, auto-discovery | Each command is a file; auto-discovered at startup by reading src/commands/**/*.ts | |
| Explicit command registry | Explicit commands/index.ts that imports and re-exports all commands | |
| Category folders + auto-discovery | Commands grouped in folders by category (commands/game/, commands/admin/) with auto-discovery | ✓ |

**User's choice:** Category folders + auto-discovery

---

## DB Schema Scope for Phase 1

### Q4: Which tables should Phase 1 fully create vs. defer to later phases?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal bootstrap tables only | Phase 1 creates only what bootstrap needs: users (id, discord_id, balance BIGINT, locale), seasons (current season marker) | ✓ |
| Full schema upfront | Phase 1 creates all final tables from REQUIREMENTS.md (fully-shaped schema) | |
| All tables as skeletons | Phase 1 creates structural skeletons of all tables (correct columns, no constraints or indexes yet) | |

**User's choice:** Minimal bootstrap tables only

---

### Q5: How should Drizzle schema files be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| One file per domain | db/schema/users.ts, db/schema/economy.ts, db/schema/seasons.ts — merged in db/schema/index.ts | ✓ |
| Single schema.ts | Single db/schema.ts with all table definitions | |
| Co-located with modules | src/modules/users/schema.ts, src/modules/economy/schema.ts | |

**User's choice:** One file per domain

---

## Config & Secrets Management

### Q6: How should environment variables be loaded and validated?

| Option | Description | Selected |
|--------|-------------|----------|
| dotenv + Zod validation, fail-fast | .env loaded, all values parsed + validated with Zod at bot startup — fatal crash if any required var missing | ✓ |
| dotenv, lazy reads, no validation | .env loaded but values read lazily — no upfront validation | |
| OS env vars only, no .env | No .env file — all config as OS environment variables; Zod validates at startup | |

**User's choice:** dotenv + Zod validation, fail-fast

---

### Q7: How should the validated config be exposed to the rest of the codebase?

| Option | Description | Selected |
|--------|-------------|----------|
| Single config module (src/config.ts) | src/config.ts exports a single parsed+typed config object; Zod schema in the same file | ✓ |
| Per-service config slices | Each service reads its own slice: db/config.ts, redis/config.ts, etc. | |
| DI-injected config | Config injected via dependency injection container | |

**User's choice:** Single config module (src/config.ts)

---

## CI/CD Pipeline Design

### Q8: What should the CI/CD pipeline look like from day 1?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions → SSH deploy to VM | On push to main: lint + tsc + tests → SSH to Oracle VM → pull + restart | ✓ |
| GitHub Actions → Docker image → VM | Builds Docker image, pushes to registry, SSH to pull and run container | |
| CI only, manual deploy | GitHub Actions runs CI only; deployment is manual | |

**User's choice:** GitHub Actions → SSH deploy to VM

---

### Q9: How should the bot process be managed on the Oracle Cloud VM?

| Option | Description | Selected |
|--------|-------------|----------|
| pm2 process manager | pm2 with ecosystem.config.js — auto-restart on crash, startup on reboot | ✓ |
| systemd service | Systemd service file — more native Linux | |
| Docker Compose on VM | Bot + PostgreSQL + Redis all containerized | |

**User's choice:** pm2 process manager

---

### Q10: Where do PostgreSQL and Redis run?

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL + Redis on Oracle VM directly | Installed as services on the VM — simple, no orchestration needed at this scale | ✓ |
| Docker Compose for DB + Redis on VM | Both run in Docker containers, managed by Docker Compose | |
| Managed cloud services | Supabase/Neon/Railway for DB + Upstash for Redis | |

**User's choice:** PostgreSQL + Redis on Oracle VM directly

---

## i18n Wiring Strategy

### Q11: How should locale be resolved per user interaction?

| Option | Description | Selected |
|--------|-------------|----------|
| Stored pref → Discord locale → VI default | users.locale in DB wins; fallback to Discord header; fallback to VI | ✓ |
| Discord locale → VI default (no DB storage) | Always use Discord's reported locale; never store in DB | |
| VI only in Phase 1, stubs for EN/ZH-CN | Full resolution deferred to Phase 2 | |

**User's choice:** Stored pref → Discord locale → VI default

---

### Q12: How should i18n namespace files be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Feature namespaces (common + per-domain) | common.json, game.json, combat.json, marketplace.json, admin.json — loaded lazily | ✓ |
| Single translation.json per locale | Single flat file per locale | |
| Phase-based namespaces | phase1.json, phase2.json — mirrors development phases | |

**User's choice:** Feature namespaces (common + per-domain)

---

### Q13: How should the no-hardcoded-strings rule be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| eslint-plugin-i18next + pre-commit hook | ESLint rule flags string literals in reply calls; husky + lint-staged enforces on commit | ✓ |
| Type-level enforcement only | Custom TypeScript type that wraps reply functions | |
| Manual review only | No automated enforcement in Phase 1 | |

**User's choice:** eslint-plugin-i18next + pre-commit hook

---

## Emoji & Asset Registry

### Q14: Emoji & Discord assets registry — how should they be declared and accessed?

| Option | Description | Selected |
|--------|-------------|----------|
| Typed emoji registry + ESLint rule | src/assets/emojis.ts exports typed const map; ESLint rule blocks raw emoji literals | ✓ |
| Emoji in locale files | Emoji go in locale files alongside text strings | |
| assets/ folder by asset type | assets/emojis.ts, assets/colors.ts, assets/images.ts grouped by type | |

**User's choice:** Typed emoji registry + ESLint rule
**Notes:** User specifically requested this as a cross-cutting quality standard — all visual assets must be declared, no hardcoding. Same philosophy as i18n for strings.

---

## Discord Embed UX

### Q15: Discord embed UI — how should embed messages be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Typed embed builder functions in src/ui/ | src/ui/embeds/ folder with builder functions per interaction type | ✓ |
| Inline embed building per command | Embed built inline in each command handler | |
| Wrapper class with fluent API | Single EmbedBuilder wrapper class with fluent API and theme defaults | |

**User's choice:** Typed embed builder functions in src/ui/
**Notes:** User specifically called out that embed messages must be visually clean and well-structured ("trình bày khoa học, đẹp mắt").

---

### Q16: Should there be a shared UI theme for consistency across all embeds?

| Option | Description | Selected |
|--------|-------------|----------|
| Theme constants file (src/ui/theme.ts) | Standard color palette (primary, success, error, warning, info) + layout rules | ✓ |
| Style guide document only | Colors and layout rules documented in STYLE.md — developers follow manually | |
| No central theme | Each embed builder decides its own colors | |

**User's choice:** Theme constants file (src/ui/theme.ts)

---

## Agent's Discretion

- TypeScript path aliases configuration approach (tsconfig paths vs. relative imports)
- pm2 ecosystem.config.js exact configuration (instances, memory limits, log paths)
- Dev hot-reload tooling (tsx vs. ts-node-dev)
- Health check endpoint details (route path, response shape)
- VWAP hourly cron schedule expression and pg-boss job name

## Deferred Ideas

None — discussion stayed within phase scope.
