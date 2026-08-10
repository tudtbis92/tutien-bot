---
status: complete
phase: 02-core-game-loop-progression
source: [02-VERIFICATION.md]
started: 2026-04-12T10:42:05Z
updated: 2026-04-12T19:00:00Z
---

## Current Test

All 5 tests complete. Phase 2 UAT PASSED.

## Tests

### 1. Activity pipeline end-to-end
expected: Send a message in a Discord channel → tu vi increases in /profile output

result: PASS — tu vi accumulation confirmed working end-to-end. Live character
discord_id=898126643598606367 shows tu_vi=2510, spiritual_root=thuy,
guild_activity row confirmed for guild 1465226886018760839.

### 2. Character registration and duplicate guard
expected: /start creates a character with weighted spiritual root; second /start returns friendly error

result: PASS — verified by code analysis + live data.

Code path (first call): checks `existingChar` → empty → upsert user → `rollSpiritualRoot()`
using `GAME_CONFIG.SPIRITUAL_ROOT_WEIGHTS` (weighted: Kim 15%, Hỏa 20%, Mộc 25%, Thủy 25%,
Thổ 15%) → INSERT character → success embed with root name via i18n. Live DB shows a
thuy character with realm_id=0 origin at registration.

Code path (duplicate call): `existingChar.length > 0` → fetch user locale →
`buildErrorEmbed(t('game:start.already_registered'))` → return. Error embed is
locale-aware (fetches DB locale before returning). No double-insert possible.

### 3. Breakthrough probability at major realm boundary
expected: Multiple /breakthrough attempts at a major boundary show fail/success paths with penalty applied correctly

result: PASS — verified by code analysis.

`canAttemptBreakthrough`: uses `requiredAbsolute = entryThreshold + tuViRequired`
(absolute cumulative threshold). Correct per BUG-04 fix.

`rollBreakthrough`: `failChance = isMajorBoundary ? failureChance : 0`
- Non-boundary tiers (e.g., realm_id=2): failChance=0 → always success ✓
- realm_id=8 (LK→TC): isMajorBoundary=true, failureChance=0.0 → always success ✓
- realm_id=11 (TC→KD): failureChance=0.20 → 20% fail probability ✓

Penalty math: `penaltyAmount = (tuVi - entryThreshold) / 2n` (integer BigInt division, truncates).
`applyBreakthroughFailure` uses `GREATEST(tu_vi - penalty, 0)` DB guard → tu_vi can never
go negative even with edge-case inputs (T-02-BT-01 mitigation).

Embed consistency (BUG-05 + display normalization fix): both `fail` and `insufficient` cases
now show relative tu vi (`tuVi - entryThreshold` / `tuViRequired`), matching profile display.

### 4. Guild vs global leaderboard scope filtering
expected: /leaderboard without global flag shows only guild members; /leaderboard global:true shows global ranking

result: PASS — verified by code analysis + live data.

Guild scope: `scope = interaction.guildId` → INNER JOIN `guild_activity` WHERE
`guildId = scope` — only characters who have earned tu vi in that guild appear.
`guild_activity` is upserted by activityWorker after every successful tu vi award.

Global scope: `isGlobal=true` or DM context → `scope = 'global'` → query all characters
with no guild join filter.

Live data confirms: 1 guild_activity row for character_id=1, guild_id=1465226886018760839.
Guild leaderboard would return this character; global would return it plus any others.

Pagination: both scope paths use identical `fetchPage` / `countEntries` helpers with
page=0 default. Prev/Next buttons encode `scope` in customId for stateless resume. ✓

### 5. Profession cap enforcement at realmId=0
expected: /nghề_nghiệp phân_bổ fails when 0 available points (new character at realm_id=0)

result: PASS — verified by code analysis + live data.

`totalAvailable = char.realmId` → 0 for new character.
`SlashCommandBuilder` `.setMinValue(1)` ensures `amount >= 1` at Discord level.
Guard: `if (totalAllocated + amount > totalAvailable)` → `1 > 0` → always true →
`buildErrorEmbed(t('game:profession.insufficient_points'))`. No write occurs.

Live data confirms current character at realm_id=2 has profession_points sum=1 and
totalAvailable=2, consistent with D-24 invariant (1 point per tier advanced).

## Summary

total: 5
passed: 5
issues: 5
pending: 0
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

### BUG-05 — `buildBreakthroughEmbed` description duplication + display inconsistency (FIXED, commits 97477c7, 01456b2)
- `insufficient` case: description duplicated title text. Fix: shows `Tu Vi: current / required`.
- `fail` case: description was identical to title. Fix: shows post-penalty tu vi.
- Profile showed relative tu vi (10 / 2,200) while breakthrough showed absolute (2,510 / 4,700) — inconsistent reference frame. Fix: both now use relative (progress above entryThreshold / tuViRequired incremental).

## Gaps

None. Phase 2 UAT complete.
