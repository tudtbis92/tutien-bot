# Phase 9: Travel & Encounters — Pattern Map (PULL MODEL)

**Mapped:** 2026-08-12 (rewritten for the pull-based travel check-in redesign — D-22..D-28)
**Files analyzed:** 24 (12 edit / 12 new, excluding tests + data)
**Analogs found:** 24 / 24 (StringSelectMenu + buttons have in-repo button-branch analogs in `interactionCreate.ts:380-445`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/commands/sanguo/map.ts` (EDIT) | controller | request-response | itself — existing `'sanguo'` command file | exact |
| `src/commands/sanguo/travel.ts` (NEW) | controller | request-response + components | `src/commands/sanguo/map.ts` execute() + `interactionCreate.ts` button branch | role-match (first select/button components for sanguo) |
| `src/utils/commandLoader.ts` (EDIT) | utility | config/load | itself — one-command-per-file loader (UNCHANGED — no autocomplete field) | exact |
| `src/events/interactionCreate.ts` (EDIT) | controller | event-driven | itself — button branch at ~380-445 + chat-input gate at 448 | exact |
| `src/services/sanguo/travelService.ts` (NEW) | service | CRUD | `src/services/football/matchLifecycleService.ts` (tx) + `src/services/wallet.ts` (pure service shape) | role-match |
| `src/services/sanguo/travelCheckInService.ts` (NEW) | service | transform (elapsed → result) | `travelService` (tx) + RESEARCH Pattern 1 (check-in algorithm) | role-match (first pull engine) |
| `src/services/sanguo/encounterService.ts` (NEW) | service | transform (pure math) | `src/services/football/oddsCalculator.ts` | exact |
| `src/ui/components/sanguoTravelDestinationMenu.ts` (NEW) | component | transform | discord.js `StringSelectMenuBuilder` (installed 14.27.0) | new pattern (first select menu in codebase) |
| `src/ui/components/sanguoTravelButtons.ts` (NEW) | component | transform | `interactionCreate.ts` button branch customIds | exact (buttons exist elsewhere) |
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
| `scripts/seed-sanguo.ts` (EDIT) | script | batch | itself — idempotent full-replace upsert (B3) | exact |
| `scripts/data/sanguo-map-data.json` (NEW) | data | — | `scripts/data/sanguo-classifications.json` | exact |
| `migrations/0018_*.sql` (NEW) | migration | batch | `migrations/0017_hero_spouse_relations.sql` | exact |
| `src/db/schema/index.ts` (EDIT) | config | — | itself — re-export block | exact |

**Tests (all NEW, Wave 0):** `src/services/sanguo/__tests__/travelService.test.ts`, `__tests__/encounterService.test.ts`, `__tests__/travelCheckInService.test.ts`, `src/commands/sanguo/__tests__/travel.test.ts`.

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
The `travel` subcommand has **NO options** — the destination picker is a StringSelectMenu + Start button (D-26). **travel.ts must export the subcommand builder + `execute` + component handlers and map.ts imports and wires them** (Pitfall 3 / D-08).

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

**Where travel.execute() gets wired:** map.ts dispatches `subcommand === 'travel'` → `travelExecute(interaction)`; travel.ts exports the subcommand builder + `execute` + `handleDestinationSelect` + `handleStartPress`.

---

### `src/commands/sanguo/travel.ts` (controller, request-response + components) — NEW

**Analog:** `map.ts` execute() for command flow; `interactionCreate.ts:380-445` for the button/select customId routing.

**Command contract (from RESEARCH §5 + UI-SPEC):** two modes —
1. **Start mode** (no active journey / arrived): embed (current position) + StringSelectMenu (adjacent nodes) + disabled Start button → select enables it → Start writes the journey (`startTravel(user.id, selectedCode)`).
2. **Check-in mode** (traveling): `checkInTravel(user.id)` → dispatch by mode (status/encounter/arrival/pending), all inline (D-22/D-23/D-24).

**Identity rule:** all travelService/checkInTravel calls use `user.id` (users.id) from fetchCommandContext — `playerTravelState.userId` references `users.id`, NEVER `char.id` (characters.id).

**Component handler shape (new pattern, from RESEARCH Pattern 4 + §Code Examples):**
```typescript
// travel.ts — handlers consumed by interactionCreate routing
export async function handleDestinationSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  // read chosen code (interaction.values[0]); update reply with destination + ETA
  // + ENABLED Start button built with buildStartButton(t, false, selectedCode) — F1
}
export async function handleStartPress(interaction: ButtonInteraction): Promise<void> {
  // parse selectedCode from the customId suffix (customId.slice(START_BTN_ID.length + 1));
  // startTravel(user.id, selectedCode); NO_ROUTE → DANGER embed; success → travel reply embed
}
```
Note: `fetchCommandContext` takes `ChatInputCommandInteraction` — for `StringSelectMenuInteraction`/`ButtonInteraction` read the user row directly via `db.select({ id: users.id }).from(users).where(eq(users.discordId, interaction.user.id))` mirroring `interactionCreate.ts:462-465`. **F1:** the Start button carries the destination in its customId (`sanguo:travel:start:{code}`) — a ButtonInteraction has no select values, and the message-snapshot `StringSelectMenuComponent` has no `.values` (only `StringSelectMenuInteraction` does, context7-verified).

---

### `src/events/interactionCreate.ts` (controller, event-driven) — EDIT

**Analog:** itself (477 lines, full read). The chat-input gate at `interactionCreate.ts:448` returns early for every non-chat-input interaction — the select-menu + button branches go BEFORE it.

**Insert before line 448** (`interactionCreate.ts:447-448`):
```typescript
  // ── Slash command routing ───────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
```
New branches (RESEARCH §Code Examples "StringSelectMenu + buttons"):
```typescript
  // ── Sanguo travel components (pull model, D-26/D-25) ───────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === DEST_MENU_ID) {
      const cmd = interaction.client.commands?.get('sanguo');
      try { await (cmd as any).handleDestinationSelect(interaction); }
      catch (err) { logger.error('InteractionCreate', 'Select error in sanguo travel', err); }
    }
    return;
  }
  // existing button branch (~380-445) — add:
  if (interaction.customId.startsWith(START_BTN_ID)) { /* handleStartPress — F1: destination in customId suffix */ return; }
  if (interaction.customId === ACK_BTN_ID)  { /* handleAckPress — clear encounterActive, updatedAt=now */ return; }
```
**Existing logger pattern:** `logger.error('InteractionCreate', 'Error in handlePredictResult', err)` — `interactionCreate.ts:33`.

---

### `src/services/sanguo/travelService.ts` (service, CRUD — pure time/state) — NEW

**Analog:** `matchLifecycleService.ts` tx shape (lines 333-345) + `wallet.ts:32-33` type-helper pattern. **NO wallet import anywhere (D-01).**

**API contract (RESEARCH §5):**
- `getCurrentPosition(userId)` → `{ nodeId, nodeCode }` — `status='arrived'` → `toNodeId`; `status='traveling'` → `fromNodeId`; no row → `START_NODE = 'luoyang'` (research A6).
- `getAdjacentNodes(nodeId)` → SELECT `map_edges` WHERE `node_a_id = :nodeId OR node_b_id = :nodeId`, JOIN nodes + zones, ordered by `travelSeconds ASC`, cap 25.
- `startTravel(userId, toNodeCode)` → resolve code → id via map_nodes.code (D-20-resilient); **read the current row with `.for('update')` (F3 — locks the double-start race; two concurrent starts both reading 'arrived' would UPDATE last-wins)**; throw `ALREADY_TRAVELING` if row `status='traveling'` (D-09); throw `NO_ROUTE` if edge missing (Pitfall 4); INSERT on first journey / in-place UPDATE on subsequent (`userId.unique()` = one row forever); set `fromNodeId=current, toNodeId=dest, travelSecondsRemaining=edge.travelSeconds, encounterActive=false, status='traveling', departAt=now, updatedAt=now`.

**Error style:** plain `Error('ALREADY_TRAVELING')` / `Error('NO_ROUTE')` — mirrors `wallet.ts:61`. Transaction style: `db.transaction(async (tx) => { ... })` per `wallet.ts:78-81`.

---

### `src/services/sanguo/travelCheckInService.ts` (service, transform — pull check-in) — NEW

**Analog:** `travelService` (tx) + RESEARCH Pattern 1 (the locked check-in algorithm). **No cron, no REST DM (D-22/D-23).**

**Core algorithm (D-22/D-24/D-25/D-28):**
```typescript
// src/services/sanguo/travelCheckInService.ts — conceptual (RESEARCH Pattern 1)
export async function checkInTravel(userId: number): Promise<CheckInResult> {
  return await db.transaction(async (tx) => {
    const [row] = await tx.select().from(playerTravelState)
      .where(eq(playerTravelState.userId, userId)).for('update');   // single writer
    if (!row || row.status === 'arrived') return { mode: 'start' };
    if (row.encounterActive) { /* F2: fetch latest pending encounter_runs row (userId + status='pending' ORDER BY id DESC LIMIT 1) and return { mode:'encounterPending', encounter: <mapped heroId/zone/boss> } */ }   // ack-gated (D-25)
    let remaining = row.travelSecondsRemaining;
    const counted = Math.floor((Date.now() - row.updatedAt.getTime()) / 60000);
    for (let k = 1; k <= counted; k++) {
      if (remaining <= 0) break;                                    // arrival — no rolls past it (D-28)
      remaining -= 60;                                              // hit minute IS counted (F4 — D-28 amended)
      const roll = await rollMinute({ ... });                       // 09-04 encounterService + cap + boss
      if (roll.hit) {                                               // STOP AT FIRST (D-24)
        await tx.update(playerTravelState).set({ travelSecondsRemaining: remaining,
          encounterActive: true, updatedAt: new Date(row.updatedAt.getTime() + k*60000) })
          .where(eq(playerTravelState.userId, userId));
        return { mode: 'encounter', encounter: roll };              // inline + ack button
      }
    }
    remaining = Math.max(0, remaining);
    if (remaining <= 0) { /* status='arrived', return { mode:'arrived' } */ }
    else { /* update remaining/updatedAt, return { mode:'status' } */ }
  });
}
```
**Single-writer rule (Pitfall 5):** this is the ONLY writer of `travel_seconds_remaining`/`updatedAt` for traveling rows; `startTravel` (depart) and the ack handler (resume) are the only other deliberate writers.

---

### `src/services/sanguo/encounterService.ts` (service, transform — pure math) — NEW

**Analog:** `src/services/football/oddsCalculator.ts` (pure functions, unit-tested in isolation) — the pool blend + time accounting are "pure functions that should be written first and unit-tested in isolation" (RESEARCH "Key insight").

**Position-blended weighted pick (RESEARCH Pattern 3, D-15, B6 dominant-zone fix)** — the core math, crypto RNG only:
```typescript
function pickEncounterHero(poolA: ZoneRate[], poolB: ZoneRate[], pos: number): { heroId: string; zone: string } {
  const weights = new Map<string, number>();
  const heroZone = new Map<string, string>();
  for (const { heroId, zone, rate } of poolA) {
    weights.set(heroId, (weights.get(heroId) ?? 0) + rate * (1 - pos));
    heroZone.set(heroId, zone);                      // B6: only set when absent OR when dominant
  }
  for (const { heroId, zone, rate } of poolB) {
    const wB = rate * pos;
    weights.set(heroId, (weights.get(heroId) ?? 0) + wB);
    // B6 fix: do NOT overwrite heroZone unconditionally — attribute to the pos-dominant zone:
    // if the blended weight came out zone-B-dominant, set heroZone; else keep A.
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
Also export pure helpers: `positionFraction(remaining, total)` = `1 − remaining/total`; `shouldRoll(encounterRate, rng)`; `shouldRollBoss(bossRate, rng)`; `capHit(windowCount, limit)`; `cryptoUniform()` — all `crypto.randomInt` threshold based (D-10/D-14, defaults 0.35 / 0.07 per research A7).

---

### `src/ui/components/sanguoTravelDestinationMenu.ts` (component, transform) — NEW

**Analog:** none in-repo (first StringSelectMenu); discord.js `StringSelectMenuBuilder` (installed 14.27.0) is the platform API. Per RESEARCH §Code Examples + UI-SPEC §Interaction contract — destination picker (D-26):
```typescript
export const DEST_MENU_ID = 'sanguo:travel:dest';
export function buildDestinationMenu(adjacent: AdjacentNode[], locale: SupportedLocale, t: TFunction): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(DEST_MENU_ID)
    .setPlaceholder(t('sanguo:travel.dest_placeholder'))
    .setMinValues(1).setMaxValues(1)
    .addOptions(adjacent.slice(0, 25).map((n) => new StringSelectMenuOptionBuilder()
      .setLabel(n.representativeHeroId ? `${heroEmoji(n.representativeHeroId)} ${pickName(n, locale)}` : pickName(n, locale))
      .setValue(n.code)   // stable node code (D-07/D-26)
      .setDescription(t('sanguo:travel.minutes', { n: Math.round(n.travelSeconds / 60) }))));
}
```

### `src/ui/components/sanguoTravelButtons.ts` (component, transform) — NEW

```typescript
export const START_BTN_ID = 'sanguo:travel:start';
export const ACK_BTN_ID = 'sanguo:travel:ack';
export function buildStartButton(t: TFunction, disabled = true, destinationCode?: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(destinationCode ? `${START_BTN_ID}:${destinationCode}` : START_BTN_ID) // F1 — destination rides in the customId
    .setLabel(t('sanguo:travel.start_button'))
    .setStyle(ButtonStyle.Primary).setDisabled(disabled);
}
export function buildAckButton(t: TFunction): ButtonBuilder {
  return new ButtonBuilder().setCustomId(ACK_BTN_ID).setLabel(t('sanguo:travel.ack_button'))
    .setStyle(ButtonStyle.Secondary);
}
```

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
    .addFields(...)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
```
Rules: colors from `theme.ts:33-41` (`COLORS.SEASON` for travel/arrival/normal encounter, `COLORS.GOLD` for boss encounter — UI-SPEC color contract); footer via `embedFooter(data.shardId)`; every string through `t('sanguo:...')`. Encounter/arrival embeds may use `heroEmoji(heroId)` — `src/assets/sanguoEmojis.ts:1230-1242` (throws `EMOJI_NOT_FOUND` on unknown heroId — guard before calling, per `map.ts:98`). All returned INLINE (D-23) — no DM, no REST.

---

### `locales/{vi,en,zh-cn}/sanguo.json` (config) — EDIT

**Analog:** itself. VI is the reference (check-i18n compares all three — `scripts/check-i18n.ts:13-14`). Add `travel.*` (incl. `dest_placeholder`, `start_button`, `ack_button`), `arrival.*`, `encounter.*`, and `cmd.travel.description` blocks — all three files MUST stay key-synced (hard gate `npm run check-i18n`).

---

### `scripts/seed-sanguo.ts` (script, batch) — EDIT

**Analog:** itself (486 lines, full read). Extend for zones/nodes/edges/hero_zone_rates from `scripts/data/sanguo-map-data.json` (D-16/17/20).

**Idempotent full-replace upsert (D-20 + B3)** — the D-20 delete scope MUST include the child collections so re-runs never accumulate edges/rates (node ids change after delete+reinsert):
```typescript
await db.delete(schema.mapEdges);        // child first (no FK)
await db.delete(schema.heroZoneRates);   // child (references heroes + zone code)
await db.delete(schema.mapNodes);        // D-20 placeholder replacement
// then upsert zones → nodes (build code→id map) → edges (canonical min/max, onConflictDoNothing) → hero_zone_rates
```
**Upsert pattern** (`seed-sanguo.ts:397-422` — map nodes; copy for zones/rates):
```typescript
const [inserted] = await db
  .insert(schema.mapNodes)
  .values({ code, nameVi, nameEn, nameZh: zh, zone, nodeOrder, representativeHeroId })
  .onConflictDoUpdate({
    target: schema.mapNodes.code,
    set: { nameVi, nameEn, zone, nodeOrder, representativeHeroId, ...(zh ? { nameZh: zh } : {}) },
  })
  .returning({ id: schema.mapNodes.id });
```
**Data file loader pattern** (`seed-sanguo.ts:71-79` `loadZhNames`): load `sanguo-map-data.json` with FATAL-on-missing per `loadClassifications` (`seed-sanguo.ts:162-169`) — this dataset is REQUIRED.

---

### `scripts/data/sanguo-map-data.json` (data) — NEW

**Analog:** `scripts/data/sanguo-classifications.json` — committed dev-time dataset consumed by the seed; shape per RESEARCH "Data Contract":
```jsonc
{
  "zones":     [ { "code": "trung_nguyen", "nameVi": "Trung Nguyên", "nameEn": "Central Plains (Sili)", "nameZh": "中原", "sortOrder": 1 } ],
  "nodes":     [ { "code": "luoyang", "nameVi": "Lạc Dương", "nameEn": "Luoyang", "nameZh": "洛阳", "zone": "trung_nguyen", "nodeOrder": 1, "representativeHeroId": "dong_trac" } ],
  "edges":     [ { "nodeA": "hongnong", "nodeB": "luoyang", "travelSeconds": 900 } ],
  "heroZoneRates": [ { "heroId": "dong_trac", "zone": "quan_trung", "rate": 1.0 } ]
}
```
Machine-verified: 18 zones, 73 nodes, 162 edges, 208 hero_zone_rates rows, 132/132 heroes covered (RESEARCH). **Every node carries `nodeOrder` (B4 — mapNodes.node_order NOT NULL, map.ts orders by it).**

---

### `migrations/0018_*.sql` (migration) — NEW

**Analog:** `migrations/0017_hero_spouse_relations.sql` (11 lines) — drizzle-kit generated format. From RESEARCH §6: `ALTER TABLE player_travel_state DROP COLUMN arrive_at, DROP COLUMN cost, ADD COLUMN travel_seconds_remaining integer NOT NULL DEFAULT 0, ADD COLUMN encounter_active boolean NOT NULL DEFAULT false` + `CREATE TABLE map_edges/map_zones/hero_zone_rates` + `ALTER TABLE encounter_runs ADD COLUMN encounter_type varchar(20) NOT NULL DEFAULT 'hero'`. Generated via `npx drizzle-kit generate`, not hand-written.

---

## Shared Patterns

### Authentication / Command Guard
**Source:** `src/commands/sanguo/map.ts:49-54` + `src/utils/commandContext.ts:32-56`
**Apply to:** travel.ts execute (chat input) + component handlers (direct users-row lookup)
```typescript
const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
if (!char) {
  await interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)] });
  return;
}
```
Locale resolution order: stored DB locale → interaction locale → 'vi' (`commandContext.ts:52`). **For StringSelectMenuInteraction/ButtonInteraction, resolve the users row directly (`interactionCreate.ts:462-465`) and use `user.id`.**

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

### FOR UPDATE (concurrency)
**Source:** `src/services/football/matchLifecycleService.ts:333-345`
**Apply to:** the check-in transaction + startTravel (single writer per user)
```typescript
const [row] = await tx
  .select().from(playerTravelState)
  .where(eq(playerTravelState.userId, userId))
  .for('update');   // ← single-writer lock (no skipLocked needed — no competing cron)
```
**Source:** `matchLifecycleService.ts:336-345` (in-repo, production-running); Context7 drizzle-orm-docs confirms `.for('update').skipLocked()` chain equivalent (skipLocked optional here).

### Component customIds (first in codebase)
**Source:** `interactionCreate.ts:380-445` button branch + RESEARCH §Code Examples
**Apply to:** `sanguo:travel:dest` (select), `sanguo:travel:start` (start), `sanguo:travel:ack` (encounter resume)
```typescript
// consts in sanguoTravelDestinationMenu.ts / sanguoTravelButtons.ts; routed in interactionCreate
```

### Redis (cap + no push)
**Source:** `src/cache/redis.ts:19` — singleton `redis` export, auto-mocked in NODE_ENV=test
**Apply to:** encounter cap ZSET only (`sanguo:enc:win:{userId}`) — NO locale cache, NO 3-strike counter (D-23 removed the DM path).

### Player-facing RNG
**Source:** RESEARCH Pattern 3 + STATE.md mandate
**Apply to:** encounterService rolls — `crypto.randomInt` ONLY, never `Math.random` (predictable — anti-pattern).

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
| `src/ui/components/sanguoTravelDestinationMenu.ts` | component | transform | First StringSelectMenu in the codebase — no in-repo select-menu pattern; use discord.js `StringSelectMenuBuilder` (installed 14.27.0) + the RESEARCH §Code Examples shape |
| `src/services/sanguo/travelCheckInService.ts` | service | transform | First pull-based check-in engine in the codebase — no cron analog (by design, D-22); use RESEARCH Pattern 1 (locked algorithm) |

---

## Metadata

**Analog search scope:** `src/commands/sanguo/`, `src/utils/`, `src/events/`, `src/services/football/`, `src/services/`, `src/db/schema/`, `src/ui/embeds/`, `locales/*/sanguo.json`, `scripts/seed-sanguo.ts`, `scripts/data/`, `migrations/0017`, `src/cache/`, `src/i18n/`, `src/assets/sanguoEmojis.ts`, `vitest.config.ts`, `scripts/check-i18n.ts`, `src/config.ts`
**Files scanned:** 26 source files + 4 test files + 3 locale files + 1 migration
**Pattern extraction date:** 2026-08-12 (rewritten 2026-08-12 for D-22..D-28)
