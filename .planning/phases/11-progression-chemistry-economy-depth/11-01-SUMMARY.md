---
phase: 11-progression-chemistry-economy-depth
plan: 01
subsystem: economy, database
tags: [economy-budget, d-18, drizzle-kit, postgres, migration, schema, hon-ngoc]

# Dependency graph
requires:
  - phase: 10-battle-capture
    provides: capture-fee contract (D-20), starter faucet, user_heroes/captureAttempts schema base, FOR UPDATE single-writer pattern
provides:
  - Re-signed Phase 11 economy amendment (D-18 one-way gate): ONLY new Linh thạch sinks = shop (heal_pill 50💎, booster_x2 100💎) + formations (200/300/500💎) via wallet.deductBalance; evolution/level/reroll = HỒN NGỌC sinks; boss drops items-only weights 70/25/4.9/0.1; E[net/hour] <= 0 with gross < ~416/hr
  - Migration 0020 applied live: 5 new tables (sanguo_skills, user_hero_soulgems, user_legions, user_legion_slots, soulgem_transactions) + 4 schema extends (user_heroes tier/skill FKs, sanguo_items multi-currency model, encounter_runs level/skill FKs, formations emoji) + 2 PLAN-FIX P0-1 unique indexes
affects: [11-02 (seed), 11-03 (soulgemService), 11-04 (shopService/dropService), 11-05 (battleEngine), 11-06 (boss capture), 11-07 (legion), 11-08 (balance pass), 12-anti-abuse-monitoring-marketplace-gating]

# Actuals (#2632) — pairs with plan's estimate (44000) on the same chars/4 scale over the realized diff.
actuals:
  tokens: 78930
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-currency price model (priceLinh/priceEvent/saleState/dropWeight) on sanguo_items — D-16, replaces single base_price"
    - "Per-hero hồn ngọc pool table (user_hero_soulgems) with unique(userId, heroId) + amount>=0 check — WHERE-guard deduct target (deductHonNgoc in 11-03)"
    - "Unique index on seed upsert targets (formation_slots(formationId, slotOrder), user_formations(userId, formationId)) — ON CONFLICT prerequisite + TOCTOU close"

key-files:
  created:
    - src/db/schema/sanguoSkills.ts
    - src/db/schema/userHeroSoulgems.ts
    - src/db/schema/userLegions.ts
    - src/db/schema/soulgemTransactions.ts
    - migrations/0020_ancient_northstar.sql
  modified:
    - docs/economy-budget.md
    - src/db/schema/userHeroes.ts
    - src/db/schema/sanguoItems.ts
    - src/db/schema/encounterRuns.ts
    - src/db/schema/formations.ts
    - src/db/schema/index.ts

key-decisions:
  - "adopt-a5 (user checkpoint decision 2026-08-14): research prices/drop-weights adopted as-is — heal_pill 50💎, booster_x2 100💎, formations 200/300/500💎, boss drops heal 70% / booster 25% / key4 4.9% / key5 0.1%; superseded 'Linh thạch → evolution' row replaced by 'Linh thạch → hồn ngọc: only via the booster (bounded, one-way)'"
  - "Evolution/leveling/reroll are HỒN NGỌC sinks (D-01/D-06) — never wallet.deductBalance; restated as a hard prohibition in the amendment"

patterns-established:
  - "D-18 amendment block pattern: Phase 11 AMENDMENT block with sink table + drop weights + E[net/hour] recompute + RE-SIGNED line, mirroring the Phase 9/10 amendment blocks"
  - "Schema-gate migration: drizzle-kit generate → npm run migrate → information_schema probe spanning ALL tables (Phase 10 lesson — heroes-only probes miss cross-table columns)"

requirements-completed: [TQC-14, TQC-15, TQC-16, TQC-17]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "docs/economy-budget.md Phase 11 AMENDMENT (2026-08-14) — sink-set restatement (shop + formations via wallet.deductBalance; evolution/level/reroll = hồn ngọc), boss drop weights 70/25/4.9/0.1, E[net/hour] recompute <= 0 with gross < ~416/hr, RE-SIGNED D-18 line"
    verification:
      - kind: manual_procedural
        ref: "docs/economy-budget.md AMENDMENT block + RE-SIGNED (2026-08-14, Phase 11 D-18) + convertibility matrix superseded rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 0020 applied — 5 new tables (sanguo_skills, user_hero_soulgems, user_legions, user_legion_slots, soulgem_transactions) + 4 extends (user_heroes tier/skill_normal_id/skill_special_id, sanguo_items price_linh/price_event/sale_state/drop_weight with base_price dropped, encounter_runs level + skill FKs, formations emoji) + unique indexes formation_slots_formation_slot_unique + user_formations_unique_user_formation"
    verification:
      - kind: integration
        ref: "node probe against information_schema + pg_indexes — SCHEMA OK: 5 tables + 8 columns + 2 unique indexes present"
        status: pass
      - kind: integration
        ref: "npm run migrate — migrations applied successfully"
        status: pass
      - kind: unit
        ref: "npm run typecheck — exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 26min
completed: 2026-08-14
status: complete
---

# Phase 11 Plan 01: Economy Amendment (D-18) + Schema Migration 0020 Summary

**Re-signed Phase 11 economy contract (adopt-a5) with the ONLY new Linh thạch sinks locked (shop heal 50💎 / booster 100💎 / formations 200-500💎, E[net] <= 0, gross < ~416/hr) + migration 0020 live with 5 new tables and 4 schema extends powering every Phase 11 service**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-14T07:19:40Z
- **Completed:** 2026-08-14T07:45:40Z
- **Tasks:** 2 (1 checkpoint:decision resolved → adopted, 1 auto)
- **Files modified:** 13

## Accomplishments

- **D-18 economy gate closed (2026-08-14):** `docs/economy-budget.md` now carries the Phase 11 AMENDMENT — the ONLY new Linh thạch sinks are the shop (`heal_pill` 50💎, `booster_x2` 100💎) and formation purchases (200/300/500💎), all via `wallet.deductBalance`; evolution/leveling/re-roll are restated as HỒN NGỌC sinks (D-01/D-06, never Linh thạch — the superseded "Linh thạch → evolution" convertibility row is replaced by "Linh thạch → hồn ngọc: only via the booster (bounded, one-way)"); boss drop weights recorded (heal 70% / booster 25% / key4 4.9% / key5 0.1%, items only); E[net/hour] recomputed <= 0 with gross ≈ 50–130💎/hr at realistic cadence 5–10/hr (full loop incl. signed capture fees ≈ 160–520💎/hr, below ~416/hr in the realistic model); document RE-SIGNED (D-18).
- **Migration 0020 applied to the live DB (schema-gate closed):** drizzle-kit generated `migrations/0020_ancient_northstar.sql` (never hand-written SQL) — 5 new tables (`sanguo_skills`, `user_hero_soulgems`, `user_legions`, `user_legion_slots`, `soulgem_transactions`), 4 extends (`user_heroes` +tier 0-3 check +skill_normal_id/skill_special_id FKs; `sanguo_items` +price_linh/price_event/sale_state/drop_weight with base_price dropped; `encounter_runs` +level +skill FKs +hero_id comment flip for D-24; `formations` +emoji), plus the 2 PLAN-FIX P0-1 unique indexes. `npm run migrate` applied it; the information_schema probe (all tables — Phase 10 lesson) confirms **5 tables + 8 columns + 2 unique indexes live**; `npm run typecheck` and `npx drizzle-kit check` both green.
- **PLAN-FIX P0-1 delivered:** `formation_slots_formation_slot_unique` (formationId+slotOrder — the 11-02 seed's `onConflictDoUpdate` target, without which `ON CONFLICT (formation_id, slot_order)` fails at the Postgres level) and `user_formations_unique_user_formation` (userId+formationId — the 11-04 buyFormation ALREADY_OWNED + no-duplicate-ownership contract closing the SELECT-then-INSERT TOCTOU race).

## Task Commits

Each task was committed atomically:

1. **Task 1: Amend + re-sign docs/economy-budget.md (adopt-a5)** - `42e3d9c` (docs)
2. **Task 2: [BLOCKING] Migration 0020 — 5 new tables + 4 schema extends + generate + migrate** - `ecaa53f` (feat)

**Plan metadata:** `pending` (docs: complete plan — made after SUMMARY)

## Files Created/Modified

- `docs/economy-budget.md` - Phase 11 AMENDMENT block (sink table, drop weights, E[net/hour] recompute, RE-SIGNED D-18) + convertibility matrix rows superseded/replaced
- `src/db/schema/sanguoSkills.ts` - NEW skill catalog (code unique, class/slot/rarity/mpCost/mpGain/effectType/effectValue/emoji)
- `src/db/schema/userHeroSoulgems.ts` - NEW per-hero hồn ngọc pool (unique(userId,heroId), amount>=0 check)
- `src/db/schema/userLegions.ts` - NEW user_legions (unique userId) + user_legion_slots (unique(userId,slotOrder), 0-11 check)
- `src/db/schema/soulgemTransactions.ts` - NEW hồn ngọc audit ledger (index userId)
- `src/db/schema/userHeroes.ts` - EXTEND tier (0-3 check) + skillNormalId/skillSpecialId FKs → sanguo_skills
- `src/db/schema/sanguoItems.ts` - EXTEND D-16 multi-currency model; base_price column removed
- `src/db/schema/encounterRuns.ts` - EXTEND level + skill FKs; hero_id comment flip (D-24 bosses carry real hero)
- `src/db/schema/formations.ts` - EXTEND emoji + 2 P0-1 unique indexes
- `src/db/schema/index.ts` - barrel re-exports for 5 new table symbols
- `migrations/0020_ancient_northstar.sql` + `migrations/meta/0020_snapshot.json` - generated migration (5 tables + 4 extends + 2 unique indexes)

## Decisions Made

- **adopt-a5** (user checkpoint decision, 2026-08-14): adopted research shop prices and boss drop weights as-is rather than tuning — internally consistent (heal 50 / booster 100 / formations 200-300-500; drops 70/25/4.9/0.1), with first-pass fairness unproven until live data (flagged for Phase 12 TQC-19 monitoring). The amendment recomputes and verifies E[net] <= 0 + gross < ~416/hr BEFORE signing.
- The booster (`booster_x2`, 100💎, doubles ONE conversion) is documented as the bounded, one-way Linh thạch → hồn ngọc bridge (flagged assumption A11 — monitored in Phase 12); E[inflow] stays 0 (booster is a sink), so D-19 holds trivially.

## Deviations from Plan

None - plan executed exactly as written. The checkpoint:decision (Task 1) was resolved by the user as `adopt-a5` and the amendment/seed prices follow the confirmed values (no adjust-prices path taken).

## Issues Encountered

- **drizzle-kit interactive prompt (non-TTY harness):** `drizzle-kit generate` requires a TTY to resolve the `sanguo_items.base_price` removal vs 4 new columns (rename-or-create ambiguity). Resolved by driving the prompt through a PTY (`node-pty` installed in the temp dir outside the repo, answering "create column" for all 4 new columns — the correct resolution: base_price deleted, new columns created). No project dependency added; no hand-written SQL.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **11-02 (content seed)** can now upsert the D-11 catalog against `sanguo_items.price_linh`/`sale_state`/`drop_weight` and `sanguo_skills` (code unique), and upsert formation slots against the new `formation_slots_formation_slot_unique` target (P0-1) — the amendment values are the single source the seed writes (Pitfall 8).
- **11-03 (soulgemService)** has its storage ready: `user_hero_soulgems` (unique(userId,heroId), amount>=0) + `soulgem_transactions` audit ledger + `user_heroes.tier` (0-3) for TIER_VALUE lookups.
- **11-04 (shopService/dropService)** charges the signed prices via wallet.deductBalance and rolls boss drops against the signed weights; `user_formations_unique_user_formation` backs the buyFormation ALREADY_OWNED contract.
- **11-05/11-06/11-07** read `user_legions`/`user_legion_slots`, `encounter_runs.level` + skill FKs, and `user_heroes` skill columns as designed.
- **11-08 (balance pass)** has the signed economy baseline to tune against (D-18).

## Self-Check: PASSED

- FOUND: docs/economy-budget.md (amended), src/db/schema/sanguoSkills.ts, userHeroSoulgems.ts, userLegions.ts, soulgemTransactions.ts, migrations/0020_ancient_northstar.sql, 11-01-SUMMARY.md
- FOUND commits: 42e3d9c (Task 1 docs), ecaa53f (Task 2 feat)
- Probe: SCHEMA OK — 5 tables + 8 columns + 2 unique indexes present in live DB

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-14*
