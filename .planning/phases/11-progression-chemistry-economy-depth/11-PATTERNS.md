# Phase 11: Progression, Chemistry & Economy Depth — Pattern Map

**Mapped:** 2026-08-14
**Files analyzed:** 36 (20 new, 16 modified)
**Analogs found:** 34 / 36 (2 partial — `dropService` event-driven, `legionService` orchestration)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/schema/sanguoSkills.ts` (NEW) | model | CRUD | `src/db/schema/sanguoItems.ts` | exact |
| `src/db/schema/userHeroSoulgems.ts` (NEW) | model | CRUD | `src/db/schema/userSanguoItems.ts` | exact |
| `src/db/schema/userLegions.ts` (NEW) | model | CRUD | `src/db/schema/formations.ts` | exact |
| `src/services/sanguo/soulgemService.ts` (NEW) | service | CRUD (single-writer tx) | `src/services/wallet.ts` + `battleCheckInService.ts` | exact |
| `src/services/sanguo/chemistryService.ts` (NEW) | service | transform (pure fn) | `src/services/sanguo/encounterService.ts` | exact |
| `src/services/sanguo/shopService.ts` (NEW) | service | CRUD (wallet sink) | `src/services/sanguo/captureService.ts` | role-match |
| `src/services/sanguo/bagService.ts` (NEW) | service | CRUD (inventory) | `src/services/sanguo/captureService.ts` | role-match |
| `src/services/sanguo/dropService.ts` (NEW) | service | event-driven (post-win drop) | `src/services/sanguo/encounterService.ts` (weighted pick) + `captureService.ts` (boss branch) | partial |
| `src/services/sanguo/legionService.ts` (NEW) | service | CRUD (ownership-gated) | `src/commands/sanguo/hero.ts` handleCompanionPress | partial |
| `src/services/sanguo/skillService.ts` (NEW) | service | event-driven (spawn roll) | `src/services/sanguo/encounterService.ts` (weighted pick) | exact |
| `src/services/sanguo/encounterLevelService.ts` (NEW) | service | transform (pure fn) | `src/services/sanguo/encounterService.ts` | exact |
| `src/constants/sanguoProgression.ts` (NEW) | config | constants | `src/constants/sanguoCapture.ts` | exact |
| `src/constants/sanguoChemistry.ts` (NEW) | config | constants | `src/constants/sanguoCapture.ts` | exact |
| `src/commands/sanguo/shop.ts` (NEW) | controller | request-response | `src/commands/sanguo/heroes.ts` | exact |
| `src/commands/sanguo/bag.ts` (NEW) | controller | request-response | `src/commands/sanguo/heroes.ts` | exact |
| `src/commands/sanguo/legion.ts` (NEW) | controller | request-response | `src/commands/sanguo/hero.ts` | exact |
| `src/ui/embeds/buildSanguo*Embed.ts` (NEW ×5) | component | request-response | `src/ui/embeds/buildSanguoHeroEmbed.ts` | exact |
| `src/ui/components/sanguo*Buttons.ts` (NEW) | component | request-response | `src/ui/components/sanguoCaptureButtons.ts` | exact |
| `scripts/data/sanguo-{skills,items,formations}.json` (NEW) | config | seed data | `scripts/data/sanguo-base-stats.json` | exact |
| `migrations/0020_*.sql` (NEW via drizzle-kit) | migration | schema | existing `migrations/0015..0019` pattern | exact |
| `src/services/sanguo/__tests__/*.test.ts` (NEW) | test | unit | `src/services/sanguo/__tests__/battleEngine.test.ts` | exact |
| `src/services/sanguo/battleEngine.ts` (EXTEND) | service | transform (pure fn) | itself — add optional `level`, add `runLegionBattle` alongside | self |
| `src/services/sanguo/battleCheckInService.ts` (EXTEND) | service | request-response | itself — boss branch in `buildEnemyInput` | self |
| `src/services/sanguo/captureService.ts` (EXTEND) | service | request-response | itself — remove guard L150, boss capture branch | self |
| `src/commands/sanguo/hero.ts` (EXTEND) | controller | request-response | itself — `renderHeroDetail` + `handleCompanionPress` generalize | self |
| `src/commands/sanguo/heroes.ts` (EXTEND) | controller | request-response | itself — `queryOwnedHeroes` + `handleZoneFilterSelect` | self |
| `src/events/interactionCreate.ts` (EXTEND) | event | request-response | itself — sanguo:* prefix routing blocks | self |
| `src/db/schema/userHeroes.ts` (EXTEND) | model | CRUD | itself — add tier + skill columns | self |
| `src/db/schema/sanguoItems.ts` (EXTEND) | model | CRUD | itself — price-currency model | self |
| `src/db/schema/encounterRuns.ts` (EXTEND) | model | CRUD | itself — level + skill columns | self |
| `src/db/schema/formations.ts` (EXTEND) | model | CRUD | itself — emoji column | self |
| `src/db/schema/index.ts` (EXTEND) | config | barrel | itself — add exports | self |
| `src/constants/sanguoBoss.ts` (REPLACE) | config | constants | itself → superseded by `sanguoProgression.ts` + zone-general | self |
| `src/ui/theme.ts` (EXTEND) | utility | constants | itself — `EMOJI.HON_NGOC` only | self |
| `scripts/seed-sanguo.ts` (EXTEND) | utility | batch | itself — upsert pattern + FATAL datasets | self |
| `docs/economy-budget.md` (AMEND) | doc | — | itself (Phase 9/10 amendment pattern) | self |

---

## Pattern Assignments

### `src/services/sanguo/soulgemService.ts` (service, CRUD single-writer)

**Analog:** `src/services/wallet.ts` (deductBalance) + `src/services/sanguo/battleCheckInService.ts` (FOR UPDATE orchestration)

**Tx type + WHERE-guard primitive** (wallet.ts:32-33, 53-62) — the template for `deductHonNgoc`:
```typescript
type DbClient = typeof db;
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

// wallet.ts:53-62 — WHERE-guard UPDATE + rowCount check; throw on zero rows
const rows = await client
  .update(users)
  .set({ balance: sql`${users.balance} - ${amount}` })
  .where(and(eq(users.id, userId), sql`${users.balance} >= ${amount}`))
  .returning({ balance: users.balance });
if (rows.length === 0) {
  throw new Error('INSUFFICIENT_BALANCE');
}
```

**FOR UPDATE single-writer tx** (battleCheckInService.ts:229-236):
```typescript
return db.transaction(async (tx) => {
  // 1. Single-writer lock on the player's journey (Pitfall 5 / F7).
  const [row] = await tx
    .select()
    .from(playerTravelState)
    .where(eq(playerTravelState.userId, userId))
    .for('update');
  if (!row || !row.encounterActive) throw new Error('NO_PENDING_ENCOUNTER');
```

**Convert/level/evolve/reroll pattern** (D-03/D-05/D-06/D-32): one `db.transaction` that (1) FOR UPDATE-locks the `user_hero_soulgems` pool row + the target `user_heroes` copy + `user_sanguo_state`, (2) re-fetches latest rows (never trusts the press payload), (3) `deductHonNgoc(tx, …)` with `amount >= cost` WHERE-guard, (4) writes level/tier/skill columns in the SAME tx. Booster consumption (D-12) rides the SAME conversion tx — `user_sanguo_items` row FOR UPDATE + `quantity >= 1` guard + delete-at-0 (userSanguoItems.ts:20 `quantity_positive` check). Error convention: plain `throw new Error('CODE')` matched on `err.message` (battleCheckInService.ts:35-37).

**Injectable deps for tests** (battleCheckInService.ts:51-63):
```typescript
export interface BattleDeps {
  seed?: number;                        // defaults to crypto.randomInt(2 ** 32)
  ivRoll?: () => number;                // defaults to crypto.randomInt(0, 32)
  runBattleFn?: typeof runBattle;       // injected engine
}
```

---

### `src/services/sanguo/chemistryService.ts` (service, pure transform)

**Analog:** `src/services/sanguo/encounterService.ts` — pure module contract: no db/redis/discord imports, no Math.random, crypto-backed default rng + injectable `rng` param for tests.

**Pure module contract** (encounterService.ts:1-24 header + 53-59):
```typescript
/** Crypto-backed uniform draw in [0, 1) — the ONLY default rng. Player-facing
 *  rolls therefore always ride crypto.randomInt (milestone mandate). */
export function cryptoUniform(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}
```

**Injectable-rng pure function shape** (encounterService.ts:91-96):
```typescript
export function pickEncounterHero(
  poolA: ZoneRate[],
  poolB: ZoneRate[],
  pos: number,
  rng: () => number = cryptoUniform,
): { heroId: number; zone: string } {
```
Chemistry is NOT a roll — it is a pure deterministic function (`mainChemistryPoints(main, supports)` summing 3/2/1 per link then mapping to a tier via a `CHEMISTRY_TIERS` const table). It NEVER uses rng. Buff is pre-baked into the mains' `CombatantInput` BEFORE `runLegionBattle` so the `sanguo_battles.input` snapshot stays replay-faithful (D-06 — anti-pattern "baking chemistry into the engine as a live DB read").

---

### `src/services/sanguo/shopService.ts` + `bagService.ts` (service, CRUD + wallet sink)

**Analog:** `src/services/sanguo/captureService.ts` — the only existing wallet-sink service.

**Single-writer + wallet fee + audit** (captureService.ts:127-196):
```typescript
return db.transaction(async (tx) => {
  const [encounter] = await tx
    .select().from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id)).limit(1).for('update');
  if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');
  // ...
  const balanceAfter = await deductBalance(tx, userId, cfg.fee, {
    reason: 'sanguo_capture_t' + tier,
    metadata: { encounterId: encounter.id, tier, chance },
  });
```

**Inventory upsert (bag/shop grant)** — userSanguoItems.ts:20-24 unique (userId, itemId) enables `onConflictDoUpdate`:
```typescript
await tx.insert(userSanguoItems).values({ userId, itemId: item.id, quantity: 1 })
  .onConflictDoUpdate({ target: [userSanguoItems.userId, userSanguoItems.itemId],
    set: { quantity: sql`${userSanguoItems.quantity} + 1` } });
```

**Anti-tamper price** (D-16): `sanguo:shop:buy:{itemCode}` carries ONLY the code; price/saleState resolve server-side inside the tx from `sanguo_items` (sanguoCapture.ts:17-20 anti-tamper comment is the contract to mirror). Capture_key: `saleState !== 'sold'` → `throw new Error('ITEM_NOT_FOR_SALE')` (D-15 locked).

---

### `src/services/sanguo/dropService.ts` (service, event-driven — NO direct analog)

**Closest:** weighted pick from `encounterService.ts:121-127` (cumulative walk) + boss branch from `captureService.ts:104-112` (wildRarity). **No existing event-driven reward service** — planner should follow RESEARCH Pattern 4/5 numbers (drop weights heal 70% / booster 25% / key4 4.9% / key5 0.1%) and the shared patterns below. Drop is called from `battleCheckInService` boss-win branch; crypto `cryptoUniform()` only; inserts into `user_sanguo_items` via the upsert above.

---

### `src/services/sanguo/legionService.ts` (service, CRUD ownership-gated)

**Closest:** `src/commands/sanguo/hero.ts:286-323` — FOR UPDATE ownership tx + upsert on the one-row state (IN-06 first-insert race):
```typescript
await db.transaction(async (tx) => {
  const [owned] = await tx.select().from(userHeroes)
    .where(eq(userHeroes.id, heroId)).limit(1);
  if (!owned || owned.userId !== userId) throw new Error('NOT_OWNED');

  const [state] = await tx.select().from(userSanguoState)
    .where(eq(userSanguoState.userId, userId)).for('update');

  if (state) {
    await tx.update(userSanguoState).set({ activeHeroId: heroId, updatedAt: new Date() })
      .where(eq(userSanguoState.userId, userId));
  } else {
    await tx.insert(userSanguoState).values({ userId, activeHeroId: heroId, starterViews: 0 })
      .onConflictDoUpdate({ target: userSanguoState.userId,
        set: { activeHeroId: heroId, updatedAt: new Date() } });
  }
});
```
Legion assembly (D-20/D-22): validate every pressed `userHeroId` belongs to the user AND its `heroes.class` matches the slot's `formation_slots.class` — mismatch → `throw new Error('legion.class_mismatch')` before any write (security V4).

---

### `src/services/sanguo/skillService.ts` + `encounterLevelService.ts` (service, pure spawn rolls)

**Analog:** `src/services/sanguo/encounterService.ts` — same pure-module + injectable-rng shape (see chemistryService above). Weighted skill roll reuses the cumulative-walk at encounterService.ts:121-127. Wild level band (D-33) is a pure band-roll: `Math.floor(rng() * 1000)` then uniform-within-band via `crypto.randomInt`. Both written to `encounter_runs` at spawn by `travelCheckInService`'s `makeDefaultRollMinute` (see below).

**Spawn-site integration** (travelCheckInService.ts:147-174 — EXTEND): the boss sub-roll + encounter_runs insert is where level/skill columns get written:
```typescript
const isBoss = shouldRollBoss(bossRate);
let heroId: number | null; let zone: string;
if (isBoss) { heroId = null; zone = dominantZone; }   // D-24: becomes a REAL hero pick
// ...
await tx.insert(encounterRuns).values({ userId, travelId, zone, heroId,
  encounterType: isBoss ? 'boss' : 'hero', status: 'pending' });
```

---

### `src/constants/sanguoProgression.ts` + `sanguoChemistry.ts` (config, hidden constants)

**Analog:** `src/constants/sanguoCapture.ts` — the established hidden-mechanics constants module (signed-contract header + typed const tables + never-render rule).

**Module header contract** (sanguoCapture.ts:1-25): docblock stating what's signed/where, anti-tamper (cost never rides customId), and the D-12 never-render rule. **Typed const tables** (sanguoCapture.ts:43-49):
```typescript
export const CAPTURE_TIERS: readonly CaptureTier[] = [
  { tier: 1, fee: 5n, multiplier: 1.0, requiresItem: null },
  // ...
  { tier: 5, fee: 250n, multiplier: 5.0, requiresItem: 'capture_tier5_key' },
] as const;
```
`sanguoProgression.ts` carries: `LEVEL_COST(level) = 1 + Math.floor((level-1)**2 / 200)`, `STAT_GAIN_PER_LEVEL = 2`, tier multipliers t0..t3, evolution costs 20/50/100, reroll 10. `sanguoChemistry.ts` carries `CHEMISTRY_POINTS = { family: 3, spouse: 3, faction: 2, role: 1 }` + `CHEMISTRY_TIERS` (S≥12→+10% … D 1-2→+2%, 0→no tier). Both NEVER rendered (D-12 — mirror sanguoCapture.ts:22-24).

---

### `src/commands/sanguo/shop.ts` / `bag.ts` (controller, request-response)

**Analog:** `src/commands/sanguo/heroes.ts` — subcommand builder + embed render + component handler in ONE file, re-exported via `map.ts`.

**Subcommand builder** (heroes.ts:59-66): `SlashCommandSubcommandBuilder` + `setDescriptionLocalizations` for en-US/zh-CN, wrapped in `/* eslint-disable i18next/no-literal-string */` (static Discord API strings).

**Execute + handler shape** (heroes.ts:220-278): `fetchCommandContext` → `notRegistered` guard → try/catch with `logger.error('Scope', 'msg', err)` → `buildErrorEmbed(t('sanguo:shop.error'), shardId)` on catch. Component handler: `deferUpdate()` → `resolveComponentUser` (utils/componentContext.ts:25-45) → `parseInt` + `isNaN` guard on the customId suffix → FOR UPDATE tx → re-render embed.

**Registration** (map.ts:14-57 EXTEND): add `shopSubcommand`/`bagSubcommand` to the `.addSubcommand(...)` chain + dispatch in `execute` (map.ts:90-112) + re-export handlers at map.ts:25-35 so `interactionCreate` can find them via `client.commands.get('sanguo')`.

---

### `src/commands/sanguo/legion.ts` (controller, request-response)

**Analog:** `src/commands/sanguo/hero.ts` — ownership-gated detail + press handlers. Copy the `resolveOwnedHero` (hero.ts:142-170) + `renderHeroDetail` (hero.ts:178-219) + `handleCompanionPress` (hero.ts:269-348) trio; the copy-selector select menu (paged at 25, D-04) is a `StringSelectMenuInteraction` variant of the zone-filter menu (heroes.ts:395-454).

---

### `src/ui/embeds/buildSanguo*Embed.ts` (component, ×5 new)

**Analog:** `src/ui/embeds/buildSanguoHeroEmbed.ts` — the D-12 safe data-interface pattern.

**Data interface + builder** (buildSanguoHeroEmbed.ts:18-64):
```typescript
export interface SanguoHeroEmbedData {
  emoji?: string; name: string; stars: string; gradeKey: string;
  hpCurrent: number; hpMax: number; mp: number;
  isActive: boolean; fainted: boolean; shardId?: number;
}
export function buildSanguoHeroEmbed(data: SanguoHeroEmbedData, t: TFunction): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SEASON)
    .setTitle(t('sanguo:hero.title', { name: data.name }))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
  embed.addFields(
    { name: t('sanguo:hero.field_stars'), value: data.stars, inline: true },
    // ...
  );
  return embed;
}
```
**D-12 rule** (buildSanguoHeroEmbed.ts:15-17): "the data interface carries gradeKey + stars + HP/MP only — NO raw IV numbers, NO iv sum, NO rarity anywhere". Phase 11 never-render list: chemistry points/buff%, boss capture weights, skill rarity weights, wild-level %, tier multipliers. Embed colors ONLY from `theme.ts` COLORS (theme.ts:1-8).

---

### `src/ui/components/sanguo*Buttons.ts` (component, new)

**Analog:** `src/ui/components/sanguoCaptureButtons.ts` — customId contract constants + builder + anti-tamper comment.

**Pattern** (sanguoCaptureButtons.ts:8-37):
```typescript
// ANTI-TAMPER: customId carries ONLY the tier — the cost NEVER rides the payload.
export const CAPTURE_TIER_PREFIX = 'sanguo:capture:tier';
export function buildCaptureTierButtons(t: TFunction, tiers: { tier: number; fee: string }[]): ButtonBuilder[] {
  return tiers.map(({ tier, fee }) =>
    new ButtonBuilder()
      .setCustomId(`${CAPTURE_TIER_PREFIX}:${tier}`)
      .setLabel(t('sanguo:capture.tier_button', { tier, fee }))
      .setStyle(ButtonStyle.Primary));
}
```
Phase 11 prefixes: `sanguo:shop:*`, `sanguo:bag:*`, `sanguo:legion:*`, `sanguo:convert:*`, `sanguo:evolve:*`, `sanguo:reroll:*` (CONTEXT discretion). Row budget ≤5 (capture buttons comment lines 14-18).

---

### `scripts/data/sanguo-{skills,items,formations}.json` + `scripts/seed-sanguo.ts` (config seed + EXTEND)

**Analog:** `scripts/data/sanguo-base-stats.json` + its FATAL loader (seed-sanguo.ts:228-236):
```typescript
const BASE_STATS_PATH = fileURLToPath(new URL('./data/sanguo-base-stats.json', import.meta.url));
function loadBaseStats(): Record<string, HeroBaseStats> {
  try { return JSON.parse(fs.readFileSync(BASE_STATS_PATH, 'utf8')) as Record<string, HeroBaseStats>; }
  catch { console.error('[Seed] FATAL: … required'); process.exit(1); }
}
```
**Idempotent upsert** (seed-sanguo.ts:352-368): `insert(...).onConflictDoUpdate({ target: <natural key>, set: <clobber-safe spread> })` + fail-fast `if (!inserted) throw`. Placeholder `SANGUO_ITEMS` at seed-sanguo.ts:312-337 is REPLACED by the D-11 catalog (heal_pill / booster_x2 / capture_key). `onConflictDoUpdate` target = natural key `code` (sanguoItems.ts:12 unique). Item emojis are content columns, never theme constants (RESEARCH don't-hand-roll).

---

### `migrations/0020_*.sql` (migration)

**Pattern:** `drizzle-kit generate` + `npm run migrate` (never hand-written SQL). New tables: `sanguo_skills`, `user_hero_soulgems`, `user_legions`, `user_legion_slots`. Schema edits: `user_heroes` (+tier, +skill_normal_id, +skill_special_id), `sanguo_items` (+price currency model, +sale_state, +drop_weight), `encounter_runs` (+level, +skill ids), `formations` (+emoji). New schemas must be re-exported in `src/db/schema/index.ts` (barrel, index.ts:1-50 pattern).

---

### `src/services/sanguo/battleEngine.ts` (EXTEND — the phase's core engine work)

**Self-analog, non-breaking extension.** Preserve the D-05 contract; the Phase 10 test suite pins `runBattle(seed, player, enemy)` (battleEngine.test.ts:40-55 replay deep-equals). Add OPTIONAL `level?: number` to `CombatantInput` (battleEngine.ts:39-71) — absent → levelGain 0 → existing tests unchanged:
```typescript
/** Phase 11 (D-08): optional level — absent → levelGain 0 → Phase 10 behavior unchanged. */
level?: number;
```
The `eff()` helper (battleEngine.ts:132-134) becomes `base + iv + ((c.level ?? 1) - 1) * STAT_GAIN_PER_LEVEL`. Add `runLegionBattle(seed, input)` as a NEW export alongside `runBattle` (battleEngine.ts:185-273) — shared helpers (compareCombatants:148-156, clamp:143-145, BATTLE_CONFIG:119-129) stay DRY. Pure-module contract (battleEngine.ts:24-27): no db/redis/discord imports, no Math.random, no Date — support-effect trigger rolls (D-18) ride the seeded `uniformFloat64(rng)` only.

**Legion input snapshot** (D-17/D-31 replay contract): `{ mains[3]: buffed CombatantInput + level + skillIds, supports[9]: { heroId, class, lea, special }, boss: CombatantInput }` — exactly the values passed to the engine, stored in `sanguo_battles.input` jsonb (sanguoBattles.ts:31-35).

---

### `src/services/sanguo/battleCheckInService.ts` (EXTEND)

**Self-analog.** Replace the boss branch in `buildEnemyInput` (battleCheckInService.ts:146-165 — currently `bossTemplateFor(encounter.zone)` from the SUPERSEDED sanguoBoss.ts) with the real zone-general `heroes` row: t2 base × IV all-31 × L50 (D-24/D-35). Boss win → call `dropService` (guaranteed ≥1 item, D-14) + open capture. Add optional `level` to the player/enemy inputs from the encounter_runs level (D-33). Keep the FOR UPDATE tx, CR-02 `BATTLE_ALREADY_FOUGHT` guard (lines 256-261), `storeBattle` snapshot (189-216), and HP write-back (285-288).

---

### `src/services/sanguo/captureService.ts` (EXTEND)

**Self-analog.** REMOVE the `BOSS_CAPTURE_UNAVAILABLE` guard (captureService.ts:150) — one-way supersession, like the Phase 10 ack→battle inversion. Boss capture success branch (D-28/D-36) inserts the FRESH roll — random IV ×6 (`crypto.randomInt(0, 32)` pattern at captureService.ts:210-217), random tier t0 95 / t1 4.98 / t2 0.02 via `cryptoUniform()`, fixed level 20, skills from `encounter_runs` (D-31) — into `user_heroes` with the new `tier` column. Fees/chance unchanged (D-26 reuses `CAPTURE_TIERS`/`CAPTURE_BASE_BY_RARITY`).

---

### `src/events/interactionCreate.ts` (EXTEND)

**Self-analog.** Copy the sanguo prefix-routing blocks: `sanguo:capture:tier:` parseInt+isNaN guard (interactionCreate.ts:212-230) is the template for `sanguo:shop:buy:`, `sanguo:evolve:go:`, `sanguo:convert:go:`, `sanguo:reroll:slot:`; exact-id matches for `sanguo:bag:*`, `sanguo:legion:*`. Extend the `SanguoComponentHandlers` interface (lines 37-49) with the new handler signatures, dispatched via `interaction.client.commands?.get('sanguo')` — handlers re-exported by map.ts.

---

### Schema EXTENDs (models)

**`userHeroes.ts`** — add `tier: smallint` (D-10, t0-t3 with a `check` like the IV range checks at userHeroes.ts:43-49), `skillNormalId`/`skillSpecialId` integer FKs → `sanguo_skills` (D-31; per-copy columns chosen over a child table — exactly 2 slots, TM-swap semantics, zero joins per RESEARCH). NO unique (userId, heroId) stays (comment userHeroes.ts:9-10 — dupes are the D-03 conversion fuel).

**`sanguoItems.ts`** — replace single `basePrice` (sanguoItems.ts:20) with the price-currency model: `priceLinh bigint`, `priceEvent bigint`, `saleState varchar ('sold'|'locked')`, `dropWeight` (D-16). BigInt defaults use `sql`0`` (sanguoItems.ts:19-20 drizzle-kit bug comment).

**`encounterRuns.ts`** — `hero_id` comment flips (bosses now carry a real hero, encounterRuns.ts:28-30); add `level smallint`, `skillNormalId`/`skillSpecialId` FKs written at spawn (D-31/D-33). Keep the F2 index (lines 42-45).

**`formations.ts`** — add `emoji varchar` (UI-SPEC content-driven emoji); buy/sell logic (D-21) uses `basePrice` bigint (line 17) + `userFormations` (39-48) + `wallet.deductBalance`.

---

## Shared Patterns

### FOR UPDATE single-writer transaction
**Sources:** `battleCheckInService.ts:229-236`, `captureService.ts:131-137`, `hero.ts:286-323`, `heroes.ts:165-192` (upsert on missing one-row state)
**Apply to:** soulgemService (convert/level/evolve/reroll), shopService, bagService, legionService, hero.ts progression actions
```typescript
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const [row] = await tx.select().from(<userRow>)
  .where(eq(<userRow>.userId, userId)).for('update');
// re-fetch latest state inside the tx — never trust the press payload
```

### WHERE-guard deduction (hồn ngọc mirror of wallet)
**Source:** `wallet.ts:47-82` (`deductBalance`) — the `INSUFFICIENT_HON_NGOC` primitive mirrors this exactly
**Apply to:** soulgemService only (hồn ngọc is a SEPARATE account-bound per-hero resource — NEVER a `users.balance` flow; D-02)

### Crypto RNG for every player-facing roll
**Source:** `encounterService.ts:57-59` (`cryptoUniform`) + `captureService.ts:123-125` (injectable roll deps)
**Apply to:** skillService (spawn roll), encounterLevelService (wild level), dropService (boss drop), captureService boss branch (tier roll). pure-rand exists ONLY inside battleEngine.ts (D-06)

### Error convention — plain throw + err.message match
**Source:** `battleCheckInService.ts:35-37`, `captureService.ts:138`, `hero.ts:335-341`
**Apply to:** all services/commands
```typescript
if (err instanceof Error && err.message === 'NOT_OWNED') { /* friendly embed */ }
throw new Error('INSUFFICIENT_HON_NGOC'); // whole tx rolls back
```

### i18n zero-hardcoded strings
**Source:** `src/i18n/index.ts:28` (`sanguo` namespace), `locales/{vi,en,zh-cn}/sanguo.json` (parity via `npm run check-i18n`), eslint `i18next/no-literal-string` (disabled ONLY for static Discord API strings — heroes.ts:58)
**Apply to:** all new commands/embeds/components — new `shop/bag/legion/convert/level/evolve/skills/reroll` sections in `sanguo` namespace, 3 locales. Hero/zone/item names stay DB per-locale columns (`pickName` pattern — hero.ts:82-86)

### customId anti-tamper (prices/costs never in customIds)
**Source:** `sanguoCapture.ts:17-20`, `sanguoCaptureButtons.ts:8-12`, `interactionCreate.ts:212-230` (parseInt + isNaN guard)
**Apply to:** shop buy (`sanguo:shop:buy:{code}`), evolve (`sanguo:evolve:go:{id}`), reroll (`sanguo:reroll:slot:{n}`), convert (`sanguo:convert:go:{id}`)

### Hidden mechanics (D-12) — never-render enforced structurally
**Source:** `buildSanguoHeroEmbed.ts:15-17` (data interface carries visible fields only), `sanguoCapture.ts:22-24`
**Apply to:** all embeds — chemistry tier label + link count render; points/buff% never. Rolled level + stars/grade + MP cost + hồn ngọc costs render; rarity/weights/distributions never

### Injectable deps for deterministic tests
**Source:** `battleCheckInService.ts:51-63` (`BattleDeps`), `captureService.ts:90-97` (`CaptureDeps`), `battleEngine.test.ts:40-55` (replay deep-equals)
**Apply to:** soulgem/chemistry/shop/drop/legion/level tests — `__tests__/*.test.ts` beside the service (vitest, established layout)

### Content-in-DB reference data for chemistry
**Source:** `heroes.ts` schema (factionId/role/class/familyId — lines 55-83), `heroRelations.ts:12-33` (spouse pairs, undirected unique index), `heroFactions.ts:10-17` (flat reference table)
**Apply to:** chemistryService — links resolved by joins on these tables; `mainChemistryPoints` consumes `{ factionId, role, familyId }` + `spouseOfMain` flags; strict class-match (D-20) compares slot class vs `heroes.class` (heroes.ts:20-29 enum)

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/services/sanguo/dropService.ts` | service | event-driven | No post-win reward service exists; closest is the weighted pick in encounterService.ts:121-127 — use RESEARCH Pattern 4 numbers + shared FOR UPDATE/upsert patterns |
| `src/services/sanguo/legionService.ts` | service | CRUD (3+9 assembly) | No multi-row assembly service; closest is hero.ts:286-323 ownership tx — combine with formationSlots FK validation |

## Metadata

**Analog search scope:** `src/services/sanguo/*`, `src/services/wallet.ts`, `src/db/schema/*`, `src/commands/sanguo/*`, `src/events/interactionCreate.ts`, `src/ui/embeds/*`, `src/ui/components/*`, `src/ui/theme.ts`, `src/constants/*`, `src/i18n/*`, `src/utils/*`, `scripts/seed-sanguo.ts`, `scripts/data/*.json`, `locales/vi/sanguo.json`, `migrations/`
**Files scanned:** ~40
**Pattern extraction date:** 2026-08-14
