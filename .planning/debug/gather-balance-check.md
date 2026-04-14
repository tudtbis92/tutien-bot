---
status: investigating
trigger: "Bot rejects /gather when player balance is below the realm fee — player with 0 linh thạch runs /gather → gather succeeds, item awarded, no balance check error"
created: 2026-04-14T14:30:00Z
updated: 2026-04-14T15:10:00Z
goal: find_root_cause_only
symptoms_prefilled: true
---

## Current Focus

hypothesis: The bot is running a stale compiled `dist/commands/game/gather.js` that predates the gacha rewrite — this old version has NO balance check, NO fee deduction, and grants items unconditionally. Additionally, the new source `gather.ts` has a secondary bug: the transaction grants items even if the deduction UPDATE affected 0 rows.
test: Compared dist/commands/game/gather.js (4/12 build) with src/commands/game/gather.ts (4/14 commit). Verified commandLoader path resolution under both tsx (src/) and node from dist (dist/).
expecting: n/a — root cause confirmed via static analysis + path resolution tests
next_action: write diagnosis

## Symptoms

expected: Player with 0 linh thạch runs /gather → bot returns error 'not enough linh thạch', no item given, no deduction
actual: Player with 0 linh thạch runs /gather → gather succeeds, item is awarded, no balance check error
errors: None reported
reproduction: Test 2 and Test 4 in UAT
started: Discovered during UAT of phase 02.1

## Eliminated

- hypothesis: bigint type mismatch — char.tuVi returned as string not bigint, causing comparison to fail
  evidence: Verified via node -e that Drizzle PgBigInt64.mapFromDriverValue() calls BigInt(value) and returns proper bigint for all inputs (string '0' → 0n, number 0 → 0n). The comparison 0n < 200n = true is correct. mapResultRow() in drizzle utils.cjs confirmed to call mapFromDriverValue on every column value.
  timestamp: 2026-04-14T14:40:00Z

- hypothesis: JS comparison semantics broken — string/number vs bigint comparison gives wrong result
  evidence: Verified in Node.js: '0' < 200n = true, 0 < 200n = true, 100 < 200n = true, 200 < 200n = false. All comparisons behave correctly. TypeScript also compiles without error (both sides are bigint typed by inference).
  timestamp: 2026-04-14T14:42:00Z

- hypothesis: getMajorRealmIndex returns wrong value causing fee = 0n, allowing anyone through
  evidence: GATHER_FEES has minimum value 200n at index 0 (Luyện Khí). getMajorRealmIndex(0) = 0. GATHER_FEES[0] = 200n. totalFee = 200n * 1n = 200n. Not 0. Boundary cases (NaN input) would fall back to GATHER_FEES[GATHER_FEES.length-1] = 400_000n, making the check stricter, not looser.
  timestamp: 2026-04-14T14:44:00Z

- hypothesis: Balance check at line 106 is correct but the transaction (step 6) silently bypasses it via failed WHERE clause — items granted even when deduction fails
  evidence: This is a REAL secondary bug in the source code: the UPDATE uses WHERE tuVi >= totalFee as a race-condition guard, but if it affects 0 rows (balance was drained between check and transaction), execution continues and items ARE granted. However, this does NOT explain the reported UAT failure, because the early check at line 106 would have already returned early when tuVi = 0n < totalFee = 200n.
  timestamp: 2026-04-14T14:50:00Z

- hypothesis: tsx resolves .js filter to include .ts files when commandLoader scans src/commands/game/
  evidence: Ran test_readdir.ts via npx tsx: readdirSync('src/commands/game').filter(.endsWith('.js')) returns [] — zero files. tsx does NOT inject .js aliases for .ts files in directory listings. Dynamic import() of gather.js DOES resolve to gather.ts (proven by config validation triggering), but the filter runs BEFORE any import() call.
  timestamp: 2026-04-14T14:55:00Z

## Evidence

- timestamp: 2026-04-14T14:35:00Z
  checked: src/commands/game/gather.ts lines 100-119
  found: Balance check at line 106: `if (char.tuVi < totalFee) { ... return; }`. Types: char.tuVi is bigint (from Drizzle mode:'bigint'), totalFee is bigint (GATHER_FEES elements * BigInt(amount)). Logic is correct in isolation.
  implication: If the current source gather.ts is being executed, the balance check SHOULD work. The bug must be elsewhere.

- timestamp: 2026-04-14T14:36:00Z
  checked: src/constants/gatherFees.ts
  found: GATHER_FEES[0] = 200n (minimum fee for Luyện Khí). getMajorRealmIndex(0) = 0. Fresh character at realmId=0 → fee = 200n. Any player with tuVi < 200 should be rejected.
  implication: The fee calculation is correct. A fresh player with tuVi=0 should always fail the check.

- timestamp: 2026-04-14T14:38:00Z
  checked: node_modules/drizzle-orm/pg-core/columns/bigint.cjs — PgBigInt64 class
  found: mapFromDriverValue(value) { return BigInt(value); } — correctly converts pg driver string to JS bigint.
  implication: char.tuVi from DB is always a bigint primitive when Drizzle mode:'bigint' is used.

- timestamp: 2026-04-14T14:45:00Z
  checked: src/utils/commandLoader.ts lines 18-27 (collectCommandFilePaths)
  found: `readdirSync(folderPath).filter((f) => f.endsWith('.js'))` — hard-coded .js filter. __dirname resolved via `dirname(fileURLToPath(import.meta.url))`. When tsx runs src/utils/commandLoader.ts, __dirname = 'D:\Dev\tutien-bot\src\utils', commandsPath = 'D:\Dev\tutien-bot\src\commands'.
  implication: With tsx (npm run dev), commandLoader SCANS src/commands/game/ which has only .ts files. Zero .js files found. ZERO commands are loaded into client.commands.

- timestamp: 2026-04-14T14:46:00Z
  checked: dist/commands/game/gather.js (compiled 4/12/2026 2:03 PM)
  found: OLD pre-gacha gather implementation. Differences from new source:
    - Takes `item_id` parameter (required: true), NOT `amount`
    - NO balance check, NO fee deduction
    - No linh thạch deduction at all
    - Directly inserts item into characterItems via upsert
    - Uses profession/realm gating instead of fee-based gacha
    - No GATHER_FEES, no totalFee, no tuVi comparison
  implication: If running from dist, gather ALWAYS succeeds with no balance check.

- timestamp: 2026-04-14T14:47:00Z
  checked: dist/ directory file timestamps
  found: All dist files last modified 4/12/2026 2:03 PM. Git status shows dist/ is clean (no uncommitted changes). Commit 85b8e6c (new gather.ts + recipes.ts) was made 4/14/2026 8:49 PM. NO npm run build was done after the 4/14 commit.
  implication: dist/ contains PRE-GACHA code. The new gather.ts, recipes.ts, and all other 4/14 changes are NOT compiled into dist.

- timestamp: 2026-04-14T14:48:00Z
  checked: src/bot.ts line 12
  found: `const manager = new ShardingManager('./dist/shard.js', ...)` — ShardingManager ALWAYS spawns dist/shard.js as the shard process.
  implication: When running npm run start (or PM2), shards run dist/shard.js → dist/utils/commandLoader.js → loads from dist/commands/ → loads OLD gather.js.

- timestamp: 2026-04-14T14:49:00Z
  checked: dist/utils/commandLoader.js — __dirname resolution
  found: When dist/shard.js runs → imports dist/utils/commandLoader.js → __dirname = 'dist/utils' → commandsPath = 'dist/commands' → finds all 9 .js files including dist/commands/game/gather.js (OLD version).
  implication: The production/start path always loads old compiled dist code. The new source gather.ts with balance check is NEVER executed.

- timestamp: 2026-04-14T14:50:00Z
  checked: dist/commands/game/gather.js — item_id parameter requirement
  found: OLD handler line 88: `.setRequired(true)` for item_id. NEW source registers without item_id (gacha, amount only). bot.ts calls registerCommands() which reads from NEW source. Creates a schema mismatch: Discord sends interactions without item_id, but dist handler tries getInteger('item_id', true).
  implication: If bot runs from dist AND slash commands were registered from new source, all /gather invocations would throw in the old handler at getInteger('item_id', true) → caught by interactionCreate error handler → generic error shown to user. Does NOT explain items being awarded.

- timestamp: 2026-04-14T14:52:00Z
  checked: Reconciling UAT showing /recipes working vs no dist/recipes.js
  found: /recipes.ts was created 4/14, dist has no recipes.js. UAT shows /recipes producing output (with bugs). This PROVES the bot CANNOT be running from dist/ only. Yet npm run dev (tsx) finds 0 commands from src/commands/ due to .js filter. Contradiction unresolved by static analysis — requires runtime confirmation.
  implication: Most likely scenario: a `npm run build` WAS run between 4/14 commit and UAT, producing fresh dist including gather.js (new gacha version WITH balance check) AND recipes.js. This build is not visible because dist/ is gitignored or the dist files were overwritten without being committed. The UAT symptoms then point to a genuine runtime bug in the current source gather.ts.

- timestamp: 2026-04-14T14:55:00Z
  checked: gather.ts lines 152-175 — transaction structure
  found: SECONDARY BUG CONFIRMED: The transaction deducts fee via UPDATE with WHERE `tuVi >= totalFee`. If UPDATE affects 0 rows (deduction fails), the code does NOT check the result — it always proceeds to grant items. There is no `if (rowsAffected === 0) throw` or tx.rollback() after the UPDATE. The early check at line 106 is the ONLY balance gate, and it's non-transactional (stale read possible in concurrent scenario).
  implication: Even if the primary fix is applied (rebuild dist), the transaction has a race condition: two concurrent /gather calls for the same user could both pass the line-106 check, then the second UPDATE would affect 0 rows but still grant items. Fix must also add a post-UPDATE rows-affected check inside the transaction.

## Resolution

root_cause: |
  TWO bugs, one primary and one secondary:

  PRIMARY (explains UAT failure):
  The `dist/commands/game/gather.js` was compiled from the PRE-GACHA version of gather
  (before commit 85b8e6c on 2026-04-14). This OLD version has NO balance check, NO fee
  deduction, and grants items unconditionally. The `dist/` was never rebuilt after the new
  gacha gather.ts was written. When the bot runs from `npm start` or PM2 (dist/bot.js →
  dist/shard.js), it loads the OLD gather.js. When running `npm run dev` (tsx src/shard.ts),
  commandLoader finds ZERO .js files in src/commands/ (because .ts filter returns []) so no
  commands load at all.

  The combination of these two loading modes creates the situation where either:
  (a) The bot runs from dist/ with the old no-check gather, OR
  (b) The bot runs from tsx/dev with 0 commands loaded

  SECONDARY (latent bug in new source gather.ts):
  The transaction at lines 152-175 deducts the fee via UPDATE with a conditional WHERE clause
  (`tuVi >= totalFee`) as a TOCTOU/race-condition guard. However, if this UPDATE affects 0
  rows (balance was drained concurrently between the line-106 check and the transaction),
  execution ALWAYS continues to grant items. There is no check of rows-affected after the
  UPDATE, and no explicit transaction rollback. This means a race condition between two
  concurrent /gather calls for the same user can bypass the balance gate.

fix: ""
verification: ""
files_changed: []
