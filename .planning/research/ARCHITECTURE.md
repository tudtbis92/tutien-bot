# Architecture Research: Tam Quốc Collection Integration

**Domain:** Pokemon-style hero-collection minigame (real-time travel, encounters, auto-battle, capture, IV progression) integrated into an existing multi-shard Discord RPG bot (TuTien Bot)
**Researched:** 2026-08-10
**Confidence:** HIGH (all integration-surface facts verified by direct read of the current codebase; external patterns cross-checked via web research)

---

## 1. System Overview (Actual Implemented Architecture + New Game)

The current codebase (verified 2026-08-10) differs from the 2026-04-11 research plan in important ways: it uses discord.js **built-in** ShardingManager (not hybrid sharding), pg-boss workers/crons run **only in the manager process** (shards are send-only), money operations use **atomic `UPDATE ... WHERE balance >= X` guards** (no separate ledger table exists), and i18n uses per-feature namespaces (`common, game, combat, marketplace, admin, football`). The new game must integrate with what actually exists.

```
┌────────────────────────────────────────────────────────────────────┐
│  bot.ts — ShardingManager (ONE process)                            │
│    preflight (DB/Redis ping) → registerCommands() → initI18n()     │
│    → initPgBoss() [workers + crons + supervise + migrate]          │
│    → health server → manager.spawn()                               │
├────────────────────────────────────────────────────────────────────┤
│  shard.ts × N — per-shard processes (discord.js Client)            │
│    initI18n() → initPgBossForShard() [SEND-ONLY] → loadCommands     │
│    → loadEvents → client.login()                                   │
│    interactionCreate.ts routes slash commands + customIds          │
├────────────────────────────────────────────────────────────────────┤
│  NEW: src/commands/sanguo/ + src/components/sanguo/                │
│    map · travel · heroes · battle · capture · shop · bag           │
│    customId prefix: "sanguo:" (registry-dispatched)                │
├────────────────────────────────────────────────────────────────────┤
│  NEW: src/services/sanguo/  (pure services, like breakthrough.ts)  │
│    travelService · battleEngine · captureService · shopService     │
│  SHARED NEW: src/services/wallet.ts  (deduct/credit balance)       │
├────────────────────────────────────────────────────────────────────┤
│  NEW: src/jobs/sanguoTick.ts — pg-boss cron in MANAGER only        │
│    travel-encounter tick: scan due encounters + arrivals            │
│    → battleEngine → write results → notify via REST (no shard)     │
├────────────────────────────────────────────────────────────────────┤
│  Stores                                                             │
│  PostgreSQL (source of truth): users · heroes · user_heroes ·      │
│    map_nodes · player_travel_state · sanguo_battles ·              │
│    sanguo_items/user_sanguo_items · encounter_runs                 │
│  Redis (L1 cache ONLY — never truth): travel cooldowns, map view   │
│    cache, capture cooldowns                                        │
│  Static: src/assets/sanguoEmojis.ts (GENERATED from emojis.json)   │
└────────────────────────────────────────────────────────────────────┘
```

**Non-negotiables inherited from the codebase:**
- Currency is `users.balance` (bigint). **Never `number`** for money (`mode: 'bigint'`, display via `formatBalance()`).
- DB is source of truth; Redis is L1 cache only — the codebase states this invariant explicitly (`characters.ts`: "DB-backed cooldown state — survives shard restarts (Redis is L1 cache only)").
- All jobs/crons registered in `pgBoss.ts registerJobs()` (manager only). Shards call `boss.send()` fire-and-forget.
- Zero hardcoded user-facing strings (ESLint `i18next/no-literal-string` enforced).

---

## 2. Integration Decisions (Answers to the 6 Key Concerns)

### 2.1 New DB Schemas — FK to `users.id`, NOT `characters.id`

**Decision: All new player-owned tables reference `users.id`.** Precedent already in the codebase: `footballBets.userId → users.id`, `farmingAccounts.userId → users.id`. The new game is explicitly "data-separate" — `characters` is the xianxia progression row and the two games must not be coupled. `users.balance` is the only shared surface (the wallet).

**Catalog vs instance split (like items / character_items):**
- `heroes` — static catalog (seeded idempotently, precedent: `seed.ts` / `gather_pool_items`): `code` (e.g. `'abt'`, matches emojis.json key prefix), `nameI18nKey` (`sanguo:heroes.abt.name`), `rarity` (capture-rate tier), `baseStats` jsonb (template stats), `emojiKeyPrefix`.
- `user_heroes` — per-player instances: `userId → users.id`, `heroId → heroes.id`, `ivs` jsonb (6 stats, 0–31 each), `level`, `tier` (0→1 @20, 1→2 @50, 3 event-gated), `isStar` (star variant), `captureCount` (duplicates → hồn ngọc), `capturedAt`.

New files in `src/db/schema/`, exported from `schema/index.ts` under a `// Phase 07: Tam Quốc Collection` comment (existing grouping convention): `heroes.ts`, `user_heroes.ts`, `map_nodes.ts`, `player_travel_state.ts`, `sanguo_battles.ts`, `sanguo_items.ts` (+ `user_sanguo_items.ts`), `encounter_runs.ts`. Migrations via `drizzle-kit generate/migrate` (uses `DATABASE_URL_DIRECT`; runtime uses PgBouncer `DATABASE_URL`).

### 2.2 Travel + Encounter State — DB Rows are the Truth, Redis is Read-Cache

**Decision: `player_travel_state` row per player with derived timestamps; a periodic pg-boss tick processes due events. Redis holds only display/cooldown caches.**

```typescript
// src/db/schema/player_travel_state.ts (sketch)
export const travelState = pgTable('player_travel_state', {
  userId: integer('user_id').primaryKey().references(() => users.id),
  status: travelStatusEnum('status').notNull().default('idle'), // idle | traveling
  fromNodeId: integer('from_node_id').references(() => mapNodes.id),
  toNodeId: integer('to_node_id').references(() => mapNodes.id),
  departedAt: timestamp('departed_at', { withTimezone: true }),
  arrivalAt: timestamp('arrival_at', { withTimezone: true }),
  nextEncounterAt: timestamp('next_encounter_at', { withTimezone: true }),
  encounterCount: smallint('encounter_count').notNull().default(0),
  travelCost: bigint('travel_cost', { mode: 'bigint' }).notNull().default(sql`0`),
}, (table) => [
  check('arrival_after_departure', sql`${table.arrivalAt} IS NULL OR ${table.departedAt} IS NULL OR ${table.arrivalAt} > ${table.departedAt}`),
  index('travel_due_idx').on(table.status, table.nextEncounterAt),
]);
// DB-enforced single active travel per user (partial unique index — run in migration):
// CREATE UNIQUE INDEX IF NOT EXISTS one_active_travel
//   ON player_travel_state(user_id) WHERE status = 'traveling';
```

**Why timestamps, not "in-progress" flags:**
- `nextEncounterAt` / `arrivalAt` are computed at departure. Everything is derivable — a crash/restart cannot corrupt or strand a player; the tick simply picks up where time says it should be. This is exactly how the codebase already thinks (activity worker uses DB timestamps as cooldown truth).
- **Encounter processing = periodic tick, not per-player delayed jobs.** pg-boss `sendAfter` jobs cannot be cancelled (player cancels travel → the job still fires) and create job sprawl at scale. A tick that scans `WHERE status='traveling' AND next_encounter_at <= now() AND arrival_at > now()` (with `travel_due_idx`) is cancel-safe (cancel = `UPDATE ... SET status='idle'`; the tick only sees active rows) and restart-safe.
- **Row claiming:** use `.for('update', { skipLocked: true })` (precedent: `resolveMatchBets` in `matchLifecycleService.ts`) so multiple workers can never double-process the same encounter. Workers only run in the manager, but claiming still protects against overlap across tick invocations.
- **Startup:** no data repair needed (state is timestamp-derived). Optionally warm the Redis position cache. Precedent for startup sweeps: `clearOrphanedVoiceSessions()` — only needed because voice sessions have no timestamps; travel does.
- Cron granularity: pg-boss cron expressions are minute-granular. `*/1 * * * *` (precedent: `football-poll-scores`) with encounter intervals ≥ 60s is correct for v1. If sub-minute encounters are ever needed, process in batches per tick with a time-window filter.

### 2.3 Auto-Battle Engine — Pure Service Function, NOT a Background Job

**Decision: `src/services/sanguo/battleEngine.ts` — pure, synchronous, no discord.js deps (pattern: `services/breakthrough.ts`, which is fully unit-tested).**

- Battles are deterministic-ish simulations (seeded RNG): solo (1 hero) and legion (3 mains + 9 supports) both complete in-memory in milliseconds. There is nothing to "wait" for — a background job adds durability/queueing for zero benefit and blocks manager throughput.
- Two invocation paths:
  1. **Player-initiated** (`/sanguo battle`, travel-arrival auto-battle): called from the interaction handler (pattern: `gather.ts execute()`).
  2. **Encounter-initiated** (from the travel tick): the tick calls `battleEngine`, writes the result row, then **notifies via REST** — precedent: `matchLifecycleService.ts` posts/patches channel messages from the manager process using `new REST().setToken(...)`; no shard/gateway needed. DM via REST create-DM or post to the guild channel where travel started.
- `sanguo_battles` table stores the turn-by-turn log (`rounds` jsonb) + outcome + participants — battle history is data, not live state.

### 2.4 i18n — New `sanguo` Namespace

**Decision: add `'sanguo'` to the `ns` array in `src/i18n/index.ts` (the ONLY registration point; `preload: SUPPORTED_LOCALES` loads everything at startup) and create `locales/{vi,en,zh-cn}/sanguo.json`.** This mirrors the `football` namespace exactly (ns per feature area, all 3 locales, `fallbackNS: 'common'`). Hero names/titles use `sanguo:heroes.{code}.name` keys (pattern: `items.nameI18nKey`). All 3 locale files ship from day one (milestone constraint: VI default, EN + ZH-CN together).

### 2.5 Emoji Mapping — Checked-in Generated Registry, not Runtime File Reads

**Verified manifest:** `E:/Saeth/sanguo_assets/assets/emojis.json` is an app-emoji manifest: `{ applicationId, applicationName, uploadedAt, total, failed, emojis, failures }` where `emojis` maps **1056 keys** (`{code}_t{tier}[_star]`, e.g. `abt_t0`, `abt_t0_star`, … `abt_t3_star`) → Discord emoji snowflake IDs. 132 heroes × 4 tiers × 2 star-variants.

**Decision:** Discord supports up to 2,000 **application-owned emojis** usable anywhere on Discord; they render in embeds via `<:name:id>` (verified: Discord official emoji resource + discord.py 2.5 `fetch_application_emojis`; MEDIUM-HIGH confidence, cross-referenced).

1. Generate a checked-in TS module `src/assets/sanguoEmojis.ts` from the manifest (a small generator script; **never read the sibling repo path at runtime** — the Oracle VM won't have it).
2. Validate the JSON with Zod at build/load; render helper:
```typescript
export function heroEmoji(code: string, tier: number, star: boolean): string {
  const key = `${code}_t${tier}${star ? '_star' : ''}`;
  const id = SANGO_EMOJIS[key];
  return id ? `<:${key}:${id}>` : EMOJI.WARNING; // fallback never hardcodes an ID
}
```
3. **Startup check:** assert `manifest.applicationId === config.CLIENT_ID`; if mismatch, log FATAL (emojis are bound to the bot's own application). Add to bot.ts preflight.
4. This extends the existing `src/assets/emojis.ts` typed-registry convention — generated data instead of hand-maintaining 1056 entries. `heroEmoji` returns a plain string so embeds and components both use it.

### 2.6 Money Sinks — Reuse the Atomic Deduct Pattern via a Shared Wallet Service

The pattern currently inlined in `gather.ts` (and repeated in farming/predictions):
```typescript
// The WHERE clause is the atomic race guard; DB check `balance_non_negative` is the backstop.
const res = await tx.update(users)
  .set({ balance: sql`${users.balance} - ${amount}` })
  .where(and(eq(users.discordId, discordId), sql`${users.balance} >= ${amount}`));
if ((res.rowCount ?? 0) === 0) throw new Error('INSUFFICIENT_BALANCE');
```

**Decision: extract `src/services/wallet.ts` first** — `deductBalance(tx, userId, amount)` (guard + rowCount check + typed `InsufficientBalanceError`) and `creditBalance(tx, userId, amount)` (plain `balance + X`). The new game adds many sinks (travel cost, item shop, battle entry, capture items), and copy-pasting the guard invites drift. Refactor existing call sites (`gather.ts`, farming purchases) to the shared service in the same phase — small, safe, and makes the new commands uniform. Travel cost is deducted **in the same transaction** that writes the `player_travel_state` row (atomic: pay → travel, or neither).

---

## 3. Recommended Project Structure

```
src/
├── commands/sanguo/            # NEW — flat files (commandLoader traverses exactly ONE level)
│   ├── map.ts                  #   /sanguo map — node list + current position
│   ├── travel.ts               #   /sanguo travel <destination> — pay + set ETA
│   ├── heroes.ts               #   /sanguo heroes — collection view
│   ├── battle.ts               #   /sanguo battle — solo battle + history
│   ├── capture.ts              #   /sanguo capture — post-battle capture (item bonuses)
│   ├── shop.ts                 #   /sanguo shop — support items (money sinks)
│   └── bag.ts                  #   /sanguo bag — support items inventory
├── components/sanguo/          # NEW — customId handlers
│   ├── registry.ts             #   customId prefix → handler map (see 4.5)
│   ├── travelCancel.ts         #   sanguo:travel:cancel
│   └── battleActions.ts        #   sanguo:battle:attack|item|flee
├── services/
│   ├── wallet.ts               # NEW shared — deductBalance/creditBalance
│   └── sanguo/                 # NEW — pure logic, unit-testable
│       ├── travelService.ts    #   ETA/cost calc + state transitions (pure)
│       ├── battleEngine.ts     #   simulateBattle(team, enemy, rng?) → BattleResult
│       ├── captureService.ts   #   captureChance(hero.rarity, hp%, itemBonus) → roll
│       └── shopService.ts      #   purchase validation + inventory grants
├── jobs/sanguoTick.ts          # NEW — pg-boss travel-encounter tick
├── assets/sanguoEmojis.ts      # NEW — GENERATED registry + heroEmoji() helper
├── db/schema/                  # NEW files (see 2.1) + index.ts exports
└── utils/commandContext.ts     # EXTEND — add fetchUserContext (sanguo needs users row, not characters)
```

**Structure rationale:**
- `commands/sanguo/` is auto-discovered by `commandLoader.ts`/`registerCommands.ts` — **no registration code needed**, but files must stay flat (`collectCommandFilePaths` only reads `commands/{folder}/*.js` — do NOT nest deeper).
- Services are pure by convention (no discord.js imports) → trivially unit-tested (existing `services/*/__tests__` layout).
- Jobs live in `src/jobs/` and are wired in `pgBoss.ts registerJobs()` — never registered from a shard.
- The assets registry is generated, so it can't drift from the manifest; the generator script lives in `scripts/`.

---

## 4. Architectural Patterns

### 4.1 Atomic Deduct with WHERE Guard (wallet)
**What:** `UPDATE users SET balance = balance - X WHERE id = $1 AND balance >= X` inside a transaction; `rowCount === 0` ⇒ insufficient funds; DB `balance_non_negative` CHECK as final backstop.
**When:** Every money sink (travel, shop, battle fees).
**Trade-offs:** Single round-trip, race-proof without row locks on hot wallet rows; requires callers to roll back the transaction on error.

### 4.2 Timestamp-Derived Async State (travel)
**What:** Store only `departedAt / arrivalAt / nextEncounterAt`; never an "in progress" boolean. Current position = pure function of (from, to, departedAt, arrivalAt, now).
**When:** Any real-time-with-ETA mechanic.
**Trade-offs:** Deterministic and restart-proof; requires a periodic tick for side effects (encounters) — "when" is derived, "what happens" is tick-driven.

### 4.3 Tick + FOR UPDATE SKIP LOCKED Claim
**What:** A pg-boss cron (`*/1 * * * *`, precedent `football-poll-scores`) selects due rows and claims them with `.for('update', { skipLocked: true })` (precedent `resolveMatchBets`).
**When:** Background processing where jobs are cancellable/derived from state.
**Trade-offs:** Up to 60s latency; scales to thousands of active travels with the `travel_due_idx` partial index; simpler and safer than per-entity delayed jobs.

### 4.4 Pure Engine + Thin I/O Shell
**What:** `simulateBattle()` is a pure function (seeded RNG injected); the interaction handler and the tick job are thin shells that load rows, call the engine, persist `sanguo_battles`, and format embeds (pattern: `breakthrough.ts` — pure `rollBreakthrough` + DB `apply*` functions).
**When:** Any combat/RNG logic.
**Trade-offs:** Trivially testable (deterministic with seeded RNG); needs explicit separation so no discord.js types leak into the engine.

### 4.5 Prefix-Namespaced customId Registry
**What:** Replace extending the 477-line if-chain in `interactionCreate.ts` with a small `customIdPrefix → handler` map in `components/sanguo/registry.ts`, imported once in `interactionCreate.ts` (customIds `sanguo:*`).
**When:** New feature families add many buttons/modals.
**Trade-offs:** Small refactor of existing routing (only the new prefix is routed via the registry; existing `predict:`/`farming:` chains stay untouched) — prevents the file from becoming unmaintainable.

---

## 5. Data Flow

### 5.1 Travel Lifecycle
```
/sanguo travel <node>
  → fetchUserContext (users row: balance, locale)
  → travelService.computeCost(from, to)  [pure: distance × rate]
  → db.transaction:
       deductBalance(tx, userId, cost)   [guard → INSUFFICIENT_BALANCE]
       upsert player_travel_state {status:'traveling', from, to,
         departedAt=now, arrivalAt=now+ETA, nextEncounterAt=now+firstEncounter}
  → editReply (ETA + cost + route, emoji-rendered nodes)

[every 1 min] sanguoTick (manager process)
  → SELECT ... WHERE status='traveling' AND next_encounter_at <= now
       AND arrival_at > now  FOR UPDATE SKIP LOCKED
  → per row: roll encounter → battleEngine (auto-resolve) → insert encounter_runs
             → update nextEncounterAt (+ encounterCount)
  → rows where arrival_at <= now: status → 'idle', position := toNodeId
  → notify player (REST DM / guild channel): encounter result / arrival
```

### 5.2 Battle & Capture
```
Encounter roll → enemy template (rarity-scaled)
  → simulateBattle(team, enemy, seededRng) → BattleResult (rounds, winner, hp)
  → insert sanguo_battles {rounds, winner, heroIds, enemyRef, rewards}
  → if won → captureService.captureChance(hero.rarity, enemyHpRemaining%, itemBonus)
        → roll → insert user_heroes (roll IVs 6×0-31, captureCount++ on dup
          → soul-gem credit) or capture fail
  → embed via REST: winner, rounds summary, capture outcome (emoji-rendered)
```

### 5.3 Money Sink (travel cost — atomic with state)
```
shard handler
  └─ db.transaction:
       ├─ UPDATE users SET balance=balance-$cost WHERE id=$1 AND balance>=$cost
       │    (rowCount 0 → rollback → "không đủ linh thạch")
       └─ INSERT/UPDATE player_travel_state (traveling)
```

---

## 6. Scaling Considerations

| Concern | 0–1k players | 1k–10k players | 10k+ players |
|---------|--------------|----------------|--------------|
| Travel tick | 1 min cron, few hundred rows/scan | `travel_due_idx` partial index; batch ≤ 500 rows/tick | Split by time-window batches; increase tick rate; keep `skipLocked` |
| Encounter processing | Inline in tick | Same; keep per-tick work bounded | Consider a dedicated `sanguo-encounter` queue with localConcurrency ≥ 2 (claiming already safe) |
| Wallet writes | Fine | Fine (single UPDATE per op) | Monitor PgBouncer pool (max 5/shard) |
| Emoji rendering | Static generated registry (no cost) | Same | Same — never fetch emojis at runtime |
| i18n | 1 ns × 3 locales, preloaded | Same | Same (files are small) |

**First bottleneck:** the travel tick doing battle simulations inline inside the manager process (competes with existing football/activity jobs). Mitigate by keeping the tick fast (batch cap) and pushing battle execution into a worker queue only if profiling demands it — do not preemptively build this.

---

## 7. Anti-Patterns

### 7.1 Redis as Travel State Source of Truth
**What:** Storing the player's travel row / ETA in Redis keys.
**Why wrong:** Redis flush or restart = stranded players and lost encounters; violates the codebase's explicit "DB truth, Redis L1" invariant.
**Instead:** `player_travel_state` row; Redis only for cooldowns and the current-position display cache (recomputable).

### 7.2 Per-Player Delayed pg-boss Jobs for Encounters
**What:** `boss.sendAfter('sanguo-encounter', data, delay)` per encounter.
**Why wrong:** Cannot be cancelled on travel-cancel (the job fires anyway and must re-validate), job sprawl at scale, and a failed job strands the sequence.
**Instead:** Tick-scan of timestamp-derived rows; cancel = row update.

### 7.3 Runtime Reads from the Sibling Assets Repo
**What:** `fs.readFile('E:/Saeth/sanguo_assets/...')` or a path config pointing at the repo.
**Why wrong:** The Oracle VM deployment has no such path; the bot would crash or render bare IDs in production.
**Instead:** Generated, checked-in `sanguoEmojis.ts` (+ generator script); no runtime dependency on the assets repo.

### 7.4 FK to `characters.id` for Sanguo Data
**What:** `userHeroes.characterId → characters.id`.
**Why wrong:** Couples the two games; the milestone mandates data separation ("currency-shared" is the only shared surface). `characters` is 1:1 and tied to xianxia progression.
**Instead:** `user_heroes.userId → users.id` (matches `footballBets`/`farmingAccounts` precedent).

### 7.5 Extending the interactionCreate.ts If-Chain
**What:** Adding 20 more `if (customId.startsWith('sanguo:'))` blocks.
**Why wrong:** The file is already 477 lines; it becomes unmaintainable and review-hostile.
**Instead:** One registry import per feature family, keyed by prefix.

### 7.6 Number-typed Money (inherited rule)
**What:** `const cost = 1500.5` or `balance: number` mode in Drizzle.
**Why wrong:** Float drift + BigInt/Number overflow at 2^53; the codebase already treats this as CRITICAL (`users.ts` comment).
**Instead:** `bigint` mode everywhere; `formatBalance()` for display; never interpolate BigInt into strings directly.

---

## 8. Concrete Build Order

**Phase A — Foundation (nothing user-visible yet):**
1. Extract `src/services/wallet.ts` (`deductBalance` / `creditBalance`); refactor `gather.ts` + farming purchase sites to use it. Add `fetchUserContext` to `commandContext.ts`.
2. New schemas (`heroes`, `user_heroes`, `map_nodes`, `player_travel_state`, `sanguo_battles`, `sanguo_items`, `user_sanguo_items`, `encounter_runs`) → `drizzle-kit generate` + `migrate` (via `DATABASE_URL_DIRECT`) + partial unique index migration. Idempotent seed for hero catalog + map nodes (`ON CONFLICT DO UPDATE`, precedent `seed.ts`).
3. i18n: add `'sanguo'` to `ns` array; create 3 locale files; hero name keys.
4. Emoji: generator script → `sanguoEmojis.ts` + `heroEmoji()` + startup `applicationId === CLIENT_ID` check.
5. Command scaffold: `commands/sanguo/map.ts` (read-only, emoji-rendered) + `components/sanguo/registry.ts` wired into `interactionCreate.ts`.

**Phase B — Travel loop (the real-time core):**
6. `travelService` (pure ETA/cost/transitions) + `/sanguo travel` (atomic deduct + state row, partial unique index guard) + `/sanguo travel cancel` (component).
7. `sanguoTick` job: register in `pgBoss.ts` (`*/1 * * * *`), claim with `skipLocked`, arrival transitions, encounter scheduling.
8. Encounter resolution: roll table → outcome (battle | drop | none); write `encounter_runs`; REST notifications.

**Phase C — Battle + capture:**
9. `battleEngine` (pure, seeded RNG) + `sanguo_battles` write + solo battle from encounters; player-initiated `/sanguo battle` (history view).
10. `captureService` (capture % = f(rarity, HP, item bonus)) + capture flow; IV roll on capture.

**Phase D — Progression + economy (money sinks):**
11. Collection view `/sanguo heroes`; duplicate → hồn ngọc; level/tier-up (20→t1, 50→t2; t3 event-gated).
12. Support-item shop (`/sanguo shop` + drops from boss encounters) — all sinks via `wallet.deductBalance`.
13. Legion battle (3 mains + 9 system-buff heroes) — extends `battleEngine`.

**Phase E (later milestone, out of scope now):** server boss, PvP.

**Ordering rationale:** wallet + schema + i18n + emoji are the shared infrastructure every other step consumes; the travel loop is the time-based core that encounters depend on; battle/capture sit on top of encounters; progression/economy close the loop and only make sense once capture exists. Each phase ships a playable vertical slice (map → travel → encounter → battle → capture → collection).

---

## 9. Integration Points

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Shard handler ↔ wallet | `deductBalance/creditBalance` (tx) | Must be called inside `db.transaction`; throws `InsufficientBalanceError` |
| SanguoTick (manager) ↔ Discord | REST (`new REST().setToken()`) | Precedent `matchLifecycleService.ts`; never use a shard client from jobs |
| InteractionCreate ↔ components/sanguo | registry `sanguo:` prefix | One import in `interactionCreate.ts` |
| Shard ↔ pg-boss | `boss.send()` (fire-and-forget) | Only for future event-driven jobs; the travel tick is cron-driven |
| Bot repo ↔ sanguo_assets | **build-time only** (generator script) | No runtime dependency |
| New game ↔ users table | `users.id` FK + `users.balance` wallet | The single shared surface by design |

---

## Sources

**Codebase (HIGH — direct read 2026-08-10):**
- `src/db/schema/users.ts` — balance bigint, `balance_non_negative` CHECK
- `src/db/schema/characters.ts` — "Redis is L1 cache only" invariant; FK convention
- `src/db/schema/footballBets.ts`, `farming.ts` — `userId → users.id` precedent
- `src/commands/game/gather.ts` — atomic deduct pattern (WHERE guard + rowCount)
- `src/services/football/matchLifecycleService.ts` — `FOR UPDATE SKIP LOCKED`; REST posting from manager process
- `src/workers/pgBoss.ts`, `src/workers/activityWorker.ts` — job registration (manager-only), `localConcurrency`, per-user serialization via row locks
- `src/bot.ts`, `src/shard.ts` — process layout (manager = workers; shards = send-only)
- `src/i18n/index.ts` — `ns` array registration; `src/utils/commandLoader.ts` — one-level traversal constraint
- `src/services/breakthrough.ts` — pure-service pattern
- `E:/Saeth/sanguo_assets/assets/emojis.json` — manifest structure (1056 keys, `applicationId`)

**External (MEDIUM — cross-checked):**
- Discord official emoji resource (application emojis): https://docs.discord.com/developers/resources/emoji
- discord.py 2.5 API — `fetch_application_emojis()`: https://discordpy.readthedocs.io/en/latest/api.html
- "Persistent multiplayer state without chaos" (PG truth + Redis fast-work): https://packagemain.tech/p/persistent-multiplayer-state-without
- Redis/PostgreSQL hybrid consensus: https://www.alongside.team/blog/redis-and-postgresql-for-ai-agents

**Confidence notes:** Codebase facts are HIGH (verified by direct read today). App-emoji rendering and PG-truth/Redis-cache patterns are MEDIUM (multiple independent web sources agree; worth one deployment smoke-test of the emoji render before Phase B depends on it).

---
*Architecture research for: TuTien Bot — Milestone v3.0 Tam Quốc Collection*
*Researched: 2026-08-10*
