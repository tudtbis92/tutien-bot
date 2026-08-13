---
phase: 09-travel-encounters
verified: 2026-08-13T03:30:00Z
status: passed
score: 34/34 must-haves verified
behavior_unverified: 0
---

# Phase 9: Travel & Encounters Verification Report

**Phase Goal:** Người chơi di chuyển real-time trên bản đồ mốc địa danh (time-only cost, atomic state) và nhận encounters dọc hành trình qua travel check-in khi gọi /sanguo travel — core loop thời gian thực của game.
**Verified:** 2026-08-13T03:30:00Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/sanguo travel` with no active journey renders destination StringSelectMenu (≤25, nearest first) + disabled Start button; selecting enables Start | ✓ VERIFIED | `travel.test.ts` execute-no-journey + select tests; live Discord UAT test 2 PASS (CR-09-02/03) |
| 2 | Start press calls `startTravel(user.id, code)`; travel costs only time, never Linh thạch (D-01) | ✓ VERIFIED | `travelService.ts` — zero `deductBalance`/`services/wallet` references (grep == 0); `travelService.test.ts` D-01 gate; UAT test 1/2 PASS |
| 3 | Travel confirmation SEASON embed shows destination/ETA/from — NO money field | ✓ VERIFIED | `buildSanguoTravelReplyEmbed.ts`; travel.test.ts field assertions; UAT test 2 PASS (CR-09-06 state-specific titles) |
| 4 | One-hop per journey (D-08); destination select menu value = stable node code, never localized name | ✓ VERIFIED | `sanguoTravelDestinationMenu.ts` (value = code); travel.test.ts; UAT test 2 PASS |
| 5 | `travelService.getCurrentPosition` — START_NODE default / arrived→toNodeId / traveling→fromNodeId | ✓ VERIFIED | `travelService.ts`; 11 unit tests (travelService.test.ts) |
| 6 | `travelService.getAdjacentNodes` — edges+node join, travelSeconds ASC, cap 25 | ✓ VERIFIED | `travelService.ts`; unit tests |
| 7 | `startTravel` atomic: code→id resolve, FOR UPDATE row lock, ALREADY_TRAVELING (D-09), NO_ROUTE server-side re-validation, INSERT-first/in-place-UPDATE | ✓ VERIFIED | `travelService.ts:127-160`; `travelService.test.ts` (6 behaviors); UAT test 1 |
| 8 | User cannot cancel a journey; no cancel status, no refund path anywhere (D-03) | ✓ VERIFIED | `travelService.ts` grep — cancel only in doc comment ("no cancel"); status enum `'traveling'|'arrived'` |
| 9 | Position always equals the last arrived node; travel state resolves at arrival | ✓ VERIFIED | `travelCheckInService.ts` arrival branch sets status='arrived'; check-in tests T1/T3/T4 |
| 10 | `/sanguo travel` while traveling computes elapsed, rolls 1× per counted minute, decrements remaining (hit minute counted F4) | ✓ VERIFIED | `travelCheckInService.ts` roll loop; 8 unit tests (T1-T7) |
| 11 | Arrival resolves inline at check-in when remaining hits 0 (D-07/D-28); overdue self-heal clamped to 0 (D-05) | ✓ VERIFIED | `travelCheckInService.ts` T3/T4; live UAT test 3 PASS |
| 12 | `encounterActive` pause — pending encounter re-fetched (F2 index), NO time counted; ack button resumes clock (D-25) | ✓ VERIFIED | `travelCheckInService.ts:211,287`; travel.test.ts ack test; UAT test 3 PASS (CR-09-05 ack embed) |
| 13 | Encounter results inline in the interaction — no cron, no push, no @discordjs/rest (D-22/D-23) | ✓ VERIFIED | grep `schedule(|createQueue|@discordjs/rest|sanguo-tick` == 0 in check-in/encounter services; UAT tests 3/4 |
| 14 | Encounter roll engine pure + crypto RNG (milestone V6) — crypto.randomInt, no Math.random | ✓ VERIFIED | `encounterService.ts:58` cryptoUniform; source-read test; grep Math.random == 0 |
| 15 | Position-blended pool pick (D-15): rateA·(1−pos)+rateB·pos, B6 dominant-zone attribution | ✓ VERIFIED | `encounterService.ts` pickEncounterHero; encounterService.test.ts T2/T3/T4 |
| 16 | shouldRoll/shouldRollBoss thresholds from map_zones (0.35/0.07), strict < | ✓ VERIFIED | `encounterService.ts`; T5/T5b |
| 17 | Cap 20/hr sliding window — capHit BEFORE any roll, silent skip (D-13, Pitfall 7) | ✓ VERIFIED | `encounterService.ts:135` capHit(limit=20); travelCheckInService.test.ts T8 |
| 18 | Boss sub-roll records encounter_type='boss', hero_id NULL, counts toward cap (D-14) | ✓ VERIFIED | `travelCheckInService.ts`; T10; automated coverage 09-04:D2 |
| 19 | Encounter embed SEASON hero / GOLD boss per UI-SPEC color contract; ack button (D-24/D-25) | ✓ VERIFIED | `buildSanguoEncounterEmbed.ts`; travel.test.ts; UAT test 4 (boss variant covered by automated tests — skipped live, rate 0.07) |
| 20 | `encounter_runs` records carry encounter_type + F2 (user_id,status) index | ✓ VERIFIED | `encounterRuns.ts`; migration 0018; live DB check (UAT test 1) |
| 21 | map_edges undirected graph table with unique pair index (D-17) | ✓ VERIFIED | `mapEdges.ts`; migration 0018; DB check |
| 22 | map_zones reference table: code unique, per-locale names, sort_order, encounter_rate/boss_rate (D-19/A7) | ✓ VERIFIED | `mapZones.ts`; dataset 18 zones |
| 23 | hero_zone_rates mapping (D-16/A3): hero_id FK, zone, rate numeric(4,2), unique (hero_id, zone) | ✓ VERIFIED | `heroZoneRates.ts`; 208 rows |
| 24 | TQC-09 dataset committed: 18 zones / 73 nodes / 162 edges / 208 rates, 132/132 hero coverage | ✓ VERIFIED | `sanguo-map-data.json` (49KB); count gate `dataset counts OK 18 73 162 208`; UAT test 1 |
| 25 | D-20 full-replace seed idempotent (B3): child→parent deletes, re-runs identical | ✓ VERIFIED | `seed-sanguo.ts:407-409`; double-run verified (UAT test 1, 09-05:D2) |
| 26 | Migration 0018 generated by drizzle-kit, applied — drops arrive_at/cost, adds remaining/encounter_active, creates 3 map tables | ✓ VERIFIED | `migrations/0018_sanguo_travel_map.sql`; live DB column check (UAT test 1) |
| 27 | `migrate` uses DATABASE_URL_DIRECT (PgBouncer-safe); runtime uses pooled URL | ✓ VERIFIED | `drizzle.config.ts` comment + config; applied cleanly |
| 28 | /sanguo map zone labels from map_zones per-locale (A8) with pickName fallback | ✓ VERIFIED | `map.ts`; map.test.ts |
| 29 | users.id identity — travelService + handlers key on users.id, never char.id | ✓ VERIFIED | grep `checkInTravel(char.id` == 0; travel.test.ts |
| 30 | Router branches sanguo:travel:* before chat-input gate; customId prefix validated | ✓ VERIFIED | `interactionCreate.ts`; travel.test.ts |
| 31 | i18n — travel/arrival/encounter/ack keys in vi/en/zh-cn, check-i18n sync | ✓ VERIFIED | `npm run check-i18n` exit 0; all 3 locales |
| 32 | TypeScript clean — typecheck 0 errors | ✓ VERIFIED | `npm run typecheck` exit 0 (2026-08-13) |
| 33 | Lint clean — eslint max-warnings=0 | ✓ VERIFIED | `npm run lint` exit 0 |
| 34 | Full test suite green — 186 tests / 24 files | ✓ VERIFIED | `npm test` 186/186 pass (2026-08-13) |

**Score:** 34/34 truths verified (34 programmatically + live UAT)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/sanguo/travelService.ts` | Pure time/state journey service | ✓ EXISTS + SUBSTANTIVE | START_NODE, getCurrentPosition, getAdjacentNodes, startTravel; zero wallet |
| `src/services/sanguo/travelCheckInService.ts` | Pull check-in engine | ✓ EXISTS + SUBSTANTIVE | FOR UPDATE, per-minute roll loop, encounter pause, arrival, ack |
| `src/services/sanguo/encounterService.ts` | Pure encounter roll engine | ✓ EXISTS + SUBSTANTIVE | position blend, B6, boss sub-roll, cap, crypto RNG |
| `src/commands/sanguo/travel.ts` | /sanguo travel command + dispatch | ✓ EXISTS + SUBSTANTIVE | mode dispatch, select/start/ack handlers, embed resolution |
| `src/ui/components/sanguoTravelDestinationMenu.ts` | Destination picker | ✓ EXISTS + SUBSTANTIVE | ≤25, value=code, setEmoji |
| `src/ui/components/sanguoTravelButtons.ts` | Start + ack buttons | ✓ EXISTS + SUBSTANTIVE | customId namespace sanguo:travel:* |
| `src/ui/embeds/buildSanguoTravelReplyEmbed.ts` | Travel confirmation embed | ✓ EXISTS + SUBSTANTIVE | state-specific titles, no money field |
| `src/ui/embeds/buildSanguoArrivalEmbed.ts` | Arrival embed | ✓ EXISTS + SUBSTANTIVE | SEASON, inline |
| `src/ui/embeds/buildSanguoEncounterEmbed.ts` | Encounter embed | ✓ EXISTS + SUBSTANTIVE | SEASON/GOLD |
| `src/ui/embeds/buildSanguoAckEmbed.ts` | Ack confirmation embed | ✓ EXISTS + SUBSTANTIVE | CR-09-05, clears components |
| `src/db/schema/mapEdges.ts` | Edge graph table | ✓ EXISTS + SUBSTANTIVE | unique pair index |
| `src/db/schema/mapZones.ts` | Zone reference table | ✓ EXISTS + SUBSTANTIVE | code, per-locale names, rates |
| `src/db/schema/heroZoneRates.ts` | Hero→zone weighted mapping | ✓ EXISTS + SUBSTANTIVE | unique hero+zone |
| `scripts/data/sanguo-map-data.json` | TQC-09 dataset | ✓ EXISTS + SUBSTANTIVE | 18/73/162/208 machine-verified |
| `migrations/0018_sanguo_travel_map.sql` | Migration 0018 | ✓ EXISTS + SUBSTANTIVE | drops/adds/index/3 CREATE TABLEs |
| `locales/{vi,en,zh-cn}/sanguo.json` | travel/arrival/encounter/ack keys | ✓ EXISTS + SUBSTANTIVE | 3 locales in sync |

**Artifacts:** 16/16 verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| TQC-06: /sanguo travel — time-only, one-way, check-in | ✓ SATISFIED | - (original paid-travel text annotated INVALIDATED by D-01/D-03 in REQUIREMENTS.md) |
| TQC-07: Arrival resolution + inline results | ✓ SATISFIED | - (original cron/REST-DM text annotated INVALIDATED by D-22/D-23) |
| TQC-08: Encounter system — roll, cap, boss, embed | ✓ SATISFIED | - |
| TQC-09: Map/zone data layer + dataset + seed | ✓ SATISFIED | - |

**Coverage:** 4/4 requirements satisfied

## Human Verification Required

### 1. Live-Discord UAT (4 manual checkpoints)
- **Test 2 (first message components):** PASS 2026-08-13 — select menu + Start button + travel embed verified live after CR-09-01/02/03/04/06.
- **Test 3 (arrival/encounter embeds + ack):** PASS 2026-08-13 — ack edits to confirmation embed, clears button (CR-09-05).
- **Test 4 (encounter embed):** PASS (normal) 2026-08-13 — boss GOLD variant SKIPPED live (rate 0.07), covered by automated tests (09-04:D1).
- **Test 1 (cold start smoke):** PASS 2026-08-13 — migration 0018 applied, seed 18/73/162/208, bot Shard 0 ready, /sanguo travel+map registered, live replies.

## Gaps Summary

**No critical gaps found.** 17/18 UAT pass + 1 skipped (boss GOLD live render, low rate — automated coverage complete). All 6 CR fixes from live UAT verified green: 186 tests, typecheck 0, lint 0, i18n sync.

## Recommended Fix Plans

None — no gaps requiring fix plans. CR-09-01→06 fixes already applied and verified.

## Verification Metadata

**Verification approach:** Goal-backward (derived from phase goal)
**Must-haves source:** ROADMAP §Phase 9 Goal + SC1-SC5
**Automated checks:** 34 passed, 0 failed (typecheck ✓, lint ✓, check-i18n ✓, 186/186 tests ✓)
**Human checks required:** 4 (live Discord)
**Human checks passed:** 4 (1 skipped, automated-covered)
**Total verification time:** UAT 2026-08-13 + gate re-runs 2026-08-13

---
*Verified: 2026-08-13T03:30:00Z*
*Verifier: orchestrator inline (verifier agent disabled per workflow.verifier=false)*
