---
phase: 11-progression-chemistry-economy-depth
plan: 07
subsystem: sanguo-legion-ci
tags: [legion, formation, class-match, ownership, d-20, d-22, d-17, chemistry, tier-label, sc5, heroes-filters, faction, iv-grade, discord-command, i18n]

requires:
  - phase: 11-01
    provides: user_legions/user_legion_slots schema, migration 0020, P0-1 unique indexes
  - phase: 11-02
    provides: formations catalog seed (free starter basePrice 0 + purchasable)
  - phase: 11-04
    provides: buyFormation/user_formations ownership rows (D-21)
  - phase: 11-05
    provides: chemistryService (mainChemistryPoints/chemistryTier — pure tier/link computation)
  - phase: 11-06
    provides: buildLegionInput boss routing that consumes the persisted active legion
provides:
  - legionService: listOwnedFormations (free-starter first-use upsert) / getActiveLegion / assignHero (ownership + strict class-match V4/D-20) / clearSlot / saveLegion
  - /sanguo legion 4-row assembly UI (formation → slot → hero → save) + chemistry-line embed (tier + link count only)
  - /sanguo heroes SC5 filters (zone + faction + IV-grade) with 3 filter ActionRows
  - interactionCreate routing for sanguo:legion:* + sanguo:heroes:faction/iv
  - i18n legion.*/cmd.legion/classes.* + heroes.faction_filter/iv_filter/filter_all (3 locales)
affects: [11-08 balance pass (consumes the assembled legion + chemistry display), 12-anti-abuse-monitoring-marketplace-gating]

actuals:
  tokens: 31000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Service CRUD ownership-gated (single-writer FOR UPDATE + strict class-match BEFORE write)"
    - "Stateless multi-row Discord assembly UI (customId carries slot/index; values ride values[0])"
    - "Centralized filter validation in a shared renderCollection (invalid → cleared, T-11-07-05)"

key-files:
  created:
    - src/services/sanguo/legionService.ts
    - src/services/sanguo/__tests__/legionService.test.ts
    - src/commands/sanguo/legion.ts
    - src/commands/sanguo/__tests__/legion.test.ts
    - src/ui/components/sanguoLegionFormationMenu.ts
    - src/ui/components/sanguoLegionSlotMenu.ts
    - src/ui/components/sanguoLegionHeroMenu.ts
    - src/ui/components/sanguoLegionSaveButton.ts
    - src/ui/embeds/buildSanguoLegionEmbed.ts
    - src/ui/components/sanguoHeroesFactionMenu.ts
    - src/ui/components/sanguoHeroesIvMenu.ts
  modified:
    - src/commands/sanguo/heroes.ts
    - src/commands/sanguo/map.ts
    - src/events/interactionCreate.ts
    - src/ui/embeds/buildSanguoHeroesEmbed.ts
    - src/commands/sanguo/__tests__/heroes.test.ts
    - locales/vi/sanguo.json, locales/en/sanguo.json, locales/zh-cn/sanguo.json

key-decisions:
  - "The 'current working formation' = the active legion's formation (persisted by saveLegion); picking a different owned formation activates it immediately (D-22 one active legion) so subsequent assignHero calls target it."
  - "Filter validation centralized in renderCollection (zones/factions/IV-grade reference sets fetched once; invalid/filter_all → cleared, never a crash — T-11-07-05), avoiding double-fetching in the handlers."
  - "The legion embed data interface carries PRE-RENDERED field values (tier labels + link counts only) — no chemistry points/buff% fields reach the builder (D-12 structural rule, mirroring buildSanguoProgressionResultEmbed)."

patterns-established:
  - "legionService: every pressed userHeroId + formationId re-validated server-side in ONE tx BEFORE any write — NOT_OWNED (V4), legion.class_mismatch (D-20), HERO_ALREADY_ASSIGNED (D-17 one-copy-one-slot)."
  - "Free-starter (basePrice 0) upsert on user_formations via onConflictDoNothing riding the P0-1 unique index — concurrent first use safe."
  - "The 4-row stateless assembly UI: formation select (row 1) → slot-pick (row 2, 12 slots) → class-filtered hero-pick (row 3, paged 25) → save (row 4), each press re-renders from DB state."
  - "SC5 collection: 3 filter ActionRows (zone/faction/IV-grade), field name = joined active-filter labels, title count = filtered total."

requirements-completed: [TQC-17]

coverage:
  - id: D1
    description: "legionService ownership + strict class-match assembly persistence (listOwnedFormations free-starter upsert, getActiveLegion, assignHero V4/D-20, clearSlot, saveLegion)"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/legionService.test.ts#assignHero class-match / ownership / cast / dup"
        status: pass
    human_judgment: false
  - id: D2
    description: "/sanguo legion 4-row assembly UI + chemistry-line embed (tier + link count ONLY, D-12) + routing + command test"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/legion.test.ts#class_mismatch handler + routing"
        status: pass
      - kind: other
        ref: "npm run lint (i18next/no-literal-string zero hardcoded)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/sanguo heroes SC5 filters (zone + faction + IV-grade, grade keys only) with 3 filter rows + active-filter embed label"
    requirement: TQC-17
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/heroes.test.ts#SC5 filters combined / iv / faction"
        status: pass
    human_judgment: false

duration: 56min
completed: 2026-08-18
status: complete
---

# Phase 11 Plan 07: Legion Assembly + Chemistry-Line Display + Heroes SC5 Filters Summary

**The team-building surface (TQC-17 assembly half + ROADMAP SC5): ownership-gated, strict class-matched 3+9 legion assembly with a 4-row Discord UI and per-main chemistry tier-line display, plus the full /sanguo heroes zone + faction + IV-grade filter set.**

## Performance

- **Duration:** 56 min
- **Started:** 2026-08-18T08:58:00Z
- **Completed:** 2026-08-18T09:54:00Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- **legionService (TQC-17 assembly)**: `listOwnedFormations` (free starter `basePrice 0` granted via the P0-1 onConflictDoNothing upsert), `getActiveLegion` (joining slots to hero identities), `assignHero` (ONE FOR-UPDATE tx: formation ownership → V4 copy re-gate → slot class resolve → STRICT class-match before any write → one-copy-one-slot guard → unique(userId,slotOrder) upsert), `clearSlot`, and `saveLegion` (one active legion per user).
- **/sanguo legion command + 4-row assembly UI**: formation select (row 1) → slot-pick (row 2, 12 slots with class labels) → class-matched hero-pick (row 3, paged at 25, D-20) → save (row 4). The chemistry-line embed renders per-main tier + link COUNT only (D-12 — never points/buff%), with the incomplete-caution (R-11).
- **/sanguo heroes SC5 filters**: `queryOwnedHeroes` now AND-combines zone + faction (heroFactions code) + IV-grade (the SAME `ivGradeKey` function the render uses — grade keys only, D-12); 3 filter ActionRows + active-filter label in the embed field name.
- **Security (V4/D-20/T-11-07-05)**: every pressed userHeroId/formationId re-validated server-side; crafted foreign/wrong-class inputs → NOT_OWNED / legion.class_mismatch with no state change; invalid filter values → cleared/empty, never a crash.

## Task Commits

Each task was committed atomically:

1. **Task 1: legionService (TDD)**
   - `5b71d36` (test) — add failing legionService tests (ownership + class-match assembly)
   - `f9880fd` (feat) — implement legionService ownership + class-match assembly persistence
2. **Task 2: /sanguo legion command + 4-row UI + chemistry embed + routing**
   - `221e791` (feat) — add legion assembly: 4-row formation UI + chemistry-line embed + routing
3. **Task 3: /sanguo heroes SC5 filters (TDD)**
   - `7c1da01` (test) — add SC5 faction/IV filter tests + update for 3-row collection
   - `d6f1957` (feat) — extend /sanguo heroes with faction + IV-grade SC5 filters

**Plan metadata commit:** to follow (docs 11-07 SUMMARY).

## Files Created/Modified

- `src/services/sanguo/legionService.ts` (new) — ownership + class-match assembly persistence
- `src/services/sanguo/__tests__/legionService.test.ts` (new) — 12 tests (4 planned behaviors incl. class-match/ownership/dup/save)
- `src/commands/sanguo/legion.ts` (new) — the legion command + 4-row assembly handlers
- `src/commands/sanguo/__tests__/legion.test.ts` (new) — subcommand builder + class_mismatch handler + routing
- `src/ui/components/sanguoLegion{Formation,Slot,Hero}Menu.ts` + `sanguoLegionSaveButton.ts` (new) — the 4 UI components
- `src/ui/embeds/buildSanguoLegionEmbed.ts` (new) — 2-field mains/supports + chemistry tier lines (D-12)
- `src/ui/components/sanguoHeroes{Faction,Iv}Menu.ts` (new) — SC5 filter selects (filter_all reset)
- `src/commands/sanguo/heroes.ts` (modified) — extended `queryOwnedHeroes` filters + renderCollection + 2 new handlers
- `src/ui/embeds/buildSanguoHeroesEmbed.ts` (modified) — active filter-state labels
- `src/commands/sanguo/map.ts` (modified) — legion subcommand + re-exported handlers
- `src/events/interactionCreate.ts` (modified) — routing for sanguo:legion:* + sanguo:heroes:faction/iv
- `src/commands/sanguo/__tests__/heroes.test.ts` (modified) — collection tests updated for 3-row layout + new filter tests
- `locales/{vi,en,zh-cn}/sanguo.json` (modified) — legion.*/cmd.legion/classes.* + heroes filter keys

## Decisions Made

- **Working formation = the active legion's formation** — the current formation for `assignHero` is derived from `getActiveLegion` (persisted); choosing a different owned formation calls `saveLegion` to activate it (D-22 one active legion), so subsequent assigns target it. This avoids a separate draft-state table while keeping the flow decisive.
- **Centralized filter validation in `renderCollection`** — zones/factions/IV-grade reference sets fetched once and the pressed values validated there (invalid/filter_all → cleared, T-11-07-05), removing per-handler pre-fetch duplication and keeping the handlers thin.
- **D-12 structural rule via pre-rendered field values** — the legion embed builder receives pre-rendered tier labels + link counts (never points/buff%), so the data interface has no chemistry numeric fields (mirrors `buildSanguoProgressionResultEmbed`).

## Deviations from Plan

None - plan executed exactly as written. The free-starter (basePrice 0) first-use upsert was implemented per the flagged assumption, and the plan's `legion.test.ts` artifact (listed in `files_modified` + plan-level verification) was created to satisfy the plan-level `<verification>` suite.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — no scope creep; the plan's artifact set matched the implementation.

## Issues Encountered

- Pre-commit lint gates caught unused-import/var lint errors in the new test + component files (removed unused schema imports, an unused constant, and a `require()`-style import) — resolved before commit.
- The `heroes.ts` refactor changed the DB call order (zones → factions → owned → state) and the collection to 3 filter rows, requiring the existing `heroes.test.ts` mock chain specs + component assertions to be updated in the same change — all 16 heroes tests updated and green.
- `heroes.class` is a pgEnum column — the string slot class from `formation_slots.class` required a cast to the enum union for the `eq` comparison.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The assembled defensive legion (3+9, class-matched) is persisted for the 11-06 boss routing `buildLegionInput` to consume.
- The legacy half is fully built: `/sanguo legion` + the SC5 collection filters are ready.
- **11-08 (balance pass)** reads the assembled legion across the seeded stat ranges and tunes the constants it now has a real assembly surface to test against.

## Self-Check: PASSED

- SUMMARY file exists on disk: `[ -f 11-07-SUMMARY.md ]` ✓
- All task commits present in git: `5b71d36`, `f9880fd`, `221e791`, `7c1da01`, `d6f1957` ✓
- Plan-level `<verification>` green: 3 test files (31 tests), `npm run typecheck`, `npm run check-i18n`, `npm run lint` ✓
- Grep gates: `wallet` count in legionService = 0; embed data interfaces carry no chemistry points/buff% / raw IV ✓
- Full repo suite green: 42 files / 431 tests ✓

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-18*
