---
status: partial
phase: 02-core-game-loop-progression
source: [02-VERIFICATION.md]
started: 2026-04-12T10:42:05Z
updated: 2026-04-12T18:00:00Z
---

## Current Test

Human UAT in progress. Tests 2–5 pending.

## Tests

### 1. Activity pipeline end-to-end
expected: Send a message in a Discord channel → tu vi increases in /profile output

result: PASS — tu vi accumulation confirmed working end-to-end.

### 2. Character registration and duplicate guard
expected: /start creates a character with weighted spiritual root; second /start returns friendly error

result: [pending]

### 3. Breakthrough probability at major realm boundary
expected: Multiple /breakthrough attempts at a major boundary show fail/success paths with penalty applied correctly

result: [pending]

### 4. Guild vs global leaderboard scope filtering
expected: /leaderboard without global flag shows only guild members; /leaderboard global:true shows global ranking

result: [pending]

### 5. Profession cap enforcement at realmId=0
expected: /profession allocate fails when 0 available points (new character at realm_id=0)

result: [pending]

## Summary

total: 5
passed: 1
issues: 5
pending: 4
skipped: 0
blocked: 0

## Issues Found During UAT

### BUG-01 — i18n locale resolution (FIXED, commit e9e6fa2)
All commands were calling `resolveLocale(null, interaction.locale)` → always fell back to Discord client locale instead of the user's saved DB preference.
Fix: each command now fetches `users.locale` from DB and passes it as first arg to `resolveLocale`.

### BUG-02 — Profession embed displayed raw i18n keys (FIXED, commit e9e6fa2)
`buildProfessionEmbed` attempted to display unique item names using i18n keys that didn't exist → raw key segments like "than_dan", "khi_luyen_tu" shown to players.
Fix: removed unique item display from profession embed; show only `✨ {pts}`.

### BUG-03 — `luyen_khi_nc` display name wrong (FIXED, commit e9e6fa2)
Profession displayed as "Luyện Khí Nghề" in vi locale instead of "Luyện Khí".
Fix: corrected in `locales/vi/game.json` and `PROFESSION_CHOICE_NAMES`.

### BUG-04 — CRITICAL: Breakthrough threshold absolute vs relative (FIXED, commit aebea52)
`canAttemptBreakthrough` compared `char.tuVi` (cumulative forever) against `currentTier.tuViRequired` (incremental, relative to realm entry). A player at realm 2 with tuVi=2510 could attempt breakthrough because 2510 >= 2200 (incremental), but they actually needed 2510 >= 4700 (absolute = entryThreshold 2500 + tuViRequired 2200).
Same bug existed in `activityWorker` daily-cap calculation.
Fix: both locations now use `entryThreshold + tuViRequired` as the absolute threshold.

**Key invariant:** `characters.tu_vi` is CUMULATIVE FOREVER — never resets on breakthrough. All threshold comparisons MUST use `entryThreshold + tuViRequired` (absolute). Never compare against `tuViRequired` alone.

### BUG-05 — `buildBreakthroughEmbed` description duplication (FIXED, post-commit)
- `insufficient` case: description duplicated the title text (same i18n key in both title and description).
  Fix: description now shows `Tu Vi: current / required`.
- `fail` case: description was identical to title.
  Fix: description now shows `Tu Vi: <post-penalty tu vi>`. Added `postTuVi?: bigint` to `BreakthroughEmbedData`; `breakthrough.ts` command passes `char.tuVi - result.penaltyAmount`.

## Gaps

None identified beyond the bugs above.
