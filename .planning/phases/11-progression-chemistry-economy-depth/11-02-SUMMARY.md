---
phase: 11-progression-chemistry-economy-depth
plan: 02
subsystem: progression, content-seed, database
tags: [balance-contract, d-12, progression, chemistry, seed, drizzle-kit, migration, hon-ngoc]

# Dependency graph
requires:
  - phase: 11-progression-chemistry-economy-depth
    provides: 11-01 economy amendment (adopt-a5 prices 50/100 + formations 200/300/500 + drop weights 70/25/4.9/0.1) + migration 0020 (sanguo_skills/user_hero_soulgems/user_legions tables, sanguo_items multi-currency model, formations emoji, P0-1 unique indexes)
provides:
  - Hidden balance contract modules: sanguoProgression.ts (LEVEL_COST curve 1+floor((L-1)^2/200), STAT_GAIN_PER_LEVEL 2, TIER_MULTIPLIERS 1.0/1.1/1.25/1.5, EVOLUTION_COSTS 20/50/100, REROLL_COST 10, MAX_LEVEL 100) + sanguoChemistry.ts (CHEMISTRY_POINTS 3/3/2/1, CHEMISTRY_TIERS S>=12 +10% .. D>=1 +2% + bonus-only 0-floor) — D-12 never-rendered
  - Content seed live in DB: 41 class-based skills (8 classes x normal common/rare + special common/rare/epic, vu_co attack_up support special), D-11 item catalog (heal_pill 50 sold/70, booster_x2 100 sold/25, capture_key locked/0, capture_tier4_key locked/4.9, capture_tier5_key locked/0.1), 3 formations (can_ban free + thien_co 200 + vu_sat 300, 36 slots)
  - seed-sanguo.ts extended with FATAL loaders + idempotent upserts + stale placeholder row deletion; theme.ts +EMOJI.HON_NGOC '🧿'
  - Migration 0021: sanguo_items.emoji column (Rule 2 fix — 0020 only added emoji to formations)
affects: [11-03 soulgemService (LEVEL_COST/EVOLUTION_COSTS/REROLL_COST/MAX_LEVEL), 11-04 shopService/dropService (sanguo_items prices/sale_state/dropWeight), 11-05 battleEngine (STAT_GAIN_PER_LEVEL, CHEMISTRY_TIERS buffs), 11-06 skillService (sanguo_skills pools), 11-07 legion (formations catalog + TIER_MULTIPLIERS), 11-08 balance pass, 12-anti-abuse-monitoring-marketplace-gating]

# Actuals (#2632) — pairs with the plan's estimate (42000) on the same chars/4 scale over the realized diff.
actuals:
  tokens: 38994
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hidden-mechanics constants module (sanguoCapture.ts analog): signed-contract header + typed const tables + D-12 never-render rule — the balance contract lives in constants, services import, UI never renders"
    - "FATAL-required content seed datasets: JSON catalog + loadX() with process.exit(1) on missing (mirror sanguo-base-stats.json loader) + onConflictDoUpdate on natural keys"
    - "Content-driven emoji in seed tables (never theme constants) — skills/items/formations carry emoji columns"

key-files:
  created:
    - src/constants/sanguoProgression.ts
    - src/constants/sanguoChemistry.ts
    - src/constants/__tests__/sanguoProgression.test.ts
    - src/constants/__tests__/sanguoChemistry.test.ts
    - scripts/data/sanguo-skills.json
    - scripts/data/sanguo-items.json
    - scripts/data/sanguo-formations.json
    - migrations/0021_oval_miss_america.sql
  modified:
    - scripts/seed-sanguo.ts
    - src/ui/theme.ts
    - src/db/schema/sanguoItems.ts

key-decisions:
  - "Item emoji is a DB content column (Rule 2 fix): migration 0020 only added emoji to formations; the plan's D-11 catalog requires per-item content-driven emoji, so migration 0021 adds sanguo_items.emoji varchar(100) nullable — item emojis now persist"
  - "CHEMISTRY_TIERS buff direction: along the S-first array (min descending) buffs strictly DESCEND with tier quality (S +10% best, D +2% weakest); the 0-entry is the bonus-only no-penalty floor — test corrected to encode this contract"

patterns-established:
  - "Balance contract as pure constants + sanity tests (TDD): RED test commit → GREEN constants commit; the numbers every Phase 11 service imports are tested before any service exists"
  - "Seed dataset shape: { catalog } object keyed with _comment provenance + code natural keys; upsert clobber-safe spreads; stale rows deleted via notInArray when a catalog replaces a placeholder"

requirements-completed: [TQC-14, TQC-15, TQC-16, TQC-17]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "sanguoProgression.ts — LEVEL_COST curve (1 + floor((L-1)^2/200), anchors 1/1/3/13/50, tier-independent by construction), STAT_GAIN_PER_LEVEL 2, TIER_MULTIPLIERS {0:1.0,1:1.1,2:1.25,3:1.5}, EVOLUTION_COSTS {1:20,2:50,3:100}, REROLL_COST 10, MAX_LEVEL 100"
    verification:
      - kind: unit
        ref: "src/constants/__tests__/sanguoProgression.test.ts#LEVEL_COST/STAT_GAIN/TIER_MULTIPLIERS/EVOLUTION/REROLL/MAX_LEVEL describes"
        status: pass
    human_judgment: false
  - id: D2
    description: "sanguoChemistry.ts — CHEMISTRY_POINTS {family:3, spouse:3, faction:2, role:1} (D-19 hierarchy) + CHEMISTRY_TIERS S>=12 +10% / A>=8 +8% / B>=5 +6% / C>=3 +4% / D>=1 +2% / min-0 buff 0 (bonus-only, EA FC grounding); both D-12 never-render with no wallet/db imports"
    verification:
      - kind: unit
        ref: "src/constants/__tests__/sanguoChemistry.test.ts#CHEMISTRY_POINTS/CHEMISTRY_TIERS describes"
        status: pass
    human_judgment: false
  - id: D3
    description: "sanguo-skills.json seeded — 41 skills, every class has a normal pool (common 80/rare 20 weight) + special pool (common 60/rare 30/epic 10); vu_co carries the attack_up 'buff sỹ khí' support special (D-18); mechanics + emoji only (names are i18n keys)"
    verification:
      - kind: integration
        ref: "npm run seed:sanguo (idempotent, 3 runs stable) + DB probe — 16 class/slot groups all present, vu_co 4 specials incl. attack_up"
        status: pass
    human_judgment: false
  - id: D4
    description: "sanguo-items.json seeded — D-11 catalog: heal_pill (50 sold, dropWeight 70), booster_x2 (100 sold, 25), capture_key (locked, 0 — excluded from drop pool by WHERE drop_weight > 0), capture_tier4_key (locked, 4.9), capture_tier5_key (locked, 0.1); stale placeholder codes (xian_tea/qinglong_dan) deleted from the DB"
    verification:
      - kind: integration
        ref: "npm run seed:sanguo + DB probe — 5 items with exact sale_state/drop_weight/price_linh/emoji; stale probe returns []"
        status: pass
    human_judgment: false
  - id: D5
    description: "sanguo-formations.json seeded — can_ban starter (basePrice 0, 12 slots) + thien_co 200💎 + vu_sat 300💎 (adopt-a5 200/300/500 set); 36 formation_slots rows (3 mains + 9 support per formation, class requirements per slot, P0-1 upsert target)"
    verification:
      - kind: integration
        ref: "npm run seed:sanguo + DB probe — 3 formations with 12 slot rows each, positions main+support"
        status: pass
    human_judgment: false
  - id: D6
    description: "src/ui/theme.ts gains exactly EMOJI.HON_NGOC: '🧿' (verified distinct from 💎 LINH_THACH and 💠 linh_khi_tinh at seed.ts:68) — no COLORS change, diff is exactly +1 line"
    verification:
      - kind: other
        ref: "git diff src/ui/theme.ts — single-line addition; npm run typecheck exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-08-14
status: complete
---

# Phase 11 Plan 02: Balance Contract + Content Seed Summary

**The hidden progression/chemistry balance contract (D-12 never-rendered constants, sanity-tested via TDD) + the live-seeded content layer — 41 class-based skills, the D-11 item catalog at adopt-a5 prices/drop-weights, and 3 formations (starter free + 200/300💎) — with the EMOJI.HON_NGOC glyph and the missing sanguo_items.emoji column added (Rule 2)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-14T14:53:00+07:00
- **Completed:** 2026-08-14T15:07:00+07:00
- **Tasks:** 2 (both `type="auto"`; Task 1 TDD)
- **Files modified:** 13 (11 project files + 2 migration artifacts)

## Accomplishments

- **Balance contract constant-first (Task 1, TDD RED→GREEN):** `sanguoProgression.ts` carries the signed level curve `LEVEL_COST(L) = 1 + ⌊(L−1)²/200⌋` (anchors 1/1/3/13/50; L1→21 ≈ 27, L1→51 ≈ 264, L1→100 ≈ 1741 — D-05, identical across tiers by construction), `STAT_GAIN_PER_LEVEL = 2` (D-08), `TIER_MULTIPLIERS` t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5 (D-07), `EVOLUTION_COSTS` 20/50/100 (D-06/D-09), `REROLL_COST 10` (D-32), `MAX_LEVEL 100` (D-01). `sanguoChemistry.ts` carries the EA FC-grounded chemistry contract: `CHEMISTRY_POINTS` family+spouse 3 / faction 2 / role 1 (D-19 hierarchy) and `CHEMISTRY_TIERS` S≥12 +10% … D≥1 +2% + a bonus-only min-0 floor (buff 0, no penalty — EA FC 0-chemistry grounding). Both are D-12 never-rendered hidden modules with zero wallet/db imports; 18 sanity tests green, typecheck green.
- **Content layer seeded idempotently (Task 2):** `sanguo-skills.json` (41 skills — every class has a normal pool common 80/rare 20 and a special pool common 60/rare 30/epic 10; vu_co carries the attack_up "buff sỹ khí" support special per D-18; mechanics + emoji only, names are i18n keys), `sanguo-items.json` (the D-11 catalog REPLACING the Phase 8 placeholder: heal_pill 50💎 sold / dropWeight 70, booster_x2 100💎 sold / 25, capture_key locked / 0 — excluded from the drop pool by `WHERE drop_weight > 0` — plus capture_tier4_key locked / 4.9 and capture_tier5_key locked / 0.1 matching the `requiresItem` gates in sanguoCapture.ts), `sanguo-formations.json` (can_ban starter free + thien_co 200💎 + vu_sat 300💎, 36 class-requirement slots). `seed-sanguo.ts` gained the three FATAL loaders (mirror loadBaseStats), idempotent upserts (items on code, skills on code, formations on code, formation_slots on the P0-1 `(formationId, slotOrder)` unique), and deleted the 2 stale placeholder rows (probe: zero orphans, zero user-owned). `src/ui/theme.ts` gained exactly `EMOJI.HON_NGOC: '🧿'` (distinct from 💎 LINH_THACH and 💠 linh_khi_tinh at seed.ts:68) — diff is exactly +1 line, COLORS untouched.
- **Rule 2 fix — `sanguo_items.emoji` column (migration 0021):** the plan's Task 2 spec requires content-driven per-item emoji ("No item emoji as theme constants — content-driven emoji columns in the seed tables"), but migration 0020 added `emoji` only to `formations`. Drizzle silently ignored the unknown `emoji` key, so item emojis were NOT persisting. Added `emoji varchar(100)` nullable to `sanguoItems.ts` (mirroring `formations.emoji`), generated migration 0021 via drizzle-kit (additive, non-ambiguous — no TTY needed this time), applied, re-seeded. The probe now confirms all 5 item emojis live.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): failing tests for the balance constants** - `78f8988` (test)
2. **Task 1 (TDD GREEN): progression + chemistry constants** - `7fce91a` (feat)
3. **Task 2: content seed — skills/items/formations + seed extension + HON_NGOC + emoji column fix** - `91dd841` (feat)

## Files Created/Modified

- `src/constants/sanguoProgression.ts` - level curve, stat gain, tier multipliers, evolution costs, reroll cost, max level (hidden, D-12)
- `src/constants/sanguoChemistry.ts` - chemistry link points + tier/buff table (hidden, D-12)
- `src/constants/__tests__/sanguoProgression.test.ts` + `sanguoChemistry.test.ts` - 18 sanity tests
- `scripts/data/sanguo-skills.json` - 41 class-based skills (mechanics + emoji; names = i18n keys)
- `scripts/data/sanguo-items.json` - D-11 catalog (prices/sale_state/drop_weights/emoji/per-locale names)
- `scripts/data/sanguo-formations.json` - starter + 2 purchasable formations with 12-slot layouts
- `scripts/seed-sanguo.ts` - FATAL loaders + idempotent upserts + stale-row deletion; placeholder SANGUO_ITEMS removed
- `src/ui/theme.ts` - +`EMOJI.HON_NGOC: '🧿'` only
- `src/db/schema/sanguoItems.ts` - +`emoji` column (Rule 2)
- `migrations/0021_oval_miss_america.sql` + `migrations/meta/0021_snapshot.json` + `_journal.json` - additive emoji column

## Decisions Made

- **Item emoji as a DB content column (Rule 2 fix):** migration 0020's omission of `sanguo_items.emoji` would have silently dropped the plan-required per-item emoji. Added the nullable column via migration 0021 (mirrors `formations.emoji`), re-seeded, probe-confirmed. Item emojis are content-driven, never theme constants — per the plan's prohibition.
- **CHEMISTRY_TIERS buff ordering encoded correctly:** the S-first array (min descending 12→0) carries strictly DESCENDING buffs (S +10% best → D +2% weakest); the bonus-only min-0 entry is the no-penalty floor. The test was corrected during GREEN to assert this contract (better tier = bigger buff, floor = 0).
- **Formation price assignment:** the two purchasable formations take 200💎 (thien_co) and 300💎 (vu_sat) from the adopt-a5 confirmed 200/300/500 set (starter free); the plan's "2 purchasable" constraint fits the 200/300 pair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `sanguo_items.emoji` column missing — item emojis silently dropped**
- **Found during:** Task 2 (DB probe after seed run)
- **Issue:** The plan requires content-driven per-item emoji in the seed tables, but migration 0020 (11-01) added `emoji` only to `formations`. Drizzle ignores unknown value keys, so the seed's `emoji: item.emoji` never reached the DB — a silent data loss against the plan's own catalog spec.
- **Fix:** Added `emoji varchar(100)` nullable to `sanguoItems.ts` (mirroring `formations.emoji`), generated + applied migration 0021 (additive, single-column), re-ran the seed. Probe now shows all 5 item emojis persisted.
- **Files modified:** `src/db/schema/sanguoItems.ts`, `migrations/0021_oval_miss_america.sql`, `migrations/meta/0021_snapshot.json`, `migrations/meta/_journal.json`
- **Verification:** DB probe — `emoji` column present, all 5 items carry their emoji; seed still idempotent (3rd run stable); `npx drizzle-kit check` not required (additive column, applied cleanly)
- **Committed in:** `91dd841` (Task 2 commit)

**2. [Rule 1 - Bug] Chemistry tier test asserted the wrong invariant direction**
- **Found during:** Task 1 (GREEN phase — test failed after implementation)
- **Issue:** The test asserted buffs "strictly ascending" along the array, but the plan's own numbers (S +10% … D +2%, 0 → 0) make buffs strictly DESCENDING with tier quality along the S-first array; the final 0-entry breaks ascent by design (bonus-only floor).
- **Fix:** Corrected the test to assert the true contract — S..D block strictly descending, min-0 entry exactly 0 with no negative buff anywhere.
- **Files modified:** `src/constants/__tests__/sanguoChemistry.test.ts`
- **Verification:** 18/18 tests green; typecheck green
- **Committed in:** `7fce91a` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes were necessary for the plan's own contract to hold (item emoji persistence is explicit in the Task 2 spec; the tier test now encodes the signed numbers). No scope creep — migration 0021 is a single additive nullable column.

## Issues Encountered

- **drizzle-kit generate for 0021 was non-interactive** (unlike the 11-01 rename-or-create ambiguity): adding a brand-new column to an existing table is unambiguous, so no PTY workaround was needed.
- **`scripts/` is outside tsconfig `include` (`src/**/*`)**: `npm run typecheck` does not cover `seed-sanguo.ts`. The seed's `emoji` key slipped past typecheck for this reason — caught by the DB probe instead. Noted for 11-03+ (services live in `src/` so they ARE typechecked; the seed remains tsx-transpiled only).

## User Setup Required

None - no external service configuration required. The seed and migration ran against the local dev DB (DATABASE_URL_DIRECT).

## Next Phase Readiness

- **11-03 (soulgemService)** imports `LEVEL_COST`, `EVOLUTION_COSTS`, `REROLL_COST`, `MAX_LEVEL` from sanguoProgression.ts — the level button label and `deductHonNgoc` charge read the curve directly; `user_hero_soulgems` (0020) + `soulgem_transactions` are ready.
- **11-04 (shopService/dropService)** reads the D-11 catalog: `sale_state === 'sold'` gates purchases (capture_key stays `locked` → `ITEM_NOT_FOR_SALE`), `price_linh` charges via `wallet.deductBalance`, `drop_weight` feeds the boss drop walk (remember RESEARCH P2: `Number()`-convert the drizzle numeric string).
- **11-05/11-06 (battleEngine/skillService)** consume `STAT_GAIN_PER_LEVEL` + `CHEMISTRY_TIERS` buffs and roll skills from the 41-row `sanguo_skills` pools (rarity weights 80/20 normal, 60/30/10 special; MP +12/15/25/40).
- **11-07 (legion)** reads the 3-formation catalog (can_ban free grant at onboarding) + `TIER_MULTIPLIERS` for evolved mains; formation slots carry content-driven emoji.
- **11-08 (balance pass)** tunes the constants against the seeded stat ranges; the signed values from 11-01 are now the single source in both the seed and the constants.

## Self-Check: PASSED

- FOUND: src/constants/sanguoProgression.ts, sanguoChemistry.ts, __tests__/sanguoProgression.test.ts, __tests__/sanguoChemistry.test.ts, scripts/data/sanguo-skills.json, sanguo-items.json, sanguo-formations.json, migrations/0021_oval_miss_america.sql, modified seed-sanguo.ts + theme.ts + sanguoItems.ts
- FOUND commits: 78f8988 (test RED), 7fce91a (feat GREEN), 91dd841 (feat Task 2)
- Probe: ITEMS 5 rows exact sale_state/drop_weight/price_linh/emoji; SKILLS 16 class/slot groups; FORMATIONS 3 rows 12 slots each; STALE_REMAINING []
- Test suite 309/309, typecheck 0, check-i18n ✅, seed 3x idempotent

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-14*
