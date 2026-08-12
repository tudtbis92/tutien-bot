---
phase: 09-travel-encounters
plan: 04
subsystem: game (sanguo encounter system)
tags: [encounterService, crypto.randomInt, D-15 blend, B6 zone attribution, rollMinute, cap ZSET, boss, i18n, TDD]

# Dependency graph
requires:
  - phase: 09-03
    provides: pull-based check-in engine checkInTravel(userId, deps) with the injectable rollMinute seam + ack pause + F2 pending re-fetch
  - phase: 09-02
    provides: hero_zone_rates rows (per-zone weights, rate numeric(4,2)) + map_zones encounter_rate/boss_rate defaults (0.35/0.07) + map_edges graph
provides:
  - Pure encounterService: positionFraction, shouldRoll/shouldRollBoss, pickEncounterHero (D-15 linear blend + B6 dominant-zone attribution), capHit, cryptoUniform — crypto.randomInt only (milestone V6)
  - The real check-in rollMinute: cap-first sliding ZSET (D-13/Pitfall 7), position-blended pool pick (D-15), boss sub-roll (D-14), encounter_runs record (encounter_type + hero_id NULL on boss), F7 TTL, F8 Number(rate) — writes only encounter_runs + Redis (single-writer, Pitfall 5)
  - buildSanguoEncounterEmbed (SEASON normal / GOLD boss) + travel.ts dispatch with hero/zone/node per-locale resolution + encounter.* i18n keys (3 locales)
affects: [09-05 (migration + seed RUN; ROADMAP amendments), 10 (battle replaces the ack button, capture), 11, 12 (bot-detection hardens the soft cap)]

actuals:
  tokens: 11157    # chars/4 over the realized diff (44631 diff chars, 10 files, 689+/49-) — plan estimate 40000 (raw 20000); under estimate: TDD-style lean implementation, no new packages, no schema changes
  tasks: 2         # TDD: RED+GREEN per task (4 commits)
  commits: 4

tech-stack:
  added: []   # no new packages — node:crypto randomInt only (built-in)
  patterns:
    - "Crypto-backed RNG seam: encounterService exposes rng: () => number = cryptoUniform for test injection; production default crypto.randomInt (milestone V6) — deterministic tests, safe default"
    - "B6 dominant-zone attribution: a hero in both zone pools is attributed by higher blended weight (rateA·(1−pos) >= rateB·pos → A, else B), NOT loop-order overwrite — the research sketch's heroZone.set overwrite is the known bug this fixes"
    - "Zero-weight walk exclusion: pickEncounterHero filters w=0 entries before the cumulative walk so a rng()=0 draw can never select a hero absent from the pos-dominant pool"
    - "RollMinute factory inside the tx: makeDefaultRollMinute(tx, userId, travelId) closure captures the tx so the roll reads/writes through the SAME transaction (single-writer rule, Pitfall 5) — injected tests replace the whole callback"

key-files:
  created:
    - src/services/sanguo/encounterService.ts — pure encounter roll engine (D-15 blend, B6, cap predicate, cryptoUniform)
    - src/services/sanguo/__tests__/encounterService.test.ts — 11 tests (7 behaviors)
    - src/ui/embeds/buildSanguoEncounterEmbed.ts — SEASON/GOLD encounter embed (D-14 boss variant)
  modified:
    - src/services/sanguo/travelCheckInService.ts — real default rollMinute replaces the 09-03 no-hit stub
    - src/services/sanguo/__tests__/travelCheckInService.test.ts — redis mock + insert tracking + 4 default-roll tests
    - src/commands/sanguo/travel.ts — encounter/encounterPending dispatch via buildSanguoEncounterEmbed + resolveEncounterDisplay
    - src/commands/sanguo/__tests__/travel.test.ts — encounter-mode tests updated for the finalized embed
    - locales/{vi,en,zh-cn}/sanguo.json — encounter.* keys; arrival.* interpolation fix

key-decisions:
  - "i18next 26 default interpolation is {{...}} — single-brace {node} renders literally (verified against the installed package). The plan/UI-SPEC single-brace copy would have shipped literal {node}/{hero}/{zone} text; implemented with double braces and fixed the pre-existing arrival.body/cta latent bug in the same edit"
  - "The roll's DB reads inside the tx all end in .limit() (limit(2) nodes / limit(50) rates / limit(1) zone) — matches the existing fake-tx mock terminal contract and bounds the read (per-zone pool ≤ 45 rows)"
  - "Empty-pool / missing-zone / missing-edge guards are warn-skips, not crashes — a defensive roll never throws the check-in loop; the pure pickEncounterHero stays strict (EMPTY_ENCOUNTER_POOL) and the roll guards before calling"

patterns-established:
  - "Cap-first roll ordering (Pitfall 7): ZREMRANGEBYSCORE → best-effort EXPIRE (F7) → ZCARD → capHit BEFORE the probability roll; ZADD only on a successful roll; boss ZADDs too (it IS an encounter)"
  - "F8 conversion point: hero_zone_rates.rate numeric(4,2) arrives as a string from Drizzle — Number(r.rate) happens exactly once when building the ZoneRate[] for pickEncounterHero"
  - "Encounter display resolution: DB per-locale names for node/hero/zone (D-07) + heroEmoji with the EMOJI_NOT_FOUND name-only guard (map.ts:98 pattern)"

requirements-completed: [TQC-08]

coverage:
  - id: D1
    description: "Pure encounterService roll engine: positionFraction boundary/clamp math (D-15), shouldRoll/shouldRollBoss thresholds (D-10/D-14, strict <), pickEncounterHero position-blended weighted pick with B6 dominant-zone attribution and shared-hero weight accumulation, capHit sliding-window predicate (D-13), cryptoUniform crypto.randomInt-backed (milestone V6) — no Math.random, no db/redis imports"
    requirement: TQC-08
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T1 positionFraction 0 at departure / 1 at arrival / 0.5 mid-hop + clamps"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T2/T2b pos=0 A-only / pos=1 B-only blend boundary proofs"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T3 shared-hero weight accumulation + cumulative-walk ratio"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T4 B6 dominant-zone flip (pos<0.5 A / pos>0.5 B) — NOT loop-order overwrite"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T5/T5b shouldRoll/shouldRollBoss threshold + strict-< behavior"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T6 capHit window predicate (20/hr default)"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/encounterService.test.ts#T7 crypto RNG gate — no Math.random, crypto.randomInt present"
        status: pass
      - kind: other
        ref: "npm run typecheck == 0; grep Math.random == 0 / crypto.randomInt >= 1 in encounterService.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Check-in rollMinute integration (replaces the 09-03 stub): cap-first sliding ZSET (D-13/Pitfall 7) with F7 TTL, position-blended pick from map_nodes zone codes + hero_zone_rates (F8 Number) + map_zones rates (defaults 0.35/0.07), boss sub-roll recording encounter_type='boss' with hero_id NULL (D-14), encounter_runs insert + ZADD on hit, warn-skips for missing edge/zone/empty pool, single-writer rule — the roll writes ONLY encounter_runs + Redis"
    requirement: TQC-08
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T8 cap >= 20 -> silent skip, no insert, no zadd"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T9 hero roll -> encounter_runs hero INSERT + zadd + single-writer column proof"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T10 boss sub-roll -> boss INSERT, hero_id NULL, dominant zone, boss counts toward cap"
        status: pass
      - kind: unit
        ref: "src/services/sanguo/__tests__/travelCheckInService.test.ts#T11 missing edge -> warn-skip, no crash"
        status: pass
      - kind: other
        ref: "grep zremrangebyscore/zcard/zadd/capHit present, capHit before roll; expire(capKey, 86_400) F7; Number(r.rate) F8; Math.random == 0 in travelCheckInService.ts; no sanguo-tick-encounters/schedule(/createQueue('sanguo (D-22); npm run check-i18n == 0; npm run typecheck == 0; full vitest suite 187/187"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildSanguoEncounterEmbed (SEASON normal / GOLD boss per UI-SPEC color contract, boss copy with per-locale zone name, hero body with node/hero_emoji/hero interpolation) + travel.ts encounter/encounterPending dispatch resolving per-locale node/hero/zone names from DB with the heroEmoji EMOJI_NOT_FOUND name-only guard + encounter.* i18n keys in all 3 locales"
    requirement: TQC-08
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#encounter mode replies the encounter embed (hero name/emoji) + ack button (D-24)"
        status: pass
      - kind: unit
        ref: "src/commands/sanguo/__tests__/travel.test.ts#encounterPending mode replies the boss GOLD embed, NO re-roll (F2/D-25)"
        status: pass
      - kind: other
        ref: "grep COLORS.GOLD boss / COLORS.SEASON else in buildSanguoEncounterEmbed; encounter.title/body/boss_title/boss_body present in vi/en/zh-cn; npm run check-i18n == 0"
        status: pass
    human_judgment: true
    rationale: "Unit tests assert builder shape (titles, colors, customIds, interpolation keys) but cannot render the Discord client — visual adequacy of the encounter embed (hero emoji + bold name layout, GOLD boss variant, ack button) needs a human sign-off in a live guild"

# Metrics
duration: 32min
completed: 2026-08-12
status: complete
---

# Phase 9 Plan 4: Encounter System — Roll Engine, Check-In Integration & Boss Embed (TQC-08) Summary

**The encounter system is live: a crypto-backed pure roll engine (D-15 position-blended pool with the B6 dominant-zone fix, D-14 boss sub-roll, D-13 cap predicate), the real cap-first `rollMinute` wired into the `/sanguo travel` check-in loop, and the finalized encounter embed (SEASON hero / GOLD boss) with full i18n — no job, no cron (D-22)**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-12T09:50:07Z
- **Completed:** 2026-08-12T10:22:30Z (approx)
- **Tasks:** 2 (TDD — RED + GREEN per task)
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- **Pure encounterService (TQC-08 core math):** `positionFraction` (D-15 position = 1 − remaining/total, clamped), `shouldRoll`/`shouldRollBoss` (D-10 0.35 / D-14 0.07 zone-configurable thresholds, strict `<`), `pickEncounterHero` — the locked linear blend `rateA·(1−pos) + rateB·pos` summed across both pools with the **B6 dominant-zone attribution** (a hero in both pools goes to the pos-dominant zone, NOT the loop-order overwrite the research sketch warns about), `capHit` (sliding-window predicate, 20/hr), and `cryptoUniform` — **crypto.randomInt backed, the only default rng** (milestone V6; `Math.random` grep == 0, `crypto.randomInt` present, enforced by a source-read test too). No db/redis imports — the check-in owns I/O.
- **Real rollMinute in the check-in (closes the 09-03 seam):** `makeDefaultRollMinute(tx, userId, travelId)` runs inside the check-in transaction and implements the exact D-13/D-14/D-15/D-24 order — **cap first** (ZREMRANGEBYSCORE → best-effort EXPIRE 86_400 per F7 → ZCARD → `capHit`, silent skip, Pitfall 7), position from `remainingAfter`/`totalSeconds` (missing edge → warn-skip), zone codes from map_nodes + rates from hero_zone_rates with the **F8 `Number(rate)`** conversion, dominant zone = `pos < 0.5 ? from : to`, hero roll on the zone's `encounter_rate` (0.35), boss sub-roll on `boss_rate` (0.07), then the record: `encounter_runs` INSERT with `encounter_type` `'hero'|'boss'` (boss → `hero_id NULL`) + Redis `ZADD` (boss counts toward the cap). **Single-writer rule holds** — the roll writes only encounter_runs + Redis; the ONLY `player_travel_state` write carries exactly `travelSecondsRemaining/encounterActive/updatedAt` (asserted in T9).
- **Encounter embed finalized (closes the 09-03 stub):** `buildSanguoEncounterEmbed(data, t)` — `.setColor(data.boss ? COLORS.GOLD : COLORS.SEASON)` (UI-SPEC: GOLD reserved for boss), title/body per the copywriting contract, `embedFooter(shardId)` + `setTimestamp()`. `travel.ts`'s encounter/encounterPending dispatch resolves the per-locale destination node name, the hero's name + `heroEmoji()` markup (with the EMOJI_NOT_FOUND → name-only guard, map.ts:98 pattern), and — for boss — the dominant zone's per-locale name; `buildMinimalEncounterEmbed` removed.
- **i18n:** `encounter.title/body/boss_title/boss_body` in all 3 locales, key-synced (check-i18n green). All interpolation uses **double-brace `{{...}}`** — i18next 26's default (the plan's single-brace `{node}` would have rendered literally; verified against the installed package).
- **No job, no cron (D-22):** the roll engine runs inside `/sanguo travel` only — grep confirms zero `sanguo-tick-encounters`, zero `schedule(`, zero `createQueue('sanguo`.

## Task Commits

Each task followed TDD (RED test commit → GREEN implementation commit):

1. **Task 1 RED: encounterService tests** — `efa9a3b` (test)
2. **Task 1 GREEN: pure encounter roll engine** — `f584db8` (feat)
3. **Task 2 RED: default rollMinute integration tests** — `7dc2462` (test)
4. **Task 2 GREEN: rollMinute wiring + embed + i18n + dispatch** — `f72900e` (feat)

**Plan metadata:** committed separately after SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/services/sanguo/encounterService.ts` — pure roll engine (D-15 blend, B6, thresholds, cap, cryptoUniform); no db/redis imports
- `src/services/sanguo/__tests__/encounterService.test.ts` — 11 tests / 7 behaviors (boundaries, B6 flip, accumulation, thresholds, cap, crypto gate)
- `src/services/sanguo/travelCheckInService.ts` — `makeDefaultRollMinute` (cap-first ZSET, blend, boss, record) replaces the no-hit stub; `RollMinuteResult.skipped` added
- `src/services/sanguo/__tests__/travelCheckInService.test.ts` — redis mock (zremrangebyscore/zcard/zadd/expire) + insert tracking + T8–T11 default-roll tests
- `src/ui/embeds/buildSanguoEncounterEmbed.ts` — SEASON/GOLD encounter embed (D-14 boss variant)
- `src/commands/sanguo/travel.ts` — `resolveEncounterDisplay` + dispatch via `buildSanguoEncounterEmbed`; minimal embed removed
- `src/commands/sanguo/__tests__/travel.test.ts` — encounter-mode tests updated (title/body/color keys, display reads)
- `locales/{vi,en,zh-cn}/sanguo.json` — `encounter.*` keys (double-brace); `arrival.body/cta` interpolation fixed; `pending_*` removed

## Decisions Made

- **Double-brace interpolation (Rule 1):** the plan's copywriting contract uses single-brace `{node}`/`{hero}`/`{zone}`, but i18next 26.3.6 defaults to `{{...}}` interpolation — single-brace renders the literal token (verified: `t('x', {node})` on `"Bạn đã đến **{node}**."` outputs the raw braces). The new keys use `{{...}}` and the pre-existing `arrival.body/cta` latent bug (shipped in 09-03) was fixed in the same locale edit.
- **Tx-scoped roll factory:** `makeDefaultRollMinute(tx, userId, travelId)` captures the check-in transaction so the roll's reads and the encounter_runs insert ride the same tx — the single-writer invariant holds structurally, and injected-test rolls replace the whole callback (the 09-03 seam contract is unchanged).
- **Defensive roll, strict pick:** missing edge / missing zone / empty pool → `logger.warn` + skip (never crashes the loop); the pure `pickEncounterHero` stays strict (`EMPTY_ENCOUNTER_POOL`) and the roll guards before calling.
- **Zero-weight walk exclusion:** entries with weight 0 are filtered before the cumulative walk so an exact `rng()=0` draw can never select a hero absent from the pos-dominant pool (this also keeps pos=0/pos=1 boundary picks strictly within the dominant zone).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18next 26 single-brace interpolation renders literally**
- **Found during:** Task 2 (locale keys + embed builder)
- **Issue:** The plan/UI-SPEC copywriting contract prescribes `{node}`/`{hero_emoji}`/`{hero}`/`{zone}` single-brace interpolation. i18next 26.3.6's default interpolation prefix/suffix is `{{`/`}}` — verified against the installed package: `t('key', { node })` on a single-brace value returns the literal `{node}` text, so the encounter body (and the 09-03-shipped `arrival.body`) would render placeholders verbatim.
- **Fix:** New `encounter.*` keys use `{{node}}`/`{{hero_emoji}}`/`{{hero}}`/`{{zone}}`; the pre-existing `arrival.body`/`arrival.cta` single-brace keys (same latent bug, same locale files) converted to `{{...}}` in the same edit.
- **Files modified:** locales/{vi,en,zh-cn}/sanguo.json
- **Verification:** check-i18n green; builder tests assert the keys interpolate through the same `t(...)` shape the production 09-01 keys use
- **Committed in:** f72900e (Task 2 GREEN)

**2. [Rule 3 - Blocking] Test harness fixes required for the default-roll tests**
- **Found during:** Task 2 GREEN (running the RED tests against the real roll)
- **Issue:** (a) The new `describe` block is a sibling of the 09-03 describe, so its `beforeEach(clearAllMocks)` did not apply — cross-test `redis.zadd` call contamination made T10/T11 fail on stale counts; (b) `runCheckIn` did not propagate the new `insert`/`insertValues` tx mocks; (c) multi-row queue entries (NODES/RATES) were wrapped in an extra array — the mock convention is one flat row-array per read; (d) `'-inf'` ZSET bound tripped `i18next/no-literal-string` (addressed with the existing eslint-disable pattern).
- **Fix:** Added a `beforeEach(clearAllMocks)` to the new describe, propagated the insert mocks, laid out the read queue flat, and added the targeted eslint-disable.
- **Files modified:** src/services/sanguo/__tests__/travelCheckInService.test.ts, src/services/sanguo/travelCheckInService.ts
- **Verification:** all 23 service tests green; full suite 187/187; lint clean
- **Committed in:** f72900e (Task 2 GREEN)

**3. [Rule 1 - Bug] Test expectations + walk-order edge in pickEncounterHero**
- **Found during:** Task 1 GREEN
- **Issue:** (a) My initial T2b/T4 expectations assumed a different cumulative-walk band order than the Map-insertion-order walk produces; (b) the walk included weight-0 entries — an exact `rng()=0` draw would select a zero-weight hero (e.g., a zone-B-only hero at pos=0), violating the "only zone-A heroes at pos=0" boundary contract.
- **Fix:** Corrected the test expectations to the actual walk order and forced `heroId: 4` in the B6 test via rng=0.7; the implementation now filters `w > 0` entries before the walk.
- **Files modified:** src/services/sanguo/encounterService.ts, src/services/sanguo/__tests__/encounterService.test.ts
- **Verification:** 11/11 encounterService tests green; B6 flip asserted with `toEqual({heroId:4, zone})` at pos 0.4/0.6
- **Committed in:** f584db8 (Task 1 GREEN)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes were necessary for runtime correctness (interpolation), test determinism/cross-test isolation, and the boundary contract. No scope creep — no new packages, no architecture changes, no schema changes.

## Issues Encountered

- **vitest mock isolation (sibling describes):** the 09-03 describe's `beforeEach(clearAllMocks)` does not cascade to a sibling describe — new test blocks must declare their own reset hooks. Root-caused via an isolated probe; the fix is one `beforeEach` line.
- **`vi.spyOn(crypto, 'randomInt')` interception:** verified it patches the shared node builtin across module boundaries (probe confirmed `cryptoUniform() === 0.2` under the spy) — this is the deterministic-rng mechanism for the integration tests.
- **Pre-commit hook (lint-staged):** blocked twice — an unused eslint-disable directive (RED test) and an unused destructured `insert` mock (T10); both fixed in-place, no `--no-verify` used.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **TQC-08 delivered:** encounters roll inside `/sanguo travel` with the D-15 position-blended pool, D-14 boss sub-roll (boss counts toward the cap), D-13 silent cap skip (travel never blocked), stop-at-first (D-24), inline results + ack pause (D-25). All rolls ride `crypto.randomInt` (grep-enforced). `encounter_runs` records carry `encounter_type`; WINDOWS ledger entries 3–4 (the two 09-04 seams) marked **fixed** — open_count 0.
- **Ready for 09-05:** no schema drift from this plan (no new tables/columns, no migration); the migration + seed RUN gate (`drizzle-kit generate` for map_zones/map_edges/hero_zone_rates + `seed:sanguo` D-20 replace) and the ROADMAP SC2/SC3 + economy re-sign amendments remain scheduled there.
- **Ready for Phase 10:** the ack button is the Phase-10 battle/capture hook point; the check-in's `encounterActive` pause and the `encounter_runs` rows are the battle input.
- **Blockers/concerns:** none. The two FLAGGED ASSUMPTIONS this plan implemented with research defaults (0.35/0.07 rates, 20/hr cap) are tunable DATA (`map_zones.encounter_rate/boss_rate`, `capHit` limit), not code — a balance pass can adjust them without redeploy.

---

*Phase: 09-travel-encounters*
*Completed: 2026-08-12*

## Self-Check: PASSED

- Files verified on disk: encounterService.ts, encounterService.test.ts, travelCheckInService.ts, travelCheckInService.test.ts, buildSanguoEncounterEmbed.ts, travel.ts, travel.test.ts, locales/{vi,en,zh-cn}/sanguo.json, 09-04-SUMMARY.md — all FOUND.
- Commits verified in git log: `efa9a3b` (test RED), `f584db8` (feat GREEN), `7dc2462` (test RED), `f72900e` (feat GREEN) — all FOUND. TDD gate compliance: each task has a `test(...)` commit strictly before its `feat(...)` commit.
- Full suite re-run at close-out: 25 files / 187 tests passed; `npm run check-i18n` green; `npm run typecheck` green; `npm run lint` green.
- Grep gates re-run at close-out: `Math.random` == 0 in encounterService.ts and travelCheckInService.ts; `crypto.randomInt` present (3×); no `sanguo-tick-encounters`/`schedule(`/`createQueue('sanguo` in this plan's files.
- WINDOWS ledger: entries 3 & 4 marked fixed (open_count 0).
