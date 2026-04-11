# Phase 1: Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a **runnable bot shell with all load-bearing infrastructure in place** — database migrated, Redis connected, pg-boss wired, i18n fully scaffolded, CI/CD deployed to Oracle Cloud VM — so every downstream phase can build game features without retrofitting infrastructure.

No game features ship in Phase 1. No commands beyond a health-check ping. No game tables beyond what bootstrap needs.

**Requirements in scope:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, I18N-01, I18N-02, I18N-03

</domain>

<decisions>
## Implementation Decisions

### Project & Source Structure

- **D-01:** `src/` is organized **flat by concern** — top-level folders are: `commands/`, `events/`, `workers/`, `jobs/`, `db/`, `i18n/`, `utils/`, `config.ts`, `ui/`, `assets/`
- **D-02:** Two distinct entry points: `bot.ts` (ShardingManager) and `shard.ts` (Client setup + event registration) — standard discord.js ShardingManager pattern
- **D-03:** Slash commands are organized in **category subfolders** under `src/commands/` (e.g., `commands/game/`, `commands/admin/`) and **auto-discovered at startup** by recursively reading `src/commands/**/*.ts` — no manual registry file required

### DB Schema Scope for Phase 1

- **D-04:** Phase 1 creates **only bootstrap tables** — the minimal set needed to start the bot and pass health checks. Game tables (characters, items, orders, transactions) are deferred to Phase 2+ with their own migrations.
  - Phase 1 tables: `users` (id, discord_id, balance BIGINT CHECK >= 0, locale), `seasons` (current season marker)
  - All currency columns use `BIGINT` — never float
- **D-05:** Drizzle schema files are organized **one file per domain** under `src/db/schema/`: `users.ts`, `seasons.ts`, etc. All schemas are merged and re-exported from `src/db/schema/index.ts`

### Config & Secrets Management

- **D-06:** Environment variables loaded via **dotenv** + **Zod validation at startup** — bot refuses to start (fatal crash) if any required variable is missing or malformed. No silent misconfiguration.
- **D-07:** Validated config is exposed as a **single typed module** at `src/config.ts` — imports the parsed Zod object and re-exports it. All code imports from `src/config.ts`, never reads `process.env` directly.

### CI/CD Pipeline Design

- **D-08:** CI/CD via **GitHub Actions → SSH deploy to Oracle VM**. Pipeline: lint → `tsc --noEmit` → tests → SSH to `168.138.8.160` → git pull → npm ci → drizzle-kit migrate → pm2 restart. Triggered on push to `main`.
- **D-09:** Bot process managed on the Oracle VM via **pm2** with `ecosystem.config.js` — runs compiled JS from `dist/`, auto-restart on crash, startup on system reboot.
- **D-10:** PostgreSQL and Redis run **directly on the Oracle Cloud VM** as installed services (not Docker containers). Simple for Phase 1 scale. PgBouncer added to the setup for connection pooling from day 1 (per ROADMAP notes — mandatory once shard count > 1).

### i18n Wiring Strategy

- **D-11:** Locale resolution order per interaction: **(1) user's stored locale preference** (`users.locale` in DB) → **(2) Discord interaction locale header** → **(3) default VI**. Once a user sets a preference it wins over Discord's report.
- **D-12:** i18n namespace files organized by **feature domain** under `locales/{vi,en,zh-cn}/`: `common.json` (shared strings, errors, system messages), `game.json` (tu vi, realms, cultivation), `combat.json`, `marketplace.json`, `admin.json`. Loaded lazily by namespace per interaction.
- **D-13:** No-hardcoded-strings rule enforced by **eslint-plugin-i18next** + **pre-commit hook** (husky + lint-staged). The ESLint rule flags string literals in Discord reply calls. CI pipeline also runs ESLint to enforce on every push.

### Emoji & Asset Registry

- **D-14:** All Discord emoji IDs, custom emoji strings, and reusable visual assets must be declared in a **typed registry** at `src/assets/emojis.ts` (e.g. `export const EMOJI = { SWORD: '<:sword:123456>', ... } as const`). A companion ESLint rule (or custom rule) blocks raw emoji literals from appearing in command/event code. No hardcoded emoji anywhere outside this registry.
- **D-15:** Additional asset registries co-located in `src/assets/` as needed (e.g., `colors.ts` for Discord embed hex values if not in theme, `images.ts` for thumbnail URLs).

### Discord Embed UI

- **D-16:** Embed messages are built via **typed builder functions** in `src/ui/embeds/` (e.g., `buildProfileEmbed()`, `buildLeaderboardEmbed()`, `buildErrorEmbed()`). Each function returns a fully-constructed `EmbedBuilder` — never built inline in command handlers.
- **D-17:** A **shared UI theme** is defined at `src/ui/theme.ts` with the standard color palette (primary, success, error, warning, info as hex constants) and common embed structure rules (footer format, thumbnail placement, field layout). All embed builder functions import from this theme — no per-embed hardcoded colors.

### Agent's Discretion

- TypeScript path aliases (`@/db`, `@/config`, `@/utils`, etc.) — whether to use `tsconfig.json` paths + `tsc-alias` or keep relative imports. Agent can decide based on project size.
- Exact pm2 ecosystem.config.js configuration (instances, max_memory_restart, log paths) — agent decides reasonable defaults.
- Whether to use `tsx` for dev hot-reload or `ts-node-dev` — agent chooses whichever is more stable with Node 22.
- Health check endpoint details (route path, response shape for INFRA-07) — agent decides standard format.
- Exact VWAP hourly cron schedule expression and pg-boss job name — agent decides reasonable values.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Stack decisions locked (Node 22, discord.js 14.26.2, TS 5.8.x, Drizzle, ioredis, pg-boss, i18next, Zod, Fastify), Key Decisions table, architecture reminders
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: INFRA-01..07, I18N-01..03 with acceptance criteria detail
- `.planning/ROADMAP.md` §Phase 1 — Goal, Success Criteria, Notes (including architecture reminders, BIGINT constraint, PgBouncer note, version pinning)

### Stack
- `AGENTS.md` §Technology Stack — Full recommended stack table with exact versions and rationale

### No external specs
No ADRs or external design documents yet — all requirements and decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None yet — this phase establishes all patterns that downstream phases will follow.

### Integration Points
- All future phases integrate with: `src/db/` (Drizzle client), `src/config.ts` (env config), `src/i18n/` (translation helpers), `src/ui/embeds/` (embed builders), `src/assets/emojis.ts` (emoji registry)
- ShardingManager → Shard Client communication will be the cross-cutting concern for all game features

</code_context>

<specifics>
## Specific Ideas

- Embed messages must be **visually clean and well-structured** — the user specifically called out scientific/aesthetic layout as a requirement. This applies to all future phases too. Theme constants (D-17) and builder functions (D-16) are the enforcement mechanism.
- Emoji and visual assets must be **declarative and reusable** — same philosophy as i18n: nothing visual is hardcoded inline. ESLint enforcement (D-14) is the mechanism.
- These two requirements (D-14 through D-17) establish a UI quality standard for the entire project going forward.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-11*
