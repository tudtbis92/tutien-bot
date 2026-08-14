# Phase 10: Battle & Capture — Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 25 (13 new, 12 modified)
**Analogs found:** 23 / 25 (2 modified files are self-extensions with no external analog needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/sanguo/battleEngine.ts` (new) | service (pure fn) | transform (deterministic) | `src/services/sanguo/encounterService.ts` | exact (pure, no I/O) |
| `src/services/sanguo/battleCheckInService.ts` (new) | service | CRUD + event-driven | `src/services/sanguo/travelCheckInService.ts` | exact |
| `src/services/sanguo/captureService.ts` (new) | service | CRUD (single-writer tx) | `src/services/sanguo/travelCheckInService.ts` + `src/services/wallet.ts` | role-match |
| `src/services/sanguo/__tests__/battleEngine.test.ts` (new) | test | pure-fn assertions | `src/services/football/__tests__/oddsCalculator.test.ts` + `src/services/__tests__/wallet.test.ts` | role-match |
| `src/services/sanguo/__tests__/captureService.test.ts` (new) | test | mock-tx assertions | `src/services/__tests__/wallet.test.ts` | role-match |
| `src/commands/sanguo/battle.ts` (new) | controller | request-response | `src/commands/sanguo/travel.ts` | exact |
| `src/commands/sanguo/heroes.ts` (new) | controller | request-response + CRUD | `src/commands/sanguo/travel.ts` + `map.ts` | role-match |
| `src/commands/sanguo/hero.ts` (new) | controller | request-response | `src/commands/sanguo/travel.ts` | role-match |
| `src/ui/embeds/buildSanguoBattleLogEmbed.ts` (new) | component | request-response (render) | `src/ui/embeds/buildSanguoEncounterEmbed.ts` | exact |
| `src/ui/embeds/buildSanguoCaptureEmbed.ts` (new) | component | request-response | `src/ui/embeds/buildSanguoAckEmbed.ts` | exact |
| `src/ui/embeds/buildSanguoHeroesEmbed.ts` (new) | component | request-response | `src/ui/embeds/buildSanguoMapEmbed.ts` | role-match |
| `src/ui/embeds/buildSanguoHeroEmbed.ts` (new) | component | request-response | `src/ui/embeds/buildSanguoAckEmbed.ts` | role-match |
| `src/ui/components/sanguoBattleButtons.ts` (new) | component | request-response | `src/ui/components/sanguoTravelButtons.ts` | exact |
| `src/ui/components/sanguoCaptureButtons.ts` (new) | component | request-response | `src/ui/components/sanguoTravelButtons.ts` | exact |
| `src/ui/components/sanguoStarterButtons.ts` (new) | component | request-response | `src/ui/components/sanguoTravelButtons.ts` | role-match |
| `src/ui/components/sanguoHeroesZoneMenu.ts` (new) | component | request-response | `src/ui/components/sanguoTravelDestinationMenu.ts` | exact |
| `src/ui/components/sanguoHeroCompanionButton.ts` (new) | component | request-response | `src/ui/components/sanguoTravelButtons.ts` | role-match |
| `src/db/schema/captureAttempts.ts` (new) | model | CRUD (audit) | `src/db/schema/walletTransactions.ts` | exact |
| `src/db/schema/userSanguoState.ts` (new) | model | CRUD | `src/db/schema/playerTravelState.ts` | exact |
| `src/constants/sanguoCapture.ts` (new, tier config) | config | — | `src/constants/gatherFees.ts` | exact |
| `scripts/data/sanguo-base-stats.json` (new) | config/data | — | `scripts/data/sanguo-classifications.json` | exact |
| `src/db/schema/heroes.ts` (modify) | model | CRUD | self — add 8 base-stat columns + `rarity` + `tier` (D-02/D-08) | self-extension |
| `src/db/schema/userHeroes.ts` (modify) | model | CRUD | self — add `hp_current` + `captured_zone` (D-04/A5) | self-extension |
| `src/db/schema/sanguoBattles.ts` (modify) | model | CRUD | self — add `encounter_id`/`type`/`seed`/`input`/`result` (D-06/A6) | self-extension |
| `src/db/schema/encounterRuns.ts` (modify) | model | CRUD | self — add `pity_count` + status vocab (D-11/A7) | self-extension |
| `src/db/schema/index.ts` (modify) | config | — | self — add `captureAttempts` + `userSanguoState` re-exports | self-extension |
| `migrations/0019_*.sql` (new) | migration | — | `migrations/0018_sanguo_travel_map.sql` | exact (drizzle-kit output) |
| `src/events/interactionCreate.ts` (modify) | middleware/router | event-driven | self — add `sanguo:battle:*` / `sanguo:capture:*` prefix routes | self-extension |
| `src/commands/sanguo/map.ts` (modify) | controller | request-response | self — add battle/heroes/hero subcommands (D-01) | self-extension |
| `src/commands/sanguo/travel.ts` (modify) | controller | request-response | self — replace ack button with battle entry (D-01) | self-extension |
| `scripts/seed-sanguo.ts` (modify) | utility | batch | self — base stats + rarity + starter roster | self-extension |
| `package.json` (modify) | config | — | self — add `pure-rand@8.4.2` (D-06) | self-extension |
| `docs/economy-budget.md` (modify) | doc | — | self — D-20 re-sign block (BLOCKING) | self-extension |
| `locales/{vi,en,zh-cn}/sanguo.json` (modify) | config (i18n) | — | self — add battle/capture/heroes/hero keys | self-extension |

## Pattern Assignments

### `src/services/sanguo/battleEngine.ts` (service, pure deterministic transform)

**Analog:** `src/services/sanguo/encounterService.ts` — the codebase's existing "pure math only, no db/redis imports, callers own I/O" module (header comment lines 22-24).

**Module contract pattern** (encounterService.ts:1-24) — copy the header style; note the testable `rng` param injection:
```typescript
import crypto from 'node:crypto';
// CRYPTO RNG MANDATE ... every player-facing roll rides crypto.randomInt ...
// No db/redis imports — the check-in loop owns I/O (single-writer rule);
// this module is pure math only (analog: oddsCalculator.ts).
```

**Pure-fn export pattern** (encounterService.ts:57-59) — `cryptoUniform()` is the crypto RNG to reuse in battleCheckInService/captureService:
```typescript
export function cryptoUniform(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}
```

**Seeded engine skeleton** — from RESEARCH.md Pattern 1 (lines 238-265) + pure-rand README (lines 369-385). The ONLY new dependency; battle-internal only:
```typescript
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformFloat64 } from 'pure-rand/distribution/uniformFloat64';

export interface CombatantInput {
  heroId: string;                 // display identity only — engine never touches DB
  base: { str: number; agi: number; int: number; mov: number; lea: number; cha: number; hp: number; mp: number };
  iv: { str: number; agi: number; int: number; mov: number; lea: number; cha: number };
  hpCurrent: number;
  isPlayer: boolean;              // tie-break: attacker first (D-05)
}
export interface TurnLog { round: number; attacker: string; defender: string; hit: boolean; crit: boolean; dmg: number; defenderHpAfter: number; }
export interface BattleResult { roundLogs: TurnLog[]; winner: 'player' | 'enemy'; rounds: number; totalDamagePlayer: number; totalDamageEnemy: number; playerHpAfter: number; enemyHpAfter: number; }

export function combatStat(base: number, iv: number): number { return base + iv; } // D-05 locked

export function runBattle(seed: number, player: CombatantInput, enemy: CombatantInput): BattleResult {
  const rng = xoroshiro128plus(seed);
  // deterministic loop per D-05: MOV desc (tie → AGI, tie → attacker first),
  // damage = max(atk − def, 1), hit/crit from AGI, crit ×2, round cap 20,
  // winner = higher total damage, tie → higher remaining HP%.
  void rng; void uniformFloat64;
  throw new Error('TODO: engine body (D-05 formula)');
}
```

**Replay contract (D-06):** `runBattle(seed, input)` twice → deep-equal `roundLogs`. Input is the FULL stat snapshot (base+IV+hpCurrent both sides) stored in `sanguo_battles.input` jsonb at battle start. No `Math.random`, no DB reads, no global state.

**Anti-pattern:** pure-rand imported ONLY in this file (Pitfall 4, RESEARCH:337).

---

### `src/services/sanguo/battleCheckInService.ts` (service, CRUD + event-driven)

**Analog:** `src/services/sanguo/travelCheckInService.ts` — exact structural match: FOR UPDATE single-writer tx, F2 pending-encounter re-fetch, `Tx` type, injected-deps pattern for tests.

**Imports pattern** (travelCheckInService.ts:1-18):
```typescript
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { redis } from '../../cache/redis.js';
import { logger } from '../../utils/logger.js';
import { cryptoUniform } from './encounterService.js';
```

**Tx type + single-writer rule** (travelCheckInService.ts:77-78, 28-33):
```typescript
/** Tx type of db.transaction's callback (drizzle 0.45.2 — established pattern). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```
Header comment: "Single-writer rule (Pitfall 5): THIS transaction is the only writer of [state rows]". Battle start locks the player's own rows; cap/pity checks inside the tx.

**FOR UPDATE locked read + F2 pending re-fetch** (travelCheckInService.ts:196-203, 211-218) — THE battle/capture entry state:
```typescript
return db.transaction(async (tx) => {
  const [row] = await tx
    .select()
    .from(playerTravelState)
    .where(eq(playerTravelState.userId, userId))
    .for('update');
  // ...
  if (row.encounterActive) {
    const [pending] = await tx
      .select()
      .from(encounterRuns)
      .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
      .orderBy(desc(encounterRuns.id))
      .limit(1);
    // Indexed by encounter_runs_user_status_idx (encounterRuns.ts:30) — reuse, never re-roll.
  }
```

**Injected-deps pattern for deterministic tests** (travelCheckInService.ts:86, 190-194):
```typescript
function makeDefaultRollMinute(tx: Tx, userId: number, travelId: number): RollMinuteFn { ... }
export async function checkInTravel(userId: number, deps: { rollMinute?: RollMinuteFn } = {}): Promise<CheckInResult> {
  const injectedRoll = deps.rollMinute;
  // ... const rollMinute = injectedRoll ?? makeDefaultRollMinute(tx, userId, row.id);
```
Battle/capture: `makeDefaultBattleStart(tx, ...)` + `deps` injection for the battle engine + RNG.

**Status-transition WHERE-guard** (travelCheckInService.ts:283-290) — resolution (win→capture/loss/skip/retreat) always clears `encounterActive` and pins `updatedAt=now` inside the tx (Pitfall 7, RESEARCH:352):
```typescript
await tx
  .update(playerTravelState)
  .set({ travelSecondsRemaining: remaining, encounterActive: true, updatedAt: addMinutes(row.updatedAt, k) })
  .where(eq(playerTravelState.userId, userId));
```

**Error convention:** throw `new Error('CODE')` (e.g. `NO_PENDING_ENCOUNTER`, `HERO_FAINTED`), matched by `err.message` in the command layer — see travel.ts:497-504 pattern.

---

### `src/services/sanguo/captureService.ts` (service, CRUD single-writer tx)

**Analog:** `travelCheckInService.ts` (tx shape, F2 re-fetch) + `wallet.ts` (fee path). RESEARCH Pattern 2 skeleton (lines 271-287).

**Capture attempt tx** (RESEARCH.md:272-287) — one `FOR UPDATE` tx: lock pending encounter → compute chance from locked row → `deductBalance` → crypto roll → pity++/flee → audit insert → status transition:
```typescript
const result = await db.transaction(async (tx) => {
  const [encounter] = await tx.select().from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id)).limit(1).for('update');
  if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');
  const chance = captureChance({ rarity, hpFraction, tierMultiplier, pity: encounter.pityCount }); // clamped [0,1]
  await deductBalance(tx, userId, tierFee, { reason: 'sanguo_capture_t' + tier, metadata: { encounterId: encounter.id, tier } });
  const roll = cryptoUniform();                       // crypto CSPRNG — never Math.random/pure-rand here
  const success = roll < chance;
  // success → 6× crypto.randomInt(0,32) IV → insert user_heroes (hp full) → encounter status 'captured'
  // fail → pity++ (UPDATE encounter_runs) + flee roll (crypto < fleeRate(rarity)) → 'fled' | stays pending
  // EVERY attempt → insert captureAttempts audit row (incl. failures — TQC-11/SC2)
  return { success, roll, chance };
});
```

**Fee via wallet (D-03)** — wallet.ts:47-82 `deductBalance` signature + reason-length constraint (≤50 chars, walletTransactions.ts:21):
```typescript
export async function deductBalance(
  txOrDb: Tx | DbClient,   // Tx | typeof db — discriminates by OBJECT IDENTITY (wallet.ts:78)
  userId: number,
  amount: bigint,
  opts: WalletMutationOptions,   // { reason: string; metadata?: Record<string, unknown> }
): Promise<bigint>
// Throws Error('INSUFFICIENT_BALANCE') when the WHERE-guard matches zero rows — whole tx rolls back
```

**IV roll at capture (TQC-12):** `crypto.randomInt(0, 32)` ×6 — satisfies `userHeroes.ts:37-42` check constraints.

**IV grade (D-12 hidden mechanics)** — RESEARCH Common Operation 5 (lines 419-424); grade i18n keys (`iv_grade.gold/ruby/sapphire/jade/gray`):
```typescript
const IV_SUM_MAX = 186;
const pct = Math.round((ivStr + ivAgi + ivInt + ivMov + ivLea + ivCha) / IV_SUM_MAX * 100);
const gradeKey = pct === 100 ? 'iv_grade.gold' : pct >= 90 ? 'iv_grade.ruby' : pct >= 80 ? 'iv_grade.sapphire'
  : pct >= 60 ? 'iv_grade.jade' : 'iv_grade.gray';
```

**Anti-patterns (Pitfall 2/3):** display `floor(chance×100)`, roll against the exact chance, store both in the audit row; never put the fee in the customId — `sanguo:capture:tier:{n}` carries only the tier (RESEARCH:296).

---

### `src/services/sanguo/__tests__/battleEngine.test.ts` + `captureService.test.ts` (test)

**Analog for pure-fn tests:** `src/services/football/__tests__/oddsCalculator.test.ts` (same shape as encounterService) — pure input/output assertions, no mocks. **Analog for tx tests:** `src/services/__tests__/wallet.test.ts` — the full chainable mockTx surface.

**Mock-tx builder** (wallet.test.ts:19-34) — copy for captureService tests (FOR UPDATE chain + insert/values):
```typescript
function buildMockTx(returningResult: unknown, withTxFn = false) {
  const mockTx: any = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningResult),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue({}),
  };
  return mockTx;
}
```
Plus `vi.mock('../../db/client.js', () => ({ db: { transaction: vi.fn() } }))` (wallet.test.ts:10-14).

**Battle engine replay test (D-06 / Pitfall 1):** `runBattle(seed, input)` twice → `expect(roundLogs).toEqual(roundLogs)`; a seed-change → different sequence assertion; `combatStat` = base+IV.

---

### `src/commands/sanguo/battle.ts`, `heroes.ts`, `hero.ts` (controller, request-response)

**Analog:** `src/commands/sanguo/travel.ts` — exact structural match.

**Subcommand builder + handler exports** (travel.ts:39-47) — battle/heroes/hero each export a `SlashCommandSubcommandBuilder` + handler functions; `map.ts` composes them:
```typescript
/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const travelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('travel')
  .setDescription('Bắt đầu hành trình đến một địa danh')
  .setDescriptionLocalizations({
    'en-US': 'Start a journey to a landmark',
    'zh-CN': '开始前往一处地名的旅程',
  });
/* eslint-enable i18next/no-literal-string */
```

**Execute pattern** (travel.ts:304-354) — NO deferReply (parent `map.ts` owns it, line 60), `fetchCommandContext`, not-registered guard, try/catch → `logger.error` + `buildErrorEmbed`:
```typescript
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
  if (!char || !user) {
    await interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)] });
    return;
  }
  try {
    // ... business logic
    await interaction.editReply({ embeds: [...], components: [...] });
  } catch (err) {
    logger.error('BattleExecute', 'Error in /sanguo battle', err);
    await interaction.editReply({ embeds: [buildErrorEmbed(t('sanguo:battle.error'), shardId)] });
  }
}
```

**Button handler pattern** (travel.ts:520-577 `handleAckPress` is the direct template for `handleBattleStart`/`handleCaptureTierPress`/retreat/companion-switch): `deferUpdate()` → resolve user row (`users.discordId` → `users.id` — NEVER `char.id`, travel.test.ts:292-304) → `resolveLocale` + `getT` → FOR UPDATE tx → `editReply({ embeds, components: [] })` to clear stale buttons (CR-09-04/05).

**customId suffix parsing (F1)** (travel.ts:459-469) — tier number parsed then server-side validated:
```typescript
const selectedCode =
  interaction.customId === START_BTN_ID ? undefined
  : interaction.customId.slice(START_BTN_ID.length + 1);
```
For `sanguo:capture:tier:{n}`: parse with `parseInt` + `isNaN` guard (interactionCreate.ts:221-227 pattern), validate 1–5 server-side, fee from config — never from the payload.

**`map.ts` subcommand composition** (map.ts:29-38, 71-81) — add battle/heroes/hero subcommands + dispatch, re-export component handlers for the router:
```typescript
export { handleDestinationSelect, handleStartPress, handleAckPress } from './travel.js';
// ...
const subcommand = interaction.options.getSubcommand();
if (subcommand === 'travel') { await travelExecute(interaction); return; }
```

**Spar (`/sanguo battle`) caveats (D-17/D-04):** gate on active-companion HP > 0 (fainted → "đổi hero đồng hành trước" prompt, same block for spar); spar NEVER writes HP back.

---

### `src/ui/embeds/buildSanguoBattleLogEmbed.ts`, `buildSanguoCaptureEmbed.ts`, `buildSanguoHeroesEmbed.ts`, `buildSanguoHeroEmbed.ts` (component)

**Analog:** `buildSanguoEncounterEmbed.ts` / `buildSanguoAckEmbed.ts` — exact pattern: exported data interface + builder taking `(data, t)`.

**Embed builder pattern** (buildSanguoAckEmbed.ts:12-33) — theme colors NEVER hardcoded, i18n keys, footer/timestamp:
```typescript
export interface SanguoAckEmbedData {
  destinationName: string;
  remainingSeconds: number;
  shardId?: number;
}

export function buildSanguoAckEmbed(data: SanguoAckEmbedData, t: TFunction): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SEASON)            // theme.ts — never hardcode hex (UI-SPEC)
    .setTitle(t('sanguo:ack.title'))
    .setDescription(t('sanguo:ack.body', { node: data.destinationName, eta: humanizeEta(data.remainingSeconds, t) }))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
```
Fields variant: `buildSanguoMapEmbed.ts:25-28` `.addFields({ name: t(...), value: ..., inline })`.

**Battle log (D-07):** single embed, description-only, ≤20 turn lines (`≤ ~1,700 chars < 4,096` — Pitfall 8, RESEARCH:357). Never fields-per-round (25-field cap).

**D-12 contract:** render ONLY IV grade (`iv_grade.*` keys) + the single displayed capture % (`floor(chance×100)`); raw IV numbers and rarity NEVER rendered (Pitfall 6).

**Colors contract (UI-SPEC):** SEASON normal hero / GOLD boss (buildSanguoEncounterEmbed.ts:33); DANGER errors; SUCCESS capture success; WARNING/NEUTRAL per UI-SPEC.

**heroEmoji guard** (travel.ts:175-181) — `heroEmoji(heroRow.heroId)` in try/catch → name-only on `EMOJI_NOT_FOUND`:
```typescript
let heroEmojiMarkup: string | undefined;
try { heroEmojiMarkup = heroEmoji(heroRow.heroId); } catch { /* EMOJI_NOT_FOUND → name-only */ }
```

---

### `src/ui/components/sanguoBattleButtons.ts`, `sanguoCaptureButtons.ts`, `sanguoStarterButtons.ts`, `sanguoHeroCompanionButton.ts` (component)

**Analog:** `sanguoTravelButtons.ts` — exact: exported customId constants + builder functions.

**CustomId contract + builder pattern** (sanguoTravelButtons.ts:8-42):
```typescript
export const START_BTN_ID = 'sanguo:travel:start';
export const ACK_BTN_ID = 'sanguo:travel:ack';
// "sanguo:battle:*" / "sanguo:capture:*" namespaces (agent discretion, CONTEXT D-09)

export function buildStartButton(t: TFunction, disabled = true, destinationCode?: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(destinationCode ? `${START_BTN_ID}:${destinationCode}` : START_BTN_ID)
    .setLabel(t('sanguo:travel.start_button'))
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}
```
Capture tier buttons: customId `sanguo:capture:tier:{1|2|3}` carries ONLY the tier (never the fee — anti-tamper). Faint-block + retreat buttons per D-04/D-18.

### `src/ui/components/sanguoHeroesZoneMenu.ts` (component, StringSelectMenu)

**Analog:** `sanguoTravelDestinationMenu.ts` — exact: `StringSelectMenuBuilder` + `StringSelectMenuOptionBuilder`, emoji in `option.setEmoji()` (NOT label — CR-09-03), stable value codes.

**Select menu pattern** (sanguoTravelDestinationMenu.ts:17-58):
```typescript
export const DEST_MENU_ID = 'sanguo:travel:dest';
// zone filter: customId 'sanguo:heroes:zone' with zone code values; option label = zone per-locale name
const option = new StringSelectMenuOptionBuilder()
  .setLabel(label)
  .setValue(n.code)
  .setDescription(t('sanguo:travel.eta_minutes', { count: minutes, n: minutes }));
try { option.setEmoji(heroEmoji(n.representativeHeroId)); } catch { /* name-only */ }
```

---

### `src/db/schema/captureAttempts.ts` (model, audit table)

**Analog:** `walletTransactions.ts` — exact (audit-row philosophy, RESEARCH:126-127): first-class table + indexes for Phase 12 TQC-19 reports.

**Audit table pattern** (walletTransactions.ts:7-29):
```typescript
export const walletTransactions = pgTable('wallet_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  // ...
  reason: varchar('reason', { length: 50 }).notNull(),          // ≤50 chars
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('amount_non_negative', sql`${table.amount} >= 0`),
  index('wallet_transactions_user_created_idx').on(table.userId, table.createdAt),
]);
```
`capture_attempts` shape (RESEARCH A8): `user_id, encounter_id, tier, fee bigint, displayed_chance float8, roll float8, outcome ('success'|'fail'|'flee'), pity_before, created_at, index (user_id, created_at)` — the SC2 audit-proof (exact chance + roll stored).

### `src/db/schema/userSanguoState.ts` (model)

**Analog:** `playerTravelState.ts` — exact: one row per user (`userId` `.unique()`, line 21), `userId` FK to `users.id`.

**One-row-per-user state pattern** (playerTravelState.ts:15-35):
```typescript
export const playerTravelState = pgTable('player_travel_state', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  // ...state columns...
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```
`user_sanguo_state` (RESEARCH A4): `user_id unique, active_hero_id FK user_heroes.id, starter_views counter` (D-14 rotation).

### `src/constants/sanguoCapture.ts` (config, tier fees + capture constants)

**Analog:** `gatherFees.ts` — exact: readonly bigint[] fee table + helper.

**Fee-tier config pattern** (gatherFees.ts:17-30):
```typescript
export const GATHER_FEES: readonly bigint[] = [200n, 400n, 800n, /* ... */ 400_000n] as const;
```
Capture: `CAPTURE_TIERS: readonly { fee: bigint; multiplier: number; requiresItem?: string }[]` (5 tiers; tiers 4-5 item-gated, Phase 10 activates 1-3 — D-09). Fee stored as `bigint` to match `users.balance` (bigint, walletTransactions.ts:17). Draft values from RESEARCH A1 (T1=10💎×1.0 … T5=500💎×5.0) — MUST pass the D-20 re-sign before shipping.

### `scripts/data/sanguo-base-stats.json` (config/data)

**Analog:** `scripts/data/sanguo-classifications.json` — committed dev-time data, loaded in `seed-sanguo.ts` (lines 169-177) with a FATAL missing-file guard:
```typescript
const CLASSIFICATIONS_PATH = fileURLToPath(new URL('./data/sanguo-classifications.json', import.meta.url));
function loadClassifications(): Record<string, HeroClassification> {
  try { return JSON.parse(fs.readFileSync(CLASSIFICATIONS_PATH, 'utf8')) as Record<string, HeroClassification>; }
  catch { console.error('[Seed] FATAL: ... required'); process.exit(1); }
}
```
New file: `{ heroId: { str, agi, int, mov, lea, cha, hp, mp, rarity, tier } }` per hero (A2 template approach) + starter-set entries with starter-appropriate stats (D-14 names locked).

---

### Modified files (self-extensions)

| File | What changes | Pattern to follow |
|------|-------------|-------------------|
| `src/db/schema/heroes.ts` | +8 base-stat columns (str/agi/int/mov/lea/cha/hp/mp) + `rarity` smallint 1-5 + public `tier` (D-02/D-08, UI-SPEC) | Existing column style lines 39-65; add `check('rarity_range', sql\`...\`)` per `userHeroes.ts:37-42` |
| `src/db/schema/userHeroes.ts` | +`hpCurrent` smallint (0=fainted, default full) + `capturedZone` varchar(50) (A5) | Add to table def lines 12-34; keep IV checks |
| `src/db/schema/sanguoBattles.ts` | +`encounterId` nullable FK, `type` varchar('encounter'\|'spar'), `seed` bigint, `input` jsonb, `result` jsonb (D-06/A6) | Existing jsonb pattern line 16 |
| `src/db/schema/encounterRuns.ts` | +`pityCount` smallint default 0 (D-11); status vocab extends to captured/fled/skipped/escaped (A7) | Existing table def lines 11-32 |
| `src/db/schema/index.ts` | +`export * from './captureAttempts.js'` + `./userSanguoState.js'` | Commented group style lines 27-39 |
| `migrations/0019_*.sql` | drizzle-kit generate → then `npm run migrate` (RESEARCH:309) | Follow `migrations/0018_sanguo_travel_map.sql` (generated) |
| `src/events/interactionCreate.ts` | +`sanguo:battle:*` (battle start, tier buttons) + `sanguo:capture:*` (retry, retreat) prefix routes; REPLACE `ACK_BTN_ID` route (D-01) | Route-block pattern lines 92-120 (prefix `startsWith` for F1-suffixed, `===` for fixed); handlers registered on the `sanguo` command module via `SanguoComponentHandlers` interface lines 28-32 + map.ts re-export |
| `src/commands/sanguo/travel.ts` | ack button → "Chiến đấu" button (D-01); `buildAckRow` → battle row | In-place edit; keep `handleAckPress` FOR UPDATE resume semantics (lines 543-556) moved into battle resolution |
| `scripts/seed-sanguo.ts` | +base stats/rarity/tier in hero upsert (lines 340-394) + starter roster | Idempotent `onConflictDoUpdate` + clobber-safe `...(zh ? { nameZh: zh } : {})` spread (lines 371-390) |
| `package.json` | `npm install pure-rand@8.4.2` | dependencies block line 36-52 |
| `docs/economy-budget.md` | D-20 re-sign block with 5-tier capture-fee values + `E[net/hour]` recompute (≤20/hr pull-driven supply) | Follow AMENDMENT pattern line 6; new sign-off section per lines 108-128 |
| `locales/{vi,en,zh-cn}/sanguo.json` | +`battle`, `capture`, `heroes`, `hero`, `iv_grade` sections | Key-nesting style of current file (lines 19-58); 3-locale parity via `npm run check-i18n` |

---

## Shared Patterns

### Crypto RNG for every player-facing roll
**Source:** `src/services/sanguo/encounterService.ts:57-59`
**Apply to:** captureService (capture %, flee, IV), battleCheckInService (wild IV, battle seed), all command handlers
```typescript
export function cryptoUniform(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}
```
IV roll: `crypto.randomInt(0, 32)` ×6. Battle seed: `crypto.randomInt`. pure-rand is battle-internal ONLY (D-06) — import it in `battleEngine.ts` and nowhere else.

### FOR UPDATE single-writer transaction
**Source:** `src/services/sanguo/travelCheckInService.ts:196-218`
**Apply to:** battleCheckInService (battle start), captureService (every capture attempt), travel.ts resolution path
```typescript
return db.transaction(async (tx) => {
  const [row] = await tx.select().from(playerTravelState)
    .where(eq(playerTravelState.userId, userId)).for('update');
  const [pending] = await tx.select().from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id)).limit(1);
  // ... all reads/writes for this interaction inside the tx; throw Error('CODE') to roll back
});
```

### Wallet discipline
**Source:** `src/services/wallet.ts:47-82`
**Apply to:** captureService (every tier press), starter onboarding (NO wallet call — free faucet, D-19 exception)
```typescript
const balanceAfter = await deductBalance(tx, userId, feeAmount, {
  reason: 'sanguo_capture_t1',   // ≤ 50 chars
  metadata: { encounterId: encounter.id, tier, chance },
});
// Throws Error('INSUFFICIENT_BALANCE') → capture.insufficient i18n copy
```

### i18n zero-hardcoded-strings
**Source:** `src/i18n/index.ts:20-40` (ns list includes `sanguo`), `src/commands/sanguo/travel.ts:39-47` (eslint-disable only for static Discord API strings)
**Apply to:** ALL new embeds/buttons/commands. Every user-facing string via `t('sanguo:<section>.<key>')`; 3-locale parity via `npm run check-i18n`; content names (hero/zone) from DB per-locale columns, never i18n keys (D-07).

### Embed/component theme
**Source:** `src/ui/theme.ts:33-41` (`COLORS`), `src/ui/theme.ts:49-51` (`embedFooter`)
**Apply to:** all 4 new embeds + 5 new component builders. Never hardcode hex; `setColor(COLORS.SEASON|GOLD|DANGER|SUCCESS|WARNING|NEUTRAL)` per UI-SPEC; `embedFooter(shardId)` on every embed.

### Error handling
**Source:** `src/commands/sanguo/travel.ts:496-509` + `src/ui/embeds/buildErrorEmbed.ts`
**Apply to:** every command + button handler. Services throw `Error('MACHINE_CODE')`; controllers match `err.message` for known codes, fall back to `buildErrorEmbed(t('sanguo:<section>.error'), shardId)` with `components: []` (CR-09-04).
```typescript
} catch (err) {
  if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') { /* specific reply */ return; }
  logger.error('BattleExecute', 'Error in /sanguo battle', err);
  await interaction.editReply({ embeds: [buildErrorEmbed(t('sanguo:battle.error'), shardId)], components: [] });
}
```

### Hidden mechanics (D-12)
**Source:** RESEARCH Common Operation 5 (IV grade) + `buildSanguoEncounterEmbed.ts` (color contract)
**Apply to:** heroes/hero embeds (grade only), capture embed (single `floor(chance×100)` %), collection lines (emoji + name + public tier + IV grade — never rarity/raw IV). Grade keys `iv_grade.gold/ruby/sapphire/jade/gray`.

### Idempotent seed upsert
**Source:** `scripts/seed-sanguo.ts:371-391`
**Apply to:** base-stats/rarity content pass + starter roster; clobber-safe spread prevents NULL-clobbering researched values:
```typescript
.onConflictDoUpdate({
  target: schema.heroes.heroId,
  set: { nameVi: row.nameVi, /* ...new columns... */ ...(zh ? { nameZh: zh } : {}) },
})
```

### Component routing
**Source:** `src/events/interactionCreate.ts:92-120` (prefix vs exact match) + `src/commands/sanguo/map.ts:19` (re-export handlers)
**Apply to:** `sanguo:battle:*` and `sanguo:capture:*` routes — prefix `startsWith` for F1-suffixed ids (`sanguo:capture:tier:{n}`), exact `===` for fixed ids; every route wrapped in try/catch with `logger.error`; dispatch via `interaction.client.commands?.get('sanguo')`.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/services/sanguo/battleEngine.ts` | service | transform | No seeded-replay engine exists; closest are pure-fn modules (`encounterService.ts`, `oddsCalculator.ts`) — engine body is new code per D-05 formula + pure-rand (RESEARCH Pattern 1 skeleton) |
| `scripts/data/sanguo-base-stats.json` | config/data | — | New content dataset; format follows `sanguo-classifications.json` + RESEARCH A2 template approach |
| `docs/economy-budget.md` re-sign | doc | — | New amendment block; follows the existing AMENDMENT pattern (line 6) but content is the D-20-priced 5-tier table (RESEARCH A1 draft) |

## Metadata

**Analog search scope:** `src/services/sanguo/*`, `src/services/*`, `src/services/football/*`, `src/db/schema/*`, `src/commands/sanguo/*`, `src/events/*`, `src/ui/embeds/*`, `src/ui/components/*`, `src/ui/theme.ts`, `src/assets/sanguoEmojis.ts`, `src/constants/*`, `src/i18n/*`, `src/utils/*`, `scripts/*`, `scripts/data/*`, `locales/vi/sanguo.json`, `migrations/*`, `docs/economy-budget.md`, `package.json`, `vitest.config.ts`
**Files scanned:** 40+
**Pattern extraction date:** 2026-08-13
