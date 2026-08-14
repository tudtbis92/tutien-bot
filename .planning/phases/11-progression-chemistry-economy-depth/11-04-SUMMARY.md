---
phase: 11-progression-chemistry-economy-depth
plan: 04
subsystem: economy, api, ui, testing
tags: [sanguo, shop, bag, boss-drops, wallet-sink, anti-tamper, drizzle, discord.js, i18n, tdd]

# Dependency graph
requires:
  - phase: 11-01
    provides: migration 0020/0021 (sanguo_items multi-currency model price_linh/price_event/sale_state/drop_weight, formations + emoji, P0-1 unique indexes) + economy amendment adopt-a5 prices
  - phase: 11-02
    provides: D-11 item catalog seeded (heal_pill 50 sold/70, booster_x2 100 sold/25, capture_key locked/0, capture_tier4_key locked/4.9, capture_tier5_key locked/0.1) + 3 formations (can_ban free, thien_co 200, vu_sat 300) + EMOJI.HON_NGOC
provides:
  - shopService (buyItem + buyFormation — wallet-sink txs, anti-tamper prices, saleState gate, TOCTOU close) — the reference wallet-sink pattern
  - bagService (listBag + useHeal — the D-04 soft-lock recovery path, FOR UPDATE single-writer, zero wallet calls)
  - dropService (rollBossDrop — guaranteed ≥1 item, crypto-weighted half-open walk, items-only)
  - /sanguo shop (two currency tabs D-16) + /sanguo bag (D-13) subcommands + buy/use/tab UI + customId routing
  - i18n shop.*/bag.*/cmd.shop/cmd.bag (3 locales)
affects: [11-06 boss-win branch (wires rollBossDrop), 11-07 legion formation surface (buyFormation ownership), 12-anti-abuse-monitoring-marketplace-gating (TQC-19 audit reads sanguo_shop ledger reasons)]

# Actuals (#2632) — pairs with the plan's estimate (52000) on the same chars/4 scale over the realized diff.
actuals:
  tokens: 21852    # chars/4 over the 9b31327..HEAD realized diff (18 files)
  tasks: 3
  commits: 7       # 6 code commits (2 TDD commits per task) + 1 docs commit

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wallet-sink tx (shopService): ONE db.transaction — price/saleState resolve server-side from sanguo_items/formations (anti-tamper T-11-04-01), deductBalance WHERE-guard + ledger 'sanguo_shop_{code}' in the same tx, inventory/ownership upsert — a failed deduction rolls the whole grant back"
    - "TOCTOU ownership close (P0-1): friendly pre-check SELECT + insert.onConflictDoNothing().returning() rowCount — the unique (userId, formationId) constraint is the defense-in-depth ALREADY_OWNED"
    - "Integer-space half-open weighted walk (dropService): roll = floor(rng()*1e6), bands = w×100 — bit-exact boundaries (0.0→heal, 0.70→booster, 0.95→key4, 0.999→key5); the encounterService (roll -= w) <= 0 operator is NOT copied"
    - "Bag heal single-writer (T-11-04-04): FOR UPDATE inventory row + target copy in one tx, full-HP guard (NO_TARGET, item NOT consumed), heal + decrement/delete-at-0 atomic"

key-files:
  created:
    - src/services/sanguo/shopService.ts
    - src/services/sanguo/bagService.ts
    - src/services/sanguo/dropService.ts
    - src/commands/sanguo/shop.ts
    - src/commands/sanguo/bag.ts
    - src/ui/components/sanguoShopTabs.ts
    - src/ui/components/sanguoShopBuyButtons.ts
    - src/ui/components/sanguoBagUseButtons.ts
    - src/ui/embeds/buildSanguoShopEmbed.ts
    - src/ui/embeds/buildSanguoBagEmbed.ts
  modified:
    - src/commands/sanguo/map.ts
    - src/events/interactionCreate.ts
    - locales/{vi,en,zh-cn}/sanguo.json
    - src/services/sanguo/__tests__/{shopService,bagService,dropService}.test.ts

key-decisions:
  - "Buy-formation namespace dispatch: sanguo:shop:buy:{code} serves BOTH items and formations (UI-SPEC pins one customId shape); the handler resolves the code namespace via a formations pre-read before dispatching buyFormation vs buyItem"
  - "Integer-space drop walk chosen over normalized-float cumulative fractions: 0.95×100 and 99.9/100 float rounding could land an exact boundary on the wrong band; floor(rng()*1e6) vs w×100 bands is bit-exact for all four boundary tests"
  - "useHeal gated to HEAL_ITEM_CODE='heal_pill' (defensive ITEM_NOT_USEABLE): the command layer decides which items render use buttons (booster→hint, capture keys→none); the service re-verifies the code is the heal item"
  - "Task-level tdd=true: RED (failing test) → GREEN (implementation) atomic commits per task, mirroring the 11-03 convention"

patterns-established:
  - "Shop/bag/drop services follow the soulgemService single-writer tx shape (FOR UPDATE own rows, re-fetch inside tx, plain throw Error('CODE'), users.id keys)"
  - "Anti-tamper customIds throughout: sanguo:shop:buy:{code} / sanguo:bag:use:{code} carry identifiers only — prices/effects resolve server-side in the tx"
  - "Prices render as glyph + bold number in labels (shop.buy_button / shop.item_line) — never a color accent (UI-SPEC)"

requirements-completed: [TQC-16]

coverage:
  - id: D1
    description: "shopService.buyItem — ONE wallet-sink tx: price + saleState resolve server-side from sanguo_items (anti-tamper T-11-04-01), saleState !== 'sold' → ITEM_NOT_FOR_SALE (D-15, capture_key never sold), deductBalance WHERE-guard + ledger reason 'sanguo_shop_{code}' (SC1), inventory upsert quantity +1"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/shopService.test.ts#buyItem describe (S1-S3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "shopService.buyFormation — ONE wallet-sink tx: base_price charge + user_formations row, ALREADY_OWNED fast path + onConflictDoNothing TOCTOU close (P0-1), ledger 'sanguo_shop_formation_{code}' (D-21 v3 delivers shop purchase only)"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/shopService.test.ts#buyFormation describe (F1-F3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/sanguo shop subcommand — two currency tabs (💎/🎁 D-16) in one ActionRow, Linh thạch tab items+formations with buy buttons (price in label only, customId = code only), Event tab locked capture_key row + shop.event_empty (D-15 shown-not-sold); map.ts registration + interactionCreate sanguo:shop:tab/buy routing"
    requirement: TQC-16
    verification:
      - kind: other
        ref: "grep 'saleState !== sold' + customId template 'sanguo:shop:buy:{code}' + map.ts shopSubcommand/handler re-exports + interactionCreate routing blocks"
        status: pass
    human_judgment: true
    rationale: "Wiring is grep-proven (registration, customId contract, routing), but the rendered Discord output — tab toggle behavior, buy-button layout, embed copy — has no unit assertion and requires live client UAT (Phase 10 CR-09 precedent: client-rendering bugs escape unit tests)"
  - id: D4
    description: "bagService.useHeal — ONE FOR UPDATE tx: inventory lock (join by code, ITEM_NOT_OWNED), target = explicit copy (ownership re-gate) or active companion (NO_TARGET), full-HP guard (NO_TARGET, item NOT consumed), heal to full base HP + decrement/delete-at-0 atomic (T-11-04-04 anti-clone); ZERO wallet calls (D-19)"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/bagService.test.ts#useHeal describe (H1-H7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "bagService.listBag — owned inventory join sanguo_items ordered by item id asc with quantity; empty bag → [] (command renders bag.empty with next-step copy)"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/bagService.test.ts#listBag describe (B1-B2)"
        status: pass
    human_judgment: false
  - id: D6
    description: "/sanguo bag subcommand — bag.title with count, per-row lines, Dùng button ONLY for heal_pill, owned booster renders convert.booster_hint (D-13 not an apply site), capture keys no button; map.ts registration + interactionCreate sanguo:bag:use routing"
    requirement: TQC-16
    verification:
      - kind: other
        ref: "grep 'deductBalance' bagService === 0 + map.ts bagSubcommand/handleUsePress + interactionCreate BAG_USE_PREFIX routing + bag.* keys in 3 locales (check-i18n)"
        status: pass
    human_judgment: true
    rationale: "Wiring is grep-proven, but the rendered Discord output — heal button visibility per item type, booster hint line, embed layout — requires live client UAT"
  - id: D7
    description: "dropService.rollBossDrop — guaranteed ≥1 item (D-14), drop pool + weights from sanguo_items.drop_weight (Number()-converted, never hardcoded — Pitfall 8), crypto-weighted half-open integer walk (0.0→heal, 0.70→booster, 0.95→key4, 0.999→key5), inventory upsert only — ZERO wallet calls (D-19, T-11-04-03)"
    requirement: TQC-16
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/dropService.test.ts#rollBossDrop describe (D1-D3)"
        status: pass
    human_judgment: false
  - id: D8
    description: "i18n parity — shop.* / bag.* / cmd.shop / cmd.bag sections in vi/en/zh-cn (14 shop + 8 bag keys incl. bag.empty next-step copy and additive bag.healed)"
    verification:
      - kind: other
        ref: "npm run check-i18n"
        status: pass
    human_judgment: false

# Metrics
duration: 29min
completed: 2026-08-14
status: complete
---

# Phase 11 Plan 4: Shop + Bag + Boss-Drop Economy Services Summary

**The Linh thạch sink surface of Phase 11 wired end-to-end: /sanguo shop (two currency tabs — 💎 Linh thạch / 🎁 Sự kiện) with anti-tamper wallet-sink purchases (buyItem + buyFormation through wallet.deductBalance, capture_key shown-but-locked per D-15), /sanguo bag with the D-04 soft-lock recovery heal (useHeal — full-HP-guarded, atomic consumption, zero wallet calls), and dropService's guaranteed ≥1 rarity-weighted boss item drop (integer half-open crypto walk over the seeded drop_weight columns) — all TDD (RED→GREEN per task), i18n-complete in 3 locales.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-08-14T16:43:21Z
- **Completed:** 2026-08-14T17:12:00Z
- **Tasks:** 3 (all `type="auto"` with `tdd="true"`)
- **Files modified:** 18 (13 new, 5 modified)

## Accomplishments

- **shopService (Task 1, TDD RED→GREEN):** `buyItem` — ONE wallet-sink tx where the price + saleState resolve SERVER-SIDE from sanguo_items (anti-tamper, T-11-04-01: the customId carries only the code); `saleState !== 'sold'` → `ITEM_NOT_FOR_SALE` so capture_key can NEVER be bought for Linh thạch (D-15); the charge rides `wallet.deductBalance`'s WHERE-guard + ledger (`sanguo_shop_{code}`, SC1) in the same tx as the inventory upsert. `buyFormation` (D-21) — base_price charge + user_formations row with an ALREADY_OWNED fast path AND the P0-1 unique-constraint TOCTOU close (`onConflictDoNothing().returning()` rowCount). Both return per-locale names for the UI.
- **/sanguo shop surface (D-16):** two currency tab buttons (💎 Linh thạch / 🎁 Sự kiện) in ONE ActionRow; the Linh thạch tab lists the purchasable items (heal_pill 50💎, booster_x2 100💎) + formations (200-300💎) ordered by section then price asc with one buy button per row (price in the label only); the Event tab shows the LOCKED capture_key row (`shop.capture_key_locked` — no buy button) + `shop.event_empty` — never a blank surface. map.ts registration + `sanguo:shop:tab/buy` routing in interactionCreate.
- **bagService (Task 2, TDD RED→GREEN):** `listBag` (owned inventory join, item-id-asc order) + `useHeal` — the D-04 soft-lock recovery: ONE FOR UPDATE tx locking the inventory row + target copy; target = explicit copy (ownership re-gate) or the active companion; a full-HP copy → `NO_TARGET` with the item NOT consumed (flagged adjacency assumption); heal to full base HP + decrement/delete-at-0 atomically (T-11-04-04 anti-clone). **Zero wallet calls** (D-19 grep gate). `/sanguo bag` renders per-row lines + a Dùng button ONLY for heal_pill; an owned booster shows `convert.booster_hint` (applies at the conversion site, D-13); capture keys render no button.
- **dropService (Task 3, TDD RED→GREEN):** `rollBossDrop` — guaranteed ≥1 item (D-14) picked from the drop-eligible pool (sanguo_items WHERE drop_weight > 0 — weights from the DB seed, never hardcoded, Pitfall 8) via a **half-open cumulative walk in integer space** (`floor(rng()*1e6)` vs `w×100` bands — bit-exact boundaries: 0.0→heal_pill, 0.70→booster_x2, 0.95→capture_tier4_key, 0.999→capture_tier5_key; the encounterService `(roll -= w) <= 0` operator is deliberately NOT copied). Default rng is `cryptoUniform` (crypto mandate); inventory upsert is the ONLY payout surface (items-only, D-19). 11-06 wires the boss-win branch call.
- **i18n complete:** `shop.*` (14 keys incl. bought/bought_formation/insufficient/capture_key_locked), `bag.*` (8 keys incl. bag.empty next-step copy + additive bag.healed), `cmd.shop`/`cmd.bag` — parity green in all 3 locales.

## Task Commits

Each task was committed atomically (TDD: test RED → feat GREEN):

1. **Task 1 RED: add failing tests for shopService buyItem + buyFormation** - `d57eda0` (test)
2. **Task 1 GREEN: implement shopService (buyItem + buyFormation wallet sinks) + /sanguo shop + currency tabs + buy UI** - `f2948f0` (feat)
3. **Task 2 RED: add failing tests for bagService listBag + useHeal** - `f8a81d4` (test)
4. **Task 2 GREEN: implement bagService (useHeal soft-lock recovery) + /sanguo bag + use UI + booster hint** - `22709ae` (feat)
5. **Task 3 RED: add failing tests for dropService rollBossDrop** - `c2b3753` (test)
6. **Task 3 GREEN: implement dropService — guaranteed rarity-weighted boss item drop (crypto)** - `8f772e8` (feat)
7. **Plan metadata:** `11-04-SUMMARY.md` (docs — this commit)

## Files Created/Modified

- `src/services/sanguo/shopService.ts` - buyItem (saleState gate + wallet sink + inventory upsert) + buyFormation (TOCTOU-closed ownership) — both ONE tx, ledger `sanguo_shop_*`
- `src/services/sanguo/bagService.ts` - listBag + useHeal (FOR UPDATE single-writer, full-HP guard, delete-at-0) — zero wallet references
- `src/services/sanguo/dropService.ts` - rollBossDrop (integer half-open crypto walk over DB drop_weight columns, items-only)
- `src/commands/sanguo/shop.ts` - subcommand + execute (tab default Linh thạch) + handleTabPress + handleBuyPress (formation/item namespace dispatch)
- `src/commands/sanguo/bag.ts` - subcommand + execute + handleUsePress (active-companion heal, booster hint)
- `src/ui/components/sanguoShopTabs.ts` / `sanguoShopBuyButtons.ts` / `sanguoBagUseButtons.ts` - customId contract builders (anti-tamper — identifiers only)
- `src/ui/embeds/buildSanguoShopEmbed.ts` / `buildSanguoBagEmbed.ts` - tab-state-aware / empty-state-aware embeds (SEASON color, glyph+bold prices)
- `src/commands/sanguo/map.ts` - shop + bag subcommand registration + handler re-exports
- `src/events/interactionCreate.ts` - sanguo:shop:tab / sanguo:shop:buy / sanguo:bag:use routing + handler interface
- `src/services/sanguo/__tests__/{shopService,bagService,dropService}.test.ts` - 18 tests (6 shop / 9 bag / 3 drop) — boundary-exact, deterministic rng injection
- `locales/{vi,en,zh-cn}/sanguo.json` - shop.* / bag.* / cmd.shop / cmd.bag sections

## Decisions Made

- **Buy-formation namespace dispatch:** the UI-SPEC pins ONE buy customId shape (`sanguo:shop:buy:{code}`) for both items and formations; the handler resolves the namespace via a formations pre-read before dispatching `buyFormation` vs `buyItem` (the code sets are disjoint: heal_pill/booster_x2 vs can_ban/thien_co/vu_sat).
- **Integer-space drop walk over normalized-float cumulative fractions:** float rounding on `0.95×100` / `99.9÷100` could land an exact boundary on the wrong band; `floor(rng()*1e6)` vs `w×100` bands is bit-exact for all four boundary assertions (verified by the D1 test).
- **`HEAL_ITEM_CODE` gate in useHeal (defensive):** the command layer decides which items render use buttons; the service re-verifies the code is the heal item (`ITEM_NOT_USEABLE` for anything else) so a crafted customId can never run the heal path on a booster/key.
- **Task-level TDD (`tdd="true"` per task):** RED (failing test) → GREEN (implementation) atomic commits, matching the 11-03 convention; the plan is `type: execute` so plan-level RED/GREEN gate enforcement does not apply.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `userFormations` import path**
- **Found during:** Task 1 GREEN (first test run)
- **Issue:** Both the test and the initial shopService import referenced `db/schema/userFormations.js` — a file that doesn't exist; `userFormations` is exported from `db/schema/formations.ts`. Vitest failed to load the module.
- **Fix:** Imported `userFormations` from `formations.js` in shopService.ts and the test file.
- **Files modified:** src/services/sanguo/shopService.ts, src/services/sanguo/__tests__/shopService.test.ts
- **Verification:** shopService suite green (6 tests)
- **Committed in:** `f2948f0` (Task 1 commit)

**2. [Rule 1 - Bug] Test-fixture read-queue depth (F1 formation success)**
- **Found during:** Task 1 GREEN (test run)
- **Issue:** F1 queued 3 read results but `insert.onConflictDoNothing().returning()` consumes a 4th — the exhausted mock returned `[]`, so the TOCTOU close threw ALREADY_OWNED on the SUCCESS path.
- **Fix:** Queued the 4th read result (`[{ id: 55 }]` — the inserted ownership row).
- **Files modified:** src/services/sanguo/__tests__/shopService.test.ts
- **Verification:** F1 passes; the mock's exhausted-queue `[]` is exactly what F3 (the TOCTOU test) needs
- **Committed in:** `f2948f0` (Task 1 commit)

**3. [Rule 1 - Bug] dropService test fixture nesting**
- **Found during:** Task 3 GREEN (test run)
- **Issue:** `runInTx([[DROP_ITEMS]])` nested the 4-item pool one level too deep — the select resolved to `[DROP_ITEMS]` (length 1) instead of the 4 rows, tripping EMPTY_DROP_POOL.
- **Fix:** `runInTx([DROP_ITEMS])` — the read result IS the items array (mirrors the `[COPY_T0]` pattern).
- **Files modified:** src/services/sanguo/__tests__/dropService.test.ts
- **Verification:** D1/D2 boundary tests green (3 tests total)
- **Committed in:** `8f772e8` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 test-harness bugs)
**Impact on plan:** All three were implementation/test-harness corrections with no scope change or plan-contract impact. The service code, UI, and i18n shipped as specified.

## TDD Gate Compliance

The plan frontmatter is `type: execute` (not `type: tdd`), so plan-level RED/GREEN gate enforcement does not apply. All three tasks carry `tdd="true"` and each followed RED → GREEN with atomic commits:
- Task 1: `d57eda0` (test, RED — 6 failing tests) → `f2948f0` (feat, GREEN — 6 pass)
- Task 2: `f8a81d4` (test, RED — 9 failing tests) → `22709ae` (feat, GREEN — 9 pass)
- Task 3: `c2b3753` (test, RED — 3 failing tests) → `8f772e8` (feat, GREEN — 3 pass)

## Issues Encountered

- **lint-staged pre-commit reversion:** the pre-commit hook reverts the working tree on eslint failure, silently discarding edits made between `git add` and the hook run — required re-applying fixes after reading the current file state (no production impact; commits eventually landed clean).
- **PowerShell console UTF-8 mangling:** `Get-Content`/console output garbles Vietnamese/CJK in the locale JSONs — used the Read/Edit tools (UTF-8-correct) for all locale edits; `check-i18n` + JSON.parse probes confirmed parity.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **11-06 (boss-win branch):** `rollBossDrop(userId)` is ready to call from the battleCheckInService boss-win branch for the guaranteed item drop (D-14); the call site was deliberately NOT wired here (the plan scopes this plan to the service).
- **11-07 (legion formation surface):** `buyFormation` establishes the user_formations ownership rows the legion-assembly formation pick reads; ALREADY_OWNED + the P0-1 unique index guarantee single-ownership semantics.
- **D-21 deferral (flagged):** formation SELL and 'formations via boss drops' sourcing are NOT delivered by this plan — shop purchase only. The 11-01 CONTEXT amendment records the deferral (not a silent drop); Phase 12 should re-open if the user wants sell flows.
- **Booster volume (A11):** booster_x2 is the only Linh thạch→hồn ngọc bridge; Phase 12 TQC-19 should flag booster purchase volume (no runtime cap in v3 — D-11/D-12).
- `sanguo_shop_*` ledger reasons accumulate the wallet audit trail for Phase 12 TQC-19 (repudiation / economy monitoring).

---

*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-14*

## Self-Check: PASSED

- Created files verified on disk: shopService.ts, bagService.ts, dropService.ts, shop.ts, bag.ts, 3 UI component builders, 2 embeds, SUMMARY.md
- All 6 code commits verified in git log (`d57eda0`, `f2948f0`, `f8a81d4`, `22709ae`, `c2b3753`, `8f772e8`)
- Overall verification: 18/18 plan tests green (6 shop + 9 bag + 3 drop), full suite 37 files / 363 tests green, `npm run typecheck` green, `npm run check-i18n` green
- Wallet discipline: shopService 4× deductBalance (sink); bagService + dropService 0 wallet calls (D-19 grep gates)
