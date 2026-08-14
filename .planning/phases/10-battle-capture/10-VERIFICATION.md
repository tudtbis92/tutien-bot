---
phase: 10-battle-capture
verified: 2026-08-13T17:20:00Z
status: gaps_found
score: 10/12 must-haves verified
behavior_unverified: 3 # Present + wired, no test exercises the 3s interaction-window latency backstops (battle log / capture view / heroes collection)
overrides_applied: 0
gaps:
  - truth: "Capture requires a completed player-won battle — the D-10 'won → capture window opens' precondition is enforced SERVER-SIDE, not just by the UI (anti-tamper: a crafted sanguo:capture:tier:{n} interaction on an unfought encounter must fail before any fee)"
    status: failed
    reason: "CR-01 (confirmed in code, unfixed): attemptCapture (captureService.ts:148-167) reads the latest sanguo_battles row for the encounter but NEVER verifies a completed battle exists or that result.winner === 'player'. With no battle row, input/result default to {} → hpMax=0/hpCurrent=0 → hpFactor(0,·)=0 → chance = pity×0.05 only; after 20 failed attempts pity clamps chance to 1.0 → GUARANTEED paid capture of any rarity (incl. rarity 5) for 21×5=105💎 without ever fighting. Violates D-10 and the server-authoritative/anti-tamper contract (T-10-05-02, T-10-05-04) on a wallet path. The code review (10-REVIEW.md) provides a concrete fix (won-battle SELECT + CAPTURE_NOT_AVAILABLE throw before the fee); the fix is NOT applied — the review commit 89f48d3 is the last commit in git log."
    artifacts:
      - path: "src/services/sanguo/captureService.ts"
        issue: "Lines 148-167: no won-battle precondition; hpMax/hpCurrent default to 0 when the snapshot is missing, silently collapsing the chance to pity-only while the fee is still charged"
    missing:
      - "In attemptCapture, after the FOR UPDATE encounter lock and before the fee: verify a completed sanguo_battles row (type='encounter', encounter_id) with result.winner==='player' exists; throw Error('CAPTURE_NOT_AVAILABLE') otherwise (mirror in renderCaptureView battle.ts:304-313)"
      - "Test: attemptCapture with [PENDING] and no battle row rejects and never calls deductBalance"
  - truth: "An encounter battle cannot be re-run against a pending encounter that already has a completed battle — the single-battle invariant that the D-20 economy model prices (one battle per capture window, wild IV/HP not freely re-rollable)"
    status: failed
    reason: "CR-02 (confirmed in code, unfixed): startEncounterBattle (battleCheckInService.ts:218-291) checks playerTravelState.encounterActive + the pending encounter but NEVER checks whether a completed sanguo_battles row already exists for it. After a win the encounter stays 'pending' and encounterActive stays true, while older encounter embeds with live fight buttons remain in chat — pressing a stale fight button re-runs the battle: (a) wild IV is re-rolled and enemy HP resets to full → free grinding of the wild to 0 HP (hpFactor→1.0) breaking the D-20 model (Pitfall 5); (b) a re-battle LOSS flips the encounter to 'escaped' (battleCheckInService.ts:271-279), destroying the won capture window and overwriting companion hpCurrent (possibly to 0 → HERO_FAINTED soft-lock with no heal). Fix proposed in 10-REVIEW.md (BATTLE_ALREADY_FOUGHT throw + capture-view routing); NOT applied."
    artifacts:
      - path: "src/services/sanguo/battleCheckInService.ts"
        issue: "startEncounterBattle has no existing-battle check between the F2 pending re-fetch (line 239) and the battle execution (line 248)"
    missing:
      - "In startEncounterBattle after the pending re-fetch: SELECT the latest sanguo_battles row (type='encounter', encounter_id); if present throw Error('BATTLE_ALREADY_FOUGHT'); handleBattleStart (battle.ts) catches it and renders the capture view (reuse the F4 path)"
      - "Test: second startEncounterBattle call for the same pending encounter rejects and writes no new battle row"
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
| 11 | Capture requires a completed player-won battle — the D-10 "won → capture window opens" precondition enforced SERVER-SIDE on a wallet path | ✗ FAILED | **CR-01 (confirmed in code, unfixed)** — see gaps |
| 12 | An encounter cannot be re-battled after a win — the single-battle invariant the D-20 model prices | ✗ FAILED | **CR-02 (confirmed in code, unfixed)** — see gaps |

**Score:** 10/12 truths verified (2 failed — both critical review findings, confirmed present in code and unfixed)

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
| CR-01 won-battle guard | grep winner/wonBattle/CAPTURE_NOT_AVAILABLE in captureService.ts | 0 matches — **guard ABSENT** | ✗ FAIL |
| CR-02 existing-battle guard | grep BATTLE_ALREADY in battleCheckInService.ts | 0 matches — **guard ABSENT** | ✗ FAIL |

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

**Status: gaps_found — 2 critical server-side state preconditions are missing on money/state paths, both confirmed in code and unfixed.**

The phase goal — the first complete vertical loop (starter → travel → encounter → battle → capture → collection) — is **functionally achieved**: all four features (seeded battle engine, capture service, IV + starter, collection view) exist, are wired, flow real data, and are covered by a green 282-test suite with typecheck/lint/i18n clean. All 5 ROADMAP success criteria are demonstrable in code.

However, the code review (10-REVIEW.md) identified **two critical findings that are real, present in the code, and UNFIXED** (the review commit `89f48d3` is the last commit in git log — no fix commit follows):

1. **CR-01 — Capture without a won battle.** `attemptCapture` never verifies a completed player-won battle exists before charging the fee. On an unfought encounter the chance silently collapses to pity-only (hpMax defaults to 0 → hpFactor=0); after 20 paid failures the pity clamps chance to 1.0 → **guaranteed capture of any hero, including rarity 5, without ever fighting** — a real-money exploit violating D-10 and the server-authoritative/anti-tamper contract (T-10-05-02, T-10-05-04). The UI gates capture buttons on a win, but the server does not — and this codebase's own threat model treats crafted customIds as a genuine threat.

2. **CR-02 — Re-battling a won encounter.** `startEncounterBattle` never checks whether a completed battle already exists for the pending encounter. Stale fight buttons (older check-in embeds remain live in chat) re-run a won battle: the wild IV is re-rolled and enemy HP resets to full (free grinding to 0 HP → hpFactor 1.0, breaking the D-20 economy model), and a re-battle loss destroys the open capture window and can faint the companion (no heal exists).

These are **goal-completion blockers**, not post-deploy notes: they violate the phase's own D-10 contract and economy model on wallet paths, the review rates them CRITICAL with concrete fixes, and no fix exists in the tree. Both are `gaps_found` blockers for the phase gate.

**Deferred (Step 9b):** None — Phase 11 (progression/chemistry/shop/legion) and Phase 12 (anti-abuse/monitoring/marketplace) roadmap criteria do not cover the CR-01/CR-02 invariants or the boss-capture mapping; the boss-capture stub (BOSS_CAPTURE_UNAVAILABLE) is documented in 10-05/10-06 Known Stubs as deferred to a future content decision (WINDOWS.md #5) and is not re-raised here as a new gap.

**Warnings carried forward:** WR-01 (32-bit seed entropy — D-06 entropy overstatement, replay intact), WR-02 (unguarded heroEmoji in map.ts), WR-03 (silent chance collapse — the CR-01 mechanism).

---

_Verified: 2026-08-13T17:20:00Z_
_Verifier: the agent (gsd-verifier)_
