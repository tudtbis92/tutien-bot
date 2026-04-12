---
phase: "02"
plan: "05"
subsystem: leaderboard
tags: [discord, leaderboard, pagination, buttons, i18n]
dependency_graph:
  requires:
    - "02-01: characters schema, guild_activity schema, REALM_CONFIG, i18n leaderboard keys"
  provides:
    - "buildLeaderboardEmbed: typed embed builder for leaderboard pages"
    - "buildLeaderboardPage: exported async helper for /bxh command and button handler"
    - "/bxh slash command: guild and global leaderboard with pagination"
  affects:
    - "src/events/interactionCreate.ts: extended with button routing"
tech_stack:
  added: []
  patterns:
    - "ButtonBuilder pagination with stateless customId encoding (page + scope)"
    - "Shared page builder exported for both command and button handler"
    - "User locale DB lookup in button handler (no interaction.locale on ButtonInteraction)"
key_files:
  created:
    - src/commands/game/bxh.ts
    - src/ui/embeds/buildLeaderboardEmbed.ts
  modified:
    - src/events/interactionCreate.ts
decisions:
  - "scope encoded in customId as guildId|'global' — stateless, no Redis needed for pagination"
  - "◀/▶ disabled state computed at query time based on totalPages — no over-fetching"
  - "NaN guard on parseInt before DB query — T-02-BXH-01 threat mitigated"
  - "User locale resolved from users table in button handler (interaction.locale unavailable on ButtonInteraction)"
  - "isGuild flag defaulted from !guildId for DM usage safety"
metrics:
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 02 Plan 05: /bxh Leaderboard Command Summary

**One-liner:** Paginated /bxh leaderboard with guild/global toggle using stateless ButtonBuilder customId encoding and shared `buildLeaderboardPage` helper reused by both command and button router.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | /bxh command + buildLeaderboardEmbed.ts | `261c5e8` | src/commands/game/bxh.ts, src/ui/embeds/buildLeaderboardEmbed.ts |
| 2 | Extend interactionCreate.ts with bxh button handler | `ec974cf` | src/events/interactionCreate.ts |

---

## What Was Built

### `src/ui/embeds/buildLeaderboardEmbed.ts`

Typed embed builder for leaderboard pages:
- `LeaderboardEntry` interface: `{ rank, discordId, realmId, tuVi }`
- `buildLeaderboardEmbed(entries, page, totalPages, isGuild, t, shardId?)` — returns EmbedBuilder
- Empty state: `t('game:leaderboard.empty')` when entries.length === 0
- Each entry formatted as `**#N** · {realmName} · <@discordId> · {tuVi} tu vi`
- Realm name resolved via `REALM_CONFIG[entry.realmId].i18nKey`
- `COLORS.GOLD` color, footer shows page info from `t('game:leaderboard.page', {current, total})`

### `src/commands/game/bxh.ts`

/bxh slash command with full pagination logic:

**Command definition:**
- `setName('bxh')` with EN/ZH localizations
- Optional boolean option `toàn_server` (EN: `global`) — guild vs global scope toggle

**`buildLeaderboardPage(scope, page, t, shardId?)` (exported):**
- `scope = 'global'` → global query (no join)
- `scope = guildId` → guild query with `innerJoin(guildActivity, eq(guildActivity.characterId, characters.id)) + WHERE guildId = scope`
- Parallel Promise.all for rows + count
- Pagination buttons: `bxh_prev_{page}_{scope}` / `bxh_next_{page}_{scope}`
- ◀ disabled at page 0; ▶ disabled at last page

**`execute(interaction)`:**
- deferReply → resolve locale → determine scope → call buildLeaderboardPage(scope, 0, t, shardId) → editReply

### `src/events/interactionCreate.ts` (extended)

Button routing block added before command dispatch:
- Checks `interaction.isButton()` → `customId.startsWith('bxh_prev_')` or `bxh_next_`
- Parses direction, currentPage (parseInt with NaN guard), scope from customId
- Negative page guard: `newPage < 0` → deferUpdate + return
- DB lookup for user locale: `SELECT locale FROM users WHERE discordId = userId`
- Calls `buildLeaderboardPage(scope, newPage, t, shardId)`
- `interaction.deferUpdate()` before DB query to satisfy Discord 3-second timeout
- Existing ChatInputCommand dispatch block preserved exactly

---

## Threat Mitigations Applied

| Threat ID | Mitigation Implemented |
|-----------|----------------------|
| T-02-BXH-01 | `parseInt(parts[2], 10)` + `isNaN()` guard + `newPage < 0` check before any DB query |
| T-02-BXH-02 | scope passed to Drizzle `eq()` parameterized WHERE — no string interpolation into SQL |
| T-02-BXH-03 | `characters_tu_vi_idx` index from Plan 01 covers ORDER BY tuVi DESC; LIMIT 10 bounds result set |
| T-02-BXH-04 | Discord user IDs are public — accepted per threat register |

---

## Deviations from Plan

### Auto-added Missing Features

**1. [Rule 2 - Missing functionality] Added ▶ disabled state on last page**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified `◀` disabled at page 0 but did not explicitly disable `▶` on last page — leaving it enabled would allow querying out-of-bounds pages returning empty results
- **Fix:** Added `setDisabled(safePageCapped >= totalPages - 1)` to ▶ button
- **Files modified:** src/commands/game/bxh.ts
- **Commit:** 261c5e8

**2. [Rule 2 - Security] Added NaN guard in button handler**
- **Found during:** Task 2 — threat model T-02-BXH-01
- **Issue:** Plan code used `parseInt(parts[2], 10)` but did not explicitly show NaN guard before DB query
- **Fix:** `if (isNaN(rawPage)) { await interaction.deferUpdate(); return; }` added before any processing
- **Files modified:** src/events/interactionCreate.ts
- **Commit:** ec974cf

**3. [Rule 2 - Missing functionality] Added slash command i18n localizations**
- **Found during:** Task 1 — ESLint i18next/no-literal-string enforcement
- **Issue:** Plan showed command definition without `setNameLocalizations` / `setDescriptionLocalizations`; project convention (seen in start.ts, profile.ts) requires these for multi-language support
- **Fix:** Added EN/ZH-CN localizations + `/* eslint-disable i18next/no-literal-string */` block + inline disable for option name in execute()
- **Files modified:** src/commands/game/bxh.ts
- **Commit:** 261c5e8

---

## Known Stubs

None — all data flows are wired to real DB queries. `guild_activity` data is populated by ActivityWorker (Plan 02-02).

---

## Self-Check

**Checking created files:**
- [x] src/commands/game/bxh.ts — created
- [x] src/ui/embeds/buildLeaderboardEmbed.ts — created
- [x] src/events/interactionCreate.ts — modified

**Checking commits:**
- [x] 261c5e8 — Task 1
- [x] ec974cf — Task 2

## Self-Check: PASSED
