---
status: testing
phase: 09-travel-encounters
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md, 09-05-SUMMARY.md]
started: 2026-08-13T02:11:41Z
updated: 2026-08-13T02:11:41Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running bot/server. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Bot boots without errors, migrations (0018) apply cleanly, seed:sanguo completes, and a primary query (bot login + /sanguo travel command surface) returns live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running bot/server. Clear ephemeral state. Start the application from scratch. Bot boots without errors, migrations (0018) apply cleanly, seed:sanguo completes, and a primary query returns live data.
result: [pending]

### 2. Discord-Client Adequacy of First Message Components
expected: In a live guild, /sanguo travel with no active journey renders the destination StringSelectMenu + disabled "Bắt đầu hành trình" Start button; selecting a destination enables the button; Start sends the SEASON travel-confirmation embed (destination/ETA/from fields, no money field). Embed colors follow the UI-SPEC contract (SEASON 0x8B5CF6, DANGER 0xEF4444 for no-route).
result: [pending]

### 3. Discord-Client Adequacy of Arrival/Encounter Embeds + Ack Button
expected: In a live guild, an active journey resolves on /sanguo travel: arrival → inline SEASON arrival embed + re-opened destination menu; encounter → encounter embed + "Tiếp tục hành trình" ack button; pressing ack clears the pending state and resumes the clock (no time counted while pending). Visual layout and button interaction are adequate.
result: [pending]

### 4. Encounter Embed + Dispatch Adequacy
expected: In a live guild, encounter mode shows the finalized embed (hero emoji + bold hero name, destination context, ack button); boss encounter shows the GOLD 0x9E0B variant (rare signal) with per-locale zone name in boss copy. EncounterPending mode re-renders the pending boss embed with NO re-roll.
result: [pending]

### 5. travelService journey-start domain
expected: travelService journey-start domain: getCurrentPosition (START_NODE default / arrived / in-flight), getAdjacentNodes (edges+node join, travelSeconds ASC, cap 25), startTravel (code→id resolve, FOR UPDATE, ALREADY_TRAVELING, NO_ROUTE, INSERT-first/in-place-UPDATE), zero wallet/deduction references (D-01)
result: pass
source: automated
coverage_id: 09-01:D1

### 6. /sanguo travel command interaction contract
expected: /sanguo travel command interaction contract: start mode select menu + disabled Start, destination select enables Start with code in customId (F1), Start press calls startTravel(user.id, code) and replies the SEASON embed with NO money field, ALREADY_TRAVELING → check-in path, NO_ROUTE → DANGER embed, zero-adjacent renders no menu (F6), router branches before the chat-input gate, users.id identity, 3-locale i18n sync
result: pass
source: automated
coverage_id: 09-01:D2

### 7. map_zones + hero_zone_rates schema tables
expected: map_zones + hero_zone_rates schema tables with the researched column contracts (code unique, per-locale names, sort_order, encounter_rate/boss_rate defaults; hero_id FK, zone, rate numeric(4,2), unique hero+zone) and Phase 9 index.ts re-exports including the 09-01 mapEdges module
result: pass
source: automated
coverage_id: 09-02:D1

### 8. TQC-09 dataset committed
expected: TQC-09 dataset committed at scripts/data/sanguo-map-data.json with exact counts (18 zones, 73 nodes, 162 edges, 208 hero_zone_rates), 132/132 hero coverage, every node carrying a deterministic nodeOrder, and the research-matching travel-time distribution
result: pass
source: automated
coverage_id: 09-02:D2

### 9. Idempotent D-20 full-replace seed flow
expected: Idempotent D-20 full-replace seed flow in scripts/seed-sanguo.ts: FATAL-on-missing loader, child→parent deletes (mapEdges, heroZoneRates, mapNodes) then zones/nodes/edges/hero_zone_rates upserts keyed on natural keys — re-runs never accumulate duplicates; hero/faction/family/relation/item seeding untouched; clobber-safe nameZh (never '')
result: pass
source: automated
coverage_id: 09-02:D3

### 10. /sanguo map zone labels from map_zones
expected: /sanguo map zone labels sourced from map_zones per-locale names (A8) with pickName fallback for missing zone rows; the 09-01 travel subcommand wiring intact
result: pass
source: automated
coverage_id: 09-02:D4

### 11. checkInTravel pull engine
expected: checkInTravel pull engine: FOR UPDATE row lock (T-09-06), no-row/arrived → start, encounterActive → encounterPending with latest pending run + NO decrement (T-09-07/F2), elapsed → per-minute roll loop with stop-at-first-hit + hit-minute counting (D-24/F4), overdue self-heal clamped to 0 → arrived (T-09-09/D-05), arrival/status branches, injectable rollMinute + capCheck, zero wallet references (D-01)
result: pass
source: automated
coverage_id: 09-03:D1

### 12. /sanguo travel full dispatch by mode + handleAckPress
expected: /sanguo travel full dispatch by mode (status → travel reply embed, arrived → arrival embed + re-opened destination menu, encounter/encounterPending → encounter embed + ack button) + handleAckPress resume (FOR UPDATE clears encounterActive, sets updatedAt=now) wired through interactionCreate and map.ts, users.id identity, no char.id
result: pass
source: automated
coverage_id: 09-03:D2

### 13. Pure encounterService roll engine
expected: Pure encounterService roll engine: positionFraction boundary/clamp math (D-15), shouldRoll/shouldRollBoss thresholds (D-10/D-14, strict <), pickEncounterHero position-blended weighted pick with B6 dominant-zone attribution and shared-hero weight accumulation, capHit sliding-window predicate (D-13), cryptoUniform crypto.randomInt-backed (milestone V6) — no Math.random, no db/redis imports
result: pass
source: automated
coverage_id: 09-04:D1

### 14. Check-in rollMinute integration
expected: Check-in rollMinute integration (replaces the 09-03 stub): cap-first sliding ZSET (D-13/Pitfall 7) with F7 TTL, position-blended pick from map_nodes zone codes + hero_zone_rates (F8 Number) + map_zones rates (defaults 0.35/0.07), boss sub-roll recording encounter_type='boss' with hero_id NULL (D-14), encounter_runs insert + ZADD on hit, warn-skips for missing edge/zone/empty pool, single-writer rule — the roll writes ONLY encounter_runs + Redis
result: pass
source: automated
coverage_id: 09-04:D2

### 15. Migration 0018
expected: Migration 0018 generated by drizzle-kit (not hand-written), reviewed against the plan's expected DDL, applied to the dev DB via npm run migrate (DATABASE_URL_DIRECT) — player_travel_state drops arrive_at/cost + adds travel_seconds_remaining/encounter_active, encounter_runs adds encounter_type + user_status_idx (F2), map_zones/map_edges/hero_zone_rates created
result: pass
source: automated
coverage_id: 09-05:D1

### 16. D-20 full-replace reseed idempotency
expected: D-20 full-replace reseed run twice via npm run seed:sanguo — identical counts both runs (132 heroes / 18 zones / 73 nodes / 162 edges / 208 rates), DB row counts verified and zero duplicates on unique keys; hero seed untouched
result: pass
source: automated
coverage_id: 09-05:D2

### 17. Planning-doc amendments
expected: Planning-doc amendments: ROADMAP §Phase 9 Goal/SC1/SC2/SC3 to time-only (D-01), one-way/no-cancel (D-03), pull-based check-in inline results (D-22/D-23); REQUIREMENTS TQC-06/TQC-07 annotated INVALIDATED; economy-budget AMENDMENT + re-baseline (pull-driven supply ≤20/hr) + Phase 10 capture-fee re-sign flag (D-02/D-18); STATE D-11/D-12 supersession verified present
result: pass
source: automated
coverage_id: 09-05:D3

### 18. Full phase gate green
expected: Full phase gate green — npm test (186 tests / 24 files), npm run typecheck (0 errors), npm run lint (max-warnings=0), npm run check-i18n (all locales in sync)
result: pass
source: automated
coverage_id: 09-05:D4

## Summary

total: 18
passed: 14
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
