---
phase: 10-battle-capture
reviewed: 2026-08-13T00:00:00Z
depth: standard
files_reviewed: 43
files_reviewed_list:
  - docs/economy-budget.md
  - locales/en/sanguo.json
  - locales/vi/sanguo.json
  - locales/zh-cn/sanguo.json
  - migrations/0019_green_snowbird.sql
  - scripts/data/sanguo-base-stats.json
  - scripts/seed-sanguo.ts
  - src/commands/sanguo/__tests__/battle.test.ts
  - src/commands/sanguo/__tests__/hero.test.ts
  - src/commands/sanguo/__tests__/heroes.test.ts
  - src/commands/sanguo/__tests__/map.test.ts
  - src/commands/sanguo/__tests__/travel.test.ts
  - src/commands/sanguo/battle.ts
  - src/commands/sanguo/hero.ts
  - src/commands/sanguo/heroes.ts
  - src/commands/sanguo/map.ts
  - src/commands/sanguo/travel.ts
  - src/constants/__tests__/sanguoCapture.test.ts
  - src/constants/sanguoBoss.ts
  - src/constants/sanguoCapture.ts
  - src/db/schema/captureAttempts.ts
  - src/db/schema/encounterRuns.ts
  - src/db/schema/heroes.ts
  - src/db/schema/index.ts
  - src/db/schema/sanguoBattles.ts
  - src/db/schema/userHeroes.ts
  - src/db/schema/userSanguoState.ts
  - src/events/interactionCreate.ts
  - src/services/sanguo/__tests__/battleCheckInService.test.ts
  - src/services/sanguo/__tests__/battleEngine.test.ts
  - src/services/sanguo/__tests__/captureService.test.ts
  - src/services/sanguo/battleCheckInService.ts
  - src/services/sanguo/battleEngine.ts
  - src/services/sanguo/captureService.ts
  - src/ui/components/sanguoBattleButtons.ts
  - src/ui/components/sanguoCaptureButtons.ts
  - src/ui/components/sanguoHeroCompanionButton.ts
  - src/ui/components/sanguoHeroesZoneMenu.ts
  - src/ui/components/sanguoStarterButtons.ts
  - src/ui/embeds/buildSanguoBattleLogEmbed.ts
  - src/ui/embeds/buildSanguoCaptureEmbed.ts
  - src/ui/embeds/buildSanguoHeroEmbed.ts
  - src/ui/embeds/buildSanguoHeroesEmbed.ts
findings:
  critical: 2
  warning: 3
  info: 6
  total: 11
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-08-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 43
**Status:** issues_found

## Summary

Reviewed the Phase 10 battle/capture implementation: the seeded battle engine (`battleEngine.ts`), the battle check-in service, the capture service, the capture/battle/hero UI layer, the DB migration, the content seed, locales, and the economy budget doc. The overall architecture is strong — single-writer `FOR UPDATE` transactions, crypto-backed draws, full audit rows per capture attempt, anti-tamper tier resolution, and a genuine replay contract (tested). The data/content layer verified: 132 base-stat entries, rarity bins exactly 79/33/13/5/2 matching the D-20 signed distribution, migration matches schemas, locale key parity across vi/en/zh-cn.

However, two server-side state preconditions are **missing on money/state paths**, and both are reachable despite the UI gating (one via crafted customIds — which the codebase explicitly defends against elsewhere — and one via stale buttons that legitimately coexist in chat):

1. **Capture without a won battle** — `attemptCapture` never verifies the pending encounter was actually beaten. A crafted `sanguo:capture:tier:{n}` interaction on an unfought encounter charges the fee for a 0% roll, and pity grinding (21 failed attempts) clamps chance to 1.0 → **guaranteed capture of any hero (including rarity 5) without ever fighting**. This violates D-10 ("won → capture window opens") and the server-authoritative/anti-tamper contract on a real-money path.
2. **Re-battling a won encounter** — `startEncounterBattle` allows a second battle against a pending encounter that already has a completed player-won battle (stale fight buttons from earlier check-in embeds remain live in chat). A re-battle loss destroys the open capture window and can faint the companion; a re-battle win re-rolls the wild IV and resets enemy HP to full for free, letting players grind the wild to 0 HP (hpFactor → 1.0) and breaking the D-20 economy model (Pitfall 5).

Plus a confirmed engine defect: the pure-rand `xoroshiro128plus` constructor truncates the seed to 32 bits (`seed | 0`), so the documented `crypto.randomInt(2**48)` seed contributes only 32 bits of entropy.

## Critical Issues

### CR-01: Capture window lacks the server-side "battle won" precondition — paid capture possible without fighting

**File:** `src/services/sanguo/captureService.ts:132-174`
**Issue:** The capture transaction locks the pending encounter, resolves the tier, reads the battle snapshot, computes the chance, and then charges the fee — but it **never verifies that a completed, player-won battle exists for the encounter**. The UI only renders capture buttons after a win (battle.ts:417, travel.ts:299-301 F4), but the interaction router (`interactionCreate.ts:212-230`) dispatches **any** customId starting with `sanguo:capture:tier` to `handleCaptureTierPress`, and this codebase's own anti-tamper contract (sanguoCapture.ts:17-20) treats crafted customIds as a real threat. When no battle row exists, `hpMax` defaults to 0 → `hpFactor(0, …) = 0` → `chance = pity × 0.05` (captureService.ts:154-167). The first attempt is a paid 0% roll; each failure increments pity by 5pp, so after 20 failures chance clamps to 1.0 and the 21st roll is a **guaranteed capture** — of any rarity, including rarity-5 heroes — for 21 × tier-1 fee = 105💎, with no battle ever fought. This violates D-10 (capture window opens only on a win) and D-19 (economy) on a wallet path.
**Fix:** Require the won-battle precondition inside the tx, before the fee:
```ts
// After the encounter lock (line 132), before tier/fee resolution:
if (encounter.heroId != null) {
  const [wonBattle] = await tx
    .select()
    .from(sanguoBattles)
    .where(and(eq(sanguoBattles.encounterId, encounter.id), eq(sanguoBattles.type, 'encounter')))
    .orderBy(desc(sanguoBattles.id))
    .limit(1);
  const stored = (wonBattle?.result ?? {}) as { winner?: string };
  if (!wonBattle || stored.winner !== 'player') throw new Error('CAPTURE_NOT_AVAILABLE');
}
```
Mirror the guard in `renderCaptureView` (battle.ts:304-313) so the displayed view also fails closed when the precondition is missing. Add a test: `attemptCapture` with `[PENDING]` and no battle row rejects and never calls `deductBalance`.

### CR-02: Encounter battle can be re-run after a win — free wild-IV/HP re-roll and capture-window loss via stale fight buttons

**File:** `src/services/sanguo/battleCheckInService.ts:218-291`
**Issue:** `startEncounterBattle` checks `playerTravelState.encounterActive` and re-fetches the pending encounter, but never checks whether a completed battle already exists for it. After a win, the encounter stays `'pending'` (by design — capture window) and `encounterActive` stays `true`, while **older encounter embeds with live fight buttons remain in chat** (every check-in re-renders the fight/skip row — travel.ts:306-326). Pressing a stale fight button re-runs the battle against the same pending encounter: (a) the wild IV is re-rolled and the enemy's `hpCurrent` is reset to full base HP, so players can grind the wild to 0 HP for free (hpFactor → 1.0) before capturing — destroying the D-20 economy model which explicitly assumes a **single** battle (docs/economy-budget.md:30, Pitfall 5); (b) if the re-battle is lost, the encounter flips to `'escaped'` (battleCheckInService.ts:271-279) — the already-won capture window is destroyed and the companion's `hpCurrent` is overwritten (possibly to 0 → HERO_FAINTED soft-lock, since no heal exists yet).
**Fix:** Reject a second battle for a pending encounter that already has a completed encounter battle, and route to the capture view instead:
```ts
// After the F2 pending re-fetch (line 239):
const [existing] = await tx
  .select()
  .from(sanguoBattles)
  .where(and(eq(sanguoBattles.encounterId, encounter.id), eq(sanguoBattles.type, 'encounter')))
  .limit(1);
if (existing) throw new Error('BATTLE_ALREADY_FOUGHT');
```
Have `handleBattleStart` (battle.ts:408-450) catch `BATTLE_ALREADY_FOUGHT` and render the capture view (reuse the F4 logic from travel.ts:291-304). Add a test: second `startEncounterBattle` call for the same pending encounter rejects and writes no new battle row.

## Warnings

### WR-01: Battle seed is truncated to 32 bits — the documented 48-bit crypto seed contributes only 32 bits of entropy

**File:** `src/services/sanguo/battleEngine.ts:184` (and `src/services/sanguo/battleCheckInService.ts:68`)
**Issue:** `xoroshiro128plus(seed)` from pure-rand is implemented as `new XoroShiro128Plus(-1, ~seed, seed | 0, 0)` (verified in `node_modules/pure-rand/lib/esm/generator/xoroshiro128plus.js:76`) — both `~seed` and `seed | 0` operate on the 32-bit value, so the RNG state depends only on `seed & 0xFFFFFFFF`. The service seeds with `crypto.randomInt(2 ** 48)` (battleCheckInService.ts:67-69, D-06 "seed < 2^48, a safe JS integer"). Two different stored seeds differing only in bits ≥ 32 (e.g. 5 and 2³²+5) produce **byte-identical battles**, so the effective seed space is 2³², not 2⁴⁸. The per-seed replay contract still holds (same seed → same state → same logs), so this is not a replay break, but the D-06 seed contract is violated and the documented entropy is halved — a collision between two independently-rolled battles occurs with probability 2⁻³² per pair instead of 2⁻⁴⁸.
**Fix:** Either document and accept 32-bit entropy (and draw the seed with `crypto.randomInt(2 ** 32)`), or expand the seed through the generator's 128-bit state explicitly:
```ts
// battleCheckInService.ts
function defaultSeed(): number {
  return crypto.randomInt(2 ** 32); // matches pure-rand's 32-bit seed consumption
}
```
and update the D-06 contract text in `sanguoBattles.ts:25-26` / `battleEngine.ts:20` accordingly.

### WR-02: `map.ts` calls `heroEmoji` unguarded — a zone without an emoji mapping breaks the whole map command

**File:** `src/commands/sanguo/map.ts:171`
**Issue:** `heroEmoji(z.heroId)` throws `EMOJI_NOT_FOUND` (sanguoEmojis.ts:1239) for any heroId without an emoji mapping. Every other consumer guards this (`safeHeroEmoji` in battle.ts:86-93, hero.ts:88-95, heroes.ts:98-105, and the inline try/catch in travel.ts:181-186) — the map command is the only unguarded call site. It happens to work today because the seeded `representative_hero_id` values all have emoji mappings (map.test.ts:114 regression test), but the next content update (new zone/hero without an emoji row) turns the entire `/sanguo map` render into the generic error embed. `zonesContent` is also built outside the `try` that only wraps `editReply` inputs, so the throw is caught by the outer catch and the map fails completely rather than rendering name-only zone markers.
**Fix:**
```ts
const zonesContent = zones
  .map((z) => {
    let marker = z.label;
    if (z.heroId) {
      try {
        marker = `${heroEmoji(z.heroId)} ${z.label}`;
      } catch {
        // EMOJI_NOT_FOUND → label-only zone marker (map.ts:98 pattern)
      }
    }
    return `# ${marker}`;
  })
  .join('\n');
```

### WR-03: Capture chance fails *silently* to a pity-only value when the battle snapshot is missing

**File:** `src/services/sanguo/captureService.ts:154-167` (same pattern at `src/commands/sanguo/battle.ts:310-313`)
**Issue:** When the battle query returns no row (or the stored `result` lacks `enemyHpAfter`), `hpMax`/`hpCurrent` default to 0 → `hpFactor(0, …) = 0` → the chance silently collapses to `pity × 0.05` while the fee is still charged. Even after CR-01's won-battle guard is added, a battle row whose stored shape drifted (e.g. a legacy row or a partial write) would reproduce the same paid-0%-roll behavior without any error. The design contract says "recompute from the locked row, never the payload" and fail loudly elsewhere (`bossTemplateFor` throws `NO_BOSS_TEMPLATE`); this path should fail closed instead of proceeding with a 0% paid roll.
**Fix:** Throw when the snapshot is unusable, before the fee:
```ts
const hpMax = input.enemy?.base?.hp;
const hpCurrent = result.enemyHpAfter;
if (hpMax == null || hpCurrent == null) throw new Error('NO_BATTLE_SNAPSHOT');
```

## Info

### IN-01: Dead `percent` computation in `handleCaptureTierPress`

**File:** `src/commands/sanguo/battle.ts:537`
**Issue:** `const percent = Math.floor(result.chance * 100)` is computed but never rendered — the success/fail/flee/retreat states of `buildSanguoCaptureEmbed` do not show the chance (only the `view` state does, which re-renders via `renderCaptureView`).
**Fix:** Delete the line (and the `percent` argument passes at battle.ts:543, 555, 571 if the embed data shape is trimmed).

### IN-02: `rounds` field is never rendered by the battle log builder

**File:** `src/ui/embeds/buildSanguoBattleLogEmbed.ts:30` and `src/commands/sanguo/battle.ts:230`
**Issue:** `SanguoBattleLogEmbedData.rounds` is declared and populated (`roundLogs.reduce(...)`), but `buildSanguoBattleLogEmbed` never reads it — the embed renders only the turn lines and the resolution.
**Fix:** Either render it (e.g. append to the resolution line) or remove the field and its computation.

### IN-03: Duplicate schema re-export

**File:** `src/db/schema/index.ts:31,44`
**Issue:** `export * from './heroFactions.js'` appears twice (Phase 8 schemas block and the "Phase 8 post-gate" block). Harmless in ESM (idempotent), but it signals a copy/paste and invites drift if one site is edited.
**Fix:** Remove the duplicate at line 44 (keep the post-gate grouping comment accurate).

### IN-04: Pity "resets on flee" is documented but never implemented

**File:** `src/db/schema/encounterRuns.ts:12-13`, `src/services/sanguo/captureService.ts:223-236`, `docs/economy-budget.md:21`
**Issue:** `encounter_runs.pity_count` is only ever incremented (captureService.ts:223-226). The schema comment and the economy doc claim it "resets on success/flee/retreat". It is functionally harmless today — every resolution ('captured'/'fled'/'skipped'/'escaped') makes the encounter row terminal and a new encounter is a new row — but the contract text and the code disagree, which will mislead Phase 11 work (hồn ngọc conversion) or any future row-reuse flow.
**Fix:** Either reset `pityCount: 0` alongside the `status: 'fled'`/`'captured'` updates for contract fidelity, or amend the comments/doc to state the counter is per-row and terminal-only.

### IN-05: `resolveInteractionUser` copy-pasted across command modules

**File:** `src/commands/sanguo/battle.ts:106-124`, `src/commands/sanguo/hero.ts:143-161`, `src/commands/sanguo/heroes.ts:164-182`, and inline again in `src/commands/sanguo/travel.ts:402-417, 477-492`
**Issue:** The users-row lookup + locale/t/shardId resolution is duplicated in five places with identical bodies. The identity rule ("users.id, never char.id") is enforced by grep, so any future drift in one copy (e.g. adding a field) silently diverges.
**Fix:** Extract a shared `resolveComponentUser(interaction): Promise<InteractionUserCtx | null>` in a shared module (e.g. `src/utils/componentContext.ts`) and import it in all four command files.

### IN-06: Concurrent first-time companion switch can hit the unique constraint on `user_sanguo_state.user_id`

**File:** `src/commands/sanguo/hero.ts:313-342`
**Issue:** When no `user_sanguo_state` row exists, `SELECT … FOR UPDATE` locks nothing, so two concurrent presses both take the `!state` branch and both `INSERT` — the second fails with a Postgres unique violation (23505), caught as a generic `hero.error`. Low impact (the row normally exists after a starter pick), but the codebase's single-writer discipline elsewhere (heroes.ts:191-209) suggests the same upsert pattern here.
**Fix:** Use `insert … onConflictDoUpdate({ target: userSanguoState.userId })` for the create path, or re-read under the lock and update-if-exists.

---

_Reviewed: 2026-08-13T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
