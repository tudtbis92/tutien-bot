---
phase: 11-progression-chemistry-economy-depth
verified: 2026-08-18T15:35:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
behavior_unverified_items: []
human_verification:
  - test: "Open /sanguo shop in a live Discord server and confirm the two currency tabs (💎 Linh thạch / 🎁 Sự kiện) render with heal_pill 50💎 and booster_x2 100💎 purchasable rows and the capture_key row shown-but-locked (no buy button), all within the deferReply → editReply latency window (no duplicate defer)."
    expected: "Shop/legion/hero action + boss-capture presses complete within the 3s window; the Linh thạch tab lists purchasable items; the Event tab shows the locked capture_key."
    why_human: "Discord component rendering + latency cannot be observed by unit tests — requires a live Discord interaction."
  - test: "Run the /sanguo legion 4-row assembly (formation → slot → hero → save) in a live server: assign 3 mains + 9 support with strict class-match, read the chemistry tier lines (label + link count, never points/buff%), save, then enter a boss battle."
    expected: "The assembly UI works end-to-end; chemistry lines show tier label + link count only; the saved legion routes to the forced legion battle."
    why_human: "Discord embed/select-menu interaction flows and visual field budgets are not exercised by unit tests."
  - test: "Beat a boss thường in a live server, verify the guaranteed item drop line + capture view open, then capture and confirm the captured copy reveal (stars/grade/Lv20 — never the t0/t1/t2 weights). Confirm all new Phase 11 UI surfaces handle empty/populated/overflow states per UI-SPEC #31."
    expected: "Clean Discord UX for the drop + capture flow; empty-state and field-budget handling correct."
    why_human: "Visual appearance, empty/populated/overflow states, and the never-render of hidden weights require live-Discord human observation."
---

# Phase 11: Progression, Chemistry & Economy Depth Verification Report

**Phase Goal:** "Chiều sâu progression — dupe → hồn ngọc, evolution, shop + boss drops (items only), legion battle 3+9 với chemistry buffs; đóng vòng economy (net-sink/neutral)."
**Verified:** 2026-08-18T11:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All 5 ROADMAP success criteria are functionally **VERIFIED** in the codebase with passing behavioral tests. The only reason the status is `human_needed` (not `passed`) is the plan's own declared `ui_backstops` — Discord UI/UX surfaces (loading-state latency, tab/embed rendering, field budgets) that cannot be exercised by unit tests and require live-Discord human verification. No functional gap blocks the phase goal.

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | SC1 — User can convert duplicate heroes to hồn ngọc (tier-scaled flat 1/5/10/20, account-bound, never → Linh thạch) | ✅ VERIFIED | `convertDuplicate` in soulgemService.ts (FOR UPDATE tx, TIER_VALUE flat-by-tier, booster ×2 atomicity, additive pool upsert closing the WR-04 lost-update, ledger); 0 wallet references (D-02); behaviorally proven by passing soulgemService tests (7 convert tests) |
| 2   | SC2 — User can evolve heroes at L20→t1 and L50→t2; t3 schema-gated unreachable | ✅ VERIFIED | `evolveHero` (LEVEL_REQUIRED L20/L50 inclusive, T3_GATED for tier≥2, EVOLUTION_COSTS); `user_heroes.tier` column (0-3 check); behaviorally proven by passing evolveHero tests |
| 3   | SC3 — User can buy items from /sanguo shop and use them from the bag; boss thường drops items only, never money; every sink via wallet.deductBalance | ✅ VERIFIED | `buyItem`/`buyFormation` via wallet.deductBalance with ITEM_NOT_FOR_SALE guard (capture_key locked); `useHeal` full-HP guard; `rollBossDrop` items-only guaranteed ≥1 (0 wallet calls in bag/drop); shop+bag+legion wired in map.ts + interactionCreate; behaviorally proven by shop/bag/drop tests |
| 4   | SC4 — User can field a legion of 3 mains + 9 buff heroes in legion battle; chemistry buffs (bonus-only, no penalty) via battleEngine extension | ✅ VERIFIED | `runLegionBattle` in battleEngine.ts (mains[3] fight + supports[9] buff-only, MP/skills via shared resolveTurn, LEA-driven support effects riding the seeded rng); boss routing in battleCheckInService (TIER_MULTIPLIERS bake P0-2, legion.not_assembled, rollBossDrop on win); chemistryService pure module (first-match, bonus-only, 0→no tier); behaviorally proven by battleEngine/chemistry/legion/balancePass tests |
| 5   | SC5 — Full collection filters (faction/zone/IV) in /sanguo heroes | ✅ VERIFIED | `queryOwnedHeroes` accepts factionCode + ivGrade + zone AND-combined; IV-grade keys (never raw IV, D-12); routed in interactionCreate; behaviorally proven by heroes.test.ts filter tests |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Deferred Items

None — no success criterion is deferred to a later phase. All 5 SCs are delivered in Phase 11.

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/services/sanguo/soulgemService.ts` | convert/level/evolve/reroll hồn ngọc sinks | ✅ VERIFIED | deductHonNgoc WHERE-guard, convertDuplicate, levelUp, evolveHero, rerollSkill — all one FOR UPDATE tx, 0 wallet |
| `src/services/sanguo/shopService.ts` | wallet-sink buy + formation purchase | ✅ VERIFIED | buyItem/buyFormation via wallet.deductBalance, ITEM_NOT_FOR_SALE gate |
| `src/services/sanguo/bagService.ts` | bag list + heal | ✅ VERIFIED | listBag, useHeal (full-HP guard, delete-at-0) |
| `src/services/sanguo/dropService.ts` | guaranteed boss item drop | ✅ VERIFIED | rollBossDrop crypto-weighted, items-only (0 wallet) |
| `src/services/sanguo/chemistryService.ts` | pure chemistry link→points→tier→buff | ✅ VERIFIED | mainChemistryPoints (first-match), chemistryTier, applyChemistryBuff, supportTriggerChance; pure module |
| `src/services/sanguo/battleEngine.ts` | runLegionBattle + resolveTurn + support effects | ✅ VERIFIED | non-breaking extension; Phase 10 replay tests unchanged |
| `src/services/sanguo/battleCheckInService.ts` | boss→runLegionBattle routing + drop wiring | ✅ VERIFIED | TIER_MULTIPLIERS bake, legion.not_assembled, rollBossDrop on win, writeLegionHpBack |
| `src/services/sanguo/captureService.ts` | boss capture random-roll branch | ✅ VERIFIED | WR-02 single-draw tier, WR-03 real HP, P1-2 rarity on encounterType |
| `src/services/sanguo/legionService.ts` | ownership+class-match assembly | ✅ VERIFIED | assignHero/clearSlot/saveLegion, NOT_OWNED/class_mismatch/HERO_ALREADY_ASSIGNED |
| `src/constants/sanguoProgression.ts` + `sanguoChemistry.ts` | hidden balance contract | ✅ VERIFIED | LEVEL_COST, STAT_GAIN_PER_LEVEL 2, TIER_MULTIPLIERS, EVOLUTION_COSTS, REROLL_COST, MAX_LEVEL; CHEMISTRY_POINTS/TIERS |
| `src/commands/sanguo/shop.ts`/`bag.ts`/`legion.ts`/`heroes.ts` | command surfaces + SC5 filters | ✅ VERIFIED | registered in map.ts, routed in interactionCreate |
| Tests (soulgem/chemistry/battleEngine/shop/bag/drop/legion/balancePass/heroes) | behavioral suites | ✅ VERIFIED | 449 tests total green |
| `docs/economy-budget.md` | Phase 11 AMENDMENT + COMPLIANCE VERIFICATION | ✅ VERIFIED | E[net]<=0, satisfies D-19, RE-SIGNED D-18, Pitfall-8 500💎 reconciliation |
| Migrations 0020/0021/0022 | schema contract + review fixes | ✅ VERIFIED | 5 new tables + extends; WR-05 unique index in 0022 |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| shopService.buyItem | wallet.deductBalance | ledger reason 'sanguo_shop_' | ✅ WIRED | sink tx confirmed |
| capture_key saleState | shop buy buttons | ITEM_NOT_FOR_SALE | ✅ WIRED | 'locked' in seed + service guard |
| battleCheckInService boss-win | dropService.rollBossDrop | win branch within FOR UPDATE tx | ✅ WIRED | confirmed line 576 |
| boss routing | runLegionBattle + user_legions | legion build + TIER_MULTIPLIERS bake | ✅ WIRED | confirmed |
| chemistryService | mains' CombatantInput | pre-baked buffed stats | ✅ WIRED | Pitfall 6 contract |
| legionService.saveLegion | user_legions/user_legion_slots | persisted active legion | ✅ WIRED | boss routing reads it |
| heroes filters | user_heroes + heroFactions | faction/IV/zone AND | ✅ WIRED | confirmed |
| convert/level/evolve/reroll customIds | soulgemService | interactionCreate routing | ✅ WIRED | confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| convertDuplicate | pool amount | user_hero_soulgems additive upsert | ✅ FLOWING | real DB upsert + ledger |
| evolveHero | tier | user_heroes.tier write | ✅ FLOWING | real DB write |
| buyItem | inventory | user_sanguo_items upsert | ✅ FLOWING | real DB upsert |
| useHeal | hpCurrent | user_heroes.hp_current = base hp | ✅ FLOWING | real DB write |
| rollBossDrop | inventory | user_sanguo_items upsert | ✅ FLOWING | real DB upsert |
| runLegionBattle | battle outcome | sanguo_battles.input snapshot | ✅ FLOWING | replay-faithful snapshot |
| heroes filters | filtered copies | queryOwnedHeroes real query | ✅ FLOWING | real DB query + grade filter |

No static-return / hardcoded-empty data flows found — all rendered values trace to real DB queries.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| SC1/SC2 convert/level/evolve/reroll + chemistry | `npx vitest run soulgemService chemistryService` | 34/34 pass | ✅ PASS |
| SC4 legion battle + boss-wall + assembly | `npx vitest run battleEngine balancePass legionService` | 57/57 pass | ✅ PASS |
| SC3 shop/bag/drop sinks + SC5 heroes filters | `npx vitest run shopService bagService dropService heroes` | 34/34 pass | ✅ PASS |
| Full phase regression | `npx vitest run` | 43 files / 449 tests pass | ✅ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✅ PASS |
| check-i18n | `npx tsx scripts/check-i18n.ts` | all locales in sync | ✅ PASS |

### Probe Execution

The phase declared integration probes against a live PostgreSQL DB (information_schema / pg_indexes) in 11-01. These require a running database and were claimed as `SCHEMA OK` in the SUMMARY. This verifier confirmed the schema **source files** (migrations 0020/0021/0022 present, TS schema matches) but did not re-run the live-DB probe (no DB connection in this environment). The schema contract itself is verified at the source level.

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Migration schema (source) | migration files + TS schema inspection | 0020/0021/0022 present; tier/skill columns + unique indexes defined | ✅ PASS (source-level) |
| Live-DB information_schema probe | node pg probe (claimed in summary) | NOT re-run — requires live DB | ? SKIP (needs live DB + human) |

### Requirements Coverage

All 4 requirement IDs (TQC-14..17) are accounted for across the 8 plans — no orphans, every ID mapped to Phase 11.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| TQC-14 | 11-01, 11-02, 11-03, 11-08 | Duplicate → hồn ngọc tier-scaled, account-bound | ✅ SATISFIED | convertDuplicate (flat 1/5/10/20), per-hero pool, 0 wallet |
| TQC-15 | 11-01, 11-02, 11-03, 11-08 | Evolution L20→t1 / L50→t2, t3 gated | ✅ SATISFIED | evolveHero LEVEL_REQUIRED/T3_GATED, tier 0-3 check |
| TQC-16 | 11-01, 11-02, 11-04, 11-06, 11-08 | Shop + bag + boss items only + wallet sinks | ✅ SATISFIED | shop/bag/drop services, wallet discipline |
| TQC-17 | 11-01, 11-02, 11-05, 11-06, 11-07, 11-08 | Legion 3+9 chemistry extending battleEngine | ✅ SATISFIED | runLegionBattle + chemistryService + legionService |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX markers in any key phase file | ℹ️ Info | None |
| — | — | No stub return / hardcoded-empty / console.log-only implementations | ℹ️ Info | None |
| — | — | Wallet-discipline greps clean (0 calls in bag/drop/soulgem/legion) | ℹ️ Info | None |

No debt markers, no stubs, no forbidden wallet paths found.

### Human Verification Required

The plan's 8 frontmatter `ui_backstops` (loading-state latency, UI-SPEC #31 covered states for the shop/bag/legion/hero/boss-capture surfaces) are Discord UI/UX items that unit tests cannot exercise. These route to human verification:

### 1. Shop/legion/hero-actions/boss-capture loading-state + shop tab rendering

**Test:** Open `/sanguo shop` in a live Discord server and confirm the two currency tabs render (💎 Linh thạch with heal_pill 50💎 + booster_x2 100💎 purchasable, 🎁 Sự kiện with the locked capture_key, no buy button); verify all component presses complete via deferReply → editReply within the 3s window (no duplicate defer).
**Expected:** Shop tabs and buy/use/convert/evolve/reroll/legion presses respond within the 3s latency window; the Event tab is non-empty by construction.
**Why human:** Discord component rendering + interaction latency are not observable by unit tests — requires a live Discord interaction.

### 2. Legion 4-row assembly UI + chemistry-tier-line display

**Test:** Run the `/sanguo legion` 4-row assembly (formation → slot → hero → save) in a live server: assign 3 mains + 9 supports with strict class-match, read the per-main chemistry tier lines (label + link count, never points/buff%), save, then enter a boss battle.
**Expected:** The 4-row UI works; chemistry lines render tier label + link count only (never chemistry points/buff%); the saved legion routes to the forced legion battle.
**Why human:** Discord embed/select-menu interaction flows and field-budget compliance are not exercised by unit tests.

### 3. Boss drop + capture embed flow + never-render of hidden weights

**Test:** Beat a boss thường in a live server, verify the guaranteed item drop line + capture view open, capture, and confirm the captured copy reveal (stars/grade/Lv20 — never the t0 95/t1 4.98/t2 0.02 weights). Confirm all new Phase 11 UI surfaces handle empty/populated/overflow states per UI-SPEC #31.
**Expected:** Clean Discord UX for the drop + capture flow; empty-state + field-budget handling correct; no hidden balance/weight numbers render.
**Why human:** Visual appearance, empty/populated/overflow states, and the D-12 never-render rule require live-Discord human observation.

### Gaps Summary

No functional gaps block the phase goal. All 5 success criteria are implemented, wired, and behaviorally proven by 449 passing tests + green typecheck/check-i18n. The code review (11-REVIEW.md) is clean with all 5 warnings (WR-01..WR-05) fixed and verified (confirmed in-code: WR-02 single-draw boss tier, WR-03 real boss HP, WR-04 additive pool upsert, WR-05 unique index in migration 0022). Migrations 0020/0021/0022 exist.

The `human_needed` status is solely due to the plan's declared Discord UI backstops (loading latency, embed/tab rendering, field budgets) that require live-Discord human verification — not due to any code failure. Every code-level must-have is achieved.

---

_Verified: 2026-08-18T11:20:00Z_
_Verifier: the agent (gsd-verifier)_
