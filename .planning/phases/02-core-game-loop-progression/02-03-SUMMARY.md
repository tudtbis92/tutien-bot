---
phase: "02"
plan: "03"
subsystem: game-commands
tags: [slash-commands, character-creation, profile, spiritual-root, i18n, embed]
dependency_graph:
  requires:
    - "02-01"  # DB schema (characters table, spiritualRootEnum)
  provides:
    - "/start slash command (character registration)"
    - "/profile slash command (character stats display)"
    - "buildProfileEmbed typed embed builder"
  affects:
    - src/commands/game/
    - src/ui/embeds/
    - locales/ (all 3)
tech_stack:
  added: []
  patterns:
    - "Weighted random selection from GAME_CONFIG.SPIRITUAL_ROOT_WEIGHTS"
    - "Upsert users table on first /start (create user if not exists)"
    - "buildProfileEmbed(data, t) — typed embed builder with REALM_CONFIG lookup"
    - "/* eslint-disable i18next/no-literal-string */ for SlashCommandBuilder static strings"
key_files:
  created:
    - src/commands/game/start.ts
    - src/commands/game/profile.ts
    - src/ui/embeds/buildProfileEmbed.ts
  modified:
    - locales/vi/game.json
    - locales/en/game.json
    - locales/zh-cn/game.json
    - eslint.config.mjs
decisions:
  - "eslint-disable block for SlashCommandBuilder static API strings — not runtime i18n, don't want false positives"
  - "resolveLocale(null, interaction.locale) — no DB lookup for user locale yet (Phase 2 enhancement)"
  - "professionPoints cast to Record<string,number> — Drizzle returns jsonb as unknown at runtime"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-12"
  tasks: 2
  files: 7
---

# Phase 02 Plan 03: /start + /profile Commands Summary

**One-liner:** Slash commands /start (weighted-random spiritual root, upsert user, duplicate guard) and /profile (REALM_CONFIG i18n lookup, embed with realm/root/tu-vi/streak).

## Objective

Implement the two core player-facing commands: `/start` registers a new character with a weighted-random spiritual root assignment, and `/profile` shows the character's current stats in a themed embed. These are the game loop's entry point and primary feedback mechanism.

## Tasks Completed

### Task 1: /start command
**Commit:** `3c32dea`
**Files:** `src/commands/game/start.ts`

- `rollSpiritualRoot()` uses `GAME_CONFIG.SPIRITUAL_ROOT_WEIGHTS` (kim:15, hỏa:20, mộc:25, thủy:25, thổ:15) for weighted random selection
- Duplicate guard: SELECT from characters WHERE discordId before INSERT — returns error embed if already registered
- Upsert pattern: look up user in `users` table, INSERT if not found
- INSERT character with `sql\`0\`` for tuVi (BigInt drizzle-kit pattern from Phase 1)
- Success embed: `COLORS.GOLD`, spiritual root name only (no multiplier per D-04)

### Task 2: /profile command + buildProfileEmbed
**Commit:** `6f22202`  
**Files:** `src/commands/game/profile.ts`, `src/ui/embeds/buildProfileEmbed.ts`, 3 locale files

- `buildProfileEmbed(data, t)` typed embed builder: `COLORS.PRIMARY`, realm name via `REALM_CONFIG[realmId].i18nKey`, spiritual root name (no number), `formatBalance(tuVi)`, daily cap progress, streak days
- `/profile` returns error embed with `game:start.not_registered` if user has no character
- Added `not_registered` i18n key to all 3 locales (vi/en/zh-cn)
- `npm run check-i18n` exits 0

## Verification Results

```
npx tsc --noEmit    → EXIT 0 ✓
npm run lint        → EXIT 0 ✓
npm run check-i18n  → EXIT 0, "All locale files are in sync." ✓
```

## Key Behaviors (must_haves satisfied)

1. ✅ `/start` creates character with weighted-random spiritual root
2. ✅ `/start` again returns error "already registered" (no crash, no duplicate DB row)
3. ✅ `/profile` shows: Discord user tag, spiritual root name (i18n), realm name (REALM_CONFIG.i18nKey), tu vi, daily progress, streak days
4. ✅ All embeds use `theme.ts` COLORS and `embedFooter()`
5. ✅ Unregistered user running `/profile` sees clear error embed (not a crash)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added eslint-disable block for SlashCommandBuilder localizations**
- **Found during:** Task 1
- **Issue:** `setDescriptionLocalizations()` with Vietnamese/Chinese strings triggered `i18next/no-literal-string` rule. These are static Discord API registration strings, not runtime user-facing text — they should not go through i18next
- **Fix:** Added `/* eslint-disable i18next/no-literal-string */` block around `export const data = ...` with comment explaining why
- **Also:** Added `\\.setNameLocalizations` and `\\.setDescriptionLocalizations` to ESLint callees.exclude whitelist for future commands
- **Files modified:** `eslint.config.mjs`, `src/commands/game/start.ts`, `src/commands/game/profile.ts`
- **Commit:** included in `3c32dea` and `6f22202`

**2. [Rule 1 - Bug] Used correct Discord Locale enum values**
- **Found during:** Task 1
- **Issue:** Plan specified `en` in `setNameLocalizations` but Discord.js Locale enum only has `en-US` and `en-GB`, not bare `en`
- **Fix:** Changed to `'en-US'` in all localizations
- **Files modified:** `src/commands/game/start.ts`

## Known Stubs

None — all fields come from live DB data. Profile embed renders real character data.

## Threat Surface Scan

No new threat surface beyond plan's threat model. Both commands use `interaction.user.id` (discord.js-validated, cannot be spoofed at application level per T-02-CMD-02).

## Self-Check: PASSED

- [x] `src/commands/game/start.ts` exists
- [x] `src/commands/game/profile.ts` exists  
- [x] `src/ui/embeds/buildProfileEmbed.ts` exists
- [x] `3c32dea` commit exists
- [x] `6f22202` commit exists
