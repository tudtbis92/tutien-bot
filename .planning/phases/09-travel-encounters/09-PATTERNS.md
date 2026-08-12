# Phase 9: Travel & Encounters — Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 24 (12 edit / 12 new, excluding tests + data)
**Analogs found:** 23 / 24 (only `autocomplete` handler is a first-in-codebase pattern with no direct analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/commands/sanguo/map.ts` (EDIT) | controller | request-response | itself — existing `'sanguo'` command file | exact |
| `src/commands/sanguo/travel.ts` (NEW) | controller | request-response + autocomplete | `src/commands/sanguo/map.ts` execute() | role-match (no autocomplete exists yet) |
| `src/utils/commandLoader.ts` (EDIT) | utility | config/load | itself — one-command-per-file loader | exact |
| `src/events/interactionCreate.ts` (EDIT) | controller | event-driven | itself — line 448 chat-input gate | exact |
| `src/workers/pgBoss.ts` (EDIT) | config | batch | itself registerJobs() + `src/workers/voiceWorker.ts` | exact |
| `src/jobs/sanguoTickArrivals.ts` (NEW) | job | batch/CRUD | `src/jobs/footballResolveMatches.ts` | exact |
| `src/jobs/sanguoTickEncounters.ts` (NEW) | job | batch/event-driven | `src/jobs/footballResolveMatches.ts` | exact |
| `src/services/sanguo/travelService.ts` (NEW) | service | CRUD | `src/services/football/matchLifecycleService.ts` (tx) + `src/services/wallet.ts` (pure service shape) | role-match |
| `src/services/sanguo/encounterService.ts` (NEW) | service | transform (pure math) | `src/services/football/oddsCalculator.ts` | role-match |
| `src/services/sanguo/sanguoNotificationService.ts` (NEW) | service | request-response (REST outbound) | `src/services/football/matchLifecycleService.ts` | exact |
| `src/db/schema/playerTravelState.ts` (EDIT) | model | CRUD | itself | exact |
| `src/db/schema/encounterRuns.ts` (EDIT) | model | CRUD | itself | exact |
| `src/db/schema/mapNodes.ts` (EDIT) | model | CRUD | itself | exact |
| `src/db/schema/mapEdges.ts` (NEW) | model | CRUD | `src/db/schema/heroRelations.ts` (undirected pair table + unique index) | exact |
| `src/db/schema/mapZones.ts` (NEW) | model | CRUD | `src/db/schema/heroFactions.ts` (reference table, per-locale names) | exact |
| `src/db/schema/heroZoneRates.ts` (NEW) | model | CRUD | `src/db/schema/heroRelations.ts` (many-to-many) | exact |
| `src/ui/embeds/buildSanguoTravelReplyEmbed.ts` (NEW) | component | transform | `src/ui/embeds/buildSanguoMapEmbed.ts` | exact |
| `src/ui/embeds/buildSanguoArrivalEmbed.ts` (NEW) | component | transform | `src/ui/embeds/buildSanguoMapEmbed.ts` | exact |
| `src/ui/embeds/buildSanguoEncounterEmbed.ts` (NEW) | component | transform | `src/ui/embeds/buildSanguoMapEmbed.ts` | exact |
| `locales/{vi,en,zh-cn}/sanguo.json` (EDIT) | config | — | itself (VI reference, en/zh mirror) | exact |
| `scripts/seed-sanguo.ts` (EDIT) | script | batch | itself — idempotent upsert | exact |
| `scripts/data/sanguo-map-data.json` (NEW) | data | — | `scripts/data/sanguo-classifications.json` | exact |
| `migrations/0018_*.sql` (NEW) | migration | batch | `migrations/0017_hero_spouse_relations.sql` | exact |
| `src/db/schema/index.ts` (EDIT) | config | — | itself — re-export block | exact |

**Tests (all NEW, Wave 0):** `src/services/sanguo/__tests__/travelService.test.ts`, `__tests__/encounterService.test.ts`, `__tests__/sanguoNotificationService.test.ts`, `src/jobs/__tests__/sanguoTickArrivals.test.ts`, `src/commands/sanguo/__tests__/travel.test.ts`.

---

## Pattern Assignments

### `src/commands/sanguo/map.ts` (controller, request-response) — EDIT

**Analog:** itself (110 lines, full read). The `'sanguo'` command is owned by exactly ONE file — `commandLoader.ts` registers one command per file (`commandLoader.ts:44-49`) and `registerCommands.ts:26-31` PUTs each file's `data`; a second file exporting `data` with `name: 'sanguo'` would PUT twice (last wins → flaky).

**Command builder pattern** (`map.ts:14-31`) — append a `.addSubcommand()` call for `travel` to this builder:
```typescript
/* eslint-disable i18next/no-literal-string -- slash commands name/description are static Discord API strings */
export const data = new SlashCommandBuilder()
  .setName('sanguo')
  .setDescription('Xem bản đồ và thông tin Tam Quốc')
  .setDescriptionLocalizations({
    'en-US': 'View Three Kingdoms map and information',
    'zh-CN': '查看三国地图和信息',
  })
  .addSubcommand((subcommand) =>
    subcommand
      .setName('map')
      .setDescription('Xem bản đồ Tam Quốc')
      .setDescriptionLocalizations({ 'en-US': '...', 'zh-CN': '...' })
  );
/* eslint-enable i18next/no-literal-string */
```
The `travel` subcommand needs `.addStringOption(o => o.setName('destination').setAutocomplete(true).setRequired(true).setDescription(...))` — first autocomplete option in the codebase. **travel.ts must export the subcommand builder + `execute` + `autocomplete` and map.ts imports and wires them** (Pitfall 3 / D-08).

**Content-in-DB name picker** (`map.ts:38-42`) — copy verbatim for travel UI:
```typescript
function pickName(node: MapNode, locale: SupportedLocale): string {
  if (locale === 'en') return node.nameEn;
  if (locale === 'zh-cn') return node.nameZh ?? node.nameVi;
  return node.nameVi;
}
```

**Execute flow** (`map.ts:44-62`) — defer → context → char guard → subcommand dispatch:
```typescript
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const { t, char, locale, shardId } = await fetchCommandContext(interaction);
  if (!char) {
    await interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)] });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'map') { /* error embed */ return; }
```

**Error handling** (`map.ts:105-109`) — try/catch around DB work, error embed on failure:
```typescript
} catch {
  await interaction.editReply({ embeds: [buildErrorEmbed(t('sanguo:map.error'), shardId)] });
}
```

**Where travel.execute() gets wired:** travel.ts exports `execute(interaction)` that dispatches on `interaction.options.getSubcommand() === 'travel'` (the subcommand is now a child of the `sanguo` command). travel.ts also exports `autocomplete(interaction: AutocompleteInteraction)` for the destination option (RESEARCH Pattern: autocomplete section below).

---

### `src/commands/sanguo/travel.ts` (controller, request-response + autocomplete) — NEW

**Analog:** `map.ts` execute() for command flow; **no autocomplete analog exists** — use the interactionCreate + commandLoader excerpts below plus RESEARCH.md "Autocomplete handler (first in codebase — new pattern)" (§Code Examples, lines 804-822).

**Command contract (from RESEARCH §5):** read current position → re-validate adjacency against `map_edges` server-side (never trust autocomplete — Pitfall 4) → `startTravel` → reply with `buildSanguoTravelReplyEmbed` ETA. On `ALREADY_TRAVELING` or `NO_ROUTE` → DANGER embed via `buildErrorEmbed` + `t('sanguo:travel.error.*')` keys.

**Autocomplete handler shape (new pattern, from RESEARCH §Code Examples):**
```typescript
// travel.ts — autocomplete export consumed by the router + loader
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'destination') return;
  const { char } = await fetchCommandContext(interaction); // reuse
  if (!char) { await interaction.respond([]); return; }
  const pos = await travelService.getCurrentPosition(char.id);
  const adjacent = await travelService.getAdjacentNodes(pos.nodeId); // max 25, nearest first
  const filtered = adjacent.filter(a => a.code.includes(focused.value.toLowerCase()));
  await interaction.respond(filtered.slice(0, 25).map(a => ({ name: `${a.nameVi} (${Math.round(a.travelSeconds/60)} phút)`, value: a.code })));
}
```
Note: `fetchCommandContext` takes `ChatInputCommandInteraction` — for `AutocompleteInteraction` read the user row directly via `db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id))` mirroring `interactionCreate.ts:187-190`.

---

### `src/utils/commandLoader.ts` (utility) — EDIT

**Analog:** itself (53 lines, full read). Extend the `Command` interface + load the optional `autocomplete` export.

**Current interface** (`commandLoader.ts:9-12`):
```typescript
interface Command {
  data: { name: string; toJSON(): unknown };
  execute: (...args: unknown[]) => Promise<void>;
}
```
Add `autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;` — mirror the discord.js type import used by `interactionCreate.ts:1` (`import { Events, type Interaction } from 'discord.js';`).

**Load loop** (`commandLoader.ts:44-49`) — the `client.commands.set(command.data.name, command)` line already stores the whole module object, so the autocomplete function rides along once the interface gains the field; no other change needed:
```typescript
if ('data' in command && 'execute' in command) {
  client.commands.set(command.data.name, command);
  logger.debug('CommandLoader', `Loaded: ${relPath}`);
}
```

---

### `src/events/interactionCreate.ts` (controller, event-driven) — EDIT

**Analog:** itself (477 lines, full read). The chat-input gate at `interactionCreate.ts:448` returns early for every non-chat-input interaction — the autocomplete branch must go BEFORE it.

**Insert before line 448** (`interactionCreate.ts:447-448`):
```typescript
  // ── Slash command routing ───────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
```
New branch (RESEARCH §Code Examples lines 804-813):
```typescript
  // ── Autocomplete routing (first in codebase — Phase 9) ─────────────────────
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands?.get(interaction.commandName);
    if (command && typeof command.autocomplete === 'function') {
      try { await command.autocomplete(interaction); }
      catch (err) { logger.error('InteractionCreate', `Autocomplete error in ${interaction.commandName}`, err); }
    }
    return;
  }
```
**Existing logger pattern:** `logger.error('InteractionCreate', 'Error in handlePredictResult', err)` — `interactionCreate.ts:33`.

---

### `src/workers/pgBoss.ts` (config, batch) — EDIT

**Analog:** itself `registerJobs()` (lines 83-179) + `voiceWorker.ts:21-32` for the self-contained register function shape.

**Registration pattern — add inside `registerJobs()` after line 176** (RESEARCH Pattern 1, verified against `pgBoss.ts:113-124` football block):
```typescript
// Register Sanguo Tick — Arrivals (every 60s)
await b.createQueue('sanguo-tick-arrivals');
await b.schedule('sanguo-tick-arrivals', '* * * * *', {}); // every minute
await b.work('sanguo-tick-arrivals', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    try { await runSanguoTickArrivals(job); }
    catch (err) { logger.error('pgBoss', `Job ${job.id} (sanguo-tick-arrivals) failed`, err); }
  }
});

// Register Sanguo Tick — Encounters (every 45s, 6-field cron — verified: cron-parser 5.7 accepts seconds position)
await b.createQueue('sanguo-tick-encounters');
await b.schedule('sanguo-tick-encounters', '*/45 * * * * *', {});
await b.work('sanguo-tick-encounters', { localConcurrency: 1 }, async (jobs: Job[]) => {
  for (const job of jobs) {
    try { await runSanguoTickEncounters(job); }
    catch (err) { logger.error('pgBoss', `Job ${job.id} (sanguo-tick-encounters) failed`, err); }
  }
});
```
Key invariants from `pgBoss.ts:14-16` header comment: **crons only in bot.ts (manager); shards send-only.** Add imports at top (lines 4-9 import style): `import { runSanguoTickArrivals } from '../jobs/sanguoTickArrivals.js';` etc. Update the final `logger.info('pgBoss', 'Jobs registered: ...')` at line 178 to include the two new queues.

---

### `src/jobs/sanguoTickArrivals.ts` (job, batch/CRUD) — NEW

**Analog:** `src/jobs/footballResolveMatches.ts` (188 lines, full read) for job-body structure; `matchLifecycleService.ts:333-345` for the locking transaction.

**Job body structure** (`footballResolveMatches.ts:32-33` + `106-108`):
```typescript
export async function runFootballResolveMatches(job: Job): Promise<void> {
  logger.info('FootballResolveMatches', `Job started: ${job.id}`);
  ...
  for (const match of matchesToResolve) {
    try { ... } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('FootballResolveMatches', `Failed to resolve match ID ${match.id}: ${errMsg}`);
    }
  }
  logger.info('FootballResolveMatches', `Job completed: ${job.id}. Resolved ${resolvedCount}/${matchesToResolve.length} matches.`);
}
```

**Core arrival logic (RESEARCH Pattern 2, conceptual — copy shape, D-05/D-07):**
```typescript
await db.transaction(async (tx) => {
  const rows = await tx.select().from(playerTravelState)
    .where(eq(playerTravelState.status, 'traveling'))
    .for('update', { skipLocked: true });               // D-05 — exact object form, matchLifecycleService.ts:336-345
  for (const row of rows) {
    if (row.encounterActive) { /* advance updatedAt anchor, count NO time — D-07 */ continue; }
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / 1000));
    const remaining = Math.max(0, row.travelSecondsRemaining - elapsedSec);  // overdue → clamped → arrives (D-05)
    if (remaining === 0) {
      await tx.update(playerTravelState).set({ status: 'arrived', travelSecondsRemaining: 0, updatedAt: now })
        .where(eq(playerTravelState.id, row.id));
      // DM AFTER commit, outside tx (D-12) — collect rows, notify post-commit
    } else {
      await tx.update(playerTravelState).set({ travelSecondsRemaining: remaining, updatedAt: now })
        .where(eq(playerTravelState.id, row.id));
    }
  }
});
```
**Single-writer rule (Pitfall 5):** this job is the ONLY writer of `travel_seconds_remaining`/`updatedAt` for traveling rows; the encounter job never writes those columns.

---

### `src/jobs/sanguoTickEncounters.ts` (job, batch/event-driven) — NEW

**Analog:** `footballResolveMatches.ts` job structure (same as above). Per RESEARCH §7, per tick per row: Redis cap check (skip silently) → position fraction → zone probability roll (crypto) → boss sub-roll → weighted pick → `INSERT encounter_runs` → DM. Writes only `encounter_runs` + Redis, never `player_travel_state` columns (Pitfall 5).

**Redis cap ZSET ops** (research A1/D-13) — ioredis from `src/cache/redis.ts:19` (singleton `redis`; test env auto-mocks):
```typescript
const key = `sanguo:enc:win:${row.userId}`;
await redis.zremrangebyscore(key, '-inf', `(${now - 3600_000}`);   // drop entries older than 60min
const count = await redis.zcard(key);
if (count >= 20) continue;                                          // D-13 silent skip — no record, no DM
// ... on successful roll:
await redis.zadd(key, now, String(now));
```

**Record + notify:** `INSERT encounter_runs (userId, travelId, zone, heroId, encounterType, status='pending')` then `sendEncounterDM(...)` (Pattern 4 below).

---

### `src/services/sanguo/travelService.ts` (service, CRUD — pure time/state) — NEW

**Analog:** `matchLifecycleService.ts` tx shape (lines 333-345) + `wallet.ts:32-33` type-helper pattern. **NO wallet import anywhere (D-01).**

**API contract (RESEARCH §5):**
- `getCurrentPosition(userId)` → `{ nodeId, nodeCode }` — `status='arrived'` → `toNodeId`; `status='traveling'` → `fromNodeId`; no row → `START_NODE = 'luoyang'` (research A6).
- `getAdjacentNodes(nodeId)` → SELECT `map_edges` WHERE `node_a_id = :nodeId OR node_b_id = :nodeId`, JOIN nodes + zones, ordered by `travelSeconds ASC`, cap 25.
- `startTravel(userId, toNodeId)` → throw `ALREADY_TRAVELING` if row `status='traveling'` (D-09); throw `NO_ROUTE` if edge missing (Pitfall 4 defense in depth); INSERT on first journey / in-place UPDATE on subsequent (`userId.unique()` = one row forever — D-09, RESEARCH discovery 3); set `fromNodeId=current, toNodeId=dest, travelSecondsRemaining=edge.travelSeconds, encounterActive=false, status='traveling', departAt=now, updatedAt=now`.

**Error style:** plain `Error('ALREADY_TRAVELING')` / `Error('NO_ROUTE')` — mirrors `wallet.ts:61` `throw new Error('INSUFFICIENT_BALANCE')`. Transaction style for startTravel: `db.transaction(async (tx) => { ... })` per `wallet.ts:78-81` (`if (txOrDb === db) return db.transaction((tx) => run(tx));`).

---

### `src/services/sanguo/encounterService.ts` (service, transform — pure math) — NEW

**Analog:** `src/services/football/oddsCalculator.ts` (pure functions, unit-tested in isolation) — RESEARCH explicitly notes the pool blend + time accounting are "pure functions that should be written first and unit-tested in isolation" (RESEARCH "Key insight", line 398).

**Position-blended weighted pick (RESEARCH Pattern 3, D-15)** — the core math, crypto RNG only:
```typescript
function pickEncounterHero(poolA: ZoneRate[], poolB: ZoneRate[], pos: number): { heroId: string; zone: string } {
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
  let roll = crypto.randomInt(Math.ceil(total * 1000)) / 1000;   // crypto RNG (milestone) — NEVER Math.random
  for (const [heroId, w] of weights) {
    if ((roll -= w) <= 0) return { heroId, zone: heroZone.get(heroId)! };
  }
  const last = [...weights.entries()].at(-1)!;
  return { heroId: last[0], zone: heroZone.get(last[0])! };
}
```
Also export pure helpers: `positionFraction(remaining, total)` = `1 − remaining/total`; `shouldRoll(encounterRate, rng)`; `shouldRollBoss(bossRate, rng)` — all `crypto.randomInt` threshold based (D-10/D-14, defaults 0.35 / 0.07 per research A7).

---

### `src/services/sanguo/sanguoNotificationService.ts` (service, request-response REST) — NEW

**Analog:** `src/services/football/matchLifecycleService.ts` (471 lines, full read) — this is the exact D-12 mirror.

**REST client + DM open** (`matchLifecycleService.ts:16` + RESEARCH Pattern 4):
```typescript
const rest = new REST().setToken(config.DISCORD_TOKEN);
// ...
const dm = await rest.post(Routes.userChannels(), { body: { recipient_id: u.discordId } }) as { id: string };
await rest.post(Routes.channelMessages(dm.id), { body: { embeds: embeds.map(e => e.toJSON()) } });
```
**Imports to copy** (`matchLifecycleService.ts:1-16`): `import { REST, Routes } from 'discord.js';`, `import { config } from '../../config.js';`, `import { redis } from '../../cache/redis.js';`, `import { getT, type SupportedLocale } from '../../i18n/index.js';`, `import { logger } from '../../utils/logger.js';`, `import { db } from '../../db/client.js';`, `import { users } from '../../db/schema/users.js';` (for discordId lookup).

**User-level locale (differs from guild-level analog)** — users.locale is the source, fallback `vi`, Redis-cached. Shape from `getGuildLocale` (`matchLifecycleService.ts:21-46`) but keyed `user:locale:{userId}` (RESEARCH architecture diagram line 211).

**3-strike DM failure pattern** (`matchLifecycleService.ts:48-91` — `DiscordErrorLike`, `isChannelNotFoundError`, `handleChannelFailure`): adapt for 50007 (DMs closed) / 10003 (unknown channel) with Redis key `sanguo:dm:strike:{userId}`, `redis.incr` + `redis.expire(key, 86400)`, skip at 3.

---

### `src/db/schema/playerTravelState.ts` (model) — EDIT

**Analog:** itself (30 lines, full read). D-07 remaining-seconds model — from RESEARCH §6:

| Column | Change |
|--------|--------|
| `userId int UNIQUE FK` | keep (D-09) |
| `fromNodeId` / `toNodeId` int | keep, plain int no FK (existing header comment lines 5-9) |
| `departAt timestamptz` | keep |
| `arriveAt timestamptz` | **DROP** |
| `cost bigint` | **DROP** (D-01 — travel free) |
| `travelSecondsRemaining int notNull` | **ADD** (default 0) |
| `encounterActive boolean notNull default false` | **ADD** (D-07 pause flag) |
| `status varchar(20)` | keep — values `'traveling'`/`'arrived'` only (D-03 removes `'cancelled'`) |

**Column style to copy** (current lines 20-26): `timestamp('depart_at', { withTimezone: true }).notNull()`, `varchar('status', { length: 20 }).notNull().default('traveling')`, `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`.

---

### `src/db/schema/encounterRuns.ts` (model) — EDIT

**Analog:** itself (24 lines, full read). Add D-14 boss flag per RESEARCH §6: `encounterType: varchar('encounter_type', { length: 20 }).notNull().default('hero')` — values `'hero' | 'boss'` (A2 discretion). `heroId` stays nullable — boss writes `hero_id NULL` + `encounter_type='boss'` + zone.

---

### `src/db/schema/mapNodes.ts` (model) — EDIT

**Analog:** itself (26 lines, full read). Keep `code/name_vi/name_en/name_zh/zone/node_order/representative_hero_id` columns (D-20 truncates + reseeds rows). Per-locale content columns pattern stays (D-05 Phase 8). If `zone` becomes an FK to `map_zones`, follow the `heroes.ts:48-50` FK style: `zoneId: integer('zone_id').references(() => mapZones.id)` — but research keeps `zone` as a varchar code keyed to the zone table for the blend math; planner discretion (A8).

---

### `src/db/schema/mapEdges.ts` (model) — NEW

**Analog:** `src/db/schema/heroRelations.ts` (undirected pair + unique index, migration 0017 lines 1-11). D-17: `node_a < node_b` canonical order, unique index on the pair, `travelSeconds int notNull`:
```typescript
// style: src/db/schema/heroRelations.ts — pair table with unique constraint
export const mapEdges = pgTable('map_edges', {
  id: serial('id').primaryKey(),
  nodeAId: integer('node_a_id').notNull(),
  nodeBId: integer('node_b_id').notNull(),
  travelSeconds: integer('travel_seconds').notNull(),
}, (table) => [
  uniqueIndex('map_edges_pair_unique').on(table.nodeAId, table.nodeBId),
]);
```

### `src/db/schema/mapZones.ts` (model) — NEW

**Analog:** `src/db/schema/heroFactions.ts` (reference table with per-locale names + sortOrder — see seed `FACTIONS` shape at `seed-sanguo.ts:93-108`). D-19:
```typescript
export const mapZones = pgTable('map_zones', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  nameZh: varchar('name_zh', { length: 100 }),          // nullable — clobber-safe seed
  sortOrder: smallint('sort_order').notNull(),
  encounterRate: numeric('encounter_rate').notNull().default('0.35'),  // A7 — or smallint permille
  bossRate: numeric('boss_rate').notNull().default('0.07'),
});
```

### `src/db/schema/heroZoneRates.ts` (model) — NEW

**Analog:** `src/db/schema/heroRelations.ts` many-to-many shape. D-16, A3 (per-zone granularity):
```typescript
export const heroZoneRates = pgTable('hero_zone_rates', {
  id: serial('id').primaryKey(),
  heroId: integer('hero_id').notNull().references(() => heroes.id),
  zone: varchar('zone', { length: 50 }).notNull(),       // zone code key — per-zone (A3)
  rate: numeric('rate', { precision: 4, scale: 2 }).notNull(),  // 1.0 / 0.5 / 0.3 research weights (D-16)
}, (table) => [
  uniqueIndex('hero_zone_rates_hero_zone_unique').on(table.heroId, table.zone),
]);
```

### `src/db/schema/index.ts` (config) — EDIT

**Analog:** itself (43 lines). Add to the "Phase 8 schemas" block (or a new Phase 9 block): `export * from './mapEdges.js'; export * from './mapZones.js'; export * from './heroZoneRates.js';` — mirror lines 28-39.

---

### `src/ui/embeds/buildSanguoTravelReplyEmbed.ts` / `buildSanguoArrivalEmbed.ts` / `buildSanguoEncounterEmbed.ts` (component, transform) — NEW

**Analog:** `src/ui/embeds/buildSanguoMapEmbed.ts` (31 lines, full read) + `theme.ts` + `buildErrorEmbed.ts`.

**Embed builder pattern** (`buildSanguoMapEmbed.ts:20-31`):
```typescript
export function buildSanguoMapEmbed(data: SanguoMapEmbedData, t: TFunction): EmbedBuilder {
  const nodesValue = data.nodes.join('\n');
  return new EmbedBuilder()
    .setColor(COLORS.SEASON) // theme.ts — never hardcode hex (UI-SPEC)
    .setTitle(t('sanguo:map.title'))
    .addFields(
      { name: t('sanguo:map.current_position'), value: data.currentZoneName, inline: true },
      { name: t('sanguo:map.nodes'), value: nodesValue || t('sanguo:map.empty_hint'), inline: false },
    )
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
```
Rules: colors from `theme.ts:33-41` (`COLORS.SUCCESS` for arrival, `COLORS.WARNING` for encounter, `COLORS.NEUTRAL`/`SEASON` for travel reply); footer via `embedFooter(data.shardId)` (`theme.ts:49-52`); every string through `t('sanguo:...')`. Encounter/arrival embeds may use `heroEmoji(heroId)` for the hero marker — `src/assets/sanguoEmojis.ts:1230-1242` (throws `EMOJI_NOT_FOUND` on unknown heroId — guard before calling, per `map.ts:98` usage).

---

### `locales/{vi,en,zh-cn}/sanguo.json` (config) — EDIT

**Analog:** itself. VI is the reference (check-i18n compares all three — `scripts/check-i18n.ts:13-14`). Current shape (`locales/vi/sanguo.json:1-16`): `cmd.*` for command descriptions, `map.*` for UI strings. Add `travel.*`, `arrival.*`, `encounter.*`, and `cmd.travel.description` blocks — all three files MUST stay key-synced (hard gate `npm run check-i18n`).

---

### `scripts/seed-sanguo.ts` (script, batch) — EDIT

**Analog:** itself (486 lines, full read). Extend for zones/nodes/edges/hero_zone_rates from `scripts/data/sanguo-map-data.json` (D-16/17/20).

**Idempotent upsert pattern** (`seed-sanguo.ts:397-422` — map nodes; copy for edges/zones/rates):
```typescript
const [inserted] = await db
  .insert(schema.mapNodes)
  .values({ code, nameVi, nameEn, nameZh: zh, zone, nodeOrder, representativeHeroId })
  .onConflictDoUpdate({
    target: schema.mapNodes.code,
    set: {
      nameVi, nameEn, zone, nodeOrder, representativeHeroId,
      ...(zh ? { nameZh: zh } : {}),   // clobber-safe spread (D-11/D-06) — NEVER write '' for zh
    },
  })
  .returning({ id: schema.mapNodes.id });
if (!inserted) throw new Error(`[Seed] Failed to upsert map node: ${node.code}`);
```

**D-20 replacement:** delete placeholder nodes before reseed — `await db.delete(schema.mapNodes)` then reseed from the 73-node dataset. **Pair-table seed** (edges — canonical `node_a < node_b`): copy the spouse-pairs loop pattern at `seed-sanguo.ts:460-475` (`onConflictDoNothing()` + count only if inserted).

**Data file loader pattern** (`seed-sanguo.ts:71-79` `loadZhNames`): load `sanguo-map-data.json` with try/catch — but per D-21 this file is REQUIRED (research `loadClassifications` at `seed-sanguo.ts:162-169` exits FATAL when missing — follow that for the map dataset).

---

### `scripts/data/sanguo-map-data.json` (data) — NEW

**Analog:** `scripts/data/sanguo-classifications.json` — committed dev-time dataset consumed by the seed; shape per RESEARCH "Data Contract (seed file shape)":
```jsonc
{
  "zones":     [ { "code": "trung_nguyen", "nameVi": "Trung Nguyên", "nameEn": "Central Plains (Sili)", "nameZh": "中原", "sortOrder": 1 } ],
  "nodes":     [ { "code": "luoyang", "nameVi": "Lạc Dương", "nameEn": "Luoyang", "nameZh": "洛阳", "zone": "trung_nguyen", "representativeHeroId": "dong_trac" } ],
  "edges":     [ { "nodeA": "hongnong", "nodeB": "luoyang", "travelSeconds": 900 } ],
  "heroZoneRates": [ { "heroId": "dong_trac", "zone": "quan_trung", "rate": 1.0 } ]
}
```
Machine-verified: 18 zones, 73 nodes, 162 edges, 208 hero_zone_rates rows, 132/132 heroes covered (RESEARCH lines 64-66, 400-414).

---

### `migrations/0018_*.sql` (migration) — NEW

**Analog:** `migrations/0017_hero_spouse_relations.sql` (11 lines) — drizzle-kit generated format with `--> statement-breakpoint` separators. From RESEARCH §6: `ALTER TABLE player_travel_state DROP COLUMN arrive_at, DROP COLUMN cost, ADD COLUMN travel_seconds_remaining integer NOT NULL DEFAULT 0, ADD COLUMN encounter_active boolean NOT NULL DEFAULT false` + `CREATE TABLE map_edges/map_zones/hero_zone_rates` + `ALTER TABLE encounter_runs ADD COLUMN encounter_type varchar(20) NOT NULL DEFAULT 'hero'`. Generated via `npx drizzle-kit generate`, not hand-written (drizzle.config.ts standard).

---

## Shared Patterns

### Authentication / Command Guard
**Source:** `src/commands/sanguo/map.ts:49-54` + `src/utils/commandContext.ts:32-56`
**Apply to:** travel.ts execute, autocomplete (via user-row lookup)
```typescript
const { t, char, locale, shardId } = await fetchCommandContext(interaction);
if (!char) {
  await interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)] });
  return;
}
```
Locale resolution order: stored DB locale → interaction locale → 'vi' (`commandContext.ts:52`).

### Error Handling
**Source:** `src/ui/embeds/buildErrorEmbed.ts:10-16` (DANGER color + EMOJI.ERROR + footer)
**Apply to:** all command/embed paths
```typescript
export function buildErrorEmbed(message: string, shardId?: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.DANGER)
    .setDescription(`${EMOJI.ERROR} ${message}`)
    .setFooter(embedFooter(shardId))
    .setTimestamp();
}
```
Service-level errors: plain `throw new Error('CODE')` (`wallet.ts:61`), never custom classes.

### FOR UPDATE SKIP LOCKED (concurrency)
**Source:** `src/services/football/matchLifecycleService.ts:336-345`
**Apply to:** both sanguoTick jobs (Pitfall 1)
```typescript
const pendingBets = await tx
  .select().from(footballBets)
  .where(and(eq(footballBets.fixtureId, match.id), eq(footballBets.status, 'pending')))
  .for('update', { skipLocked: true });   // ← exact object form for Drizzle 0.45.2
```

### Cross-Shard REST DM + 3-strike
**Source:** `src/services/football/matchLifecycleService.ts:16, 48-112, 199-208`
**Apply to:** sanguoNotificationService (arrival + encounter DMs, D-12)
```typescript
const rest = new REST().setToken(config.DISCORD_TOKEN);
// failure helpers: isChannelNotFoundError() checks status 404/403, code 10003/50001
// 3-strike: redis.incr(key) + redis.expire(key, 86400), act at count >= 3
// DM send: rest.post(Routes.userChannels(), { body: { recipient_id } }) → rest.post(Routes.channelMessages(dm.id), { body: { embeds } })
```

### Redis (cache + cap)
**Source:** `src/cache/redis.ts:19` — singleton `redis` export, auto-mocked in NODE_ENV=test
**Apply to:** encounter cap ZSET, user-locale cache, DM strike counter

### Player-facing RNG
**Source:** RESEARCH Pattern 3 + STATE.md mandate
**Apply to:** encounterService rolls — `crypto.randomInt` ONLY, never `Math.random` (predictable — anti-pattern).

### pg-boss Cron Registration
**Source:** `src/workers/pgBoss.ts:83-179` + `src/workers/voiceWorker.ts:21-32`
**Apply to:** the two sanguoTick queues — `createQueue` → `schedule` (idempotent) → `work` with `localConcurrency: 1` + per-job try/catch; manager-only.

### i18n Zero-Hardcoded-Strings
**Source:** `locales/*/sanguo.json` + `scripts/check-i18n.ts` (VI reference; all 3 locales key-synced)
**Apply to:** all new UI strings — `t('sanguo:...')` everywhere; node/zone/hero names NEVER in i18n (content-in-DB per-locale columns, D-07 Phase 8).

### Test Patterns
**Source:** `src/commands/sanguo/__tests__/map.test.ts` (db + context mocking, lines 8-54); `src/ui/embeds/__tests__/buildSanguoMapEmbed.test.ts` (pure builder test)
**Apply to:** Wave 0 test files per RESEARCH Validation Architecture
```typescript
vi.mock('../../../db/client.js', () => ({ db: { select: vi.fn() } }));
vi.mock('../../../utils/commandContext.js', () => ({ fetchCommandContext: vi.fn() }));
const orderBy = vi.fn().mockResolvedValue([]);
const from = vi.fn().mockReturnValue({ orderBy });
(db.select as any).mockReturnValue({ from });
```
vitest include pattern: `src/**/__tests__/**/*.test.ts` (`vitest.config.ts:6`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/commands/sanguo/travel.ts` autocomplete handler | controller | request-response | First autocomplete in codebase — no existing `autocomplete` export anywhere; use RESEARCH §Code Examples (lines 804-822) + discord.js `AutocompleteInteraction` API + the travel.ts autocomplete shape above |

---

## Metadata

**Analog search scope:** `src/commands/sanguo/`, `src/utils/`, `src/events/`, `src/workers/`, `src/jobs/`, `src/services/football/`, `src/services/`, `src/db/schema/`, `src/ui/embeds/`, `locales/*/sanguo.json`, `scripts/seed-sanguo.ts`, `scripts/data/`, `migrations/0017`, `src/cache/`, `src/i18n/`, `src/assets/sanguoEmojis.ts`, `vitest.config.ts`, `scripts/check-i18n.ts`, `src/config.ts`
**Files scanned:** 26 source files + 4 test files + 3 locale files + 1 migration
**Pattern extraction date:** 2026-08-12
