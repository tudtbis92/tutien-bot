---
phase: 02-core-game-loop-progression
plan: "04"
subsystem: breakthrough-progression
tags: [service-layer, slash-command, tdd, breakthrough, realm-advancement, i18n, embeds]
dependency_graph:
  requires:
    - "02-01"  # REALM_CONFIG constants, character schema
  provides:
    - breakthrough-service  # canAttemptBreakthrough, rollBreakthrough, applyBreakthroughSuccess/Failure
    - dotpha-command        # /đột_phá slash command with 4-outcome handling
    - breakthrough-embed    # buildBreakthroughEmbed with semantic colors
  affects:
    - characters.realm_id  # SUCCESS: increments by 1
    - characters.tu_vi     # FAIL: decrements by penalty (GREATEST guard)
tech_stack:
  added:
    - src/services/  # New services directory for pure business logic
  patterns:
    - TDD (RED-GREEN-COMMIT cycle) for breakthrough service
    - vi.mock() for db/client isolation in vitest (avoids config.ts env validation)
    - Service layer pattern: pure functions separate from DB writes
    - GREATEST(tu_vi - penalty, 0) DB guard for T-02-BT-01 mitigation
key_files:
  created:
    - src/services/breakthrough.ts
    - src/services/__tests__/breakthrough.test.ts
    - src/commands/game/dotpha.ts
    - src/ui/embeds/buildBreakthroughEmbed.ts
  modified: []
decisions:
  - "vi.mock('../../db/client.js') in vitest prevents config.ts Zod env validation from calling process.exit(1) in test environment"
  - "applyBreakthroughFailure uses GREATEST(tu_vi - penalty, 0) instead of WHERE tu_vi - penalty >= 0 to ensure update always runs (avoids silent skip)"
  - "buildBreakthroughEmbed accepts TFunction from i18next directly — keeps embed builder pure and reusable"
  - "COLORS.PRIMARY for 'insufficient' outcome — informational state, not an error (DANGER would be misleading)"
metrics:
  duration: "~15 min"
  completed: "2026-04-12"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
requirements:
  - PROG-01
  - PROG-02
---

# Phase 02 Plan 04: Breakthrough Progression System Summary

**One-liner:** Breakthrough service with TDD (vitest), `/đột_phá` command handling 4 outcomes (success/fail/insufficient/max_realm), failure penalty = 50% excess above entry threshold via BigInt arithmetic.

---

## What Was Built

### Task 1: Breakthrough Service Layer (TDD)

**TDD cycle:** RED (test commit: 20cb5d7) → GREEN (implementation commit: bc84a27)

**`src/services/breakthrough.ts`** — Pure business logic, zero Discord.js dependencies:

| Export | Purpose |
|--------|---------|
| `BreakthroughCheck` | Typed union: `allowed:true` \| `max_realm` \| `insufficient_tuvi` |
| `BreakthroughResult` | Typed union: `success+newRealmId` \| `fail+penaltyAmount` |
| `canAttemptBreakthrough(char)` | Guards: `realmId >= 41` → max_realm; `tuVi < required` → insufficient |
| `rollBreakthrough(char)` | Non-boundary: always success. Major boundary: probabilistic per D-16 table |
| `applyBreakthroughSuccess(id, newRealmId)` | UPDATE characters SET realm_id = newRealmId |
| `applyBreakthroughFailure(id, penaltyAmount)` | UPDATE with GREATEST(tu_vi - penalty, 0) guard |

**Penalty formula:** `penaltyAmount = (tuVi - entryThreshold) / 2n` (BigInt integer division = floor). Clamped to 0n if tuVi ≤ entryThreshold.

**`src/services/__tests__/breakthrough.test.ts`** — 14 unit tests covering:
- `canAttemptBreakthrough`: max_realm (41 and >41), insufficient_tuvi (with exact required), allowed cases
- `rollBreakthrough`: non-boundary always success (50 rolls), LK→TC always success (0% fail), penalty exact arithmetic, penalty=0 at threshold, penalty≥0 defensive

### Task 2: /đột_phá Command + buildBreakthroughEmbed.ts

**`src/commands/game/dotpha.ts`** — `/đột_phá` slash command:
1. `deferReply()` — prevents timeout on DB queries
2. Resolve locale → `t` via `resolveLocale/getT`
3. SELECT character — not found → error embed (uses existing `buildErrorEmbed`)
4. `canAttemptBreakthrough(char)` — max_realm or insufficient → embed early return (NO DB write)
5. `rollBreakthrough(char)` — probabilistic outcome
6. Apply DB update (`applyBreakthroughSuccess` or `applyBreakthroughFailure`)
7. `editReply({ embeds: [embed] })`

**Per D-18: No retry cooldown.** Player recovers tu vi naturally before reattempting.

**`src/ui/embeds/buildBreakthroughEmbed.ts`** — Typed embed builder:

| Outcome | Color | Description |
|---------|-------|-------------|
| `success` | `COLORS.GOLD` | Shows new realm name via `t(REALM_CONFIG[newRealmId].i18nKey)` |
| `fail` | `COLORS.DANGER` | Shows penalty amount via `formatBalance(penaltyAmount)` |
| `insufficient` | `COLORS.PRIMARY` | Shows required and current tu vi |
| `max_realm` | `COLORS.GOLD` | Peak achievement message |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] config.ts process.exit(1) in test environment**
- **Found during:** Task 1 GREEN phase — breakthrough.ts imports db/client.ts → config.ts → Zod validation → process.exit(1) when env vars missing
- **Fix:** Added `vi.mock('../../db/client.js', ...)` at the top of the test file before importing breakthrough service. The mock intercepts the import chain, preventing config.ts from running.
- **Files modified:** `src/services/__tests__/breakthrough.test.ts`
- **Commit:** bc84a27 (fix inline in same GREEN commit)

**2. [Rule 1 - Bug] Lint errors in test file (3 unused imports/variables)**
- **Found during:** `npm run lint` after Task 2
- **Fix:** Removed unused `type BreakthroughCheck`, `type BreakthroughResult` imports; replaced `REALM_11_ENTRY_THRESHOLD` constant with inline comment
- **Files modified:** `src/services/__tests__/breakthrough.test.ts`
- **Commit:** 8a47db0 (fix inline in Task 2 commit)

**3. [Rule 2 - Security] GREATEST() guard instead of WHERE clause**
- **Found during:** Implementing `applyBreakthroughFailure`
- **Issue:** Plan specified `WHERE tu_vi - penaltyAmount >= 0` which would silently skip the UPDATE if penalty > tu_vi. The DB CHECK constraint `tu_vi_non_negative` would also reject it.
- **Fix:** Used `GREATEST(tu_vi - penaltyAmount, 0)` which always runs the update, clamping to 0 instead of skipping. Matches T-02-BT-01 intent (never negative, never silent skip).
- **Files modified:** `src/services/breakthrough.ts`

---

## Threat Mitigations Applied

| Threat | Status | Implementation |
|--------|--------|----------------|
| T-02-BT-01: tu_vi underflow | ✅ Mitigated | `GREATEST(tu_vi - penalty, 0)` in applyBreakthroughFailure |
| T-02-BT-02: realm_id overflow | ✅ Mitigated | `canAttemptBreakthrough` checks `realmId >= 41` before any write |
| T-02-BT-03: Repudiation | ✅ Accepted | Discord reply is audit trail; no PII stored |
| T-02-BT-04: Math.random() manipulation | ✅ Accepted | Server-side RNG, client has no influence |

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` | ✅ 23/23 passed (3 test files) |
| `npx tsc --noEmit` | ✅ No errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm run check-i18n` | ✅ All locale files in sync |

---

## Known Stubs

None. All 4 outcomes are fully implemented with real i18n keys that exist in VI/EN/ZH-CN locale files.

---

## Threat Flags

None. No new network endpoints or auth paths introduced. All mutations go through existing `db` client with Drizzle ORM patterns established in Phase 01.

---

## Self-Check: PASSED

Files exist:
- ✅ `src/services/breakthrough.ts`
- ✅ `src/services/__tests__/breakthrough.test.ts`
- ✅ `src/commands/game/dotpha.ts`
- ✅ `src/ui/embeds/buildBreakthroughEmbed.ts`

Commits exist:
- ✅ `20cb5d7` — test(02-04): add failing tests for breakthrough service
- ✅ `bc84a27` — feat(02-04): implement breakthrough service (pure business logic)
- ✅ `8a47db0` — feat(02-04): add /đột_phá command and buildBreakthroughEmbed
