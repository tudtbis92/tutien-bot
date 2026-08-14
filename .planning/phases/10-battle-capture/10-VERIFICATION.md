---
phase: 10-battle-capture
verified: 2026-08-14T04:00:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0 # 3 latency backstops resolved via live UAT 2026-08-14 (all interactions within 3s, no latency errors in logs)
overrides_applied: 0
gaps:

  - truth: "Capture requires a completed player-won battle — the D-10 'won → capture window opens' precondition is enforced SERVER-SIDE, not just by the UI (anti-tamper: a crafted sanguo:capture:tier:{n} interaction on an unfought encounter must fail before any fee)"
    status: resolved
    resolved_by: "bec0c0e + UAT test 6"
    reason: "RESOLVED by fix commit bec0c0e (2026-08-14): attemptCapture now verifies a completed sanguo_battles row (result.winner === 'player') after the FOR UPDATE lock and throws CAPTURE_NOT_AVAILABLE before any fee (captureService.ts:166-167); pity term cap-bound per rarity (PITY_CAP_BY_RARITY 0.80/0.75/0.70/0.65/0.60) so grinding can never force chance to 1.0. +3 tests (CR-01a/b + drifted input). Live UAT 2026-08-14 test 6 PASS: crafted customId on an unfought encounter rejected before the fee."
    artifacts:

      - path: "src/services/sanguo/captureService.ts"
        issue: "Line 167: won-battle precondition + CAPTURE_NOT_AVAILABLE; NO_BATTLE_SNAPSHOT fail-loud on drifted input; PITY_CAP_BY_RARITY bounds the pity term"
    missing: []
  - truth: "An encounter battle cannot be re-run against a pending encounter that already has a completed battle — the single-battle invariant that the D-20 economy model prices (one battle per capture window, wild IV/HP not freely re-rollable)"
    status: resolved
    resolved_by: "bec0c0e + UAT test 7"
    reason: "RESOLVED by fix commit bec0c0e (2026-08-14): startEncounterBattle now SELECTs the latest sanguo_battles row after the F2 pending re-fetch and throws BATTLE_ALREADY_FOUGHT when a completed battle exists (battleCheckInService.ts:255-261); handleBattleStart routes to the capture view (F4 path). +1 test (CR-02). Live UAT 2026-08-14 test 7 PASS: stale fight button rejected, no re-roll, capture view shown."
    artifacts:

      - path: "src/services/sanguo/battleCheckInService.ts"
        issue: "Lines 255-261: existing-battle check between the F2 pending re-fetch and the battle execution"
    missing: []

behavior_unverified_items:

  - truth: "Battle log + capture view + heroes collection reply within the 3s interaction window (deferReply → editReply) — the UI-SPEC latency backstops"
    test: "Run a live bot shard, start an encounter battle, press a tier button, and open /sanguo heroes; measure wall-clock reply latency"
    expected: "Each interaction completes its editReply within Discord's 3-second window (µs-synchronous battle engine, tx-based capture, async collection read)"
    why_human: "Presence checks prove the handlers deferReply→editReply without throwing; wall-clock latency on a real shard cannot be asserted from source or unit tests (flagged human_judgment: true in 10-06 D8 and 10-07 D10)"
human_verification:

  - test: "Live-Discord pass of the battle → capture → collection loop: fight an encounter (win), see the battle log, press Bắt, pick tier 1, capture success → collection line + companion switch → map position"
    expected: "The full vertical loop renders correctly with all embeds/buttons; each interaction replies within the 3s window"
    why_human: "UI-SPEC backstops (battle log, capture view, heroes collection latency) are handler-tested only; no held-out live interaction test exists on Discord"

  - test: "Craft a sanguo:capture:tier:1 customId on a pending encounter with NO battle fought (or use a stale capture view from before a re-battle loss)"
    expected: "The attempt is rejected without charging a fee (CAPTURE_NOT_AVAILABLE) — this currently FAILS: the fee is charged for a pity-only 0% roll and after 20 attempts the capture is guaranteed (CR-01)"
    why_human: "Confirms the CR-01 exploit end-to-end on a live bot; automated tests never exercise the crafted-customId path"

  - test: "Press a stale fight button on an old encounter embed after already winning the battle"
    expected: "The second battle is rejected (BATTLE_ALREADY_FOUGHT) and the capture view is shown — this currently FAILS: the battle re-runs, re-rolling wild IV/HP (CR-02)"
    why_human: "Stale-button behavior requires a live bot with multiple check-in embeds; not reproducible in unit tests"

  - test: "Boss capture decision (D-13): winning a boss battle then pressing capture currently surfaces BOSS_CAPTURE_UNAVAILABLE (known stub — no heroes row for a captured boss)"
    expected: "Human decision on the boss→heroes mapping (future content/schema work, WINDOWS.md #5); documented in 10-05/10-06 Known Stubs"
    why_human: "Content/schema decision, not a code defect; deferred by design"

  - test: "Confirm the 10-03 F8 economy adjustment (fees halved 5/15/40/100/250 vs the user-approved A1 10/30/80/200/500) is acceptable as the signed D-20 contract"
    expected: "The deviation is acknowledged (it was the plan's own F8-mandated safety valve to hold the ~416/hr gross bound); human_judgment flagged in 10-03 D4"
    why_human: "One-way economy sign-off; the checkpoint approved A1, the re-sign adjusted the absolute scale"
---

# Phase 10: Battle & Capture Verification Report

**Phase Goal:** Seeded battleEngine, captureService, IV + starter, collection view — the first complete vertical loop (ROADMAP Phase 10: "Vertical loop hoàn chỉnh đầu tiên — starter → travel → encounter → battle → capture → collection; điểm validate 'game có vui không' đầu tiên").
**Verified:** 2026-08-13T17:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can start a solo battle (player-initiated `/sanguo battle` or encounter-initiated) and see a turn-by-turn battle log that is seeded and replayable via `pure-rand` (SC1/TQC-10) | ✓ VERIFIED | `battleEngine.ts` runBattle is a synchronous pure function (xoroshiro128plus(seed) threaded via uniformFloat64; no Math.random/Date/IO); `startEncounterBattle` + `startSparBattle` in battleCheckInService.ts; `buildSanguoBattleLogEmbed.ts` (≤20 turn lines, SEASON/NEUTRAL); 18-behavior engine suite incl. 25-seed deep-equal replay loop |
| 2 | User sees capture % before attempting; capture outcome matches displayed % (server-authoritative, crypto RNG) (SC2/TQC-11) | ✓ VERIFIED | `renderCaptureView` (battle.ts:287-363) shows floor(chance×100)%; `attemptCapture` recomputes the exact chance inside the tx and rolls `cryptoUniform()` (strict `<`); chance formula + [0,1] clamp tested (T1a-c) |
| 3 | Failed capture attempts are also recorded in the audit log (SC2/TQC-11) | ✓ VERIFIED | `capture_attempts` table (10 columns + (user_id, created_at) index, migration 0019 applied); single insert site covering success/fail/flee with exact displayedChance + roll + pity_before (captureService.ts:242-251); T5 + T9 tests |
| 4 | User captures a hero with 6 IV stats (0–31) rolled at capture — IVs persist and are visible in the collection (SC3/TQC-12) | ✓ VERIFIED | Success path rolls 6× crypto.randomInt(0,32) → user_heroes insert with hp_current=base HP + captured_zone (captureService.ts:189-212); IV columns with 0-31 checks final from Phase 8; collection renders iv_grade keys (D-12 grade-only) |
| 5 | New user can choose 1 free starter hero during onboarding — the only faucet in the game (SC4/TQC-12) | ✓ VERIFIED | `/sanguo heroes` empty-collection state renders the starter picker (STARTER_SET_1/2, D-14 rotation via starterViews ≥ 3); handleStarterPick inserts with 6× crypto IV, hp_current=base HP, captured_zone NULL, sets activeHeroId, resets starterViews; **grep: 0 deductBalance in heroes.ts/hero.ts** (free grant, D-19); wallet-mock assertion in tests |
| 6 | User can view the collection with `/sanguo heroes` — grouped by zone with emoji, tier, IV; `/sanguo map` scaffold shows current position (SC5/TQC-13) | ✓ VERIFIED | `heroes.ts` execute renders per-zone lines `{{emoji}} {{name}} • {{stars}} • {{grade}}{{active}}` (stars from heroes.tier, grade from iv_grade.* keys, D-12 clean — no rarity/raw IV in any data interface); zone filter select in its own ActionRow; map.ts current_position from `getCurrentPosition(user.id)` (SC5, map.test.ts) |
| 7 | The D-06 replay contract is stored server-side: sanguo_battles carries seed + full input snapshot + roundLogs + result (SC1/TQC-10) | ✓ VERIFIED | `sanguoBattles.ts` schema: seed bigint mode 'number', input/result jsonb, type varchar, encounter_id FK; storeBattle writes `{player, enemy}` full CombatantInput snapshots (battleCheckInService.ts:195-210); T8 integration test re-runs the REAL engine against the stored input and deep-equals roundLogs |
| 8 | Battle seed is generated by crypto.randomInt at battle start (D-06); capture/flee/IV rolls ride crypto, not Math.random | ✓ VERIFIED | `defaultSeed()` = crypto.randomInt(2**48) (battleCheckInService.ts:67-69); capture roll/fleeRoll via cryptoUniform, IV via crypto.randomInt(0,32); pure-rand imports = 2 in battleEngine.ts, **0 outside** (grep) — D-06 battle-only mandate holds |
| 9 | Capture fee/tier is server-authoritative — tier customIds carry only the number; fee/multiplier resolve from CAPTURE_TIERS (anti-tamper, D-09/D-20) | ✓ VERIFIED | CAPTURE_TIERS 5 tiers (5/15/40/100/250💎 × 1.0/1.5/2.0/3.0/5.0, tiers 4-5 item-gated); customIds `sanguo:capture:tier:{n}` tier-only (grep: setCustomId uses tier only); server-side INVALID_TIER/TIER_LOCKED guards; fee via wallet.deductBalance with reason 'sanguo_capture_t{tier}' in the same tx |
| 10 | D-20 economy re-sign: E[net] ≤ 0 with E[inflow]=0 and gross < ~416/hr under effective chances (D-19 hard constraint) | ✓ VERIFIED | docs/economy-budget.md RE-SIGN (2026-08-13, Phase 10 D-20) block: 5-tier table matching CAPTURE_TIERS, E[net/hour] recomputed with effective chances (base × hpFactor × tierMult), both cadences documented, RE-SIGNED sign-off line; node probe prints RE-SIGN VERIFIED |
| 11 | Capture requires a completed player-won battle — the D-10 "won → capture window opens" precondition enforced SERVER-SIDE on a wallet path | ✓ VERIFIED | **CR-01 FIXED** (bec0c0e, 2026-08-14): `attemptCapture` throws `CAPTURE_NOT_AVAILABLE` before the fee when no player-won battle exists (captureService.ts:166-167); pity cap-bound per rarity. Live UAT test 6 PASS + captureService.test.ts CR-01a/b |
| 12 | An encounter cannot be re-battled after a win — the single-battle invariant the D-20 model prices | ✓ VERIFIED | **CR-02 FIXED** (bec0c0e, 2026-08-14): `startEncounterBattle` throws `BATTLE_ALREADY_FOUGHT` when a completed battle exists; UI routes to the capture view (battleCheckInService.ts:255-261). Live UAT test 7 PASS + battleCheckInService.test.ts CR-02 |

**Score:** 12/12 truths verified (CR-01/CR-02 closed by fix commit bec0c0e + live UAT, 2026-08-14)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/sanguo/battleEngine.ts` | Pure seeded engine | ✓ VERIFIED | CombatantInput/TurnLog/BattleResult, combatStat, getAttackType, BATTLE_CONFIG, runBattle; I/O-free + entropy-free header contract |
| `src/services/sanguo/battleCheckInService.ts` | Battle entry orchestrator | ✓ VERIFIED (CR-02 gap) | startEncounterBattle/startSparBattle/skipEncounter; FOR UPDATE, crypto IV/seed, replay record, HP write-back, loss→'escaped'; missing the BATTLE_ALREADY_FOUGHT guard |
| `src/services/sanguo/captureService.ts` | Single-writer capture tx | ✓ VERIFIED (CR-01 gap) | captureChance clamped [0,1] + attemptCapture (lock→tier→snapshot→fee→roll→pity/flee→audit→IV insert); missing the won-battle precondition |
| `src/constants/sanguoCapture.ts` | D-20-signed capture config | ✓ VERIFIED | 5 tiers, rarity/flee tables, PITY_INCREMENT 0.05, RARITY_DISTRIBUTION, hpFactor |
| `src/constants/sanguoBoss.ts` | Zone-scaled boss templates | ✓ VERIFIED | BOSS_TEMPLATES for all 18 seeded zones (rarity 5, elevated HP/STR), bossTemplateFor guard |
| Schema (heroes/userHeroes/sanguoBattles/encounterRuns/captureAttempts/userSanguoState/index) | Migration 0019 | ✓ VERIFIED | All columns/tables present; IV columns untouched (TQC-02); index.ts re-exports both new tables |
| `migrations/0019_green_snowbird.sql` | Generated + applied | ✓ VERIFIED | drizzle-kit generated (not hand-edited), applied; information_schema probe verified live in 10-02 |
| `scripts/data/sanguo-base-stats.json` + `seed-sanguo.ts` | Content seed | ✓ VERIFIED | 132 heroes + 6 starters; all 10 fields in-range; rarity dist 79/33/13/5/2 (≈ signed 60/25/10/4/1); FATAL-guarded idempotent upsert |
| `src/ui/embeds/buildSanguoBattleLogEmbed.ts` + `buildSanguoCaptureEmbed.ts` | Battle log + capture embeds | ✓ VERIFIED | Description-only log (≤20 lines, no addFields per turn); 5 COLORS keys; single mechanic number via capture.chance; 0 hex literals |
| `src/ui/components/sanguo{Battle,Capture,Starter}Buttons.ts` + `sanguoHeroesZoneMenu.ts` + `sanguoHeroCompanionButton.ts` | Button/select builders | ✓ VERIFIED | All customId consts present; tier customId tier-only; starter sets exactly 3 heroIds each; zone menu own row |
| `src/commands/sanguo/{battle,heroes,hero,map,travel}.ts` | Command handlers | ✓ VERIFIED | Full handler set; tier parseInt+isNaN guard; users.id identity (0 char.id calls); map getCurrentPosition; travel fight/skip row (D-01 inversion complete — 0 ACK_BTN_ID in router, 0 buildAckButton in travel.ts) |
| `src/events/interactionCreate.ts` | Router | ✓ VERIFIED | sanguo:battle:* / sanguo:capture:* / sanguo:heroes:* / sanguo:hero:* routes before the chat-input gate; ACK route removed |
| `locales/{vi,en,zh-cn}/sanguo.json` | i18n parity | ✓ VERIFIED | battle.* (11) + capture.* (14) + heroes.* (10) + hero.* (8) + iv_grade.* (5) + cmd.* keys; `npm run check-i18n` exit 0 |
| `docs/economy-budget.md` | D-20 re-sign | ✓ VERIFIED | RE-SIGN block + E[net]<0 + 5-tier 💎 table + RE-SIGNED line |

**Artifacts:** 14/14 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| battleCheckInService → battleEngine | runBattle(seed, CombatantInput) | Direct import + CombatantInput built from DB rows | ✓ WIRED | Player/enemy inputs built from user_heroes+heroes rows / boss templates; storeBattle persists the exact snapshot |
| sanguo_battles.input jsonb → runBattle | D-06 replay | T8 test re-runs real engine with stored input | ✓ WIRED | `runBattle(seed, JSON.parse(input))` deep-equals stored roundLogs |
| captureService → CAPTURE_TIERS | Fee/multiplier server-side | Import + tier resolution in tx | ✓ WIRED | Fee from config, never payload; wallet reason 'sanguo_capture_t{n}' |
| captureService → wallet.deductBalance | Fee + ledger in same tx | Direct call in tx | ✓ WIRED | INSUFFICIENT_BALANCE rolls back whole tx (T7) |
| capture/attempt → capture_attempts | Audit row every attempt | Single insert site in tx | ✓ WIRED | Exact chance + roll + pity_before stored (SC2) |
| encounter resolution → player_travel_state | encounterActive cleared + updatedAt pinned | Update in same tx on all terminal outcomes | ✓ WIRED | captured/fled/skipped/escaped all clear + pin (Pitfall 7); T10 escape→travel-resume test |
| button customIds → interactionCreate → handlers | D-01 routing | Router branches dispatch to battle.ts/heroes.ts/hero.ts | ✓ WIRED | All routes verified in source; ACK route removed (grep = 0) |
| starter picker → user_sanguo_state.starterViews | D-14 rotation | FOR UPDATE increment; pick resets | ✓ WIRED | heroes.ts:191-205, 376-381; rotation test (4th invocation → set 2) |
| collection line → heroes.tier (public) + iv_grade keys | D-12 never-render | Data interface carries gradeKey+stars only | ✓ WIRED | No rarity/IV column reaches any render path (grep clean) |
| **capture window → won-battle record** | **D-10 server-side precondition** | **MISSING — no sanguo_battles winner check** | ✗ NOT_WIRED | CR-01: the capture tx trusts the UI to gate on a win; crafted customId bypasses it |
| **startEncounterBattle → existing battle check** | **Single-battle invariant** | **MISSING — no existing-row check** | ✗ NOT_WIRED | CR-02: stale fight buttons re-run a won battle |

**Links:** 9/11 wired; the 2 broken links are exactly CR-01 and CR-02

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| Battle log embed | roundLogs | runBattle result → BattleOutcome | Yes — real engine output | ✓ FLOWING |
| Capture % (view) | percent | captureChance(rarity, hpMax/hpCurrent from locked battle snapshot + heroes rarity, tierMult 1, pity) | Yes — real DB rows (battle snapshot, heroes, encounter pity) | ✓ FLOWING |
| Capture chance (attempt) | chance | recomputed in tx from FOR UPDATE locked rows | Yes — server-authoritative | ✓ FLOWING (with CR-01 caveat: defaults to 0/0 when no battle row exists) |
| Collection lines | stars/gradeKey | heroes.tier + user_heroes iv_* via grade bands | Yes — real seeded/captured values | ✓ FLOWING |
| Map current_position | pos.nodeId | getCurrentPosition(user.id) from player_travel_state | Yes — real player state (not rows[0]) | ✓ FLOWING |
| Capture tier fee label | fee | CAPTURE_TIERS config | Yes — config constant, never payload | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npx vitest run` | 31 files / 282 tests passed | ✓ PASS |
| TypeScript | `npm run typecheck` | exit 0 | ✓ PASS |
| i18n parity | `npm run check-i18n` | "All locale files are in sync." exit 0 | ✓ PASS |
| Lint | `npm run lint` (max-warnings 0) | exit 0 | ✓ PASS |
| pure-rand scope gate | grep "from 'pure-rand" across src | 2 in battleEngine.ts, 0 elsewhere | ✓ PASS |
| Faucet gate | grep deductBalance in heroes.ts/hero.ts | 0 matches | ✓ PASS |
| D-01 inversion gate | grep ACK_BTN_ID / buildAckButton | 0 matches in interactionCreate.ts / travel.ts | ✓ PASS |
| CR-01 won-battle guard | grep winner/wonBattle/CAPTURE_NOT_AVAILABLE in captureService.ts | 3 matches — **guard PRESENT** (captureService.ts:166-167) | ✓ PASS |
| CR-02 existing-battle guard | grep BATTLE_ALREADY in battleCheckInService.ts | 1 match — **guard PRESENT** (battleCheckInService.ts:261) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| D-20 re-sign probe | node probe on docs/economy-budget.md (RE-SIGN block + E[net]≤0 + 💎 tier table) | `RE-SIGN VERIFIED` per 10-03-SUMMARY (node probe, 8f63dec) | PASS |
| Migration 0019 probe | information_schema probe (all 19 column/table names) | `MIGRATION 0019 VERIFIED` per 10-02-SUMMARY (corrected all-table probe) | PASS |
| Content seed probe | tsx cross-check (missing/orphan keys, range, rarity dist) | `BASE-STATS JSON VERIFIED` + RARITY DIST 79/33/13/5/2 per 10-04-SUMMARY; re-verified JSON structure (132 keys, 6 starters) in this run | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TQC-10 | 10-01, 10-02, 10-06 | Pure battleEngine (seeded, replayable with pure-rand); sanguo_battles records + jsonb round logs; solo battle (player-initiated + encounter-initiated) | ✓ SATISFIED (CR-02 caveat) | Engine + replay record + encounter/spar entry all present and tested; the re-battle gap (CR-02) is a server-side invariant defect, not an absence of the requirement's features |
| TQC-11 | 10-02, 10-03, 10-05, 10-06 | captureService: captureChance(rarity × HP% × item) clamped [0,1]; crypto RNG; % displayed before capture; pity counter; audit log incl. failed attempts | ✓ SATISFIED (CR-01 caveat) | Chance formula + crypto rolls + % display + pity + audit table all implemented and tested; CR-01 is the missing D-10 won-battle precondition on the capture window (server-authoritative intent), flagged as a blocker gap |
| TQC-12 | 10-02, 10-04, 10-07 | IV 6 stats (0–31) rolled at capture; starter onboarding — 1 free hero (only faucet) | ✓ SATISFIED | IV rolls at capture + starter grant share crypto.randomInt(0,32)×6; free grant (0 wallet calls); both tested |
| TQC-13 | 10-02, 10-07 | Collection view: /sanguo heroes (collection/pokedex by zone, emoji + tier + IV); /sanguo map scaffold | ✓ SATISFIED | Zone-grouped collection with emoji/stars/IV-grade, zone filter, hero detail, companion switch, map current position (SC5); tested |

**Coverage:** 4/4 requirements satisfied — all requirement IDs from PLAN frontmatter are accounted for (no orphans: 10-01→TQC-10, 10-02→TQC-10..13, 10-03→TQC-11, 10-04→TQC-12, 10-05→TQC-11, 10-06→TQC-10/11, 10-07→TQC-12/13; REQUIREMENTS.md checkboxes for TQC-10..13 marked [x] complete).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/sanguo/captureService.ts` | 156-157 | `hpMax = input.enemy?.base?.hp ?? 0` — silent fallback when the battle snapshot is missing (WR-03) | ⚠️ Warning | When no battle row exists (the CR-01 path), chance silently collapses to pity-only while the fee is charged — the mechanism behind CR-01; should throw `NO_BATTLE_SNAPSHOT` |
| `src/commands/sanguo/map.ts` | 171 | `heroEmoji(z.heroId)` unguarded (WR-02) | ⚠️ Warning | `heroEmoji` throws EMOJI_NOT_FOUND for unmapped heroIds → breaks the entire map command; every other consumer uses safeHeroEmoji/try-catch |
| `src/services/sanguo/battleEngine.ts` | 184 | `xoroshiro128plus(seed)` truncates seed to 32 bits (`seed|0`) while the service draws `crypto.randomInt(2**48)` (WR-01) | ⚠️ Warning | Effective seed entropy is 2³² not 2⁴⁸ — D-06's documented entropy is overstated; replay contract still holds (same seed → same state → same logs); collision probability 2⁻³² per pair |
| `src/db/schema/index.ts` | 31,44 | `export * from './heroFactions.js'` duplicated (IN-03) | ℹ️ Info | Harmless (ESM idempotent) but signals copy/paste; pre-existing, not Phase-10 scope |
| `src/db/schema/encounterRuns.ts` + captureService | — | Pity "resets on flee" documented but never implemented (IN-04) | ℹ️ Info | Functionally harmless (terminal rows); contract text vs code drift noted for Phase 11 |
| `src/commands/sanguo/battle.ts` | 537 | Dead `percent` computation in handleCaptureTierPress (IN-01) | ℹ️ Info | Computed but never rendered; cosmetic |
| — | — | `rounds` field populated but never rendered by the battle log builder (IN-02) | ℹ️ Info | Cosmetic |

No `TBD`/`FIXME`/`XXX` debt markers found in any Phase-10 file (grep clean).

### Gaps Summary

**Status: passed — all 12 truths verified. CR-01 and CR-02 (the two initial verification gaps) were closed by fix commit bec0c0e (2026-08-14) and confirmed live in UAT (tests 6 & 7).**

The phase goal — the first complete vertical loop (starter → travel → encounter → battle → capture → collection) — is achieved and **deployed to production 2026-08-14**: live data confirms 2 sanguo_battles (both won), 2 capture_attempts (tier 1, fee 5💎, success), 3 user_heroes (starter + 2 captured), 1 user_sanguo_state, 2 encounter_runs 'captured', matching wallet deductions (reason 'sanguo_capture_t1'). The 3 UI-SPEC latency backstops (battle log, capture view, heroes collection) were signed off in live UAT — all interactions replied within the 3s window. UAT 43/43 pass, 0 issues.

Both critical findings from the initial verification (2026-08-13) are RESOLVED:

1. **CR-01 — Capture without a won battle.** `attemptCapture` now verifies a completed player-won battle before charging any fee — throws `CAPTURE_NOT_AVAILABLE` (captureService.ts:166-167) when the battle row is missing or `result.winner !== 'player'`; `NO_BATTLE_SNAPSHOT` fail-loud on drifted input; the pity term is cap-bound per rarity (`PITY_CAP_BY_RARITY` 0.80/0.75/0.70/0.65/0.60) so grinding can never force chance to 1.0. The real-money exploit is closed: a crafted customId on an unfought encounter is rejected before the fee (UAT test 6 live-verified; +3 automated tests).

2. **CR-02 — Re-battling a won encounter.** `startEncounterBattle` now SELECTs the latest `sanguo_battles` row after the F2 pending re-fetch and throws `BATTLE_ALREADY_FOUGHT` (battleCheckInService.ts:255-261) when a completed battle exists; `handleBattleStart` catches it and routes to the capture view (F4 path). Stale fight buttons can no longer re-roll wild IV/HP, grind the wild, or destroy a won capture window via a re-battle loss (UAT test 7 live-verified; +1 automated test).

**Deferred (Step 9b):** None — Phase 11 (progression/chemistry/shop/legion) and Phase 12 (anti-abuse/monitoring/marketplace) roadmap criteria do not cover the CR-01/CR-02 invariants or the boss-capture mapping; the boss-capture stub (BOSS_CAPTURE_UNAVAILABLE) is documented in 10-05/10-06 Known Stubs and superseded by the 2026-08-14 boss REDESIGN decision (random zone general + 3v1 formation, Phase 11+, WINDOWS.md #5) which also provides a heroes row for capture.

**Warnings carried forward:** WR-01 (32-bit seed entropy — FIXED by bec0c0e: seed now drawn in pure-rand's native 2^32 space), WR-02 (unguarded heroEmoji in map.ts — FIXED by bec0c0e: safeHeroEmoji label-only fallback), WR-03 (silent chance collapse — FIXED by bec0c0e: NO_BATTLE_SNAPSHOT fail-loud).

---

_Verified: 2026-08-14T04:00:00Z (re-verified after fix commit bec0c0e + live UAT 43/43)_
_Verifier: the agent (gsd-verifier)_
