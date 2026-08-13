---
phase: 09-travel-encounters
reviewed: 2026-08-13T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - scripts/seed-sanguo.ts
  - src/commands/sanguo/map.ts
  - src/commands/sanguo/travel.ts
  - src/db/schema/encounterRuns.ts
  - src/db/schema/heroZoneRates.ts
  - src/db/schema/index.ts
  - src/db/schema/mapEdges.ts
  - src/db/schema/mapZones.ts
  - src/db/schema/playerTravelState.ts
  - src/events/interactionCreate.ts
  - src/services/sanguo/encounterService.ts
  - src/services/sanguo/travelCheckInService.ts
  - src/services/sanguo/travelService.ts
  - src/ui/components/sanguoTravelButtons.ts
  - src/ui/components/sanguoTravelDestinationMenu.ts
  - src/ui/embeds/buildSanguoArrivalEmbed.ts
  - src/ui/embeds/buildSanguoEncounterEmbed.ts
  - src/ui/embeds/buildSanguoTravelReplyEmbed.ts
  - locales/vi/sanguo.json
  - locales/en/sanguo.json
  - locales/zh-cn/sanguo.json
  - scripts/data/sanguo-map-data.json
  - migrations/0018_sanguo_travel_map.sql
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-08-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the Phase 09 (Travel & Encounters) implementation: the time-only travel domain service (travelService), the pull-based check-in engine with per-minute encounter rolls (travelCheckInService), the pure crypto-RNG encounter roll math (encounterService), the interaction routing (interactionCreate + travel.ts component handlers), the UI components/embeds, the TQC-09 schema + migration, the seed data (sanguo-map-data.json), and the seed script.

**Invariant verification (all PASS):**
- **D-01** — travel costs only time: `travelService.ts` and `travelCheckInService.ts` import no wallet/balance API; no deduction call anywhere in the travel path. ✓
- **D-03** — no cancel path: `player_travel_state.status` is 'traveling'|'arrived' only; no 'cancelled' value exists in schema, migration, or handlers. ✓
- **D-22/D-23** — pull-based check-in: no cron, no `@discordjs/rest`, no DM path; the journey resolves only when the user invokes `/sanguo travel` (or presses a travel component). ✓
- **D-24** — stop-at-first hit: `checkInTravel` breaks the per-minute loop on the first `roll.hit`. ✓
- **crypto RNG** — all player-facing rolls ride `crypto.randomInt` via `cryptoUniform()`; no `Math.random` in production code (only a test assertion string). ✓
- **Single-writer rule** — `travel_seconds_remaining`/`updatedAt` are written only inside the `checkInTravel` FOR UPDATE tx, `startTravel` (locked), and the ack handler; `makeDefaultRollMinute` writes only `encounter_runs` + the Redis cap window. ✓
- **Cap-first (D-13, Pitfall 7)** — the ZSET cap check runs before the roll in `makeDefaultRollMinute` (lines 95-102 before 145). ✓
- **F8** — `Number()` conversion of Drizzle numeric-string `rate`/`encounterRate`/`bossRate` at travelCheckInService.ts:133-136, 144, 148. ✓
- **i18n** — no hardcoded user-facing strings beyond static Discord command names (eslint-disabled) and emoji; content names come from DB per-locale columns. Dataset validated: 18 zones / 73 nodes / 162 edges / 208 rates, no dangling zone/edge/hero references, all 67 representative heroes resolve to emoji, rate values fit numeric(4,2). ✓

The check-in clock math (elapsed → counted minutes → per-minute decrement + roll → hit-minute pin → ack resume) is internally consistent; arrival self-heal is sound. The findings below are interaction-state, data-lifecycle, and display-correctness defects, none of which block the core loop but several of which will degrade real usage.

## Warnings

### WR-01: Ack button is not bound to the specific pending encounter — a stale press silently clears the *current* encounter

**File:** `src/commands/sanguo/travel.ts:486-523`

**Issue:** `handleAckPress` clears `encounterActive` on the presser's **current** travel row regardless of which encounter the pressed button belonged to. The ack customId (`sanguo:travel:ack`) carries no encounter/travel identifier. Scenario: a user hits an encounter (embed + ack button rendered). They later ack, finish the journey, start a new one, and hit a *second* encounter. If they now press the still-visible ack button from the *first* message (component interactions are valid for ~15 min), the handler clears the **second** encounter's `encounterActive` — the second encounter is never displayed (F2 re-fetch is only consulted while `encounterActive` is true) and its `encounter_runs` row is orphaned as `pending`. The player silently misses an encounter they were owed.

**Fix:** Bind the press to the encounter. Suffix the ack customId with the encounter run id (or travel row id): `sanguo:travel:ack:{runId}` and have the handler verify the pending run matches before clearing:

```ts
// sanguoTravelButtons.ts
export function buildAckButton(t: TFunction, runId?: number): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(runId ? `${ACK_BTN_ID}:${runId}` : ACK_BTN_ID)
    .setLabel(t('sanguo:travel.ack_button'))
    .setStyle(ButtonStyle.Secondary);
}

// travel.ts handleAckPress — route via customId.startsWith(ACK_BTN_ID) in interactionCreate
const runId = Number(interaction.customId.slice(ACK_BTN_ID.length + 1));
await db.transaction(async (tx) => {
  const [row] = await tx.select().from(playerTravelState)
    .where(eq(playerTravelState.userId, userRow.id)).for('update');
  const [pending] = await tx.select().from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userRow.id), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id)).limit(1);
  if (row?.encounterActive && (!Number.isNaN(runId) ? pending?.id === runId : true)) {
    await tx.update(playerTravelState)
      .set({ encounterActive: false, updatedAt: new Date() })
      .where(eq(playerTravelState.userId, userRow.id));
  }
});
```

### WR-02: `encounter_runs.status` stays `'pending'` forever — unresolved history accumulates

**File:** `src/commands/sanguo/travel.ts:505-518` + `src/db/schema/encounterRuns.ts:24`

**Issue:** The ack handler clears `encounterActive` but never transitions the corresponding `encounter_runs` row out of `'pending'`. Every encounter ever rolled leaves a permanent `pending` row. Consequences: (a) `encounter_runs_user_status_idx` on `(user_id, status)` degrades to an all-pending index, so any future "count pending encounters" query overcounts the full history; (b) the F2 re-fetch (`ORDER BY id DESC LIMIT 1`) still works today, but any Phase 10 battle flow that consumes `pending` rows will pick up stale rows from previous journeys; (c) audit semantics are wrong — `pending` should mean "awaiting the player's ack", not "recorded".

**Fix:** In `handleAckPress`, inside the same transaction that clears `encounterActive`, mark the latest pending run resolved (keep the status value in sync with the schema, e.g. add `'acknowledged'`/`'resolved'`):

```ts
await tx.update(encounterRuns)
  .set({ status: 'resolved' })
  .where(and(
    eq(encounterRuns.userId, userRow.id),
    eq(encounterRuns.status, 'pending'),
  ));
```

### WR-03: Seed full-replace invalidates `player_travel_state` node ids — reseeding locks users out of travel permanently

**File:** `scripts/seed-sanguo.ts:407-409` + `src/services/sanguo/travelService.ts:43-62` + `src/commands/sanguo/travel.ts:298-311`

**Issue:** The D-20 full-replace flow deletes all `map_nodes` and re-inserts them, assigning **new serial ids** every run (`nodeIdByCode` proves the ids are re-created). `player_travel_state.from_node_id`/`to_node_id` are plain integers with no FK, so nothing prevents them from dangling. After any reseed against a non-empty DB, every existing travel row points at deleted node ids. `getCurrentPosition` then throws `NODE_NOT_FOUND` — and because `travel.ts execute()` calls `getCurrentPosition` **before** the traveling/encounter-active gate (line 299), the check-in path is unreachable: the user gets a generic error embed, their journey can never self-heal to `arrived`, and they can never start a new journey. This is a permanent per-user lockout of the entire travel feature, introduced by the documented "re-running updates changed content" flow.

**Fix:** Make the seed (or the service) reseed-resilient. Preferred: delete `player_travel_state` rows in the map-replace section (travel is transient state; positions reset to START_NODE), e.g.:

```ts
// seed-sanguo.ts, before deleting mapNodes
await db.delete(schema.playerTravelState); // stale node ids after full-replace
```

Alternatively, harden `getCurrentPosition` to fall back to `START_NODE` when the stored node id no longer resolves, so an in-flight journey self-heals at the next check-in instead of throwing:

```ts
const [node] = await db.select().from(mapNodes).where(eq(mapNodes.id, nodeId));
if (!node) return resolveStartNode(); // fall back to START_NODE instead of throwing
```

### WR-04: `/sanguo map` "Vị trí hiện tại" always shows the map's first node, never the player's position

**File:** `src/commands/sanguo/map.ts:118-122`

**Issue:** The embed's "current position" field is fed `rows[0]` — the node with the lowest `nodeOrder` across the whole map (i.e. Lạc Dương) — not the player's actual position. The map command never reads `player_travel_state`/`getCurrentPosition`, so the field labeled "Vị trí hiện tại" / "Current position" is always factually wrong for any player who has traveled. The adjacent destination picker in `/sanguo travel` shows the true position, so the two commands contradict each other.

**Fix:** Resolve the real position before building the embed:

```ts
const pos = await getCurrentPosition(user.id); // needs user id — destructure `user` from fetchCommandContext
const currentRow = await db.select().from(mapNodes).where(eq(mapNodes.id, pos.nodeId)).limit(1);
// ...
currentZoneName: currentRow ? pickName(currentRow, locale) : '',
```

### WR-05: Map-data full-replace in the seed is not transactional — a mid-run crash leaves a broken map

**File:** `scripts/seed-sanguo.ts:405-505`

**Issue:** The map section runs three deletes and ~450 inserts outside any `db.transaction`. The header documents "the final state is always exactly 18/73/162/208 rows", but a crash or connection drop between the deletes and the last insert leaves a partially deleted graph (e.g. nodes deleted, edges half-inserted, or nodes inserted with no edges/rates). Re-running fixes it (the flow is idempotent), but until then the runtime map is broken and the travel command renders NO_ROUTE at arbitrary nodes. The heroes/factions sections above are also unbundled, so a mid-crash can leave content half-updated.

**Fix:** Wrap the whole `seed()` body (or at least the map-replace section) in a single `db.transaction`:

```ts
await db.transaction(async (tx) => {
  await tx.delete(schema.mapEdges);
  await tx.delete(schema.heroZoneRates);
  await tx.delete(schema.mapNodes);
  // ... all zone/node/edge/rate upserts via tx
});
```

Note the deletes must still be first inside the tx, and `player_travel_state` cleanup from WR-03 belongs in the same tx.

## Info

### IN-01: `capCheck` in `RollMinuteContext` is dead contract

**File:** `src/services/sanguo/travelCheckInService.ts:63,257-260`

The production `makeDefaultRollMinute` performs its own ZSET cap check and never reads `ctx.capCheck`; the parameter only serves the test-injected roll. Either remove it from the context type or have the default roll consume it, so the cap-first contract has a single source of truth.

### IN-02: `pickName` duplicated in three modules

**File:** `src/commands/sanguo/map.ts:46-50`, `src/commands/sanguo/travel.ts:54-58`, `src/ui/components/sanguoTravelDestinationMenu.ts:19-23`

Identical per-locale node-name pickers in three files (plus a fourth variant in `buildSanguoMapEmbed.ts`'s callers). Extract to a shared `pickNodeName(node, locale)` helper in `i18n/` or a `sanguo/names` module; the zh-cn null-fallback logic diverging in one copy is a latent inconsistency.

### IN-03: Literal `'?'` and empty `hero_emoji` produce malformed user-facing text

**File:** `src/commands/sanguo/travel.ts:134,223-224`, `src/ui/embeds/buildSanguoEncounterEmbed.ts:44-45`

When node lookup fails, the embed shows a bare `?`; when a hero has no emoji, the encounter body renders `**{{hero_emoji}} {{hero}}**` with an empty substitution → "chạm trán ****". Use i18n fallback keys (e.g. `sanguo:travel.unknown_node`) and conditionally render the emoji+space only when present.

### IN-04: `humanizeEta` rounding: 59m59s renders as "~60 minutes"

**File:** `src/ui/embeds/buildSanguoTravelReplyEmbed.ts:24`

`Math.max(1, Math.round(3599/60))` = 60 → "~60 phút" instead of "~1 giờ". Round-trip `seconds >= 3600` first or floor the minutes, e.g. check `seconds > 3599` or round from the full seconds before formatting.

### IN-05: Status reply reuses the "Journey started" title

**File:** `src/commands/sanguo/travel.ts:219-231`

The check-in `status` mode renders `buildSanguoTravelReplyEmbed`, whose title is always `sanguo:travel.started_title` ("🧭 Hành trình bắt đầu"). A user checking an in-progress journey is told the journey just started. Add a `titleKey` (or a `started: boolean`) to the embed data.

### IN-06: Dead i18n keys and a misindented line

**File:** `locales/*/sanguo.json:2-9,14-16` + `src/events/interactionCreate.ts:526`

`cmd.*` keys duplicate the hardcoded command descriptions (never looked up at runtime), and `map.empty`/`map.zones` are unused (`map.ts` builds zones in content; empty state uses `empty_hint`). Line 526 in `interactionCreate.ts` is over-indented (`const errorEmbed` at 6 spaces inside a 4-space block) — cosmetic, but it suggests a mis-merge.

### IN-07: First-journey concurrent Start presses race on INSERT

**File:** `src/services/sanguo/travelService.ts:173-174`

`SELECT ... FOR UPDATE` cannot lock a nonexistent row, so two concurrent first-journey starts both reach `INSERT`, and one fails with a `23505` unique violation surfaced as a generic error embed (the `ALREADY_TRAVELING`/`NO_ROUTE` branches never see it). Low impact (user presses Start again), but the error path should catch `23505` and render the check-in/status path instead.

---

_Reviewed: 2026-08-13T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
