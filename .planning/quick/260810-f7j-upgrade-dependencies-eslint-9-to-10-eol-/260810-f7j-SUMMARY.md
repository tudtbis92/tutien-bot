---
status: complete
quick_id: 260810-f7j
completed: 2026-08-10
---

# Quick Task 260810-f7j: Upgrade dependencies

**Description:** Upgrade dependencies: eslint 9 to 10 (EOL), TypeScript to 6.0.3, vitest 3 to 4, ioredis 5 to 6, pm2 to 7.0.3, lint-staged to 17.3.0, plus minor/patch updates (discord.js 14.27, fastify, pg-boss, pg, i18next, zod, etc.)

## Result: COMPLETE

All 4 tasks executed. Full pipeline green: typecheck → lint → test → build.

## Commits

| # | Commit | Task |
|---|--------|------|
| 1 | `4700405` | chore(quick-260810-f7j): bump all dependencies to researched target versions |
| 2 | `2f37b53` | refactor(quick-260810-f7j): migrate vitest.config.ts to vitest 4 top-level pool options |

Tasks 3 & 4 (TS 6 / ESLint 10 validation + runtime/pipeline gate) were completed inline after the executor subagent was cancelled midway; no additional code commits were needed since both gates passed with zero config edits.

## Version changes

**Production deps:**
- @discordjs/rest 2.6.1 → 2.6.3
- @napi-rs/canvas ^1.0.0 → ^1.0.5
- discord.js 14.26.2 → 14.27.0
- dotenv 17.4.1 → 17.4.2
- fastify 5.8.4 → 5.11.3
- i18next 26.0.4 → 26.3.6
- i18next-fs-backend 2.6.3 → 2.6.7
- ioredis 5.10.1 → 6.0.0 (RESP3)
- pg 8.20.0 → 8.23.0
- pg-boss 12.15.0 → 12.27.0
- playwright ^1.60.0 → ^1.62.1
- proxy-agent ^8.0.1 → ^8.0.2
- zod 4.3.6 → 4.4.3

**Dev deps:**
- @types/pg 8.20.0 → 8.21.0
- @typescript-eslint/eslint-plugin 8.58.1 → 8.66.0
- @typescript-eslint/parser 8.58.1 → 8.66.0
- eslint 9.39.4 → 10.8.1 (EOL 9 removed)
- eslint-plugin-i18next 6.1.3 → 6.1.5
- lint-staged 16.4.0 → 17.3.0
- pm2 6.0.14 → 7.0.3
- tsc-alias 1.8.16 → 1.9.1
- tsx 4.21.0 → 4.23.12
- typescript 5.8.3 → 6.0.3
- typescript-eslint 8.58.1 → 8.66.0
- vitest 3.1.2 → 4.1.10

**Held (untouched):** discord.js-selfbot-v13 3.7.1 (archived), @types/node 22.19.17 (matches server Node 22.22.2), drizzle-orm 0.45.2, drizzle-kit 0.31.10, husky 9.1.7.

## Verification

- `npm ls --depth=0` — all target versions present, zero ESLint 9 / TS 5.8 in tree
- `npm run typecheck` (tsc --noEmit) — exit 0, TS 6.0.3
- `npm run lint` (eslint src --max-warnings=0) — exit 0, ESLint 10.8.1
- `npm test` (vitest run) — 16 files / 123 tests passed, vitest 4.1.10
- `npm run build` (tsc && tsc-alias) — exit 0
- `npx pm2 --version` → 7.0.3 (matches server)
- `npx lint-staged --version` → 17.3.0

## Config edits

- **vitest.config.ts**: removed `test.poolOptions` (removed in vitest 4), added top-level `isolate: true`; kept `pool: 'threads'`, `environment: 'node'`, `include`, `setupFiles`.
- **tsconfig.json**: unchanged — already TS 6-safe (strict, ES2022, Node16, no baseUrl).
- **eslint.config.mjs**: unchanged — flat config loads cleanly on ESLint 10.

## Notes / deviations

- Local machine runs Node v26.3.0 (no nvm available). All target deps are compatible (lint-staged 17 ≥22.22.1, vitest 4 ≥24, ioredis 6 ≥20, pm2 7 ≥18). Production server runs Node 22.22.2 with pm2 7.0.3 — versions now aligned.
- ioredis 6 RESP3 (HELLO 3) default: server Redis 7.0.15 verified RESP3-capable, no `protocol: 2` fallback added.
- `.planning/config.json` model_profile set to "inherit" (opencode/GSD subagent model fix, separate from this task's scope).
- Deploy to production requires `npm ci` + `npm run build` + `pm2 restart tutien-bot` on the server.
