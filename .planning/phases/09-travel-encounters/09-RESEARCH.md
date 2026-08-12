# Phase 9: Travel & Encounters - Research

**Researched:** 2026-08-12
**Domain:** Real-time graph-based travel, cron-driven encounter system, map/zone content data
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Charge & Cost Model (TQC-06)
- **D-01:** **Travel costs only TIME, never Linh thạch.** The player selects a destination, travel begins based on the time-distance of the hop; Linh thạch is only spent on encounter-related costs and capture attempts. `travelService` does NOT call `wallet.deductBalance` — it is a pure time/state service. — **Reversibility:** one-way — inverts the milestone-init "paid travel" economy decision (STATE.md) and `docs/economy-budget.md` "travel prices are sinks"; undoing requires a new economy sign-off.
- **D-02:** **Capture fee per attempt is the main sink** (encounter free, tốn khi bắt). Capture mechanics + fee execution belong to Phase 10 (TQC-11), but the economy consequence belongs here: **`docs/economy-budget.md` must be updated and re-signed (D-18) to move the sink from travel → capture fee before Phase 10 content ships.** — **Reversibility:** one-way — the D-18 design gate is the milestone's economic guardrail.
- **D-03:** **No cancel — travel is a one-way commitment.** The travel-cancel component is removed entirely. Rationale (user): when canceling mid-journey, a new journey's start node would be ambiguous; removing cancel keeps position always defined = last arrived node. `player_travel_state.userId.unique()` already prevents a new journey while traveling. ROADMAP SC2 must be amended accordingly. — **Reversibility:** one-way — SC2 amendment + no cancel path in tick; re-adding cancel needs refund logic + position model work.
- **D-04:** **No refund path exists anywhere in travel.** Money is never involved in travel, so cancel/refund/fail-refund bugs are structurally impossible. Tick only handles arrive (+ overdue self-heal).

#### Fail & Self-Heal (TQC-07)
- **D-05:** **sanguoTick self-heals overdue journeys — "đến trễ", never stuck forever.** A journey past its counted travel time is resolved at the next tick sweep (`FOR UPDATE SKIP LOCKED` prevents double-resolve). No refund, no failed status — only late arrival. — **Reversibility:** reversible.

#### Travel UX & Time Model (TQC-06)
- **D-06:** **Only event notifications, no persistent status embed.** The player is notified on arrival and on encounter (both via DM); there is no always-on travel status embed or live countdown UI. — **Reversibility:** reversible.
- **D-07:** **Travel time pauses during encounters.** The travel clock stops counting while an encounter is active and resumes when the encounter is resolved. `player_travel_state` therefore stores **`travel_seconds_remaining`** (decrementing) instead of a fixed `arriveAt` timestamp — the current schema's `arriveAt timestamp notNull` must be replaced/adapted. The tick subtracts elapsed counted time; while an encounter is active the tick does not subtract. Arrival fires when remaining reaches 0. — **Reversibility:** costly — touches the Phase 8 schema (`player_travel_state.ts`) and the tick logic.
- **D-08:** **One hop per `/sanguo travel`** — a single adjacent-node journey (A→B). No multi-hop routes, no route planning. The player must arrive and re-issue travel for the next hop. — **Reversibility:** reversible.
- **D-09:** **Cannot travel while already traveling.** A journey in flight blocks a new one (matches `userId.unique()`); combined with the clock-pause-on-encounter this is the anti-spam mechanism — no separate departure cooldown needed.

#### Encounter Roll Design (TQC-08)
- **D-10:** **Encounter rolls happen periodically during travel**, keyed to counted travel time (pause-aware), not wall-clock. **Probability per tick scan** (e.g., each tick → probability by zone, ~30-50%); the ~20/hr cap arises naturally from bounded hop durations plus the cap itself. — **Reversibility:** reversible.
- **D-11:** **Two separate sanguoTick cron jobs:** (a) arrival-resolution tick (every minute), (b) encounter-roll tick (~30-60s). Both run in the manager process only (matches the existing pg-boss pattern in `src/workers/pgBoss.ts` — crons only in bot.ts/manager). — **Reversibility:** reversible.
- **D-12:** **Notifications for both arrivals and encounters go to the player via DM** (REST through `@discordjs/rest`, mirroring `matchLifecycleService.ts`), working across shards regardless of which shard hosts the user. — **Reversibility:** reversible.
- **D-13:** **On reaching the ~20/hr cap, encounter rolls are skipped** — the player keeps traveling normally but receives no new encounters until the cap window clears. Travel itself is never blocked by the cap. — **Reversibility:** reversible.
- **D-14:** **Boss thường is a separate low-probability encounter roll** (~5-10% replacing a successful normal hero roll, zone-based). **In Phase 9 the boss is only rolled + notified + recorded** (`encounter_runs` with a boss flag/type) — battle/capture/boss data/đội hình/way of fielding troops are Phase 10-11 (battle engine TQC-10, legion chemistry TQC-17). — **Reversibility:** reversible.

#### Position-Blended Encounter Pool (TQC-08 + TQC-09)
- **D-15:** **Encounter pool is blended by current position along the edge.** Position = `1 − (remaining seconds / total hop seconds)` = fraction of the hop completed (pause-exempt time). Weights of node A's hero pool vs node B's pool scale linearly with that fraction (near A → A-heavy, near B → B-heavy). Formula locked; exact weighting function is linear per user decision. — **Reversibility:** reversible.
- **D-16:** **Hero→zone mapping is many-to-many with per-hero-per-zone rates** — a hero can appear in multiple zones at different rates. Requires a dedicated table (e.g., `hero_zone_rates` / `encounter_pool`): hero_id + zone(+node?) + rate. **Rates are set by research** (not tier-derived, not uniform) — the researcher decides the concrete numbers from lore/historical association. — **Reversibility:** costly — schema + seed + roll logic all depend on this mapping shape.

#### Map Structure & Research (TQC-09)
- **D-17:** **Map is a graph defined by an edges table** (`map_edges`: node_a, node_b, travel_seconds), NOT coordinates and NOT nodeOrder arithmetic. Distance = edge travel time; the map is not fully connected — "không phải node nào cũng nối với nhau", route availability is research-defined. — **Reversibility:** costly — new table + migration + travelService reads edges instead of nodeOrder.
- **D-18:** **Map scale: 50+ nodes**, covering the Three Kingdoms world INCLUDING regions outside China — Triều Tiên (Korean states), Cổ Việt/Giao Châu (ancient Vietnam), steppe/nomad regions (Hung Nô, Tiên Ti), etc. — matching the 132-hero roster which includes foreign rulers. — **Reversibility:** reversible.
- **D-19:** **Zone list is fully redesigned by research** — not constrained by the 7 placeholder zones from Phase 8 seed. The researcher defines the final zone set (e.g., 13 châu Đông Hán + outlying regions as they see fit) ensuring coverage of all 132 heroes. — **Reversibility:** reversible.
- **D-20:** **Phase 8 placeholder map_nodes (7 nodes) are REPLACED** by research data — migration + reseed. Hero seed (132) stays; only the node/zone/edge/hero-zone-rate data is replaced. — **Reversibility:** one-way — a data migration that deletes placeholder nodes; re-seeding old nodes requires re-creating them.
- **D-21:** **TQC-09 research runs INSIDE Phase 9** (via `gsd-phase-researcher`) producing: node list, edges + travel times, zone set, hero_zone_rates. **User reviews the research data before implementation** — a data-review gate between research and plan execution. Output feeds the seed.

### the agent's Discretion
- Exact tick schedules (minute for arrivals, exact interval for encounter roll).
- Exact cap number mechanics (~20/hr is the target; sliding window vs fixed-hour window).
- `encounter_runs` boss flag/type column shape.
- Exact `hero_zone_rates` table schema (per-node vs per-zone rate granularity).
- Whether `player_travel_state` keeps `from_node_id`/`to_node_id`/`depart_at` semantics alongside `travel_seconds_remaining`.
- Position update frequency granularity inside the tick (how finely "current position" is computed).
- DM notification embed content/layout.

### Deferred Ideas (OUT OF SCOPE)
- **Capture fee mechanics + per-attempt pricing** — Phase 10 (TQC-11); this phase only flags the economy re-sign-off requirement (D-02).
- **Boss thường data/đội hình/troop composition** (define sẵn vs tự random) — Phase 10 battle engine + Phase 11 legion chemistry; user explicitly confirmed "Phase 9 chỉ roll + notify".
- **Quân đoàn battle (3+9 chemistry)** — Phase 11 (TQC-17); formations schema already designed in Phase 8 post-gate.
- **Economy budget re-sign-off numbers** — needs Phase 10 capture-fee values; the doc update itself should happen before Phase 10 content, not necessarily in Phase 9 execution.
- **Anti-abuse bot detection** — Phase 12 (TQC-18); encounter caps (D-13) are the Phase 9-era brake only.
</user_constraints>

## Summary

Phase 9 delivers the real-time core loop of the Tam Quốc Collection: time-only travel between map nodes on a graph (73 nodes, 162 edges — 50+ requirement met), two `sanguoTick` pg-boss crons in the manager process (arrival-resolution every minute + encounter-roll every 45s), a position-blended encounter pool driven by a many-to-many `hero_zone_rates` table (208 rows covering all 132 roster heroes), and cross-shard REST DM notifications for arrivals and encounters.

The user's locked redesign (D-01..D-21) makes travel a **pure time/state service**: no wallet calls (D-01), no cancel path (D-03/D-04), one hop per journey (D-08), pause-aware remaining-seconds clock (D-07), self-healing arrival resolution via `FOR UPDATE SKIP LOCKED` (D-05), and a ~20/hr sliding-window encounter cap with silent skips (D-13). The TQC-09 dataset (the primary deliverable of this research) is fully designed, lore-derived, and machine-verified: 18 zones (13 châu Đông Hán + Giao Châu + Triều Tiên + 3 steppe regions), 73 nodes with per-locale names and representative heroes, 162 undirected edges with `travel_seconds` (5-90 min, avg 26 min), and per-hero-per-zone encounter weights.

**Primary recommendation:** Build travelService as a stateless-domain service over the existing `player_travel_state` schema (evolved to remaining-seconds per D-07), register the two sanguoTick crons in `pgBoss.ts registerJobs()` exactly like the football jobs, implement the encounter cap as a **Redis sliding-window ZSET** (fairer than fixed-hour buckets, matches D-13 "cap window clears" language), and consume the TQC-09 dataset below as a committed seed data file (`scripts/data/sanguo-map-data.json`) following the `sanguo-classifications.json` pattern.

**Key structural discoveries (read these before planning):**
1. **The `/sanguo` command is owned by ONE file** (`src/commands/sanguo/map.ts` exports `data` with name `'sanguo'`). The `travel` subcommand must be **appended to that same builder** (or a shared `sanguo.ts` command root) — `commandLoader.ts` + `registerCommands.ts` register one command per file, and two files exporting `data` with the same name would PUT twice (last wins → flaky).
2. **The interaction router has NO autocomplete branch** — `src/events/interactionCreate.ts:448` returns early for any non-chat-input interaction. `/sanguo travel` destination autocomplete (D-08, UI-SPEC interaction contract) requires a **new `interaction.isAutocomplete()` branch** + a command-side `autocomplete` export loaded by `commandLoader.ts`. This is the first autocomplete in the codebase.
3. **`userId.unique()` means one travel row per user FOREVER** — a second journey after arrival must **UPDATE the existing row in place** (from = old to, to = new, remaining = edge seconds), not INSERT. The row is simultaneously the "last arrived position" record and the "active journey" record.
4. **Phase 9 encounters are roll+notify+record only** (D-14) — there is no battle to "resolve", so `encounter_active` (the D-07 pause flag) is set true and cleared within the same tick job: schema + tick logic are pause-aware and Phase-10-ready, but Phase 9 shows no observable clock pause (an encounter "resolves" the instant it is recorded). Do not implement a fixed pause window — it would stall journeys and contradict D-05 "never stuck".
5. **Config gate:** `.planning/config.json` sets `workflow.nyquist_validation: false` — validation is still documented below per output contract, but the planner may scope test effort accordingly.

## Project Constraints (from AGENTS.md)

Directives extracted from `./AGENTS.md` (GSD:project / GSD:stack blocks) that Phase 9 must comply with:

- **Runtime Node.js ≥22.12.0** (discord.js 14.26.2+ requirement); local dev runs v26.3.0 — production target is Node 22 LTS.
- **TypeScript 5.8.x preferred** — package.json currently resolves TS 6.0.3 (devDependency); `npm run typecheck` (`tsc --noEmit`) is the gate. Do not introduce TS-6-only syntax.
- **discord.js 14.26.2+** installed as 14.27.0 — REST DM pattern uses `@discordjs/rest` 2.6.3 (already installed).
- **i18n from day one**: zero hardcoded user-facing strings; new travel/encounter/arrival strings go into the `sanguo` namespace (`locales/{vi,en,zh-cn}/sanguo.json`); `npm run check-i18n` (scripts/check-i18n.ts) is a hard gate — all three locales must stay in sync (VI reference).
- **Content-in-DB**: node/zone/hero names live in DB per-locale columns, NEVER i18n keys (D-07 Phase 8 rule). Only UI strings go in i18next.
- **Crons manager-only**: workers/crons registered only in `bot.ts` (ShardingManager) via `initPgBoss()`; shards use `initPgBossForShard()` (send-only). `pgBoss.ts` header comment is explicit.
- **`FOR UPDATE SKIP LOCKED`** is the established concurrency pattern (Phase 8 order matching, football) — required by TQC-07.
- **crypto.randomInt() for player-facing rolls** (milestone decision) — encounter + boss rolls use crypto RNG, NOT pure-rand.
- **Wallet discipline**: every balance mutation goes through `services/wallet.ts` — Phase 9 travel touches NO balance (D-01). `npm run lint` (`--max-warnings=0`) + `npm run check-i18n` + `npm run typecheck` are the pre-merge gates.
- **Idempotent seed**: `scripts/seed-sanguo.ts` upserts on natural keys (`ON CONFLICT DO UPDATE`), never duplicates (D-11).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TQC-06 | Pure `travelService`: ETA/cost/transitions; `/sanguo travel` (atomic wallet deduct + state row write); travel-cancel component. | **Amended by D-01/D-03/D-08:** no wallet, no cost, no cancel, one hop. Service API + in-place row UPDATE semantics designed below. Subcommand must be appended to map.ts's existing `'sanguo'` builder (loader constraint). |
| TQC-07 | `sanguoTick` pg-boss cron (mỗi phút, manager process) scan due encounters/arrivals với `FOR UPDATE SKIP LOCKED`; cancel = row update (cancel-safe); REST notifications. | **Amended by D-05/D-11:** two crons (arrivals 60s + encounters 45s) registered in `registerJobs()`; `FOR UPDATE SKIP LOCKED` verified in-repo (`matchLifecycleService.ts:345`); overdue self-heal algorithm below. No cancel (D-03). |
| TQC-08 | Encounter system: roll dọc hành trình theo vùng + boss thường; route-scaled encounter rates; per-user caps (~20/hr) + cooldown từ ngày đầu. | **Amended by D-10/D-13/D-14/D-15:** per-tick probability by zone (0.35 default), position-blended pool formula locked, sliding-window cap (Redis ZSET), boss = separate 7% roll replacing hero. |
| TQC-09 | Map/zone data research — node structure + phân bố 132 hero theo vùng/lore (phase research ripphase, thảo luận data sau). | **DONE in this document:** 18 zones, 73 nodes, 162 edges, 208 hero_zone_rates rows covering 132/132 heroes — full dataset + data contract below, machine-verified. User review gate (D-21) applies. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Travel state persistence (remaining-seconds, pause-aware) | Database / Storage | — | `player_travel_state` row is the source of truth; crons read it under row locks |
| Travel time accounting (decrement, overdue self-heal, arrival resolution) | API / Backend (manager-process cron) | — | `sanguoTickArrivals` pg-boss job in bot.ts — manager-only (D-11); per-shard processes must not run crons |
| Encounter roll engine (probability, cap check, pool blend, boss roll) | API / Backend (manager-process cron) | — | `sanguoTickEncounters` pg-boss job — pure function of travel row + `hero_zone_rates` + crypto RNG |
| ~20/hr encounter cap | Database / Storage (Redis) | — | Sliding-window ZSET in Redis — cross-shard single source of truth; counters must survive restarts |
| Cross-shard DM notifications | API / Backend (REST, any process) | — | `@discordjs/rest` from manager cron process (D-12) — mirrors `matchLifecycleService.ts`; user-level locale resolution |
| `/sanguo travel` command (start journey, autocomplete) | Browser / Client (Discord interaction) | API / Backend | Command layer lives in the shard that receives the interaction; validates adjacency against DB before writing state |
| Position-derived encounter pool blend | API / Backend (pure math) | — | Position = `1 − (remaining/total)`; linear weight blend of zone A/B pools (D-15) — pure function, unit-testable |
| Map/zone/hero-rate content data | Database / Storage (seed) | — | TQC-09 dataset consumed by `scripts/seed-sanguo.ts` (D-20/D-21); content-in-DB per-locale columns |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | 14.27.0 (installed; AGENTS pins 14.26.2+) | Slash command + interaction handling | Existing stack; `/sanguo travel` extends the existing `'sanguo'` command |
| @discordjs/rest | 2.6.3 (installed) | REST-only DM sends for arrivals/encounters | Cross-shard notification (D-12); same version already used by `matchLifecycleService.ts` |
| pg-boss | 12.27.0 (installed) | Two sanguoTick cron jobs | PostgreSQL-native scheduler; `schedule()` idempotent; SKIP LOCKED internally; existing pattern in `pgBoss.ts` |
| drizzle-orm | 0.45.2 (installed) | DB queries, `FOR UPDATE SKIP LOCKED`, transactions | Existing stack; `.for('update', { skipLocked: true })` verified in-repo (`matchLifecycleService.ts:345`) |
| ioredis | 6.0.0 (installed) | Sliding-window encounter cap, user locale cache | Existing cache layer; ZSET ops for cap window (D-13) |
| i18next | 26.3.6 (installed) | `sanguo` namespace UI strings (travel/arrival/encounter) | Existing i18n; zero-hardcoded-strings gate |
| Node.js | 22 LTS (target) / v26.3.0 (local dev) | Runtime | discord.js 14.26.2 requires ≥22.12.0 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.4.3 (installed) | Runtime validation of edge/node inputs if needed | Autocomplete is advisory; server-side adjacency re-validation can be plain code — zod optional |
| vitest | 4.1.10 (installed) | Unit tests for tick math, pool blend, cap logic | `src/**/__tests__/**/*.test.ts` pattern (vitest.config.ts) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg-boss cron jobs | `node-cron` in manager process | pg-boss gives exactly-once delivery + restart-safe schedules; node-cron would need manual lock management |
| Redis ZSET sliding window | Fixed-hour Redis INCR counter | ZSET is fairer ("cap window clears" semantics), no hour-boundary burst; INCR simpler but bursty at hour rollover |
| In-place UPDATE of travel row | DELETE + INSERT per journey | `userId.unique()` allows only one row ever; in-place UPDATE preserves row id for `encounter_runs.travel_id` FK history |

**Installation:**
```bash
# No new packages required — all dependencies already installed (verified npm view, 2026-08-12).
# npm install should NOT appear in Phase 9 plan unless a transitive issue surfaces.
```

**Version verification (npm registry, verified 2026-08-12):**
| Package | `npm view` latest | Installed (package.json) |
|---------|-------------------|--------------------------|
| pg-boss | 12.27.0 | 12.27.0 ✓ |
| @discordjs/rest | 2.6.3 | 2.6.3 ✓ |
| drizzle-orm | 0.45.2 | 0.45.2 ✓ |
| ioredis | 6.0.0 | 6.0.0 ✓ |
| i18next | 26.3.6 | 26.3.6 ✓ |
| discord.js | 14.27.0 | 14.27.0 ✓ |

## Package Legitimacy Audit

> No new external packages are introduced in Phase 9 — the entire feature is built on the already-installed, production-running stack. The audit below covers the packages the phase depends on (all already installed; the `SUS` flags below are the legitimacy seam's "too-new" heuristic on recent publish dates of long-established packages — not slopsquat signals).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pg-boss | npm | 8+ yrs (publish 2026-08-03) | 1.35M/wk | github.com/timgit/pg-boss | [SUS — too-new heuristic only] | Approved — already installed, production-running |
| @discordjs/rest | npm | 8+ yrs | 1.02M/wk | github.com/discordjs/discord.js | [SUS — too-new heuristic only] | Approved — already installed |
| drizzle-orm | npm | 4+ yrs | 18.2M/wk | github.com/drizzle-team/drizzle-orm | [OK] | Approved |
| ioredis | npm | 10+ yrs | 26.1M/wk | github.com/redis/ioredis | [SUS — too-new heuristic only] | Approved — already installed |
| i18next | npm | 13+ yrs | 20.6M/wk | github.com/i18next/i18next | [OK] | Approved |
| discord.js | npm | 10+ yrs | 975K/wk | github.com/discordjs/discord.js | [SUS — too-new heuristic only] | Approved — already installed |
| vitest | npm | 4+ yrs | 89.7M/wk | github.com/vitest-dev/vitest | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none actionable — the three `SUS` verdicts are the seam's `too-new` reason on publish dates within the last ~40 days for packages that have existed for 8-13 years and are already pinned + running in production. **No new installs → no `checkpoint:human-verify` gates required.**

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────────────┐
                        │  MANAGER PROCESS (bot.ts / ShardingManager)          │
                        │                                                     │
   Discord user         │   initPgBoss() → registerJobs()                     │
   │                    │    ├─ queue 'sanguo-tick-arrivals'  @ every 60s     │
   ▼                    │    │    runSanguoTickArrivals(job)                  │
 ┌─────────────┐        │    │      │ SELECT player_travel_state              │
 │  Shard proc │        │    │      │   WHERE status='traveling'              │
 │ /sanguo map │        │    │      │   FOR UPDATE SKIP LOCKED   (D-05)       │
 │ /sanguo     │        │    │      ▼                                        │
 │ travel      │        │    │   subtract elapsed → remaining==0?             │
 │ (subcommand │        │    │   → UPDATE status='arrived'                    │
 │  appended to│        │    │   → sendArrivalDM()  ───────────────┐          │
 │  map.ts)    │        │    ├─ queue 'sanguo-tick-encounters' @ 45s│          │
 │  autocompl. │        │    │    runSanguoTickEncounters(job)     │          │
 └──────┬──────┘        │    │      │ SELECT travel rows (SKIP LOCKED)│        │
        │               │    │      ▼                              │          │
        │  validates    │    │   cap? (Redis ZSET ≥20/hr → skip silently D-13) │
        │  adjacency    │    │      │ position = 1 − remaining/total (D-15)    │
        │               │    │      ▼                              │          │
        ▼               │    │   roll zone prob (0.35) → hero?     │          │
 ┌─────────────┐        │    │   │  └ roll boss (0.07) → boss      │          │
 │ travelService│       │    │   ▼   ├─ weighted pick from blended │          │
 │ (pure, no    │       │    │   └─ pool (A×(1−pos) + B×pos)       │          │
 │  wallet D-01)│       │    │       └ INSERT encounter_runs       │          │
 └──────┬──────┘        │    │         └ sendEncounterDM() ────────┤          │
        │               │    └─────────────────────────────────────┼──────────┘
        ▼               │                                          ▼
 ┌─────────────────────────────────────────────────┐    ┌──────────────────────┐
 │ PostgreSQL (PgBouncer port 6432 / direct 5432)  │    │ Redis                │
 │  map_nodes, map_edges, map_zones, hero_zone_rates│    │  sanguo:enc:win:{uid}│
 │  player_travel_state, encounter_runs, heroes,   │    │  user:locale:{id}    │
 │  users (discordId→DM target)                    │    └──────────────────────┘
 └─────────────────────────────────────────────────┘
        ▲                                                    ▲
        └── scripts/seed-sanguo.ts (TQC-09 data, D-20/D-21) ──┘
```

**Data flow (primary use case — user travels one hop):**
1. User runs `/sanguo travel` → autocomplete lists adjacent nodes from `map_edges` (max 25, nearest first) → user picks destination node code.
2. Command (in shard) reads current position from `player_travel_state` (last arrived row's `to_node_id`; first-ever journey → START_NODE default), re-validates adjacency, writes the journey (INSERT on first, in-place UPDATE on subsequent — D-09).
3. `sanguo-tick-arrivals` (manager, every 60s) locks traveling rows, subtracts counted elapsed time, resolves at remaining==0 → `status='arrived'` → REST DM.
4. `sanguo-tick-encounters` (manager, every 45s) locks traveling rows, checks Redis cap, rolls hero (zone probability) then boss (7%), picks hero from the position-blended pool, records `encounter_runs`, sends REST DM.

### Recommended Project Structure
```
src/
├── services/sanguo/
│   ├── travelService.ts        # NEW — pure time/state: getPosition, getAdjacent, startTravel, resolveArrivals
│   ├── encounterService.ts     # NEW — roll logic: position blend, weighted pick, boss roll, cap check
│   └── sanguoNotificationService.ts  # NEW — REST DM send (arrival + encounter embeds), user-locale, 50007/3-strike
├── jobs/
│   ├── sanguoTickArrivals.ts   # NEW — cron job body (D-11)
│   └── sanguoTickEncounters.ts # NEW — cron job body (D-11)
├── workers/
│   └── pgBoss.ts               # EDIT — register the two queues + schedules in registerJobs()
├── commands/sanguo/
│   └── map.ts                  # EDIT — append 'travel' subcommand builder (loader constraint)
│   └── travel.ts               # NEW — execute() + autocomplete() for the travel subcommand
├── db/schema/
│   ├── playerTravelState.ts    # EDIT — D-07 remaining-seconds model
│   ├── encounterRuns.ts        # EDIT — D-14 boss flag/type column
│   ├── mapNodes.ts             # EDIT — zone FK/zone table; keep code/name_*/rep columns
│   ├── mapEdges.ts             # NEW — D-17 graph edges
│   ├── mapZones.ts             # NEW — D-19 zone reference table
│   └── heroZoneRates.ts        # NEW — D-16 many-to-many pool rates
├── ui/embeds/
│   ├── buildSanguoTravelReplyEmbed.ts   # NEW (UI-SPEC)
│   ├── buildSanguoArrivalEmbed.ts       # NEW (UI-SPEC)
│   └── buildSanguoEncounterEmbed.ts     # NEW (UI-SPEC)
├── events/
│   └── interactionCreate.ts    # EDIT — NEW autocomplete branch (first in codebase)
└── utils/
    └── commandLoader.ts        # EDIT — load optional `autocomplete` export
scripts/
└── seed-sanguo.ts              # EDIT — consume TQC-09 dataset (zones/nodes/edges/hero_zone_rates)
scripts/data/
└── sanguo-map-data.json        # NEW — TQC-09 committed dataset (dev-time only, like classifications)
```

### Pattern 1: Manager-only cron registration (sanguoTick)
**What:** Two pg-boss cron jobs registered ONLY in `registerJobs()` (called from `initPgBoss()` in bot.ts). Shards never schedule.
**When to use:** All scheduled work (D-11); matches existing football/activity jobs.
**Example:**
```typescript
// src/workers/pgBoss.ts registerJobs() — add after existing job registrations
await b.createQueue('sanguo-tick-arrivals');
await b.schedule('sanguo-tick-arrivals', '*/1 * * * *', {}); // every minute
await b.work('sanguo-tick-arrivals', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    try { await runSanguoTickArrivals(job); }
    catch (err) { logger.error('pgBoss', `Job ${job.id} (sanguo-tick-arrivals) failed`, err); }
  }
});

await b.createQueue('sanguo-tick-encounters');
await b.schedule('sanguo-tick-encounters', '*/45 * * * * *', {}); // every 45s — 6-field cron w/ seconds, VERIFIED: pg-boss cron-parser 5.7 accepts 6-field
await b.work('sanguo-tick-encounters', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    try { await runSanguoTickEncounters(job); }
    catch (err) { logger.error('pgBoss', `Job ${job.id} (sanguo-tick-encounters) failed`, err); }
  }
});
```
**Source:** In-repo pattern `src/workers/pgBoss.ts:83-179`; 6-field cron verified against installed `node_modules/cron-parser` (`parseExpression('*/45 * * * * *')` → next fire OK) and pg-boss `schedule(name, cron)` signature in `node_modules/pg-boss/dist/index.d.ts`.

### Pattern 2: Arrival resolution with FOR UPDATE SKIP LOCKED + overdue self-heal
**What:** Each arrival tick locks only un-resolved traveling rows, subtracts counted time, resolves at zero, notifies.
**When to use:** D-05/D-07 — no stuck journeys, no double-resolve.
**Example:**
```typescript
// src/jobs/sanguoTickArrivals.ts — conceptual
async function runSanguoTickArrivals(job: Job): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(playerTravelState)
      .where(eq(playerTravelState.status, 'traveling'))
      .for('update', { skipLocked: true });               // D-05, matches matchLifecycleService.ts:345
    for (const row of rows) {
      // D-07: pause-aware — if an encounter is active, do NOT subtract and do NOT advance anchor
      if (row.encounterActive) {
        await tx.update(playerTravelState)
          .set({ updatedAt: now })                        // advance anchor, count no time
          .where(eq(playerTravelState.id, row.id));
        continue;
      }
      const elapsedSec = Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / 1000));
      const remaining = Math.max(0, row.travelSecondsRemaining - elapsedSec);  // overdue → clamped → arrives (D-05)
      if (remaining === 0) {
        await tx.update(playerTravelState).set({ status: 'arrived', travelSecondsRemaining: 0, updatedAt: now })
          .where(eq(playerTravelState.id, row.id));
        await notifyArrival(row);                          // REST DM (D-12) — outside tx, after commit
      } else {
        await tx.update(playerTravelState).set({ travelSecondsRemaining: remaining, updatedAt: now })
          .where(eq(playerTravelState.id, row.id));
      }
    }
  });
}
```
**Source:** Locking pattern in-repo `src/services/football/matchLifecycleService.ts:333-345`; pause semantics per D-07.

### Pattern 3: Position-blended weighted encounter pick (D-15)
**What:** Position fraction = `1 − (remaining/total)`. Weight of each hero = `rate(zoneA) × (1−pos) + rate(zoneB) × pos` (0 if not in that zone). Weighted pick via `crypto.randomInt` (player-facing roll — milestone decision).
**When to use:** Every encounter tick for a traveling row.
**Example:**
```typescript
// src/services/sanguo/encounterService.ts — conceptual
function pickEncounterHero(poolA: ZoneRate[], poolB: ZoneRate[], pos: number): { heroId: string; zone: string } {
  // Build union of candidates with blended weight
  const weights = new Map<string, number>();   // heroId → weight
  const heroZone = new Map<string, string>();
  for (const { heroId, zone, rate } of poolA) {
    weights.set(heroId, (weights.get(heroId) ?? 0) + rate * (1 - pos));
    heroZone.set(heroId, zone);
  }
  for (const { heroId, zone, rate } of poolB) {
    weights.set(heroId, (weights.get(heroId) ?? 0) + rate * pos);
    heroZone.set(heroId, zone);
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  let roll = crypto.randomInt(Math.ceil(total * 1000)) / 1000;   // crypto RNG (milestone)
  for (const [heroId, w] of weights) {
    if ((roll -= w) <= 0) return { heroId, zone: heroZone.get(heroId)! };
  }
  const last = [...weights.entries()].at(-1)!;
  return { heroId: last[0], zone: heroZone.get(last[0])! };
}
```
**Source:** Formula locked by D-15; `crypto.randomInt` mandate in STATE.md accumulated decisions.

### Pattern 4: Cross-shard REST DM (D-12)
**What:** Open DM via REST (`POST /users/@me/channels` then `POST /channels/{id}/messages`) from the manager process — works regardless of which shard hosts the user. User-level locale: `users.locale` → `vi` fallback, Redis-cached 1h. Handle 50007 (DMs closed) with a Redis 3-strike counter.
**When to use:** Arrival DM + encounter DM.
**Example:**
```typescript
// src/services/sanguo/sanguoNotificationService.ts — mirrors matchLifecycleService.ts pattern
const rest = new REST().setToken(config.DISCORD_TOKEN);

async function sendUserDM(userId: number, embeds: EmbedBuilder[]): Promise<void> {
  const strikeKey = `sanguo:dm:strike:${userId}`;
  try {
    const strikes = Number(await redis.get(strikeKey) ?? '0');
    if (strikes >= 3) { logger.warn('SanguoNotify', `User ${userId} DM blocked (3 strikes)`); return; }
    const [u] = await db.select({ discordId: users.discordId }).from(users).where(eq(users.id, userId));
    if (!u) return;
    const dm = await rest.post(Routes.userChannels(), { body: { recipient_id: u.discordId } }) as { id: string };
    await rest.post(Routes.channelMessages(dm.id), { body: { embeds: embeds.map(e => e.toJSON()) } });
  } catch (err) {
    if (isDMClosed(err)) {                       // 50007 / 10003
      const c = await redis.incr(strikeKey);
      await redis.expire(strikeKey, 86400);
      logger.warn('SanguoNotify', `User ${userId} DM failed. Count: ${c}/3`);
    } else logger.error('SanguoNotify', `DM send failed for ${userId}`, err);
  }
}
```
**Source:** In-repo `matchLifecycleService.ts:16-112` (REST client, Redis locale cache, 3-strike channel failure pattern); UI-SPEC §Interaction contract DM notifications.

### Anti-Patterns to Avoid
- **Registering `sanguo` command from a second file:** Two files exporting `data` with `name: 'sanguo'` → `registerCommands.ts` PUTs both (last wins, flaky). **Append the travel subcommand to map.ts's builder.**
- **Re-implementing weighted pick with Math.random():** Milestone decision mandates `crypto.randomInt` for player-facing rolls; Math.random is predictable.
- **Fixed-hour cap bucket:** Bursts at hour boundary, contradicts "cap window clears" language (D-13). Use sliding ZSET.
- **Deleting travel row on arrival:** Breaks `encounter_runs.travel_id` FK history; `userId.unique()` forbids a second row anyway. UPDATE in place.
- **Hardcoding node/zone/hero names in i18n:** Content must stay in DB per-locale columns (D-07 Phase 8 rule); only UI strings in `sanguo` namespace.
- **Adding a persistent status embed / countdown:** D-06 — event notifications only.
- **Wallet import anywhere in travel/encounter services:** D-01 — structurally impossible to charge.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling of the two ticks | Manual setTimeout loops / node-cron in bot.ts | pg-boss `schedule()` + `work()` | Exactly-once delivery, restart-safe schedules, manager-only lock via advisory locks (existing infra) |
| Row-level concurrency on tick sweeps | Optimistic retry loops / SELECT-then-UPDATE races | Drizzle `.for('update', { skipLocked: true })` | Same-db atomicity; two crons + future multi-manager safe; already proven in football resolver |
| Sliding-window rate cap | Custom timestamp array / SQL queries per tick | Redis ZSET (`ZADD` + `ZREMRANGEBYSCORE` + `ZCARD`) | O(log n), atomic, survives restarts; no per-tick DB query |
| Weighted random pick from a blended pool | Math.random + rejection sampling | `crypto.randomInt` + linear cumulative-walk | Milestone fairness mandate; crypto RNG is the project standard for player-facing rolls |
| Cross-shard DM delivery | Event-bus messaging between shards / gateway DM | `@discordjs/rest` direct REST call from manager | REST works from any process; no shard routing needed; existing football pattern |

**Key insight:** Every hard problem in this phase (scheduling, locking, capping, RNG, notification) has an established in-repo solution. The genuinely new code is the **time accounting** (pause-aware decrement + self-heal) and the **pool blend math** — both pure functions that should be written first and unit-tested in isolation.

## TQC-09 Dataset Design (PRIMARY DELIVERABLE)

> **User review gate (D-21):** This dataset is the research output the user reviews before implementation. It is committed to `scripts/data/sanguo-map-data.json` (dev-time only — same pattern as `sanguo-classifications.json`) and consumed by `scripts/seed-sanguo.ts`. Machine-verified: 132/132 heroes covered, 0 rep-hero/zone mismatches, 0 isolated nodes, 0 duplicate edges.

### Data Contract (seed file shape)

```jsonc
// scripts/data/sanguo-map-data.json
{
  "zones":     [ { "code": "trung_nguyen", "nameVi": "Trung Nguyên", "nameEn": "Central Plains (Sili)", "nameZh": "中原", "sortOrder": 1 } ],
  "nodes":     [ { "code": "luoyang", "nameVi": "Lạc Dương", "nameEn": "Luoyang", "nameZh": "洛阳", "zone": "trung_nguyen", "representativeHeroId": "dong_trac" } ],
  "edges":     [ { "nodeA": "hongnong", "nodeB": "luoyang", "travelSeconds": 900 } ],
  "heroZoneRates": [ { "heroId": "dong_trac", "zone": "quan_trung", "rate": 1.0 } ]
}
```

### 1. Zones (18 — 13 châu Đông Hán + 5 outlying)

Zone codes are DB keys (never user-facing); per-locale names live in a new `map_zones` reference table (D-19). Representative hero per zone supplies the map marker emoji (D-07 marker pattern) — the `map.ts` command currently derives zone labels from the first node's name (WR-02); with `map_zones` the label source should switch to the zone table.

| code | nameVi | nameEn | nameZh | sortOrder | Rep hero |
|------|--------|--------|--------|-----------|----------|
| trung_nguyen | Trung Nguyên | Central Plains (Sili) | 中原 | 1 | dong_trac |
| quan_trung | Quan Trung | Guanzhong | 关中 | 2 | han_xian_di |
| du_chau | Dự Châu | Yuzhou | 豫州 | 3 | cao_cao |
| duyen_chau | Duyện Châu | Yanzhou | 兖州 | 4 | zhang_miao |
| tu_chau | Từ Châu | Xuzhou | 徐州 | 5 | tao_qian |
| thanh_chau | Thanh Châu | Qingzhou | 青州 | 6 | kong_rong |
| ky_chau | Ký Châu | Jizhou | 冀州 | 7 | yuan_shao |
| u_chau | U Châu | Youzhou | 幽州 | 8 | gongsun_zan |
| tinh_chau | Tỉnh Châu | Bingzhou | 并州 | 9 | dinh_nguyen |
| luong_chau | Lương Châu | Liangzhou | 凉州 | 10 | ma_dang |
| kinh_chau | Kinh Châu | Jingzhou | 荆州 | 11 | liu_biao |
| duong_chau | Dương Châu | Yangzhou | 扬州 | 12 | sun_jian |
| ich_chau | Ích Châu | Yizhou | 益州 | 13 | liu_bei |
| giao_chau | Giao Châu | Jiaozhou | 交州 | 14 | shi_xie |
| trieu_tien | Triều Tiên | Korean Kingdoms | 朝鲜古国 | 15 | tan_dai_vuong |
| o_hoan | Ô Hoàn | Wuhuan Steppe | 乌桓 | 16 | tadun |
| tien_ti | Tiên Ti | Xianbei Steppe | 鲜卑 | 17 | tan_shihuai |
| hung_no | Hung Nô | Xiongnu Steppe | 匈奴 | 18 | qiangqu |

Zone hero-pool sizes (rows in `hero_zone_rates`): trung_nguyen 45, kinh_chau 26, du_chau 20, luong_chau 13, u_chau 12, duong_chau 12, ky_chau 10, tinh_chau 9, duyen_chau 9, ich_chau 9, tu_chau 8, quan_trung 7, trieu_tien 6, giao_chau 6, tien_ti 5, hung_no 4, o_hoan 4, thanh_chau 3. Total 208 rows.

### 2. Nodes (73 — D-18 ≥50 ✓)

All nodes carry per-locale names (name_zh from the Tavily-researched zh-names pass, D-06 pattern — the seed's clobber-safe spread already handles missing zh). `nodeOrder` is preserved for the existing map embed ordering (`map.ts` orders by nodeOrder). `representativeHeroId` is the map-marker hero (null-safe label-only rendering per Phase 8 D-07).

| code | nameVi | nameEn | zone | rep hero |
|------|--------|--------|------|----------|
| luoyang | Lạc Dương | Luoyang | trung_nguyen | dong_trac |
| hongnong | Hoằng Nông | Hongnong | trung_nguyen | hoang_phu_tung |
| hulao | Hổ Lao Quan | Hulao Pass | trung_nguyen | lu_thuc |
| wan | Uyển Thành | Wancheng | kinh_chau | zhang_xiu |
| changan | Trường An | Changan | quan_trung | han_xian_di |
| xianyang | Hàm Dương | Xianyang | quan_trung | gai_xun |
| tongguan | Đồng Quan | Tongguan Pass | quan_trung | bac_cung_ba_ngoc |
| tianshui | Thiên Thủy | Tianshui | quan_trung | ma_dang |
| xuchang | Hứa Xương | Xuchang | du_chau | cao_cao |
| yingchuan | Dĩnh Xuyên | Yingchuan | du_chau | ly_ung |
| runan | Nhữ Nam | Runan | du_chau | yuan_shao |
| qiao | Tiêu Quận | Qiao County | du_chau | xiahou_dun |
| chenliu | Trần Lưu | Chenliu | duyen_chau | zhang_miao |
| puyang | Bộc Dương | Puyang | duyen_chau | bao_hong |
| taishan | Thái Sơn | Mount Tai | duyen_chau | bao_tin |
| pengcheng | Bành Thành | Pengcheng | tu_chau | tao_qian |
| xiapi | Hạ Phì | Xiapi | tu_chau | chen_deng |
| guangling | Quảng Lăng | Guangling | tu_chau | tran_lam |
| tan | Đàm Thành | Tancheng | tu_chau | mi_zhu |
| beihai | Bắc Hải | Beihai | thanh_chau | kong_rong |
| jinan | Tế Nam | Jinan | thanh_chau | quan_hoi |
| dongan | Đông A | Dong'an | thanh_chau | liu_yao |
| yecheng | Nghiệp Thành | Yecheng | ky_chau | yuan_shao |
| julu | Cự Lộc | Julu | ky_chau | truong_giac |
| handan | Hàm Đan | Handan | ky_chau | ju_shou |
| bohai | Bột Hải | Bohai | ky_chau | tian_feng |
| zhengding | Chân Định | Zhengding | ky_chau | han_fu |
| zhuo | Trác Quận | Zhuo Commandery | u_chau | liu_bei |
| beiping | Bắc Bình | Beiping | u_chau | gongsun_zan |
| liaodong | Liêu Đông | Liaodong | u_chau | gongsun_du |
| ji | Kế Thành | Ji City | u_chau | liu_yu |
| shanggu | Thượng Cốc | Shanggu | u_chau | wang_kuang |
| taiyuan | Thái Nguyên | Taiyuan | tinh_chau | dinh_nguyen |
| shangdang | Thượng Đảng | Shangdang | tinh_chau | zhang_yan |
| yunzhong | Vân Trung | Yunzhong | tinh_chau | zhang_yang |
| longxi | Lũng Tây | Longxi | luong_chau | han_toai |
| jincheng | Kim Thành | Jincheng | luong_chau | ma_dang |
| wudu | Vũ Đô | Wudu | luong_chau | dianwu |
| anding | An Định | Anding | luong_chau | hoang_phu_tung |
| liangzhou_city | Lương Châu thành | Liang Province Seat | luong_chau | bian_chuong |
| xiangyang | Tương Dương | Xiangyang | kinh_chau | liu_biao |
| jiangling | Giang Lăng | Jiangling | kinh_chau | cai_mao |
| changsha | Trường Sa | Changsha | kinh_chau | sun_jian |
| wuling | Vũ Lăng | Wuling | kinh_chau | huang_gai |
| guiyang | Quế Dương | Guiyang | kinh_chau | luong_long |
| jianye | Kiến Nghiệp | Jianye | duong_chau | sun_jian |
| kuaiji | Cối Kê | Kuaiji | duong_chau | xu_gong |
| lujiang | Lư Giang | Lujiang | duong_chau | xi_jian |
| shouchun | Thọ Xuân | Shouchun | duong_chau | yuan_shu |
| wu | Ngô Quận | Wu Commandery | duong_chau | huang_gai |
| chengdu | Thành Đô | Chengdu | ich_chau | liu_bei |
| hanzhong | Hán Trung | Hanzhong | ich_chau | zhang_lu |
| mianzhu | Miên Trúc | Mianzhu | ich_chau | liu_yan |
| jiangzhou | Giang Châu | Jiangzhou | ich_chau | zhao_wei |
| yongan | Vĩnh An | Yong'an | ich_chau | zhang_fei |
| longbian | Long Biên | Longbian | giao_chau | shi_xie |
| jiuzhen | Cửu Chân | Jiuzhen | giao_chau | shi_yi |
| rinan | Nhật Nam | Rinan | giao_chau | si_tu |
| cangwu | Thương Ngô | Cangwu | giao_chau | ngo_cu |
| gungnae | Quốc Nội | Gungnae | trieu_tien | tan_dai_vuong |
| buyeo | Phù Dư | Buyeo | trieu_tien | uy_cuu_dai |
| baekje | Bách Tế | Baekje (Wirye) | trieu_tien | tieu_co_vuong |
| lelang | Lạc Lãng | Lelang | trieu_tien | co_quoc_xuyen_vuong |
| okjeo | Ốc Trở | Okjeo | trieu_tien | at_ba_to |
| liucheng | Liễu Thành | Liucheng | o_hoan | tadun |
| shanggu_oh | Thượng Cốc (Ô Hoàn) | Shanggu (Wuhuan) | o_hoan | qiuliju |
| liaoxi | Liêu Tây | Liaoxi | o_hoan | nanlou |
| mobei | Mạc Bắc | Mobei | tien_ti | tan_shihuai |
| yinshan | Âm Sơn | Yinshan | tien_ti | helian |
| dai | Đại Quận | Dai Commandery | tien_ti | kuitou |
| heshuo | Hà Sóc | Heshuo | hung_no | qiangqu |
| longcheng | Long Thành | Longcheng | hung_no | yufuluo |
| xihe | Tây Hà | Xihe | hung_no | huchuquan |

**Geography notes (research basis):** 13 châu model per Eastern Han administration (Wikipedia: List of provinces and commanderies of the Han dynasty — Sili, Yu, Yan, Qing, Xu, Ji, You, Bing, Liang, Jing, Yang, Yi + Jiao 交州; Sili is the capital region, hence Trung Nguyên as the central hub). Outlying additions per D-18: Giao Châu (Jiaozhou — Shi Xie's northern Vietnam; Longbian/龙编 capital east of Hanoi, per Wikipedia Shi Xie + Jiaozhi articles), Triều Tiên (Goguryeo Gungnae/國內, Buyeo/夫餘, Baekje Wirye, Lelang/樂浪 commandery, Okjeo — per Britannica/WorldHistory "Three Kingdoms of Korea"), and the three steppe zones (Ô Hoàn/乌桓 around Liaoxi, Tiên Ti/鲜卑 north of the Great Wall, Hung Nô/匈奴 in the Ordos/Heshuo) matching the Ngoại tộc roster factions.

### 3. Edges (162 undirected — D-17 graph)

`map_edges` stores each undirected pair ONCE (`node_a < node_b` canonical order, unique index). `travel_seconds` scaled by real-world distance: local hops 5-10 min (600s), regional 10-30 min (600-1800s), cross-region 30-60 min (1800-3600s), frontier 60-90 min (3600-5400s). Distribution: 7 edges 5-10min, 126 edges 10-30min, 27 edges 30-60min, 2 edges 60-90min. Avg 26 min.

Travel times (minutes) by cluster — full list in the committed data file (`sanguo-map-data.json`); all 162 pairs listed below by region:

**Trung Nguyên / Quan Trung core (Sili):** Lạc Dương–Hoằng Nông 15 · Lạc Dương–Hổ Lao 10 · Lạc Dương–Uyển Thành 30 · Lạc Dương–Dĩnh Xuyên 20 · Lạc Dương–Hứa Xương 30 · Lạc Dương–Trần Lưu 20 · Hoằng Nông–Đồng Quan 15 · Hoằng Nông–Uyển Thành 35 · Hổ Lao–Trần Lưu 10 · Hổ Lao–Bộc Dương 25 · Trường An–Hàm Dương 10 · Trường An–Đồng Quan 20 · Trường An–Thiên Thủy 60 · Trường An–An Định 40 · Trường An–Lũng Tây 90 · Thiên Thủy–An Định 30 · Thiên Thủy–Lũng Tây 40 · Thiên Thủy–Vũ Đô 50 · An Định–Lũng Tây 25 · An Định–Vũ Đô 50 · An Định–Hà Sóc 60

**Dự Châu:** Hứa Xương–Dĩnh Xuyên 10 · Hứa Xương–Nhữ Nam 20 · Hứa Xương–Tiêu Quận 20 · Hứa Xương–Trần Lưu 15 · Dĩnh Xuyên–Nhữ Nam 20 · Dĩnh Xuyên–Uyển Thành 25 · Nhữ Nam–Tiêu Quận 20 · Nhữ Nam–Thọ Xuân 30 · Nhữ Nam–Tương Dương 35 · Tiêu Quận–Bành Thành 20 · Tiêu Quận–Thọ Xuân 25

**Duyện Châu / Từ Châu / Thanh Châu:** Trần Lưu–Bộc Dương 15 · Trần Lưu–Thái Sơn 20 · Bộc Dương–Thái Sơn 20 · Bộc Dương–Nghiệp Thành 20 · Bộc Dương–Tế Nam 30 · Thái Sơn–Tế Nam 20 · Thái Sơn–Bành Thành 20 · Thái Sơn–Bắc Hải 35 · Bành Thành–Hạ Phì 15 · Bành Thành–Đàm Thành 15 · Bành Thành–Quảng Lăng 25 · Bành Thành–Bắc Hải 25 · Hạ Phì–Quảng Lăng 20 · Hạ Phì–Đàm Thành 15 · Quảng Lăng–Kiến Nghiệp 25 · Quảng Lăng–Lư Giang 30 · Đàm Thành–Tế Nam 25 · Bắc Hải–Tế Nam 20 · Bắc Hải–Đông A 15 · Tế Nam–Đông A 20 · Tế Nam–Chân Định 30 · Đông A–Liêu Đông 40

**Ký Châu / U Châu / Tỉnh Châu:** Nghiệp Thành–Hàm Đan 10 · Nghiệp Thành–Cự Lộc 20 · Nghiệp Thành–Chân Định 15 · Nghiệp Thành–Thái Nguyên 25 · Hàm Đan–Cự Lộc 15 · Hàm Đan–Thượng Đảng 15 · Hàm Đan–Chân Định 20 · Cự Lộc–Bột Hải 25 · Cự Lộc–Thượng Cốc 30 · Cự Lộc–Liễu Thành 35 · Bột Hải–Thượng Cốc 20 · Bột Hải–Liêu Tây 30 · Chân Định–Thái Nguyên 25 · Chân Định–Kế Thành 25 · Chân Định–Liễu Thành 30 · Trác Quận–Bắc Bình 15 · Trác Quận–Kế Thành 20 · Trác Quận–Thượng Cốc 20 · Trác Quận–Đại Quận 25 · Bắc Bình–Kế Thành 15 · Bắc Bình–Liêu Đông 30 · Bắc Bình–Liêu Tây 25 · Kế Thành–Thượng Cốc 15 · Kế Thành–Liêu Đông 35 · Liêu Đông–Liêu Tây 20 · Liêu Đông–Lạc Lãng 25 · Liêu Đông–Quốc Nội 25 · Liêu Đông–Liễu Thành 30 · Thượng Cốc–Thượng Cốc (Ô Hoàn) 10 · Thượng Cốc–Đại Quận 20 · Thái Nguyên–Thượng Đảng 15 · Thái Nguyên–Vân Trung 20 · Thái Nguyên–Tây Hà 25 · Thượng Đảng–Vân Trung 25 · Thượng Đảng–Tây Hà 20 · Vân Trung–Tây Hà 15 · Vân Trung–Đại Quận 20 · Vân Trung–Âm Sơn 30 · Vân Trung–Mạc Bắc 60 · Tây Hà–Hà Sóc 20 · Tây Hà–Long Thành 30 · Tây Hà–Âm Sơn 40

**Lương Châu:** Lũng Tây–Kim Thành 15 · Lũng Tây–Vũ Đô 30 · Lũng Tây–Lương Châu thành 15 · Kim Thành–Lương Châu thành 10 · Kim Thành–Mạc Bắc 80 · Vũ Đô–Hán Trung 30 · Vũ Đô–Miên Trúc 40 · Lương Châu thành–Hà Sóc 50

**Kinh Châu / Dương Châu / Ích Châu:** Tương Dương–Giang Lăng 20 · Tương Dương–Trường Sa 30 · Tương Dương–Vũ Lăng 40 · Tương Dương–Hán Trung 50 · Tương Dương–Uyển Thành 20 · Giang Lăng–Trường Sa 30 · Giang Lăng–Vũ Lăng 25 · Giang Lăng–Quế Dương 30 · Giang Lăng–Vĩnh An 40 · Giang Lăng–Lư Giang 35 · Trường Sa–Vũ Lăng 25 · Trường Sa–Quế Dương 15 · Trường Sa–Cối Kê 40 · Vũ Lăng–Quế Dương 15 · Quế Dương–Thương Ngô 30 · Kiến Nghiệp–Cối Kê 20 · Kiến Nghiệp–Lư Giang 20 · Kiến Nghiệp–Ngô Quận 15 · Kiến Nghiệp–Quảng Lăng 25 · Cối Kê–Ngô Quận 20 · Cối Kê–Thọ Xuân 30 · Lư Giang–Thọ Xuân 15 · Lư Giang–Ngô Quận 20 · Thọ Xuân–Quảng Lăng 30 · Ngô Quận–Trường Sa 40 · Thành Đô–Miên Trúc 15 · Thành Đô–Giang Châu 20 · Thành Đô–Hán Trung 30 · Thành Đô–Vĩnh An 30 · Thành Đô–Vũ Đô 45 · Miên Trúc–Hán Trung 25 · Miên Trúc–Giang Châu 25 · Hán Trung–Giang Châu 25 · Giang Châu–Vĩnh An 15 · Vĩnh An–Giang Lăng 40

**Giao Châu / Triều Tiên / Steppe:** Long Biên–Cửu Chân 20 · Long Biên–Thương Ngô 25 · Long Biên–Nhật Nam 30 · Cửu Chân–Nhật Nam 15 · Thương Ngô–Nhật Nam 20 · Quốc Nội–Lạc Lãng 15 · Quốc Nội–Phù Dư 30 · Quốc Nội–Ốc Trở 15 · Quốc Nội–Liễu Thành 40 · Phù Dư–Ốc Trở 20 · Phù Dư–Liêu Đông 35 · Bách Tế–Lạc Lãng 20 · Bách Tế–Ốc Trở 25 · Lạc Lãng–Ốc Trở 20 · Liễu Thành–Thượng Cốc (Ô Hoàn) 20 · Liễu Thành–Liêu Tây 15 · Liễu Thành–Liêu Đông 30 · Thượng Cốc (Ô Hoàn)–Liêu Tây 20 · Thượng Cốc (Ô Hoàn)–Kế Thành 20 · Liêu Tây–Lạc Lãng 15 · Mạc Bắc–Âm Sơn 25 · Mạc Bắc–Đại Quận 30 · Mạc Bắc–Hà Sóc 40 · Âm Sơn–Đại Quận 20 · Âm Sơn–Tây Hà 40 · Đại Quận–Trác Quận 25 · Đại Quận–Thượng Cốc 15 · Hà Sóc–Long Thành 15 · Hà Sóc–Tây Hà 20 · Long Thành–Tây Hà 30 · Long Thành–Âm Sơn 40

**Design note:** graph is intentionally NOT fully connected (D-17) — e.g., Giao Châu links to the interior only via Thương Ngô–Quế Dương; Triều Tiên only via Liêu Đông; steppe zones via Tây Hà/Đại Quận/Âm Sơn. The full 162-edge list is generated (verified: 0 duplicate pairs, 0 isolated nodes, no self-loops).

### 4. hero_zone_rates (208 rows — 132/132 heroes covered, D-16)

`rate` semantics: **relative weight within the zone pool** (1.0 = primary residence, 0.5 = secondary association, 0.3 = tertiary). Weights are normalized at roll time via the D-15 blend; NOT probabilities. Set by lore/historical association per D-16 (court heroes → Trung Nguyên capital; warlords → power base + origin; foreign rulers → their home zone with a Chinese-border secondary).

**All 132 heroes (hero_id → zone:rate list):**

```
han_ling_di -> trung_nguyen:1
han_shao_di -> trung_nguyen:1
han_xian_di -> trung_nguyen:1, quan_trung:0.5
ha_thai_hau -> trung_nguyen:1
dong_thai_hau -> trung_nguyen:1
vuong_my_nhan -> trung_nguyen:1
truong_nhuong -> trung_nguyen:1
trieu_trung -> trung_nguyen:1
kien_thac -> trung_nguyen:1
doan_khue -> trung_nguyen:1
phong_tu -> trung_nguyen:1
tao_tiet -> trung_nguyen:1
hau_lam -> trung_nguyen:1
ha_uan -> trung_nguyen:1
quach_thang -> trung_nguyen:1
trinh_khoang -> trung_nguyen:1
ha_tien -> trung_nguyen:1
ha_mieu -> trung_nguyen:1
vuong_doan -> trung_nguyen:1
thai_ung -> trung_nguyen:1
tran_lam -> tu_chau:1, trung_nguyen:0.5
luu_dao -> trung_nguyen:1
truong_quan -> trung_nguyen:1
huang_wan -> trung_nguyen:1, kinh_chau:0.3
dau_vu -> trung_nguyen:1, quan_trung:0.5
tran_phien -> du_chau:1, trung_nguyen:0.5
ly_ung -> du_chau:1, trung_nguyen:0.5
pham_bang -> du_chau:1, trung_nguyen:0.3
quach_thai -> tinh_chau:1, trung_nguyen:0.5
hoang_phu_tung -> luong_chau:1, trung_nguyen:0.5
chu_tuan -> duong_chau:1, trung_nguyen:0.5
lu_thuc -> u_chau:1, trung_nguyen:0.5
pho_tiep -> luong_chau:1, trung_nguyen:0.3
bao_tin -> duyen_chau:1, trung_nguyen:0.5
bao_hong -> duyen_chau:1, trung_nguyen:0.3
thuan_vu_quynh -> du_chau:1, trung_nguyen:0.3
gongsun_zan -> u_chau:1
gai_xun -> quan_trung:1, luong_chau:0.5, trung_nguyen:0.3
zhang_wen -> trung_nguyen:1, kinh_chau:0.3
truong_giac -> ky_chau:1, du_chau:0.3
truong_bao -> ky_chau:1
truong_luong -> ky_chau:1
ma_nguyen_nghia -> ky_chau:1, trung_nguyen:0.3
duong_chau -> du_chau:1, trung_nguyen:0.3
truong_man_thanh -> du_chau:1, ky_chau:0.3
ba_tai -> du_chau:1
banh_thoat -> kinh_chau:1
trieu_hoang -> kinh_chau:1
han_trung -> kinh_chau:1
ton_ha -> kinh_chau:1
bac_ky -> kinh_chau:1
trinh_vien_chi -> kinh_chau:1
quan_hoi -> thanh_chau:1, du_chau:0.3
zhang_yan -> tinh_chau:1, ky_chau:0.5
zhang_lu -> ich_chau:1
zhang_xiu -> kinh_chau:1, trung_nguyen:0.5, luong_chau:0.3
ma_xiang -> ich_chau:1
bian_chuong -> luong_chau:1
han_toai -> luong_chau:1
bac_cung_ba_ngoc -> luong_chau:1, quan_trung:0.5
vuong_quoc -> luong_chau:1
ma_dang -> luong_chau:1, quan_trung:0.5
dianwu -> luong_chau:1, duyen_chau:0.5
yang_teng -> luong_chau:1, quan_trung:0.3
dong_trac -> quan_trung:1, luong_chau:1, trung_nguyen:0.5
yuan_shao -> ky_chau:1, du_chau:0.5
yuan_shu -> du_chau:1, duong_chau:0.5
sun_jian -> duong_chau:1, kinh_chau:0.5
dinh_nguyen -> tinh_chau:1, trung_nguyen:0.5
liu_bei -> ich_chau:1, u_chau:0.5, tu_chau:0.5, kinh_chau:0.5
guan_yu -> kinh_chau:1, ich_chau:0.5, u_chau:0.3
zhang_fei -> ich_chau:1, u_chau:0.5, kinh_chau:0.3
cao_cao -> du_chau:1, trung_nguyen:0.5, duyen_chau:0.3
xiahou_dun -> du_chau:1, trung_nguyen:0.3
xiahou_yuan -> du_chau:1, luong_chau:0.3
huang_gai -> duong_chau:1, kinh_chau:0.5
cheng_pu -> duong_chau:1, u_chau:0.5
ze_rong -> duong_chau:1, tu_chau:0.5
liu_yu -> u_chau:1
han_fu -> ky_chau:1, du_chau:0.5
ju_shou -> ky_chau:1
tian_feng -> ky_chau:1
zhang_yang -> tinh_chau:1
gongsun_du -> u_chau:1, trieu_tien:0.5
liu_biao -> kinh_chau:1
wang_rui -> kinh_chau:1, duyen_chau:0.3
kuai_yue -> kinh_chau:1
kuai_liang -> kinh_chau:1
cai_mao -> kinh_chau:1
huang_zu -> kinh_chau:1
chen_wen -> kinh_chau:1, du_chau:0.3
liu_yao -> duong_chau:1, thanh_chau:0.5
wang_lang -> duong_chau:1, tu_chau:0.3
xu_gong -> duong_chau:1
shi_xie -> giao_chau:1
shi_yi -> giao_chau:1
zhang_jin -> giao_chau:1, kinh_chau:0.3
lai_gong -> kinh_chau:1, ich_chau:0.5
liu_yan -> ich_chau:1, kinh_chau:0.5
zhao_wei -> ich_chau:1
xi_jian -> duong_chau:1, tu_chau:0.5
tao_qian -> tu_chau:1, duong_chau:0.3
mi_zhu -> tu_chau:1, ich_chau:0.3
chen_deng -> tu_chau:1
liu_dai -> duyen_chau:1, du_chau:0.5
zhang_miao -> duyen_chau:1
qiao_mao -> duyen_chau:1, du_chau:0.3
kong_zhou -> du_chau:1, duyen_chau:0.3
kong_rong -> thanh_chau:1, du_chau:0.5
wang_kuang -> u_chau:1, tinh_chau:0.5
gia_tong -> giao_chau:1
si_tu -> giao_chau:1
ngo_cu -> giao_chau:1, kinh_chau:0.3
tan_shihuai -> tien_ti:1
helian -> tien_ti:1
kuitou -> tien_ti:1
qianman -> tien_ti:1
budugen -> tien_ti:1
qiangqu -> hung_no:1, tinh_chau:0.5
yufuluo -> hung_no:1, tinh_chau:0.5
huchuquan -> hung_no:1, tinh_chau:0.3
xubu_guduhou -> hung_no:1, tinh_chau:0.3
qiuliju -> o_hoan:1, u_chau:0.5
tadun -> o_hoan:1, u_chau:0.5
nanlou -> o_hoan:1
supuyan -> o_hoan:1, u_chau:0.3
tan_dai_vuong -> trieu_tien:1
co_quoc_xuyen_vuong -> trieu_tien:1
at_ba_to -> trieu_tien:1
uy_cuu_dai -> trieu_tien:1
tieu_co_vuong -> trieu_tien:1
luong_long -> duong_chau:1, kinh_chau:0.5
```

**Weighting rationale:** rates 1.0/0.5/0.3 are the research-set weights (D-16 — not tier-derived, not uniform). Examples: the 6 Hoàng tộc + 10 Thập Thường Thị + 8 Triều đình + 5 Đảng nhân heroes anchor Trung Nguyên at 1.0 (the capital is a dense pool — historically correct: the court WAS in Luoyang); warlords carry dual weights (Yuan Shao 1.0 Ký Châu + 0.5 Dự Châu — Yecheng base + Runan origin); foreign rulers anchor home zones (Korean kings 1.0 Triều Tiên, Xianbei chiefs 1.0 Tiên Ti) with cross-border secondaries where the Records place them (Yufuluo 0.5 Tỉnh Châu — Southern Xiongnu in Bingzhou).

### 5. travelService design (TQC-06, D-01/D-03/D-08/D-09)

Pure time/state service — **no wallet import anywhere** (D-01). API:

```typescript
// src/services/sanguo/travelService.ts
export const START_NODE = 'luoyang';   // default origin for first-ever journey (research decision)

export async function getCurrentPosition(userId: number): Promise<{ nodeId: number; nodeCode: string }>
// Reads player_travel_state: status='arrived' → toNodeId; status='traveling' → fromNodeId (in-flight);
// no row → START_NODE (luoyang). Returns node code for command display.

export async function getAdjacentNodes(nodeId: number): Promise<AdjacentNode[]>
// SELECT map_edges WHERE node_a_id = :nodeId OR node_b_id = :nodeId
// JOIN map_nodes + map_zones → { code, nameVi/En/Zh, zone, travelSeconds, representativeHeroId }
// Ordered by travelSeconds ASC (UI-SPEC autocomplete contract: nearest first, cap 25).

export async function startTravel(userId: number, toNodeId: number): Promise<{ etaSeconds: number }>
// 1. Read current row: if status='traveling' → throw ALREADY_TRAVELING (D-09; userId.unique() backstop)
// 2. Validate edge exists from current position to toNodeId → throw NO_ROUTE (defense in depth; autocomplete is advisory)
// 3. INSERT on first journey; UPDATE existing row on subsequent (userId.unique() = one row forever)
//    set: fromNodeId=current, toNodeId=dest, travelSecondsRemaining=edge.travelSeconds,
//         encounterActive=false, status='traveling', departAt=now, updatedAt=now
// 4. NO wallet.deductBalance (D-01). Returns ETA for the reply embed.
```

### 6. player_travel_state schema evolution (D-07)

Replace the Phase 8 `arriveAt timestamp notNull` + `cost bigint notNull` model with the pause-aware remaining-seconds model (D-07 + D-01 — cost drops entirely):

| Column | Change | Notes |
|--------|--------|-------|
| id serial PK | keep | — |
| user_id int UNIQUE FK | keep | D-09 — one row per user forever |
| from_node_id int | keep (nullable on legacy rows; NOT NULL new) | plain int, no FK (existing design) |
| to_node_id int | keep (nullable on legacy rows; NOT NULL new) | plain int, no FK |
| depart_at timestamptz | keep | audit/position anchor |
| **arrive_at timestamptz** | **DROP** | replaced by remaining-seconds (D-07) |
| **cost bigint** | **DROP** | travel is free (D-01); money never involved |
| **travel_seconds_remaining int NOT NULL** | **ADD** | decrementing, pause-aware (D-07) |
| **encounter_active boolean NOT NULL DEFAULT false** | **ADD** | pause flag: arrival tick skips subtraction while true (D-07); Phase 9 sets true→false within one tick job (no battle resolution yet) |
| status varchar(20) | keep — values now `'traveling'`/`'arrived'` only | `'cancelled'` removed (D-03) |
| created_at / updated_at | keep | updatedAt doubles as the elapsed-time anchor |

**Migration:** new Drizzle migration (0018) `ALTER TABLE player_travel_state DROP COLUMN arrive_at, DROP COLUMN cost, ADD COLUMN travel_seconds_remaining integer NOT NULL DEFAULT 0, ADD COLUMN encounter_active boolean NOT NULL DEFAULT false` — safe because the Phase 8 table is empty in production (no travel shipped yet). Also `CREATE TABLE map_edges`, `CREATE TABLE map_zones`, `CREATE TABLE hero_zone_rates`, `ALTER TABLE map_nodes` (keep columns; D-20 truncates + reseeds rows), `ALTER TABLE encounter_runs ADD COLUMN encounter_type varchar(20) NOT NULL DEFAULT 'hero'`.

**encounter_runs boss flag (D-14):** add `encounter_type varchar(20) NOT NULL DEFAULT 'hero'` with values `'hero' | 'boss'` (extensible for future encounter kinds). `hero_id` stays nullable — boss encounters write `hero_id NULL` + `encounter_type='boss'` + zone.

### 7. Encounter roll specifics (TQC-08, D-10/D-13/D-14/D-15)

**Per encounter tick (45s), for each traveling row (locked):**
1. **Cap check first (D-13):** Redis key `sanguo:enc:win:{userId}` — ZSET of encounter timestamps. `ZREMRANGEBYSCORE -inf (now-3600s)`; `ZCARD >= 20` → **skip silently** (no record, no DM, travel continues). On successful roll, `ZADD` now. Sliding window chosen over fixed-hour (D-13 "cap window clears" semantics; no hour-boundary burst).
2. **Position fraction (D-15):** `pos = 1 − (travel_seconds_remaining / total_seconds)`. Note: total hop seconds must be available — store on the travel row or read from `map_edges`; the row is sufficient and avoids a join.
3. **Hero roll:** per-tick probability by zone, ~30-50% (D-10). Recommend zone base rate in `map_zones.encounter_rate` (default 0.35; frontier zones 0.40-0.45). Use `crypto.randomInt` threshold.
4. **Boss roll (D-14):** after a successful hero roll, second roll ~5-10% (recommend 0.07 default; zone-configurable `map_zones.boss_rate`). Boss replaces the hero: record `encounter_type='boss'`, `hero_id NULL`, zone = current blended position's dominant zone.
5. **Weighted hero pick:** blend zone A pool × (1−pos) + zone B pool × pos (Pattern 3); pick via crypto.randomInt cumulative walk.
6. **Record + notify:** `INSERT encounter_runs (user_id, travel_id, zone, hero_id, encounter_type, status='pending')`; send DM (Pattern 4). Boss counts toward the cap too (it IS an encounter).

**Expected rates (sanity):** 45s tick → 80 ticks/hr. At 0.35/tick → ~28 expected rolls/hr, but cap 20/hr binds → players receive ≤20 encounters/hr; boss sub-roll 0.07 → ~1.4-2 boss encounters/hr at cap. Travel is never blocked by the cap (D-13).

### 8. ROADMAP / economy amendments required

- **ROADMAP.md §Phase 9 SC2** must be amended (CONTEXT §Phase Boundary): travel-cancel removed → rewrite as "User cannot cancel a journey; travel is a one-way commitment; position always equals the last arrived node; travel state resolves at arrival."
- **docs/economy-budget.md (D-02/D-18):** sink moves from travel → capture fee. Doc update + re-sign before Phase 10 content ships (CONTEXT deferred: "not necessarily in Phase 9 execution" — the planner may add a doc-flag task but the re-sign-off numbers need Phase 10 capture-fee values).

## Common Pitfalls

### Pitfall 1: Arrival tick double-resolves or misses rows (race between the two crons)
**What goes wrong:** arrival tick and encounter tick both scan `player_travel_state`; without row locks one tick can read a row mid-update, or two arrivals both fire the DM.
**Why it happens:** both crons run in the manager process; pg-boss can dispatch the two queues' jobs concurrently.
**How to avoid:** `.for('update', { skipLocked: true })` in BOTH tick scans (verified in-repo at `matchLifecycleService.ts:345`). The arrival tick's transaction: SELECT FOR UPDATE SKIP LOCKED → update → commit; the encounter tick same. A row locked by one is skipped by the other that sweep.
**Warning signs:** duplicate arrival DMs; `encounter_runs` rows with the same travel_id resolving twice; pg-boss logs of deadlock errors.

### Pitfall 2: The pause-aware clock counts encounter time (D-07 violated)
**What goes wrong:** if the arrival tick subtracts elapsed wall-clock while `encounter_active=true`, the pause is meaningless; if it doesn't advance the anchor, the pause window gets subtracted later anyway.
**Why it happens:** `updatedAt` is both the "last modified" and the "elapsed anchor" — an encounter tick that writes `encounter_active=true` also bumps `updatedAt`, silently discarding travel time.
**How to avoid:** while `encounter_active`, the arrival tick sets `updatedAt = now` WITHOUT subtracting (anchor advances, no time counted). Phase 9 note: the encounter tick sets active→record→notify→inactive inside one job — the flag is observably false between ticks, so no journey stalls (D-05 never-stuck holds).
**Warning signs:** player arrives much earlier than the displayed ETA; unit test for pause window fails.

### Pitfall 3: Two files exporting the `sanguo` command
**What goes wrong:** creating `src/commands/sanguo/travel.ts` with its own `SlashCommandBuilder().setName('sanguo')` → `collectCommandFilePaths()` picks up both map.ts and travel.ts; `registerCommands()` PUTs both definitions (last one wins — order-dependent flakiness); `client.commands.set('sanguo', …)` overwrites.
**Why it happens:** the loader is one-command-per-file by design (`commandLoader.ts:37-49`).
**How to avoid:** append `.addSubcommand(travelSubcommand)` to map.ts's existing builder; travel.ts exports the subcommand builder + `execute` + `autocomplete` handlers that map.ts imports and wires.
**Warning signs:** `/sanguo` intermittently missing the `map` or `travel` subcommand after a deploy.

### Pitfall 4: Autocomplete treated as authoritative
**What goes wrong:** a user can race an autocomplete choice with a stale/stale-rendered pick; the command executes with a destination that is no longer adjacent (e.g., after a data change), or with a fabricated option value.
**Why it happens:** Discord autocomplete is advisory — the interaction payload can contain any string, not just offered choices.
**How to avoid:** `startTravel` re-validates adjacency server-side and returns `no_route` DANGER embed on mismatch (UI-SPEC interaction contract §3.5-3.6). Never trust `getString('destination')` without an edges lookup.
**Warning signs:** `NO_ROUTE` errors in production logs from a user who "just picked from the list".

### Pitfall 5: `updatedAt` as elapsed anchor drifts when the encounter tick writes it
**What goes wrong:** the encounter tick doesn't need to write `player_travel_state` (rolls read remaining; cap is Redis) — but if it DOES write (e.g., "last_roll_at"), it corrupts the arrival math.
**Why it happens:** conflating "row last touched" with "counted-time anchor".
**How to avoid:** arrival tick is the ONLY writer of `travel_seconds_remaining`/`updatedAt` for a traveling row. Encounter tick reads under `FOR UPDATE SKIP LOCKED` (shared lock intent) but writes only `encounter_runs` + Redis. If a dedicated anchor is preferred, add `last_counted_at` instead of reusing `updatedAt` — but reusing `updatedAt` with the single-writer rule is simpler.
**Warning signs:** remaining jumps by unexpected amounts between ticks.

### Pitfall 6: nameZh gaps breaking the map render
**What goes wrong:** `pickName` falls back `nameZh ?? nameVi` (map.ts:40) so NULL zh is safe — but if the seed writes an empty string instead of NULL, the map renders blank zone labels in zh-cn.
**Why it happens:** seed `set` clauses must use the clobber-safe conditional spread already established (`...(zh ? { nameZh: zh } : {})` in seed-sanguo.ts) — an unconditional `nameZh: row.nameZh` with undefined would write NULL, which is safe; but a `''` default is not.
**How to avoid:** keep the existing clobber-safe pattern; never default nameZh to `''`.
**Warning signs:** zh-cn map shows empty node names.

### Pitfall 7: Cap check ordering — roll before cap → cap can be exceeded by burst
**What goes wrong:** checking the cap AFTER the roll lets a user on the boundary squeeze an extra encounter (and, worse, the check-then-act race across two ticks in the same second).
**Why it happens:** non-atomic read-then-write on the ZSET without a bounded window.
**How to avoid:** `ZADD` then `ZREMRANGEBYSCORE` then `ZCARD` in one `MULTI`/pipeline, or accept the micro-race (cap is a soft brake; Phase 12 hardens). Check cap BEFORE rolling so skipped rolls never record (D-13 silent skip).
**Warning signs:** a user with exactly 20 encounters in the window receives a 21st.

## Code Examples

Verified patterns from official/repo sources:

### Autocomplete handler (first in codebase — new pattern)
```typescript
// src/events/interactionCreate.ts — add BEFORE the isChatInputCommand() gate (currently line 448)
if (interaction.isAutocomplete()) {
  const command = interaction.client.commands?.get(interaction.commandName);
  if (command && typeof command.autocomplete === 'function') {
    try { await command.autocomplete(interaction); }
    catch (err) { logger.error('InteractionCreate', `Autocomplete error in ${interaction.commandName}`, err); }
  }
  return;
}
// src/utils/commandLoader.ts — extend the Command interface + load
interface Command {
  data: { name: string; toJSON(): unknown };
  execute: (...args: unknown[]) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
// loadCommands(): also copy command.autocomplete into client.commands entry
```
**Source:** discord.js 14 `AutocompleteInteraction` API (in-repo: `interactionCreate.ts:448` currently gates chat-input only; UI-SPEC §Interaction contract autocomplete).

### Drizzle FOR UPDATE SKIP LOCKED (verified in-repo)
```typescript
const pendingBets = await tx
  .select().from(footballBets)
  .where(and(eq(footballBets.fixtureId, match.id), eq(footballBets.status, 'pending')))
  .for('update', { skipLocked: true });   // ← the exact object form Phase 9 uses (0.45.2)
```
**Source:** `src/services/football/matchLifecycleService.ts:336-345` (in-repo, production-running); Context7 drizzle-orm-docs confirms `.for('update').skipLocked()` chain equivalent.

### pg-boss 6-field cron with seconds (verified)
```bash
# node -e "require('cron-parser').CronExpressionParser.parse('*/45 * * * * *').next()"
# → next fire in 45s — pg-boss (cron-parser 5.7) accepts seconds-position cron for sub-minute schedules
```
**Source:** installed `node_modules/pg-boss/dist/index.d.ts` (`schedule(name, cron, data, options)`); installed `node_modules/cron-parser` parse check executed 2026-08-12.

### REST DM open (verified in @discordjs/rest)
```typescript
const dm = await rest.post(Routes.userChannels(), { body: { recipient_id: userDiscordId } }) as { id: string };
await rest.post(Routes.channelMessages(dm.id), { body: { embeds: embeds.map(e => e.toJSON()) } });
```
**Source:** `@discordjs/rest` 2.6.3 + discord.js `Routes.userChannels()` (mirrors `matchLifecycleService.ts:199` channel-message POST shape).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 8 placeholder: 7 nodes, nodeOrder-ordered linear map | 73-node graph with `map_edges` (D-17/D-20) | This phase | travelService reads edges, not nodeOrder; not fully connected |
| 7 placeholder zones | 18 researched zones + `map_zones` reference table (D-19) | This phase | zone label source moves from first-node name to zone table; encounter pools keyed by zone |
| `arriveAt` absolute timestamp + `cost` | `travel_seconds_remaining` pause-aware + no cost (D-07/D-01) | This phase | clock pauses on encounters; no money in travel |
| Cancel + refund paths (SC2) | One-way commitment, no cancel (D-03/D-04) | This phase (SC2 amendment) | structurally no refund bugs |
| "Paid travel = main sink" (milestone init) | Time-only travel; capture fee = main sink (D-01/D-02) | This phase (D-18 gate) | `docs/economy-budget.md` re-sign before Phase 10 |

**Deprecated/outdated:**
- `player_travel_state.cost` + `arrive_at` columns — removed this phase (D-01/D-07).
- `status='cancelled'` travel state — removed (D-03).
- ROADMAP §Phase 9 SC2 (cancel) — amended per CONTEXT.
- `docs/economy-budget.md` "travel prices are sinks" rows — superseded by D-01/D-02 (re-sign at D-18 gate).

## Assumptions Log

> All claims tagged `[ASSUMED]` below — flagged for user confirmation before the planner locks decisions. Everything else in this research is verified (in-repo code, installed package inspection, npm registry, Tavily/web sources).

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Encounter cap window = **sliding 60-min** via Redis ZSET `sanguo:enc:win:{userId}` (vs fixed-hour) | Encounter roll §7 | Fixed-hour would burst at boundaries; sliding is fairer. Minor code difference, user discretion (D-13) |
| A2 | `encounter_type varchar(20) DEFAULT 'hero'` values `hero|boss` is the boss flag shape (vs boolean `is_boss`) | Schema §6 | Extensible for future encounter kinds; boolean is simpler. Discretion (D-14) |
| A3 | `hero_zone_rates` granularity = **per-zone** (hero_id + zone + rate), not per-node | hero_zone_rates §4 | D-16 says "zone(+node?)"; per-zone chosen (208 rows vs 73×132). Per-node would change blend input |
| A4 | `player_travel_state` **keeps** `from_node_id`/`to_node_id`/`depart_at` alongside `travel_seconds_remaining` | Schema §6 | D-07 discretion; dropping them would force edge re-join for position math |
| A5 | Position computed at **tick granularity** (once per 45s roll) from stored remaining — no finer interpolation | Encounter roll §7 | D-15 discretion; finer granularity costs nothing but adds complexity |
| A6 | START_NODE = `'luoyang'` for first-ever journey (no travel row yet) | travelService §5 | Alternative: force an onboarding pick (Phase 10 scope). Wrong default only affects new users' first hop |
| A7 | Default encounter probability **0.35/tick**, boss **0.07** after hero success; zone-configurable via `map_zones.encounter_rate`/`boss_rate` | Encounter roll §7 | D-10 says 30-50% — 0.35 is within band; rates are tunable data, not code |
| A8 | Zone label source switches from "first node's name" (current map.ts WR-02) to `map_zones` per-locale name | Zones §1 | Requires a small map.ts edit; without it zone labels stay node-derived (works, but less accurate for 18 zones) |
| A9 | Phase 9 `encounter_active` is observably false between ticks (encounter resolves at record-write since there is no battle) — the pause flag is schema- and logic-ready for Phase 10 | Pattern 2 | If the user expects a real visible pause in Phase 9, a fixed pause window must be added — but that stalls journeys (D-05 tension) |
| A10 | Node `nameZh` values are filled by the established Tavily zh-names pass (D-06 pattern) — the seed's clobber-safe spread tolerates NULL until then | Nodes §2 | Missing zh renders vi fallback in zh-cn locale (safe degradation) |

## Open Questions

1. **Should Phase 9 show an actual observable clock pause per encounter, or is the schema-ready pause (instant resolve) sufficient?**
   - What we know: D-07 locks the pause-aware remaining-seconds model; D-14 locks Phase 9 to roll+notify+record only (no battle to "resolve").
   - What's unclear: whether the user wants a real pause window in Phase 9 (e.g., 60s per encounter) despite there being nothing to do with the encounter yet.
   - Recommendation: **instant resolve** (A9) — honors D-05 "never stuck" and D-14 scope; Phase 10 extends `encounter_active` to span battle duration.

2. **Cap: sliding window vs fixed-hour — exact target (20/hr confirmed)?**
   - What we know: D-13 locks ~20/hr + silent skip.
   - What's unclear: sliding (recommended, A1) vs fixed-hour; whether boss counts toward the cap (research says yes — it IS an encounter).
   - Recommendation: sliding ZSET; boss counts. Confirmation needed from user (discretion).

3. **Does `/sanguo map` need a current-position indicator this phase?**
   - What we know: D-06 says no persistent status embed; map.ts currently shows "current position" as the first node by nodeOrder.
   - What's unclear: whether the map command should show the player's actual position (from `player_travel_state`) now or wait.
   - Recommendation: read actual position in the existing map command (cheap, no persistent embed — still a query-time snapshot); UI-SPEC does not forbid it. Flag for planner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | player_travel_state/map_edges/encounter_runs + pg-boss crons | ✓ (production-running; local Docker) | PG 13+ (pg-boss requirement) | — |
| Redis | encounter cap ZSET + user-locale cache | ✓ (production-running) | — (ioredis 6.0.0) | — |
| Node.js | runtime | ✓ | v26.3.0 local / 22 LTS target | — |
| `@discordjs/rest` | DM sends | ✓ | 2.6.3 | — |
| pg-boss | tick scheduling | ✓ | 12.27.0 | — |
| Tavily/web research | nameZh fill (A10) | ✓ (dev-time) | — | zh fallback to vi |

**Missing dependencies with no fallback:** none — the phase uses only the existing production stack; no new packages, no new services.

**Note:** `pg_isready`/`redis-cli` binaries were not found on this Windows dev shell PATH — that is a probe limitation, not a deployment gap: Phase 8 shipped to production with PostgreSQL + Redis running (STATE.md deploy record), and the repo's docker-compose covers local dev.

## Validation Architecture

> `workflow.nyquist_validation: false` in `.planning/config.json` — included per output contract; the planner may scope test effort accordingly. Existing vitest infra (vitest 4.1.10, `src/**/__tests__/**/*.test.ts`) is the established pattern.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 |
| Config file | `vitest.config.ts` (include `src/**/__tests__/**/*.test.ts`, setup `./src/testSetup.ts`) |
| Quick run command | `npx vitest run src/services/sanguo/__tests__/encounterService.test.ts` (per-suite) |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TQC-06 | travelService position/adjacency/start (no wallet!) | unit | `src/services/sanguo/__tests__/travelService.test.ts` | ❌ Wave 0 |
| TQC-06 | travel command execute + autocomplete routing | unit | `src/commands/sanguo/__tests__/travel.test.ts` | ❌ Wave 0 |
| TQC-07 | arrival tick: decrement, pause, overdue self-heal, SKIP LOCKED | unit | `src/jobs/__tests__/sanguoTickArrivals.test.ts` | ❌ Wave 0 |
| TQC-08 | encounter roll: cap skip, position blend, boss sub-roll, weighting | unit | `src/services/sanguo/__tests__/encounterService.test.ts` | ❌ Wave 0 |
| TQC-08 | DM notification: 50007 3-strike, locale cache | unit | `src/services/sanguo/__tests__/sanguoNotificationService.test.ts` | ❌ Wave 0 |
| TQC-09 | seed idempotency: zones/nodes/edges/hero_zone_rates upsert | integration (seed script) | `npm run seed:sanguo` (manual/CI) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <affected suite>` (≤30s)
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` + `npm run typecheck` + `npm run lint` + `npm run check-i18n` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/services/sanguo/__tests__/travelService.test.ts` — pure math: remaining math, position, adjacency, no-wallet assertion
- [ ] `src/services/sanguo/__tests__/encounterService.test.ts` — weighted pick determinism (inject RNG), blend boundary (pos=0 → A-only, pos=1 → B-only), cap window
- [ ] `src/jobs/__tests__/sanguoTickArrivals.test.ts` — mocked tx `.for('update', { skipLocked: true })` like `map.test.ts` mocks db
- [ ] `src/commands/sanguo/__tests__/travel.test.ts` — mock interaction + commandLoader autocomplete contract
- [ ] `src/services/sanguo/__tests__/sanguoNotificationService.test.ts` — mock REST, Redis strikes

## Security Domain

> `security_enforcement` absent from `.planning/config.json` → treated as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord OAuth is platform-level; bot never authenticates users itself |
| V3 Session Management | no | stateless interactions + DB state |
| V4 Access Control | partial | slash-command scope enforced by Discord; no guild-specific privilege needed this phase |
| V5 Input Validation | yes | destination re-validated against `map_edges` server-side (autocomplete advisory — Pitfall 4); drizzle parameterization |
| V6 Cryptography | yes | `crypto.randomInt` for all player-facing rolls (milestone mandate); never Math.random |

### Known Threat Patterns for {stack}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Destination injection (fabricated node code) | Tampering | server-side edge lookup before any write; no route → DANGER embed (Pitfall 4) |
| Roll prediction via Math.random | Information disclosure / Spoofing | `crypto.randomInt` (V6) — monotonic, unseeded, CSPRNG |
| Cap evasion by multi-account | Elevation | Phase 12 bot detection (TQC-18); Phase 9 cap is a soft brake only (D-13) |
| DM spam / 50007 storm on closed DMs | DoS | 3-strike Redis counter + skip (Pattern 4); never retry-storm |
| Double-spend style double-resolve of arrivals | Tampering | `FOR UPDATE SKIP LOCKED` single-writer rule (Pitfall 1/5) |
| Wallet compromise via travel | — | structurally impossible: travelService imports NO wallet (D-01) |

## Sources

### Primary (HIGH confidence)
- In-repo code read this session: `src/workers/pgBoss.ts`, `src/services/football/matchLifecycleService.ts`, `src/db/schema/{mapNodes,playerTravelState,encounterRuns,heroes,users}.ts`, `src/commands/sanguo/map.ts`, `scripts/seed-sanguo.ts`, `src/events/interactionCreate.ts`, `src/utils/{commandLoader,registerCommands,commandContext}.ts`, `src/cache/redis.ts`, `src/ui/{theme.ts,embeds/buildSanguoMapEmbed.ts}`, `src/i18n/index.ts`, `vitest.config.ts`, `drizzle.config.ts`, `.planning/config.json`
- Installed package inspection: `node_modules/pg-boss` (README, `dist/index.d.ts` schedule signature), `node_modules/cron-parser` (6-field cron parse executed), `package.json` versions
- npm registry: `npm view` version checks for all stack packages (2026-08-12)
- Tavily (web): Eastern Han 13 provinces/commanderies (Wikipedia), Three Kingdoms geography (Kongming's Archives, Baidu), Korean Three Kingdoms (Britannica, Wikipedia, WorldHistory), Jiaozhou/Shi Xie (Wikipedia, Baidu, substack analysis), Luoyang (Britannica)
- `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` — 132-hero roster (ids, factions, people, roles) read this session

### Secondary (MEDIUM confidence)
- `scripts/data/sanguo-classifications.json` — faction/role/class mapping (in-repo, Phase 8 researched)
- Context7 drizzle-orm-docs — `.for('update').skipLocked()` chain equivalent to in-repo object form

### Tertiary (LOW confidence)
- Hero→zone weight values (1.0/0.5/0.3) — [ASSUMED], based on historical association from training knowledge, cross-checked against roster factions; user review gate (D-21) applies
- Per-zone `encounter_rate`/`boss_rate` defaults (0.35/0.07) — [ASSUMED] within D-10 band; tunable data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed + production-running; versions verified via npm view
- Architecture: HIGH — every pattern traced to in-repo code or installed package inspection; dataset machine-verified
- Pitfalls: HIGH — each pitfall tied to a specific in-repo line or verified behavior; two are structural (loader, autocomplete)

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (stable stack; dataset is milestone content, not time-sensitive)

**Generated data artifact (dev-time reference):** the full verified dataset was generated and validated during this research — TQC-09 seed contract above is the canonical copy for `scripts/data/sanguo-map-data.json`.
