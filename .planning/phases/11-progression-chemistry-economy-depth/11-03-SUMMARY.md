---
phase: 11-progression-chemistry-economy-depth
plan: 03
subsystem: progression
tags: [sanguo, hon-ngoc, progression, convert, level, evolve, reroll, drizzle, discord.js, i18n]

# Dependency graph
requires:
  - phase: 11-01
    provides: sanguo_skills / user_hero_soulgems / user_legions / soulgem_transactions schema (migration 0020) + user_heroes tier/skill columns
  - phase: 11-02
    provides: hidden balance constants (sanguoProgression.ts) + skill/item/formation seed catalogs + EMOJI.HON_NGOC theme
provides:
  - soulgemService (deductHonNgoc + convertDuplicate + levelUp + evolveHero + rerollSkill) — the hồn ngọc single-writer pattern reference
  - /sanguo hero copy selector (D-04) with convert/level/evolve/reroll action surfaces + reroll slot flow
  - convert/level/evolve/reroll/skills i18n sections (3 locales, 41 skill-name keys)
affects: [11-04 shop, 11-05+ legion battle, 11-07 legion save (IN_FORMATION guard reads user_legion_slots), 11-08 balance pass, 12 (TQC-19 audit reads soulgem_transactions)]

# Actuals (#2632) — pairs with the plan's estimate (60000 tokens) for calibration.
actuals:
  tokens: 26662    # chars/4 over the 1e81875..HEAD realized diff (14 files)
  tasks: 3
  commits: 7       # 6 code commits + 1 docs commit

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE single-writer tx: lock the user's OWN rows (copy FOR UPDATE; pool row locked by the WHERE-guard UPDATE itself), re-fetch inside the tx, every read/write for the interaction in ONE tx (Pitfall 1)"
    - "WHERE-guard deduction (deductHonNgoc): UPDATE ... WHERE amount >= cost + rowCount → throw INSUFFICIENT_HON_NGOC → whole tx rolls back (mirrors wallet.ts:53-62, D-02 separate account-bound resource)"
    - "Anti-tamper customIds: only userHeroId/slot ride the payload; costs/yields resolve server-side from constants inside the tx (T-11-03-03)"
    - "Injectable-rng weighted pick: default cryptoUniform (crypto.randomInt), pure-rand only in the seeded battle engine (D-06)"

key-files:
  created:
    - src/services/sanguo/soulgemService.ts
    - src/ui/components/sanguoLevelButton.ts
    - src/ui/components/sanguoEvolveButton.ts
    - src/ui/components/sanguoRerollSlotMenu.ts
    - src/ui/components/sanguoRerollButton.ts
    - src/ui/embeds/buildSanguoProgressionResultEmbed.ts
  modified:
    - src/services/sanguo/__tests__/soulgemService.test.ts
    - src/commands/sanguo/hero.ts
    - src/commands/sanguo/__tests__/hero.test.ts
    - src/events/interactionCreate.ts
    - src/commands/sanguo/map.ts
    - src/ui/components/sanguoConvertButton.ts
    - locales/{vi,en,zh-cn}/sanguo.json

key-decisions:
  - "USER AMENDMENT (2026-08-14): convertDuplicate guards are collection-non-empty (COLLECTION_EMPTY — any copy convertible as long as ≥1 hero of ANY kind remains), active-companion HARD block (ACTIVE_COMPANION — auto-switch removed; companion changes only via the companion button), and in-formation (IN_FORMATION — user_legion_slots reference blocks conversion); the ≥2-copies-of-the-species guard (NOT_ENOUGH_COPIES) is DELETED"
  - "Task 2/3 follow task-level tdd=true: RED (failing test) → GREEN (implementation) commits per feature"
  - "Skill display names are systematically generated '{class} · {slot} · {rarity}' per locale (41 keys) — the seed carries mechanics only, names are i18n (sanguo:skills.{code}); a later content pass may flavor them"
  - "Level/evolve/reroll costs render in button labels (spendable resources VISIBLE per D-12); level-up result shows level ONLY — no stat deltas; evolve result shows the NEW t1/t2 emoji via heroEmoji(heroId, newTier)"

patterns-established:
  - "Progression tx shape (convert/level/evolve/reroll): ONE db.transaction, FOR UPDATE copy lock + ownership re-gate → guards → deductHonNgoc (pool lock via conditional UPDATE) → row write → soulgem_transactions ledger {type, ±amount, balanceAfter}"
  - "Copy-detail surface budget: ≤3 ActionRows (copy select / page / action row); the reroll flow REPLACES the action row with the slot select then the confirm button"
  - "Button disabled-state contract: convert disabled on the active companion; level disabled at L100 or pool < cost; evolve disabled until L20/L50 + pool ≥ cost or forever on t2+ (evolve.t3_gated label)"

requirements-completed: [TQC-14, TQC-15]

coverage:
  - id: D1
    description: "convertDuplicate — one FOR UPDATE tx converting any owned copy into per-hero hồn ngọc with the 4 user-amended guards (ownership / collection-non-empty / active-companion hard block / in-formation), atomic booster ×2 consumption (Pitfall 2), flat-by-tier yield t0=1/t1=5/t2=10/t3=20, pool upsert, ledger row"
    requirement: TQC-14
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/soulgemService.test.ts#convertDuplicate describe (C1..C7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "deductHonNgoc WHERE-guard primitive (amount >= cost + rowCount → INSUFFICIENT_HON_NGOC, whole tx rolls back; never wallet.deductBalance — D-02)"
    requirement: TQC-14
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/soulgemService.test.ts#deductHonNgoc describe"
        status: pass
    human_judgment: false
  - id: D3
    description: "levelUp — explicit hồn ngọc leveling, LEVEL_COST curve, hard cap 100, per-copy level write, ledger −cost (D-05/D-01)"
    requirement: TQC-15
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/soulgemService.test.ts#levelUp describe"
        status: pass
    human_judgment: false
  - id: D4
    description: "evolveHero — inclusive L20→t1 / L50→t2 gates (LEVEL_REQUIRED), EVOLUTION_COSTS, T3_GATED (unreachable in v3), tier write, ledger −cost; IVs never re-rolled (D-06/D-07/D-09)"
    requirement: TQC-15
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/soulgemService.test.ts#evolveHero describe"
        status: pass
    human_judgment: false
  - id: D5
    description: "rerollSkill — ONE slot at a time, class-slot pool (slot isolation), rarity-weighted pick via injectable crypto rng, per-copy slot column write, ledger type 'reroll' (D-32/D-30)"
    requirement: TQC-14
    verification:
      - kind: unit
        ref: "src/services/sanguo/__tests__/soulgemService.test.ts#rerollSkill describe"
        status: pass
    human_judgment: false
  - id: D6
    description: "/sanguo hero copy selector + action surfaces — zero-one-many (1 copy → direct actions), paged select at 25, convert/level/evolve/reroll buttons with disabled states, 3-step reroll flow (open → slot → confirm), result embeds, customId routing (D-04)"
    verification:
      - kind: unit
        ref: "src/commands/sanguo/__tests__/hero.test.ts#/sanguo hero command describe"
        status: pass
    human_judgment: false
  - id: D7
    description: "i18n parity — convert.* (amended guard errors) / level.* / evolve.* / reroll.* / skills.{code} (41 names) / hero additive keys in vi/en/zh-cn"
    verification:
      - kind: other
        ref: "npm run check-i18n"
        status: pass
    human_judgment: false

# Metrics
duration: 42min
completed: 2026-08-14
status: complete
---

# Phase 11 Plan 3: Hồn Ngọc Progression Vertical Slice Summary

**The hồn ngọc progression loop wired end-to-end: convert-duplicate (4 user-amended guards: collection-non-empty / active-companion hard block / in-formation / ownership) → per-hero pool → levelUp → evolveHero (L20→t1 / L50→t2, t3 gated) → rerollSkill (class-pool rarity-weighted, crypto RNG), every mutation in ONE FOR UPDATE tx with the deductHonNgoc WHERE-guard, all surfaced through the /sanguo hero copy selector (D-04) with i18n-complete copy (3 locales).**

## Performance

- **Duration:** 42 min (continuation wave — Task 1 tracer committed `1e81875` in the prior wave)
- **Started:** 2026-08-14T07:50:00Z (this continuation)
- **Completed:** 2026-08-14T09:32:14Z
- **Tasks:** 3 (Task 1 amended + Tasks 2/3 executed)
- **Files modified:** 14 (over the 1e81875..HEAD range)

## Accomplishments

- **User amendment applied (2026-08-14):** convertDuplicate's guard semantics replaced per the user's design direction — the ≥2-copies-of-the-species guard (`NOT_ENOUGH_COPIES`) is DELETED; any copy is convertible as long as (a) the user keeps ≥1 hero of ANY kind (`COLLECTION_EMPTY`), (b) the copy is not the active companion (`ACTIVE_COMPANION` — the old auto-switch is REMOVED; companion changes only via the companion button), (c) the copy is not placed in a legion slot (`IN_FORMATION` — reads `user_legion_slots`). Booster ×2 atomicity, flat-by-tier yield, WHERE-guard primitive, ledger row, and the zero-wallet rule are untouched.
- **levelUp + evolveHero (Task 2, TDD RED→GREEN):** explicit hồn ngọc-sink leveling on the accelerating LEVEL_COST curve with the hard 100 cap; evolution at inclusive L20/L50 gates charging EVOLUTION_COSTS, T3_GATED for t2+ (D-09 unreachable in v3); evolve.done renders the NEW t1/t2 spritesheet emoji (D-07 swap); level result shows level ONLY (D-12).
- **rerollSkill (Task 3, TDD RED→GREEN):** TM-style ONE-slot reroll drawing ONLY from the copy's class pool for that slot (slot isolation), rarity-weighted (normal 80/20, special 60/30/10) via an injectable rng defaulting to `cryptoUniform` — pure-rand never (milestone mandate); defensive `NO_SKILL_POOL` guard.
- **Full progression UI:** the copy-detail action row (convert/level/evolve/reroll/companion) with server-state disabled logic (convert on the active companion, level at L100/insufficient pool, evolve below gate/insufficient/t3), the 3-step reroll flow (open → slot select → confirm), and shared progression-result embeds.
- **i18n complete:** convert.* (amended error keys), level.*, evolve.*, reroll.*, skills.{code} (41 skill names), hero additive keys — parity green in all 3 locales.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TRACER): soulgem convert tx + deductHonNgoc + copy selector + convert UI** — `1e81875` (feat, prior wave)
2. **Task 1 AMENDMENT (user-directed): convert guards — collection/companion/formation instead of copy-count** — `5eba0d1` (refactor)
3. **Task 2 RED: add failing tests for levelUp + evolveHero** — `5276f8b` (test)
4. **Task 2 GREEN: implement levelUp + evolveHero + level/evolve buttons + result embed** — `76e2651` (feat)
5. **Task 3 RED: add failing tests for rerollSkill** — `7ca321b` (test)
6. **Task 3 GREEN: implement rerollSkill + reroll slot UI + full i18n sections** — `5ed42fd` (feat)
7. **Plan metadata:** `11-03-SUMMARY.md` (docs)

## Files Created/Modified

- `src/services/sanguo/soulgemService.ts` - deductHonNgoc (WHERE-guard), convertDuplicate (4 amended guards + booster atomicity + pool upsert + ledger), levelUp, evolveHero, rerollSkill + RARITY_WEIGHTS/pickWeightedSkill — all ONE FOR UPDATE tx, zero wallet references
- `src/ui/components/sanguoLevelButton.ts` / `sanguoEvolveButton.ts` - level/evolve buttons (cost in label, disabled states, anti-tamper customIds)
- `src/ui/components/sanguoRerollSlotMenu.ts` / `sanguoRerollButton.ts` - reroll slot select + confirm button (Secondary destructive)
- `src/ui/components/sanguoConvertButton.ts` - disabled state for the active companion (server guard mirrored at render)
- `src/commands/sanguo/hero.ts` - renderCopyDetail (pool read, copy list, skills field, 5-button action row with disabled logic, reroll modes), handleLevelPress/handleEvolvePress/handleRerollPress/handleRerollSlot/handleRerollGo
- `src/events/interactionCreate.ts` - sanguo:level:go / sanguo:evolve:go / sanguo:reroll:open / sanguo:reroll:slot / sanguo:reroll:go routing
- `src/commands/sanguo/map.ts` - handler re-exports
- `src/services/sanguo/__tests__/soulgemService.test.ts` - 20 tests (7 convert guards/booster + deductHonNgoc + 4 levelUp + 4 evolveHero + 3 rerollSkill)
- `src/commands/sanguo/__tests__/hero.test.ts` - 24 tests (copy selector, convert/level/evolve/reroll handlers, disabled states, error mappings, D-12)
- `locales/{vi,en,zh-cn}/sanguo.json` - convert/level/evolve/reroll/skills sections (41 skill-name keys per locale)

## Decisions Made

- **User design amendment (supersedes the plan's Task 1 guard semantics + Pitfall 3 approach):** collection-non-empty, active-companion hard block (auto-switch removed — a companion change happens only via the existing companion button), in-formation (legion-slot reference blocks conversion), no ≥2-copy requirement. Documented in the `## Deviations from Plan` section (user-directed, not a deviation-rule fix).
- **Task-level TDD (tdd="true"):** RED (failing test) → GREEN (implementation) atomic commits per feature for Tasks 2/3.
- **Skill display names:** systematic `{class} · {slot} · {rarity}` per-locale names (41 keys) — the 11-02 seed stores mechanics only; a future content pass may add flavor names (same key set).
- **No new packages:** the plan installs nothing; all patterns reuse existing deps (drizzle, discord.js, i18next).

## Deviations from Plan

### User-Directed Design Amendment

**1. [User amendment — convert guard semantics] Collection/companion/formation guards instead of the ≥2-copy-count guard**
- **Found during:** Task 1 tracer review (2026-08-14, user directive)
- **Issue:** The plan's Task 1 guard semantics (≥2 copies of the same species + active-companion auto-switch to the earliest remaining copy, Pitfall 3) were superseded by the user's design direction: "không cần chặn kiểm tra >= 2 copy, chỉ chặn luôn phải còn lại 1 hero bất kỳ tránh collection rỗng, chặn nếu copy đang là active-companion hoặc đang nằm trong formation".
- **Fix:** Removed `NOT_ENOUGH_COPIES` + the auto-switch; added `COLLECTION_EMPTY` (total user_heroes count ≤ 1 → throw), `ACTIVE_COMPANION` (hard block, no state write), `IN_FORMATION` (user_legion_slots reference → throw). Convert button renders disabled on the active companion. `convert.insufficient` replaced by `convert.collection_empty` / `convert.active_companion` / `convert.in_formation` in all 3 locales.
- **Files modified:** soulgemService.ts, soulgemService.test.ts, hero.ts, hero.test.ts, sanguoConvertButton.ts, locales ×3
- **Verification:** vitest (7 convert tests incl. 3 new guard tests) + typecheck + check-i18n green; wallet-grep still 0
- **Committed in:** `5eba0d1` (refactor commit)

### Auto-fixed Issues

**2. [Rule 2 - Missing Critical] NO_SKILL_POOL defensive guard in rerollSkill**
- **Found during:** Task 3 (rerollSkill implementation)
- **Issue:** If a hero class has no seeded skills for the requested slot, the weighted pick would select from an empty entry list and crash on `.code` (undefined access) — a DB-content gap, not a player-visible path, but a class-pool regression would take down the tx.
- **Fix:** `if (pool.length === 0) throw new Error('NO_SKILL_POOL')` before the pick.
- **Files modified:** src/services/sanguo/soulgemService.ts
- **Verification:** unit suite green (the guard is exercised by the empty-pool path if ever seeded)
- **Committed in:** `5ed42fd` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Convert button disabled on the active companion**
- **Found during:** Task 1 amendment (the ACTIVE_COMPANION guard makes a convert press on the companion always error)
- **Issue:** With the hard block, pressing convert on the active companion was a guaranteed error — offering it enabled was a trap.
- **Fix:** `buildSanguoConvertButton` gained a `disabled` option; renderCopyDetail passes `disabled: isActive` (mirrors the existing companion-button pattern).
- **Files modified:** src/ui/components/sanguoConvertButton.ts, src/commands/sanguo/hero.ts
- **Verification:** hero.test.ts action-row tests green
- **Committed in:** `5eba0d1` (refactor commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 2 — missing critical) + 1 user-directed design amendment.
**Impact on plan:** The amendment is the user's ratified design (supersedes the plan's Task 1 guard acceptance `NOT_ENOUGH_COPIES >= 1`); the auto-fixes are correctness/UX hardening. No scope creep.

## TDD Gate Compliance

The plan frontmatter is `type: execute` (not `type: tdd`), so plan-level RED/GREEN gate enforcement does not apply. Tasks 2 and 3 carry `tdd="true"` and each followed RED → GREEN with atomic commits:
- Task 2: `5276f8b` (test, RED — 8 failing tests) → `76e2651` (feat, GREEN — 8 pass)
- Task 3: `7ca321b` (test, RED — 3 failing tests) → `5ed42fd` (feat, GREEN — 3 pass)

## Issues Encountered

- **Skill-name generation bug:** `'vu_co_normal_common'.split('_')` yields `['vu','co',...]` — the class `vu_co` itself contains an underscore. Resolved by stripping the `_{slot}_{rarity}` suffix from the code instead of blind splitting. (Tooling-only; no production impact.)
- **Test harness read-queue exhaustion:** the combined ACTIVE_COMPANION/IN_FORMATION handler test consumed the mock select queue between sub-invocations — fixed by re-seeding `mockDbSelects` per invocation.
- **ESLint unused-var catches:** two test destructures (`insert`) were flagged by lint-staged pre-commit — removed before commit landed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The hồn ngọc single-writer pattern (FOR UPDATE + WHERE-guard + ledger) is the reference for 11-04 (shop sinks) and 11-05+ (legion battle hồn ngọc flows).
- **11-07 integration point:** the `IN_FORMATION` guard reads `user_legion_slots` — the 11-07 legion-save surface must remove a copy from the legion before it can be converted (documented contract, no code change needed here).
- `soulgem_transactions` accumulates the audit trail for Phase 12 TQC-19 (repudiation) — convert/level/evolve/reroll all write ledger rows.
- Flagged assumptions resolved: L20/L50 gates are INCLUSIVE (exactly L20 may evolve); hồn ngọc math is integer throughout; t3 stays unreachable (D-09) with the evolve button disabled + `evolve.t3_gated`.
- The `11-03` `must_haves.truths` item "converting the ACTIVE companion copy is blocked OR auto-switches" is superseded by the user amendment — hard block, no auto-switch.

---
*Phase: 11-progression-chemistry-economy-depth*
*Completed: 2026-08-14*

## Self-Check: PASSED

- Created files verified on disk (soulgemService.ts, 4 new button/menu components, progression result embed, SUMMARY.md)
- All 6 code commits verified in git log (`1e81875`, `5eba0d1`, `5276f8b`, `76e2651`, `7ca321b`, `5ed42fd`)
- Overall verification: `npx vitest run` 34 files / 345 tests green; `npm run typecheck` green; `npm run check-i18n` green; `npm run lint` green; wallet-grep 0 references in soulgemService.ts

