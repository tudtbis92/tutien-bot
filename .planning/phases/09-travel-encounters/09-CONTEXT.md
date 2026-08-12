# Phase 9: Travel & Encounters - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers the real-time core loop of the Tam Quốc Collection: travel between map nodes on a graph-based map (time-only cost, one hop per journey), the `sanguoTick` cron infrastructure (separate arrival-resolution and encounter-roll ticks in the manager process), encounter rolls with position-blended zone pools, per-user caps, and the TQC-09 map/zone data research (nodes, edges, hero distribution) consumed as seed data.

**Requirements in scope:** TQC-06 (travelService + `/sanguo travel`), TQC-07 (sanguoTick cron + REST notifications), TQC-08 (encounter system + caps), TQC-09 (map/zone data research).

**Not in scope:** Battle engine, capture fee mechanics implementation, capture costs (Phase 10 — but the economy re-sign-off gated by this phase), legion battle / chemistry (Phase 11), anti-abuse bot detection (Phase 12).

**⚠ ROADMAP amendment required:** SC2 ("User can cancel a journey mid-travel via the travel-cancel component") is **invalidated** — travel is a one-way commitment with no cancel. SC2 must be rewritten (e.g., "User cannot cancel a journey; travel is a one-way commitment; position always equals the last arrived node; travel state resolves at arrival"). Planners must update ROADMAP.md §Phase 9 SC2.

**⚠ Economy budget re-sign-off required:** The milestone-init decision "paid travel = main Linh thạch sink" is inverted. Travel is now time-only (free); capture fee (per attempt) becomes the main sink (Phase 10 mechanics, but the budget doc `docs/economy-budget.md` must be updated + re-signed per D-18 before Phase 10 content ships).

</domain>

<decisions>
## Implementation Decisions

### Charge & Cost Model (TQC-06)

- **D-01:** **Travel costs only TIME, never Linh thạch.** The player selects a destination, travel begins based on the time-distance of the hop; Linh thạch is only spent on encounter-related costs and capture attempts. `travelService` does NOT call `wallet.deductBalance` — it is a pure time/state service. — **Reversibility:** one-way — inverts the milestone-init "paid travel" economy decision (STATE.md) and `docs/economy-budget.md` "travel prices are sinks"; undoing requires a new economy sign-off.
- **D-02:** **Capture fee per attempt is the main sink** (encounter free, tốn khi bắt). Capture mechanics + fee execution belong to Phase 10 (TQC-11), but the economy consequence belongs here: **`docs/economy-budget.md` must be updated and re-signed (D-18) to move the sink from travel → capture fee before Phase 10 content ships.** — **Reversibility:** one-way — the D-18 design gate is the milestone's economic guardrail.
- **D-03:** **No cancel — travel is a one-way commitment.** The travel-cancel component is removed entirely. Rationale (user): when canceling mid-journey, a new journey's start node would be ambiguous; removing cancel keeps position always defined = last arrived node. `player_travel_state.userId.unique()` already prevents a new journey while traveling. ROADMAP SC2 must be amended accordingly. — **Reversibility:** one-way — SC2 amendment + no cancel path in tick; re-adding cancel needs refund logic + position model work.
- **D-04:** **No refund path exists anywhere in travel.** Money is never involved in travel, so cancel/refund/fail-refund bugs are structurally impossible. Tick only handles arrive (+ overdue self-heal).

### Fail & Self-Heal (TQC-07)

- **D-05:** **sanguoTick self-heals overdue journeys — "đến trễ", never stuck forever.** A journey past its counted travel time is resolved at the next tick sweep (`FOR UPDATE SKIP LOCKED` prevents double-resolve). No refund, no failed status — only late arrival. — **Reversibility:** reversible.

### Travel UX & Time Model (TQC-06)

- **D-06:** **Only event notifications, no persistent status embed.** The player is notified on arrival and on encounter (both via DM); there is no always-on travel status embed or live countdown UI. — **Reversibility:** reversible.
- **D-07:** **Travel time pauses during encounters.** The travel clock stops counting while an encounter is active and resumes when the encounter is resolved. `player_travel_state` therefore stores **`travel_seconds_remaining`** (decrementing) instead of a fixed `arriveAt` timestamp — the current schema's `arriveAt timestamp notNull` must be replaced/adapted. The tick subtracts elapsed counted time; while an encounter is active the tick does not subtract. Arrival fires when remaining reaches 0. — **Reversibility:** costly — touches the Phase 8 schema (`player_travel_state.ts`) and the tick logic.
- **D-08:** **One hop per `/sanguo travel`** — a single adjacent-node journey (A→B). No multi-hop routes, no route planning. The player must arrive and re-issue travel for the next hop. — **Reversibility:** reversible.
- **D-09:** **Cannot travel while already traveling.** A journey in flight blocks a new one (matches `userId.unique()`); combined with the clock-pause-on-encounter this is the anti-spam mechanism — no separate departure cooldown needed.

### Encounter Roll Design (TQC-08)

- **D-10:** **Encounter rolls happen periodically during travel**, keyed to counted travel time (pause-aware), not wall-clock. **Probability per tick scan** (e.g., each tick → probability by zone, ~30-50%); the ~20/hr cap arises naturally from bounded hop durations plus the cap itself. — **Reversibility:** reversible.
- **D-11:** **Two separate sanguoTick cron jobs:** (a) arrival-resolution tick (every minute), (b) encounter-roll tick (~30-60s). Both run in the manager process only (matches the existing pg-boss pattern in `src/workers/pgBoss.ts` — crons only in bot.ts/manager). — **Reversibility:** reversible.
- **D-12:** **Notifications for both arrivals and encounters go to the player via DM** (REST through `@discordjs/rest`, mirroring `matchLifecycleService.ts`), working across shards regardless of which shard hosts the user. — **Reversibility:** reversible.
- **D-13:** **On reaching the ~20/hr cap, encounter rolls are skipped** — the player keeps traveling normally but receives no new encounters until the cap window clears. Travel itself is never blocked by the cap. — **Reversibility:** reversible.
- **D-14:** **Boss thường is a separate low-probability encounter roll** (~5-10% replacing a successful normal hero roll, zone-based). **In Phase 9 the boss is only rolled + notified + recorded** (`encounter_runs` with a boss flag/type) — battle/capture/boss data/đội hình/way of fielding troops are Phase 10-11 (battle engine TQC-10, legion chemistry TQC-17). — **Reversibility:** reversible.

### Position-Blended Encounter Pool (TQC-08 + TQC-09)

- **D-15:** **Encounter pool is blended by current position along the edge.** Position = `1 − (remaining seconds / total hop seconds)` = fraction of the hop completed (pause-exempt time). Weights of node A's hero pool vs node B's pool scale linearly with that fraction (near A → A-heavy, near B → B-heavy). Formula locked; exact weighting function is linear per user decision. — **Reversibility:** reversible.
- **D-16:** **Hero→zone mapping is many-to-many with per-hero-per-zone rates** — a hero can appear in multiple zones at different rates. Requires a dedicated table (e.g., `hero_zone_rates` / `encounter_pool`): hero_id + zone(+node?) + rate. **Rates are set by research** (not tier-derived, not uniform) — the researcher decides the concrete numbers from lore/historical association. — **Reversibility:** costly — schema + seed + roll logic all depend on this mapping shape.

### Map Structure & Research (TQC-09)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/ROADMAP.md` §Phase 9 — Goal, Success Criteria (5, with SC2 pending amendment), Depends, Requirements mapping TQC-06..09, UI hint
- `.planning/REQUIREMENTS.md` §v3 Travel & Encounters — TQC-06..09 with full acceptance detail
- `.planning/PROJECT.md` — Stack constraints, Key Decisions table, milestone v3 target features
- `.planning/STATE.md` — Milestone v3 state; **pending todo: "Resolve charge-on-arrival vs deduct-at-departure conflict (research gap)" — RESOLVED here (travel = time-only, no charge model)**; accumulated decisions (IV, factions, chemistry)
- `.planning/notes/sanguo-game-design.md` — Core loop, encounter tiers (boss thường v1), progression, economy links
- `docs/economy-budget.md` — **MUST be updated + re-signed (D-18): sink moves from travel → capture fee**; net-sink/neutral D-19 hard constraint still applies; gross flow < ~416/hr magnitude bound
- `AGENTS.md` — Technology Stack (pg-boss, ioredis, i18next versions)

### Existing Code (Integration Points)
- `src/db/schema/mapNodes.ts` — Current node schema (code, name_*, zone, node_order, representative_hero_id) — placeholder nodes to be replaced (D-20); consider coords/zone evolution
- `src/db/schema/playerTravelState.ts` — `arriveAt timestamp notNull` must change to pause-aware remaining-seconds model (D-07); `userId.unique()` stays
- `src/db/schema/encounterRuns.ts` — encounter history (zone, heroId nullable, status 'pending') — boss flag/type added (D-14)
- `src/services/wallet.ts` — NOT called by travel (D-01); referenced for capture-fee sink context in Phase 10
- `src/commands/sanguo/map.ts` — Existing `/sanguo map` scaffold — travel picks destination from adjacent nodes (autocomplete over edges)
- `src/workers/pgBoss.ts` — Cron registration pattern: jobs only in bot.ts/manager, shards send-only; `schedule()` idempotent — sanguoTick (2 jobs, D-11) registers here
- `src/services/football/matchLifecycleService.ts` — REST-only DM/notification pattern via `@discordjs/rest` (D-12 cross-shard notifications)
- `src/db/schema/formations.ts` + `formation_slots` + `user_formations` — Phase 11 legion chemistry (deferred, not Phase 9)
- `scripts/seed-sanguo.ts` — Idempotent seed (D-11 upsert pattern) — replaced node data + new hero_zone_rates + edges seed (D-16/17/20)

### External Content Sources (dev-time only — NEVER at runtime)
- `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` — 132 heroes: id, name (VI), en, title, faction, weapon, detail, gender, people, role — source for research hero-zone association (D-16/18)
- `E:\Saeth\sanguo_assets\assets\emojis.json` — 1056 emoji, animated `<a:name:id>` markup (D-21 Phase 8)

### No external specs
No ADRs beyond milestone design gates captured in `.planning/STATE.md`, `docs/economy-budget.md`, and this document. Research (D-21) produces the map/zone/hero-distribution data contract consumed by the seed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/workers/pgBoss.ts` — registration + `schedule()` pattern for the two sanguoTick crons (D-11); `createQueue` before `schedule`; `localConcurrency` + per-job try/catch
- `src/services/football/matchLifecycleService.ts` — `@discordjs/rest` REST DM/notification pattern to reuse for encounter/arrival DMs (D-12); `getGuildLocale` style locale resolution for DM content
- `src/db/schema/mapNodes.ts` — per-locale content columns (name_vi/en/zh) pattern (D-05 Phase 8) carries into the new node data
- `scripts/seed-sanguo.ts` — idempotent upsert (ON CONFLICT DO UPDATE) for nodes/heroes/items — extended for edges + hero_zone_rates (D-16/17)
- `src/utils/commandLoader.ts` + `src/commands/sanguo/map.ts` — `/sanguo travel` subcommand slots in here; destination autocomplete over adjacent edges (D-08/17)
- `src/ui/embeds/buildSanguoMapEmbed.ts` + `src/ui/theme.ts` — embed builder pattern for event DM notifications (D-06)

### Established Patterns
- **pg-boss crons only in manager** (`bot.ts`) — shards are send-only; sanguoTick follows this (D-11)
- **`FOR UPDATE SKIP LOCKED`** — Phase 8 / football order-matching pattern; required by TQC-07 for tick scans (D-05)
- **Content-vs-UI split** (D-07 Phase 8) — node/zone/hero names in DB per-locale columns, UI strings in i18next `sanguo` namespace
- **i18n zero-hardcoded-strings** — eslint-plugin-i18next + `npm run check-i18n` — new travel/encounter UI strings go into `sanguo` namespace
- **Wallet discipline (D-03 Phase 8)** — travel touches no balance (D-01); future capture fee goes through `wallet.deductBalance`
- **crypto.randomInt() for player-facing rolls** — encounter rolls use crypto RNG (milestone decision), not pure-rand (pure-rand is battle-replay only, Phase 10)

### Integration Points
- `src/commands/sanguo/travel.ts` (new) ← adjacency destination picker + travel start (D-08)
- `src/jobs/sanguoTickArrivals.ts` + `src/jobs/sanguoTickEncounters.ts` (new) ← registered in `src/workers/pgBoss.ts` (D-11)
- `src/db/schema/playerTravelState.ts` ← remaining-seconds + pause-aware fields (D-07)
- `src/db/schema/mapNodes.ts` + `map_edges` + `hero_zone_rates` (new) ← research-fed seed (D-16/17/20)
- `scripts/seed-sanguo.ts` ← replaced node data + edges + hero-zone rates reseed (D-20)
- REST notification service (new, or extend matchLifecycleService pattern) ← DM on arrival/encounter cross-shard (D-12)

</code_context>

<specifics>
## Specific Ideas

- **Travel as time currency, not money**: user explicitly redesigned the core loop — moving costs real time, Linh thạch only enters at capture ("việc di chuyển giữa các node chỉ tốn time không tốn linh thạch, chỉ khi encounter và thực hiện bắt tướng thì mới tốn linh thạch").
- **No cancel is a position-model decision, not just UX**: "khi cancel thì nếu bắt đầu một hành trình mới thì điểm bắt đầu sẽ tính trên node nào khi ở giữa hành trình?" — removing cancel keeps position always = last arrived node.
- **Clock pauses on encounter**: "trong khoảng thời gian này thì người chơi sẽ được roll encounter và sẽ dừng đếm thời gian khi encounter, thời gian chỉ tiếp tục đếm khi encounter xử lý xong" — the player owns their travel window.
- **Real Three Kingdoms geography**: map covers Korea, ancient Vietnam, steppe tribes — not just the Chinese heartland — matching the foreign rulers in the roster.
- **Position-based pool blend**: "vị trí hiện tại gần node A thì tăng tỷ lệ tướng node A lên" — proximity to a node shifts the encounter pool toward that node's heroes.
- **Boss thường stays a roll+notify concern in Phase 9** — its battle/đội hình/legion mechanics are explicitly Phase 10-11 (user asked and we scoped it out).
- **Economy re-sign-off is a hard gate** — D-18 requires `docs/economy-budget.md` to be updated + re-signed with the new capture-fee sink before Phase 10 content.

</specifics>

<deferred>
## Deferred Ideas

- **Capture fee mechanics + per-attempt pricing** — Phase 10 (TQC-11); this phase only flags the economy re-sign-off requirement (D-02).
- **Boss thường data/đội hình/troop composition** (define sẵn vs tự random) — Phase 10 battle engine + Phase 11 legion chemistry; user explicitly confirmed "Phase 9 chỉ roll + notify".
- **Quân đoàn battle (3+9 chemistry)** — Phase 11 (TQC-17); formations schema already designed in Phase 8 post-gate.
- **Economy budget re-sign-off numbers** — needs Phase 10 capture-fee values; the doc update itself should happen before Phase 10 content, not necessarily in Phase 9 execution.
- **Anti-abuse bot detection** — Phase 12 (TQC-18); encounter caps (D-13) are the Phase 9-era brake only.

</deferred>

---

*Phase: 09-travel-encounters*
*Context gathered: 2026-08-12*
