---
phase: 08-foundation-economy-budget-content-infrastructure
plan: 2
subsystem: economy
tags: [wallet, ledger, drizzle-schema, bigint, atomic-transaction, refactor, vitest]

# Dependency graph
requires:
  - phase: 07-paused-marketplace
    provides: existing command/embed/service patterns (gather.ts, subscriptionService, football services, drizzle schemas)
provides:
  - wallet.deductBalance/creditBalance as the single choke point for every users.balance mutation (TQC-01/D-03)
  - wallet_transactions atomic ledger — one row per balance mutation with balance_after in the same transaction (D-01/D-02, SC1 reconcilability foundation)
  - All 7 balance-write sites refactored through the wallet (gather, farming purchase/upgrade, football wager/refund/void/push/payout) — D-03 no-direct-write invariant grep-proven
  - fetchCommandContext now returns users.id (CommandContext.user: { id, balance }) — the wallet's numeric-id contract
affects: [08-04 migration 0014 (wallet_transactions table), Phase 9 travel, Phase 11 shop/evolution, Phase 12 audit TQC-19]

# Actuals (#2632) — pairs with the plan's estimate (22000 tokens) to calibrate future estimates.
actuals:
  tokens: 17927    # chars/4 over the realized diff (71709 chars)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single wallet choke point for currency mutation (deductBalance WHERE-guard + creditBalance no-guard) with ledger row in the SAME transaction"
    - "Client-vs-transaction discrimination by object identity (txOrDb === db), never method probing — drizzle PgTransaction exposes .transaction() (nested savepoint)"
    - "Tx type derived from the drizzle callback parameter (Parameters<Parameters<db.transaction>[0]>[0]) — PgTransaction<typeof schema, 'basic'> does not compile on drizzle 0.45.2"
    - "Append-only schema barrel merge under '// Phase 8 schemas' comment (walletTransactions appended after 08-01's mapNodes, no duplication)"

key-files:
  created:
    - src/services/wallet.ts
    - src/db/schema/walletTransactions.ts
    - src/services/__tests__/wallet.test.ts
  modified:
    - src/db/schema/index.ts
    - src/utils/commandContext.ts
    - src/commands/game/gather.ts
    - src/services/farming/subscriptionService.ts
    - src/services/football/predictionService.ts
    - src/services/football/matchLifecycleService.ts
    - src/services/farming/__tests__/subscriptionService.test.ts

key-decisions:
  - "Tx type derived as Parameters<Parameters<typeof db.transaction>[0]>[0] — the plan's literal PgTransaction<typeof schema, 'basic'> misorders drizzle 0.45.2 generics (TQueryResult first); derived type is exactly what the callback receives"
  - "creditBalance throws nothing on zero-row UPDATE — a credit to a missing user row would crash on rows[0].balance; kept simple per plan (no guard) since FK on wallet_transactions.userId + users balance_non_negative remain the DB backstops"
  - "Edit wager flow writes two ledger rows (bet_refund + bet_wager) — ledger stays reconcilable on edits per SC1 (research recommendation option, not a single net row)"

patterns-established:
  - "Pattern: currency mutation flows through wallet service with bigint amounts + reason/metadata attribution; display values pre-fetched by callers (behavior preserved)"
  - "Pattern: test mockTx includes the wallet's insert/values chain and balance-shaped returning rows so mocked chains match the wallet's real query shape"

requirements-completed: [TQC-01]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "wallet.deductBalance — atomic WHERE-guard UPDATE (balance >= amount) + ledger INSERT in the same transaction; zero-row result throws Error('INSUFFICIENT_BALANCE') and rolls back (no balance change, no ledger row)"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "src/services/__tests__/wallet.test.ts#deductBalance success/insufficient/boundary cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "wallet.creditBalance — no balance comparison in WHERE (credit cannot go negative), writes type 'credit' ledger row, resolves balanceAfter; DB balance_non_negative check is the backstop"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "src/services/__tests__/wallet.test.ts#creditBalance cases (payload + no-balance-in-WHERE circular-safe column walker)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Client-vs-transaction discrimination by object identity (txOrDb === db) — shared db runs inside db.transaction; a tx exposing .transaction() is used directly without a nested transaction (D-02)"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "src/services/__tests__/wallet.test.ts#identity discrimination tests (client-in-transaction + tx-with-transaction-fn used directly)"
        status: pass
    human_judgment: false
  - id: D4
    description: "wallet_transactions ledger schema — id serial, user_id FK users.id, type pgEnum('wallet_transaction_type', ['deduct','credit']), amount/balance_after bigint mode bigint, reason varchar(50), metadata jsonb, created_at tz; amount_non_negative check + (user_id, created_at) index; exported under '// Phase 8 schemas' (merged append-only with 08-01's mapNodes)"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "npm run typecheck (schema compiles) + src/services/__tests__/wallet.test.ts#ledger insert payload assertions"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 7 balance-write sites refactored through the wallet (D-03): gather 'gather', farming 'farming_subscription'/'farming_upgrade', football 'bet_refund'/'bet_wager'/'bet_void'/'bet_push'/'bet_payout'; commandContext selects users.id; no inline balance UPDATE remains outside wallet.ts (grep-proven)"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "grep gate: `${users.balance}` matches only in src/services/wallet.ts + existing farming/football suites (30 tests) pass"
        status: pass
    human_judgment: false
  - id: D6
    description: "Caller-facing error contract preserved — gather/farming catch Error('INSUFFICIENT_BALANCE'), football rethrows as InsufficientBalanceError; transaction boundaries unchanged (wallet called inside existing transactions)"
    requirement: TQC-01
    verification:
      - kind: unit
        ref: "src/services/farming/__tests__/subscriptionService.test.ts (INSUFFICIENT_BALANCE cases) + src/services/football/__tests__/predictionService.test.ts (InsufficientBalanceError cases)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-08-11
status: complete
---

# Phase 08 Plan 2: Wallet Service + Ledger + 7 Call-Site Refactor Summary

**Shared wallet choke point (deductBalance WHERE-guard + creditBalance) with atomic wallet_transactions ledger, all 7 balance-write sites refactored through it (gather/farming/football), grep-proven D-03 no-direct-write invariant, and a 7-test unit suite proving SC1 reconcilability**

## Performance

- **Duration:** 18 min (plan commits 10:40→10:56 +07:00)
- **Started:** 2026-08-11T10:40:24+07:00 (Task 1 commit)
- **Completed:** 2026-08-11T10:56:20+07:00 (Task 3 commit)
- **Tasks:** 3
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments
- `src/services/wallet.ts` — `deductBalance` (atomic `UPDATE users SET balance = balance - amount WHERE id = $1 AND balance >= amount RETURNING balance`, empty result → `Error('INSUFFICIENT_BALANCE')`) and `creditBalance` (no balance guard, returns balanceAfter via `.returning()`); each success writes exactly one `wallet_transactions` row in the SAME transaction as the balance update (D-01)
- Client-vs-transaction discrimination by **object identity** (`txOrDb === db`), never method probing — drizzle's `PgTransaction` also exposes `.transaction()` (nested savepoint), so a method probe would misclassify a real tx (D-02)
- `src/db/schema/walletTransactions.ts` — ledger table: `type` pgEnum (deduct/credit), `amount`/`balance_after` bigint mode bigint (users.ts currency convention), `reason` varchar(50) first-class column (future /profile history D-04 + Phase 12 audit TQC-19), `metadata` jsonb `$type<Record<string, unknown>>()`, `amount_non_negative` check, `(user_id, created_at)` index; merged append-only into index.ts under the existing `// Phase 8 schemas` comment (mapNodes line from 08-01 untouched)
- All 7 balance-write sites routed through the wallet inside their existing transactions: gather fee (`'gather'`), farming purchase/upgrade (`'farming_subscription'`/`'farming_upgrade'`), football edit-refund + wager (`'bet_refund'`/`'bet_wager'`), void/push/payout credits (`'bet_void'`/`'bet_push'`/`'bet_payout'`) — same error types, same pre-fetch display values, same transaction boundaries
- `fetchCommandContext` extended to select `users.id` — `CommandContext.user` is now `{ id: number; balance: bigint } | undefined` (additive; all existing consumers unaffected)
- Grep gate proves zero inline `users.balance` writes outside wallet.ts; lint + typecheck + 37 tests (7 new wallet + 30 existing farming/football) all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Wallet service + wallet_transactions ledger schema** - `2fb32cc` (feat)
2. **Task 2: Refactor all 7 balance-write sites through the wallet** - `e12cc2c` (feat)
3. **Task 3: Wallet unit tests** - `77d644c` (test)

**Plan metadata:** `(committed with this SUMMARY — see final commit)`

## Files Created/Modified
- `src/services/wallet.ts` - `deductBalance`/`creditBalance` — single choke point for `users.balance` (D-03); identity-based tx/client discrimination (D-02); ledger INSERT shares the balance UPDATE transaction (D-01)
- `src/db/schema/walletTransactions.ts` - `wallet_transactions` ledger table + `walletTransactionTypeEnum` + `WalletTransaction`/`NewWalletTransaction` types
- `src/db/schema/index.ts` - appended `export * from './walletTransactions.js';` under `// Phase 8 schemas` (mapNodes from 08-01 preserved)
- `src/utils/commandContext.ts` - selects `id: users.id`; `CommandContext.user` type → `{ id: number; balance: bigint } | undefined`
- `src/commands/game/gather.ts` - inline deduct replaced with `deductBalance(tx, user!.id, totalFee, { reason: 'gather', metadata: { amount, feePerRoll, majorRealmIndex } })`; unused `users` import removed; catch block + item-grant loop unchanged
- `src/services/farming/subscriptionService.ts` - purchase/upgrade deducts → `deductBalance` with `'farming_subscription'`/`'farming_upgrade'`; `price > 0n`/`fee > 0n` guards kept; unused `users` + `sql` imports removed
- `src/services/football/predictionService.ts` - net-diff UPDATE split into `creditBalance('bet_refund')` (edit, oldWager > 0) + `deductBalance('bet_wager')`; INSUFFICIENT_BALANCE rethrown as `InsufficientBalanceError`; SELECT FOR UPDATE + bet upsert kept; unused `sql` removed
- `src/services/football/matchLifecycleService.ts` - void/push/payout credits → `creditBalance` with `'bet_void'`/`'bet_push'`/`'bet_payout'`; unused `users` + `sql` imports removed
- `src/services/__tests__/wallet.test.ts` - 7 vitest cases: deduct success (full ledger payload), insufficient (rejects, no ledger row), exact-balance boundary (0n legal), client-in-transaction, tx-with-transaction-fn used directly (identity, no nested tx), credit payload, credit WHERE has no balance comparison (circular-safe column walker)
- `src/services/farming/__tests__/subscriptionService.test.ts` - upgrade/purchase success mockTx extended with wallet `insert`/`values` chain + balance-shaped `returning` rows (assertions not weakened)

## Decisions Made
- **Tx type derivation:** The plan's literal `type Tx = PgTransaction<typeof schema, 'basic'>` does not compile on drizzle-orm 0.45.2 — its `PgTransaction` generic signature is `PgTransaction<TQueryResult extends PgQueryResultHKT, TFullSchema, TSchema>`, so the first type argument must be the query-result HKT, not the schema. Derived `type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0]` instead — exactly the type the transaction callback receives (`NodePgTransaction<typeof schema, typeof schema>`), satisfying the plan's stated intent (properly typed, no `any`, no callback-type misuse).
- **Edit-wager ledger shape:** two rows per edit (`bet_refund` + `bet_wager`) rather than a single net row — keeps the ledger reconcilable per SC1 and matches the plan's action text.
- **Test mock fidelity:** existing subscriptionService mockTx objects extended to include the wallet's `insert`/`values` chain and `returning` now resolves balance-shaped rows (`[{ balance: X }]`) — the wallet reads `rows[0].balance`; assertions preserved (not weakened).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's literal PgTransaction type does not compile on drizzle 0.45.2**
- **Found during:** Task 1 (wallet.ts implementation)
- **Issue:** The plan states `type Tx = PgTransaction<typeof schema, 'basic'>`, but drizzle-orm 0.45.2's `PgTransaction` is generic over `(TQueryResult, TFullSchema, TSchema)` — the first argument must be a `PgQueryResultHKT`, so `typeof schema` there is a type error.
- **Fix:** `type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];` — derives the exact tx type the transaction callback receives; also made the `* as schema` import unused so it was dropped.
- **Files modified:** src/services/wallet.ts
- **Verification:** `npm run typecheck` exits 0 (and the derived type is assignment-compatible at every call site — tx passed from gather/farming/football)
- **Committed in:** 2fb32cc (Task 1 commit)

**2. [Rule 3 - Blocking] gather.ts `user` possibly undefined at the wallet call**
- **Found during:** Task 2 (gather.ts refactor)
- **Issue:** `fetchCommandContext` returns `user: { id, balance } | undefined`; the wallet call site `user.id` failed typecheck (TS18048). The runtime pre-check at gather.ts:107 already guarantees `user` is defined past that point (undefined → balance 0n → early return because fees > 0), but TS cannot infer it.
- **Fix:** `user!.id` with a comment documenting the guarantee.
- **Files modified:** src/commands/game/gather.ts
- **Verification:** `npm run typecheck` exits 0
- **Committed in:** e12cc2c (Task 2 commit)

**3. [Rule 3 - Blocking] Existing subscriptionService success-path tests fail after the wallet refactor**
- **Found during:** Task 2 (full gate run)
- **Issue:** Two `upgradePlan` success tests (and implicitly the purchase success mocks) mock a `mockTx` without the wallet's `insert`/`values` chain — `client.insert is not a function` at wallet.ts:65. The plan explicitly anticipates this: "adapt the test mock to include the wallet's insert step — do NOT weaken assertions".
- **Fix:** Added `insert`/`values` chain mocks to the upgrade success mockTx objects, and changed `returning` from `[{ id: 1 }]` to balance-shaped `[{ balance: X }]` in the success mocks (the wallet reads `rows[0].balance`). Assertions unchanged.
- **Files modified:** src/services/farming/__tests__/subscriptionService.test.ts
- **Verification:** `npx vitest run .../subscriptionService.test.ts .../predictionService.test.ts` → 30/30 pass
- **Committed in:** e12cc2c (Task 2 commit)

**4. [Rule 3 - Blocking] JSON.stringify on the drizzle WHERE AST throws circular-structure TypeError**
- **Found during:** Task 3 (credit WHERE assertion)
- **Issue:** The wallet test's "no balance comparison in credit WHERE" assertion used `JSON.stringify(whereCall)` — drizzle SQL AST nodes carry back-references (`PgColumn.table → PgTable → columns → PgColumn`), so stringify throws `Converting circular structure to JSON`.
- **Fix:** Replaced with a circular-safe recursive column-name walker (`referencedColumnNames`) that collects column names from the AST while skipping `table`/`columns`/`column` back-reference keys; asserts `not.toContain('balance')` and `toContain('id')`.
- **Files modified:** src/services/__tests__/wallet.test.ts
- **Verification:** `npx vitest run src/services/__tests__/wallet.test.ts` → 7/7 pass
- **Committed in:** 77d644c (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (4 blocking)
**Impact on plan:** All fixes were required for the plan to compile and pass on the actual installed dependency versions (drizzle 0.45.2 type signature, existing test mock shapes) — no scope creep, no behavior change.

## Issues Encountered
- None beyond the deviations above — typecheck, lint, and all 37 tests (7 wallet + 30 existing farming/football) pass on the final full-gate run.

## User Setup Required

None - no external service configuration required. (wallet_transactions table is created by plan 08-04's migration 0014, which runs after both wave-1 plans merge.)

## Next Phase Readiness
- **Ready for 08-03 and 08-04:** wallet service + ledger are the economy spine every later money flow must call; 08-04's migration task verifies all Phase 8 tables (incl. wallet_transactions) post-migrate, which is the full-boot smoke for SC1/SC2
- **Phase 9 travel / Phase 11 shop & evolution** must call `deductBalance`/`creditBalance` instead of writing `users.balance` directly — the D-03 invariant is now structurally enforced by the grep gate
- **Phase 12 audit (TQC-19)** can join wallet_transactions by `reason` — every mutation is attributable (first-class varchar(50) reason column)

## Known Stubs
None — all new code paths are fully wired (wallet is called at all 7 real call sites; ledger rows are written on every mutation).

## Self-Check: PASSED
- Files exist: `src/services/wallet.ts` ✓, `src/db/schema/walletTransactions.ts` ✓, `src/services/__tests__/wallet.test.ts` ✓
- Commits exist: `2fb32cc` ✓, `e12cc2c` ✓, `77d644c` ✓
- Plan gates: vitest 37/37 (7 wallet + 30 regression) pass, lint exit 0, typecheck exit 0 ✓
- Grep gate: `${users.balance}` matches only in `src/services/wallet.ts` ✓
- Merge protocol: index.ts Phase 8 block has mapNodes (08-01) + walletTransactions (08-02), no duplication ✓

---
*Phase: 08-foundation-economy-budget-content-infrastructure*
*Completed: 2026-08-11*
