# Phase 8: Foundation, Economy Budget & Content Infrastructure — Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 30 (10 new, 9 edits, 4 refactor targets, 1 test, 1 doc, plus generated/barrel/i18n artifacts)
**Analogs found:** 27 / 30

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/wallet.ts` (NEW) | service | CRUD (tx-bound) | `src/services/farming/subscriptionService.ts` | exact |
| `src/db/schema/walletTransactions.ts` (NEW) | model | CRUD | `src/db/schema/footballBets.ts` + `farming.ts` | exact |
| `src/db/schema/heroes.ts` (NEW) | model | CRUD | `src/db/schema/items.ts` | role-match |
| `src/db/schema/mapNodes.ts` (NEW) | model | CRUD | `src/db/schema/items.ts` | role-match |
| `src/db/schema/sanguoItems.ts` (NEW) | model | CRUD | `src/db/schema/items.ts` | role-match |
| `src/db/schema/userHeroes.ts` (NEW) | model | CRUD | `src/db/schema/character_items.ts` | exact |
| `src/db/schema/userSanguoItems.ts` (NEW) | model | CRUD | `src/db/schema/character_items.ts` | exact |
| `src/db/schema/playerTravelState.ts` (NEW) | model | CRUD | `src/db/schema/farming.ts` (farmingSubscriptions) | role-match |
| `src/db/schema/sanguoBattles.ts` (NEW) | model | CRUD | `src/db/schema/footballBets.ts` | role-match |
| `src/db/schema/encounterRuns.ts` (NEW) | model | CRUD | `src/db/schema/farming.ts` (farmingAccounts) | role-match |
| `src/db/schema/index.ts` (EDIT) | config | — | self (existing barrel) | exact |
| `scripts/seed-sanguo.ts` (NEW) | script | batch / CRUD upsert | `src/db/seed.ts` | exact |
| `scripts/gen-sanguo-emojis.ts` (NEW) | script | file-I/O transform | `scripts/check-i18n.ts` (fs read) | partial |
| `src/assets/sanguoEmojis.ts` (GENERATED) | utility | static registry | `src/assets/emojis.ts` | exact |
| `src/assets/index.ts` (EDIT) | config | — | self (existing barrel) | exact |
| `src/i18n/index.ts` (EDIT) | config | — | self (ns array, line 28) | exact |
| `scripts/check-i18n.ts` (EDIT) | script | — | self (NAMESPACES, line 13) | exact |
| `locales/{vi,en,zh-cn}/sanguo.json` (NEW ×3) | config | i18n data | `locales/vi/football.json` | exact |
| `src/commands/sanguo/map.ts` (NEW) | controller | request-response | `src/commands/predictions/predictions.ts` | exact |
| `src/ui/embeds/buildSanguoMapEmbed.ts` (NEW) | component | transform | `src/ui/embeds/buildProfileEmbed.ts` | exact |
| `src/ui/index.ts` (EDIT) | config | — | self (existing barrel) | exact |
| `src/shard.ts` (EDIT) | startup | — | self (main() sequence) | exact |
| `package.json` (EDIT) | config | — | self (scripts block) | exact |
| `scripts/deploy.sh` (EDIT) | script | — | self (migrate step, line 23) | exact |
| `eslint.config.mjs` (EDIT, D-15) | config | — | self (rules block) | exact |
| `src/commands/game/gather.ts` (REFACTOR) | controller | request-response | self (lines 153–199) | self |
| `src/services/farming/subscriptionService.ts` (REFACTOR) | service | CRUD | self (lines 75–87, 150–161) | self |
| `src/services/football/predictionService.ts` (REFACTOR) | service | CRUD | self (lines 163–178) | self |
| `src/services/football/matchLifecycleService.ts` (REFACTOR) | service | CRUD | self (lines 357–360, 417–420, 433–436) | self |
| `src/services/__tests__/wallet.test.ts` (NEW) | test | — | `src/services/farming/__tests__/subscriptionService.test.ts` | exact |
| `docs/economy-budget.md` (NEW) | doc | — | no code analog — number sources verified in constants (see No Analog Found) | none |

---

## Pattern Assignments

### `src/services/wallet.ts` (service, CRUD — tx-bound)

**Analog:** `src/services/farming/subscriptionService.ts` — the proven `db.transaction` + WHERE-guard deduct + `INSUFFICIENT_BALANCE` template (D-02, D-03). Also `src/commands/game/gather.ts:153-182` (rowCount variant) and `src/services/football/predictionService.ts:163-178` (net-diff variant) define the semantics wallet must preserve.

**Imports pattern** (subscriptionService.ts:1-8):
```typescript
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { eq, sql } from 'drizzle-orm';
```

**Core deduct pattern — the exact semantics to centralize** (subscriptionService.ts:60-87):
```typescript
const result = await db.transaction(async (tx) => {
  // ... caller's other writes go here when a flow needs them (D-02: wallet accepts tx) ...
  if (price > 0n) {
    const updateResult = await tx
      .update(users)
      .set({ balance: sql`${users.balance} - ${price}` })
      .where(sql`${users.id} = ${userId} AND ${users.balance} >= ${price}`)
      .returning({ id: users.id });
    if (updateResult.length === 0) {
      throw new Error('INSUFFICIENT_BALANCE');
    }
  }
  // D-01: INSERT wallet_transactions row (balance_after, reason, metadata) in SAME tx
});
```

**Credit pattern (no guard needed)** (matchLifecycleService.ts:357-360, verbatim — used by `creditBalance`):
```typescript
await tx
  .update(users)
  .set({ balance: sql`${users.balance} + ${bet.wagerAmount}` })
  .where(eq(users.id, bet.userId));
```

**Deduct-with-rowCount variant** (gather.ts:158-170, verbatim — the pattern wallet must preserve for gather):
```typescript
const deductResult = await tx
  .update(users)
  .set({ balance: sql`${users.balance} - ${totalFee}` })
  .where(and(eq(users.discordId, char.discordId), sql`${users.balance} >= ${totalFee}`));
if ((deductResult.rowCount ?? 0) === 0) {
  throw new Error('INSUFFICIENT_BALANCE');
}
```

**Error-handling contract:** callers catch either the `'INSUFFICIENT_BALANCE'` string error (gather.ts:184, subscriptionService.ts:85) or the `InsufficientBalanceError` class (predictionService.ts:36-41, thrown at 176-178). Wallet must keep surfacing the same error types so refactored call sites behave identically.

**Behavior-preservation requirement (from RESEARCH.md TQC-01):** `gather.ts` and `subscriptionService` display the *pre-deduct* balance in error/success messages (gather.ts:106-120, 201). The wallet API should return `balanceAfter` (via `.returning({ balance: users.balance })`) or callers must keep pre-fetching.

**tx typing (from RESEARCH.md):** do NOT use `db: any` (predictionService.ts:49). Derive from `Parameters<typeof db.transaction>[0]` — `db` is `drizzle({ client: pool, schema })` (db/client.ts:21).

---

### `src/db/schema/walletTransactions.ts` (model, CRUD)

**Analog:** `src/db/schema/footballBets.ts` (FK + bigint currency + varchar status + check + index) and `src/db/schema/farming.ts:33` (jsonb `.$type`).

**Core schema pattern** (footballBets.ts:6-32, verbatim template):
```typescript
export const footballBets = pgTable(
  'football_bets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    wagerAmount: bigint('wager_amount', { mode: 'bigint' }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('wager_amount_non_negative', sql`${table.wagerAmount} >= 0`),
    index('football_bets_user_idx').on(table.userId),
  ]
);
```

**Per D-01 locked columns:** `userId` (FK → users.id), `type` (varchar or pgEnum `'deduct' | 'credit'` — pgEnum pattern at farming.ts:6-8), `amount` + `balance_after` as `bigint({ mode: 'bigint' })` (MANDATORY — users.ts:7 comment: *"never use mode: 'number' for currency"*), `reason` varchar(50), `metadata` jsonb `.$type<Record<string, unknown>>()` (farming.ts:33), `created_at`. Suggested index: `(user_id, created_at desc)` for future `/profile` history. DB-level non-negative guard already exists on `users.balance` (users.ts:15 `balance_non_negative` check) — do not duplicate.

**Type exports** (every schema file):
```typescript
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
```

---

### `src/db/schema/heroes.ts`, `mapNodes.ts`, `sanguoItems.ts` (model, CRUD — content tables)

**Analog:** `src/db/schema/items.ts` (catalog table with enum + content columns). **D-05 adds per-locale columns** — this is the NEW pattern for Phase 8; the OLD `nameI18nKey` pattern (items.ts:34) is explicitly NOT used for sanguo content (D-07).

**Core schema pattern** (items.ts:31-52, adapted):
```typescript
// pgEnum pattern for faction/role (farming.ts:6-8 verbatim):
export const heroFactionEnum = pgEnum('hero_faction', ['hoang_toc', 'thap_thuong_thi', /* ...10 factions */]);
export type HeroFaction = (typeof heroFactionEnum.enumValues)[number];

export const heroes = pgTable('heroes', {
  id: serial('id').primaryKey(),
  heroId: varchar('hero_id', { length: 50 }).notNull().unique(), // natural key for upsert (D-11)
  nameVi: varchar('name_vi', { length: 100 }).notNull(),  // from heroes-v1.json `name`
  nameEn: varchar('name_en', { length: 100 }).notNull(),  // from heroes-v1.json `en`
  nameZh: varchar('name_zh', { length: 100 }),            // Tavily-researched (D-06); filled by seed re-run
  faction: heroFactionEnum('faction').notNull(),
  // ...
});
```

**`map_nodes` (D-10):** `id`, `code` (varchar unique natural key), `name_vi/en/zh`, `zone`, `coordinates/order` (smallint). `user_heroes` (RESEARCH TQC-02): 6 IV columns `iv_hp, iv_atk, iv_def, iv_spd, iv_crit, iv_luck` as `smallint` with `check('iv_range', sql`${table.ivHp} >= 0 AND ${table.ivHp} <= 31`)` — check-constraint style from characters.ts:60.

---

### `src/db/schema/userHeroes.ts`, `userSanguoItems.ts` (model, CRUD — user-owned rows)

**Analog:** `src/db/schema/character_items.ts` (whole file, verbatim template for user-owned inventory with upsert-supporting unique index):
```typescript
export const characterItems = pgTable(
  'character_items',
  {
    id: serial('id').primaryKey(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    itemId: integer('item_id').notNull().references(() => items.id),
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    check('quantity_positive', sql`${table.quantity} > 0`),
    index('char_items_character_idx').on(table.characterId),
    uniqueIndex('char_items_unique_char_item').on(table.characterId, table.itemId),
  ],
);
```

---

### `src/db/schema/playerTravelState.ts`, `sanguoBattles.ts`, `encounterRuns.ts` (model, CRUD)

**Analog:** `src/db/schema/farming.ts` (farmingSubscriptions — userId FK unique + timestamps) and `footballBets.ts` (status varchar + resolvedAt for battle lifecycle). The key shared conventions:
- `userId: integer('user_id').references(() => users.id).notNull()` (farming.ts:23)
- `status: varchar('status', { length: 20 }).notNull().default('pending')` (footballBets.ts:21)
- `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` + `updatedAt` (footballBets.ts:23-24)
- `check` constraints for non-negative numeric fields (footballBets.ts:27)

---

### `src/db/schema/index.ts` (EDIT)

**Analog:** self — the existing merge pattern (index.ts:4-25). Add under a `// Phase 8 schemas` comment:
```typescript
// Phase 8 schemas
export * from './walletTransactions.js';
export * from './heroes.js';
export * from './userHeroes.js';
export * from './mapNodes.js';
export * from './playerTravelState.js';
export * from './sanguoBattles.js';
export * from './sanguoItems.js';
export * from './userSanguoItems.js';
export * from './encounterRuns.js';
```
Next generated migration is `0014_*` (journal has 0000–0013, verified this session).

---

### `scripts/seed-sanguo.ts` (script, batch upsert)

**Analog:** `src/db/seed.ts` — full structural template (connection, upsert, error handling, pool teardown).

**Connection pattern** (seed.ts:13-31, 565-570, verbatim):
```typescript
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js'; // NOTE: seed-sanguo.ts imports from src/db/schema/index.js

const DATABASE_URL = process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL'];
if (!DATABASE_URL) { console.error('...must be set'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const db = drizzle({ client: pool, schema });

seed()
  .catch((err) => { console.error('[Seed] Fatal error:', err); process.exit(1); })
  .finally(() => pool.end());
```

**Idempotent upsert (D-11)** (seed.ts:455-477, verbatim — sanguo uses plain unique constraints, so `targetWhere` is only needed for partial indexes):
```typescript
const [row] = await db
  .insert(schema.items)
  .values(itemDef)
  .onConflictDoUpdate({
    target: schema.items.nameI18nKey,       // sanguo: heroes.heroId, map_nodes.code
    // targetWhere: sql`is_unique = false`, // only for partial unique indexes — not needed for sanguo
    set: { type: itemDef.type, tier: itemDef.tier, /* updated fields incl. name_zh after Tavily */ },
  })
  .returning({ id: schema.items.id });
if (!row) throw new Error(`[Seed] Failed to upsert item: ${itemDef.nameI18nKey}`);
```

**Delete-then-reinsert for child rows** (seed.ts:510-525, verbatim — if any sanguo child rows need it):
```typescript
await db.delete(schema.recipeIngredients).where(sql`recipe_id = ${recipeRow.id}`);
```

**Hero content source (dev-time only, from RESEARCH):** `E:\Saeth\sanguo_assets\src\data\heroes-v1.json` — 132 heroes, each `{ id (snake_case), name (VI), en, title, faction (VI), weapon, detail, gender, people, role }`. 10 factions, 5 roles (`royal|eunuch|military|civil|religious`), 2 genders, 10 peoples. Deploy integration: add `npx tsx scripts/seed-sanguo.ts` after `drizzle-kit migrate` in `scripts/deploy.sh:23` (D-12).

---

### `scripts/gen-sanguo-emojis.ts` (script, file-I/O transform)

**Analog (partial):** `scripts/check-i18n.ts` for the fs-read + path conventions; `src/assets/emojis.ts` defines the emitted output shape. No existing generator in repo — use RESEARCH.md Pattern 4 for the emitted format.

**fs/path pattern** (check-i18n.ts:7-14, verbatim):
```typescript
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(readFileSync(filePath, 'utf-8'));
```

**Emitted shape (RESEARCH.md Pattern 4, recommended — agent's discretion per D-13):**
```typescript
// Generated by scripts/gen-sanguo-emojis.ts from emojis.json — DO NOT EDIT BY HAND.
export const SANSUO_EMOJI_APPLICATION_ID = '1381818375633899562' as const;
export const SANSUO_EMOJIS = { abt_t0: '1536202064185524378', /* 1056 entries */ } as const;
export type SanguoEmojiKey = keyof typeof SANSUO_EMOJIS;
export type SanguoTier = 0 | 1 | 2 | 3;
export function heroEmoji(heroId: string, tier: SanguoTier = 0, star = false): string {
  const key = `${heroId}_t${tier}${star ? '_star' : ''}` as SanguoEmojiKey;
  const id = SANSUO_EMOJIS[key] ?? SANSUO_EMOJIS[`${heroId}_t0` as SanguoEmojiKey]; // fallback to t0 — never empty
  return id ?? '';
}
export function assertEmojiApplicationId(registryAppId: string, clientId: string): boolean {
  return registryAppId === clientId; // pure — testable without env (testSetup.ts sets CLIENT_ID='1234567890')
}
```
Source: `E:\Saeth\sanguo_assets\assets\emojis.json` — `{ applicationId, emojis: { "<hero_id>_t0": "<emojiId>", ... } }`, 1056 keys = 132 heroes × 8 (4 tiers × star/normal), verified 1:1 hero coverage this session.

---

### `src/assets/sanguoEmojis.ts` (GENERATED, utility)

**Analog:** `src/assets/emojis.ts` (whole file, verbatim conventions to mirror):
```typescript
/**
 * Typed emoji registry. ALL custom Discord emoji strings must be declared here.
 * Never hardcode emoji IDs in command/event files.
 */
export const EMOJI = { SPIRIT_STONE: '💎', /* ... */ } as const;
export type EmojiKey = keyof typeof EMOJI;
```
Doc comment + `as const` + `keyof` type export. Add to barrel `src/assets/index.ts` (currently `export * from './emojis.js';` — append `export * from './sanguoEmojis.js';`).

**D-15 note (RESEARCH finding #2):** there is NO existing ESLint emoji rule — `eslint.config.mjs` has only TS-recommended + i18next rules. The "ESLint-enforced" claim in UI-SPEC is currently a doc-comment convention only. Planner must decide: custom `createRule` in `eslint.config.mjs` (~30–40 lines, `typescript-eslint` already a dependency) or convention + review. The i18next rule is NOT sufficient — `<:name:id>` markup inside template strings passes `words.exclude` (eslint.config.mjs:61-91).

---

### `src/i18n/index.ts` (EDIT) + `scripts/check-i18n.ts` (EDIT) + `locales/*/sanguo.json` (NEW ×3)

**Analog:** self + `locales/vi/football.json` for JSON structure.

**Namespace registration — both places (D-08):**
- `src/i18n/index.ts:28` — `ns: ['common', 'game', 'combat', 'marketplace', 'admin', 'football'],` → append `'sanguo'`
- `scripts/check-i18n.ts:13` — `const NAMESPACES = ['common', 'game', 'combat', 'marketplace', 'admin'];` → append `'sanguo'` AND `'football'` (RESEARCH finding #4: football is registered in i18n but missing from NAMESPACES — pre-existing lint gap; fix in the same change)

**Locale file structure** (locales/vi/football.json:1-9, verbatim — flat nested keys, VI is reference):
```json
{
  "predictions": {
    "title": "⚽ Dự Đoán Bóng Đá",
    "not_registered": "Bạn cần tạo nhân vật trước khi đặt cược.",
    "insufficient_balance": "Không đủ linh thạch. Cần tối thiểu {{amount}}."
  }
}
```
**UI-SPEC keys for `sanguo`:** `cmd.map.description`, `map.title`, `map.current_position`, `map.zones`, `map.nodes`, `map.empty`, `map.empty_hint`, `map.error`; reuse `common:errors.notRegistered` (do not duplicate). `lowerCaseLng: true` means directory is `zh-cn` (i18n/index.ts:27).

---

### `src/commands/sanguo/map.ts` (controller, request-response)

**Analog:** `src/commands/predictions/predictions.ts` — the exact subcommand skeleton recommended by RESEARCH (option a: top-level `sanguo` command with `addSubcommand('map')`, forward-compatible with `/sanguo heroes` in Phase 10). Command autodiscovery: `src/utils/commandLoader.ts:18-53` auto-loads any `src/commands/**/*.ts` exporting `data` + `execute` — the file drops in place, no registration edit needed.

**Command definition** (predictions.ts:18-55, verbatim pattern):
```typescript
/* eslint-disable i18next/no-literal-string -- slash commands name/description are static Discord API strings */
export const data = new SlashCommandBuilder()
  .setName('sanguo')
  .setDescriptionLocalizations({ /* ... */ })
  .addSubcommand((subcommand) =>
    subcommand
      .setName('map')
      .setDescription('Xem bản đồ Tam Quốc')
      .setDescriptionLocalizations({ /* en-US / zh-CN */ })
  );
/* eslint-enable i18next/no-literal-string */
```

**Execute skeleton** (predictions.ts:175-187 + gather.ts:85-95, verbatim — the not-registered guard is mandatory):
```typescript
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const { t, char, shardId } = await fetchCommandContext(interaction);
  if (!char) {
    await interaction.editReply({ embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)] });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  // map branch: query mapNodes → buildSanguoMapEmbed → non-ephemeral editReply
}
```
`fetchCommandContext` (commandContext.ts:32-56) returns `{ locale, t, char, user, shardId }`. Error paths use `buildErrorEmbed(t('sanguo:map.error'), shardId)` (buildErrorEmbed.ts:10-16). No message components in Phase 8 (UI-SPEC).

---

### `src/ui/embeds/buildSanguoMapEmbed.ts` (component, transform)

**Analog:** `src/ui/embeds/buildProfileEmbed.ts` — embed builder conventions (data interface + bound `t`, colors/emoji from theme, footer, `\u200b` separator).

**Builder signature + imports** (buildProfileEmbed.ts:1-3, 41, verbatim):
```typescript
import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, EMOJI, embedFooter } from '../theme.js';

export function buildProfileEmbed(data: ProfileEmbedData, t: TFunction): EmbedBuilder {
```

**Field/color/footer conventions** (buildProfileEmbed.ts:65-83, verbatim):
```typescript
return new EmbedBuilder()
  .setColor(COLORS.PRIMARY)              // sanguo map uses COLORS.SEASON 0x8B5CF6 (theme.ts:40)
  .setTitle(t('game:profile.title'))
  .addFields(
    { name: `${EMOJI.REALM} ${t('game:profile.realm')}`, value: realmName, inline: true },
    { name: '\u200b', value: '\u200b', inline: true },   // zero-width separator (UI-SPEC field-separator)
    // emoji-prefixed field names — never raw hex/emoji IDs (UI-SPEC hard rule)
  )
  .setFooter(embedFooter(shardId))       // embedFooter(shardId) — shard debug info
  .setTimestamp();
```
Content names in field values come from DB per-locale columns (`name_vi/en/zh` — D-07), NOT i18n keys. Emoji markers via `heroEmoji(heroId, tier)` only (D-15). Zero/empty branch: `map_nodes.length === 0` → `sanguo:map.empty` + `sanguo:map.empty_hint` copy. Export from `src/ui/index.ts` barrel (currently 3 named exports, ui/index.ts:1-3).

---

### `src/shard.ts` (EDIT — startup appId check, D-14)

**Analog:** self — insert into `main()` (shard.ts:26-67). Check must run before `client.login(config.DISCORD_TOKEN)` (line 66); recommended as first statement of `main()` (after `initI18n()` at line 29 is also fine). The pure `assertEmojiApplicationId()` helper must live in a module importable by vitest without env coupling (testSetup.ts:3 sets `CLIENT_ID = '1234567890'` — the equality check would fail under test if it read env directly).

**Fatal-exit pattern** (shard.ts:69-72, verbatim — mirror for the check):
```typescript
main().catch((err) => {
  logger.error('Shard', 'Fatal error during startup', err);
  process.exit(1);
});
```
Mismatch path: `logger.error(...)` + `process.exit(1)`. **Planner MUST include a `.env` update task** — `.env` currently has `CLIENT_ID=your_application_client_id` (RESEARCH finding #1); the D-16 contract requires `1381818375633899562`.

---

### Refactor targets (EDIT — replace inline balance writes with wallet calls)

All four sites are documented with exact line ranges in RESEARCH.md TQC-01. The wallet call replaces the inline `tx.update(users)` block INSIDE the existing transaction:

| Site | Current pattern (file:lines) | Wallet call |
|------|------------------------------|-------------|
| `src/commands/game/gather.ts` | WHERE-guard deduct, gather.ts:158-170, inside tx at 155 | `wallet.deductBalance(tx, user.id, totalFee, { reason: 'gather', metadata: { amount, feePerRoll, majorRealmIndex } })` — keep item grant (lines 172-181) in the SAME tx |
| `src/services/farming/subscriptionService.ts` | purchase deduct 75-87, upgrade deduct 150-161 | `wallet.deductBalance(tx, userId, price, { reason: 'farming_subscription', metadata: { planType, durationDays } })` / `{ reason: 'farming_upgrade', ... }` |
| `src/services/football/predictionService.ts` | net-diff update 163-178 (edit = refund old + wager new in one UPDATE) | `wallet.creditBalance(tx, userId, oldWagerAmount, { reason: 'bet_refund' })` then `wallet.deductBalance(tx, userId, wagerAmount, { reason: 'bet_wager' })` — or single net row with `metadata.edit = true` (agent's discretion, ledger MUST stay reconcilable) |
| `src/services/football/matchLifecycleService.ts` | 3 credits: void 357-360, push 417-420, payout 433-436 | `wallet.creditBalance(tx, bet.userId, X, { reason: 'bet_void' | 'bet_push' | 'bet_payout', metadata: { betId, matchId } })` |

**gather.ts matching note (RESEARCH TQC-01):** gather matches `users.discordId`, farming/football match `users.id`. Wallet should take the numeric `users.id` — gather's caller already has `char.discordId`; fetch `users.id` (or pass the pre-fetched `user` from `fetchCommandContext`, which already selects `users.balance`).

---

## Shared Patterns

### WHERE-Guard Atomic Balance Mutation (wallet core)
**Sources:** `subscriptionService.ts:75-87`, `gather.ts:158-170`, `predictionService.ts:163-178`
**Applies to:** `services/wallet.ts` + all 4 refactor sites. Deduct: `UPDATE users SET balance = balance - X WHERE id = $1 AND balance >= X` + empty-returning/rowCount-0 → insufficient-balance error → rollback. Credit: no guard. DB-level `balance_non_negative` check (users.ts:15) is the last line of defense.

### `db.transaction` + `FOR UPDATE` usage
**Source:** `subscriptionService.ts:60-106`, `predictionService.ts:63-221`, `matchLifecycleService.ts:334-345` (`.for('update', { skipLocked: true })` for batch jobs)
**Applies to:** wallet service, refactor sites, future Phase 9 jobs. Ledger INSERT must share the caller's transaction (D-01/D-02).

### Idempotent Upsert Seed
**Source:** `src/db/seed.ts:455-477` (`onConflictDoUpdate` + `target`), composite target per `gather.ts:177-180`
**Applies to:** `scripts/seed-sanguo.ts` (heroes by `hero_id`, map_nodes by `code`, items by natural key). Re-run safe — required for ZH-name backfill after Tavily research (D-06 + D-11).

### Typed Emoji Registry + Startup Contract
**Source:** `src/assets/emojis.ts:1-30` (doc comment + `as const` + type export); D-14 check in shard.ts
**Applies to:** `sanguoEmojis.ts` (generated), `heroEmoji()` sole render point, `assertEmojiApplicationId()` pure check. **Gap:** no ESLint rule exists today (RESEARCH finding #2) — planner decides rule vs convention.

### i18n Namespace Registration + Zero-Hardcoded-String
**Sources:** `src/i18n/index.ts:28` (`ns` array), `scripts/check-i18n.ts:13` (`NAMESPACES`), `eslint.config.mjs:23-92` (`i18next/no-literal-string` promoted to error; `scripts/**` ignored at line 109 so seed/generator scripts are exempt)
**Applies to:** `sanguo` namespace in both files (+ repair `football` gap), all `src/**/*.ts` sanguo code, `locales/*/sanguo.json`.

### Command Skeleton
**Source:** `src/commands/predictions/predictions.ts:175-187`, `src/commands/game/gather.ts:85-95`, `src/utils/commandContext.ts:32-56`
**Applies to:** `/sanguo map`. Pattern: `deferReply()` → `fetchCommandContext(interaction)` → not-registered guard with `buildErrorEmbed` → subcommand dispatch → embed reply.

### Embed Builder Conventions
**Source:** `src/ui/embeds/buildProfileEmbed.ts` (data interface + `t: TFunction`, COLORS/EMOJI/embedFooter from theme, `\u200b` separator, emoji-prefixed field names), `buildErrorEmbed.ts` (DANGER + EMOJI.ERROR)
**Applies to:** `buildSanguoMapEmbed.ts`. Colors only from `COLORS` in theme.ts:33-41 (map uses `SEASON` 0x8B5CF6).

### Schema Conventions (all new tables)
**Sources:** users.ts (bigint currency + check), footballBets.ts (FK + index + status varchar), farming.ts (pgEnum + jsonb `.$type`), character_items.ts (uniqueIndex for upsert), items.ts (catalog content columns)
**Applies to:** all 9 new schema files. Every file exports `$inferSelect`/`$inferInsert` types; merged into `index.ts` under a phase comment.

### Vitest DB Mock Pattern (wallet tests)
**Source:** `src/services/farming/__tests__/subscriptionService.test.ts:11-15, 56-71, 84-101` (verbatim):
```typescript
vi.mock('../../../db/client.js', () => ({ db: { transaction: vi.fn() } }));
const mockTx = { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), /* chain */ };
vi.mocked(db.transaction).mockImplementation(async (cb) => await cb(mockTx as any));
// insufficient balance = mockTx.returning resolves [] → expect(...).rejects.toThrow('INSUFFICIENT_BALANCE')
```

### Seed Script Connection + Teardown
**Source:** `src/db/seed.ts:24-31, 565-570`
**Applies to:** `scripts/seed-sanguo.ts`. `DATABASE_URL_DIRECT ?? DATABASE_URL`, `Pool max: 2`, `pool.end()` in `.finally()`. Add `"seed:sanguo": "tsx scripts/seed-sanguo.ts"` to package.json scripts (package.json:7-17) and the deploy.sh seed step after migrate (deploy.sh:23).

---

## No Analog Found

| File | Role | Data Flow | Reason / Source to Use Instead |
|------|------|-----------|-------------------------------|
| `docs/economy-budget.md` | doc | — | No code analog (design artifact, D-17). All numbers verified in code — cite these sources: `DAILY_CAP 10_000` game.ts:14; gather fee tiers `200n→400_000n` gatherFees.ts:17-30; farming prices `10000n/35000n/50000n` + upgrade `BigInt(daysLeft*1000)` subscriptionService.ts:19-32, 50-56; football `MIN_BET 100n / MAX_BET 1_000_000n` footballConfig.ts:8-11; VWAP bands 1.2×/0.7×/2.5× + 10% market fee are SPEC-ONLY (REQUIREMENTS.md MKT-02/03/04/07 — label "planned, not live"); new-user starting balance 0 (start.ts:75-79). `docs/` directory does not exist yet — create it. |
| `scripts/gen-sanguo-emojis.ts` | script | file-I/O transform | Partial only: fs-read conventions from check-i18n.ts:7-14, emitted shape from RESEARCH.md Pattern 4 (no generator precedent in repo). |

---

## Metadata

**Analog search scope:** `src/services/**`, `src/commands/**`, `src/db/schema/**`, `src/db/seed.ts`, `src/ui/**`, `src/assets/**`, `src/i18n/**`, `scripts/**`, `shard.ts`, `src/config.ts`, `src/utils/commandLoader.ts` + `commandContext.ts`, `eslint.config.mjs`, `package.json`, `locales/**`
**Files scanned:** 34 source files + locales + migrations journal + test suite
**Pattern extraction date:** 2026-08-10

**Key verification notes for the planner:**
- Next migration = `0014_*` (journal: 0000–0013 confirmed this session).
- `.env` CLIENT_ID is placeholder `your_application_client_id` — D-16 contract unsatisfied; startup check needs a `.env` fix task + pure testable `assertEmojiApplicationId()`.
- `scripts/check-i18n.ts` NAMESPACES is missing `football` (line 13) — repair alongside `sanguo`.
- No ESLint emoji rule exists — D-15 enforcement gap (custom rule vs convention).
- `deploy.sh` has migrate but no seed step — add `npx tsx scripts/seed-sanguo.ts` after line 23.
