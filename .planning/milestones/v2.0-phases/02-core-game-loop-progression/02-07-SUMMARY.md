---
phase: "02"
plan: "07"
subsystem: "game-commands"
tags: ["gathering", "crafting", "transaction", "unique-items", "profession-system"]

dependency_graph:
  requires:
    - "02-01"  # Database schema + base infrastructure
  provides:
    - "gather-command"
    - "craft-command"
    - "item-embed-builder"
  affects:
    - "character_items table"
    - "items table"
    - "profession system"

tech_stack:
  added: []
  patterns:
    - "Drizzle db.transaction() for atomic crafting"
    - "ON CONFLICT DO UPDATE for inventory upsert"
    - "tryAcquireCooldown per-profession key"
    - "DELETE WHERE quantity <= 0 for zero-cleanup"

key_files:
  created:
    - src/commands/game/thutap.ts
    - src/commands/game/chetao.ts
    - src/ui/embeds/buildItemEmbed.ts
  modified:
    - src/db/schema/character_items.ts

decisions:
  - "materialTier inferred from basePrice ranges (0-99/100-499/500-1999/2000+) — avoids new DB column for Phase 2"
  - "uniqueIndex(characterId, itemId) added to character_items — required for ON CONFLICT DO UPDATE upsert semantics"
  - "profession-to-item-type mapping: material→duoc_su, stone→khai_linh, equipment→luyen_kim, etc."
  - "Unique item fallback: if profession has no archetype (shouldn't happen), treat as standard craft"

metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 02 Plan 07: Gathering + Crafting Commands Summary

**One-liner:** Atomic gathering/crafting loop with profession+realm gating, Redis cooldown, and unique item creation via JSONB attribute rolls.

---

## What Was Built

### Task 1: /thu_thập + buildItemEmbed.ts (commit `e4ac0e5`)

**`src/commands/game/thutap.ts`** — Gathering command:
- `materialTier` inferred from item `basePrice` (0-99=common, 100-499=uncommon, 500-1999=rare, 2000+=epic)
- Profession gating: `GATHER_TIER_REQUIREMENTS[tier]` min level check
- Realm gating: `GATHER_REALM_REQUIREMENTS[tier]` min realmId check (T-02-GATHER-02)
- Yield: `computeGatheringYield(realmId, profLevel, materialTier)` formula
- Inventory: `INSERT ... ON CONFLICT DO UPDATE SET quantity += yield`
- Cooldown: `tryAcquireCooldown(discordId, gather:<profKey>, 300_000)` — 5 min per profession (T-02-GATHER-01)

**`src/ui/embeds/buildItemEmbed.ts`** — Item result embed builder:
- `type: 'gather' | 'craft'` → `COLORS.SUCCESS` embed with item name + quantity
- `type: 'unique_craft'` → `COLORS.GOLD` embed with custom name, emoji, creator tag
- Accepts `ItemResultData` interface, returns `EmbedBuilder`

### Task 2: /chế_tạo (commit `a0137ec`)

**`src/commands/game/chetao.ts`** — Crafting command with full atomic transaction:
- Recipe lookup → profession level check → ingredient availability check — ALL before any mutation
- Ingredient consumption with `DELETE WHERE quantity <= 0` cleanup (T-02-CRAFT-02)
- `rollUniqueChance(profLevel)` — 1-15% based on profession level
- Unique item: `INSERT items` with `isUnique=true`, `customName`, `customEmoji`, `attributes=JSON`
- Random attributes: 2-4 rolled from `PROFESSION_UNIQUE_ARCHETYPES[profession].attributePool`
- Standard craft: `INSERT character_items ON CONFLICT DO UPDATE SET quantity += 1`
- Full rollback on any failure — no partial consumption (T-02-CRAFT-01)

**`src/db/schema/character_items.ts`** (modified):
- Added `uniqueIndex('char_items_unique_char_item').on(characterId, itemId)` — required for ON CONFLICT DO UPDATE

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added unique constraint to character_items**
- **Found during:** Task 1 implementation (ON CONFLICT DO UPDATE requires unique index)
- **Issue:** `character_items` table had no unique constraint on `(characterId, itemId)`, making inventory upsert impossible
- **Fix:** Added `uniqueIndex('char_items_unique_char_item').on(characterId, itemId)` to table definition
- **Files modified:** `src/db/schema/character_items.ts`
- **Commit:** `a0137ec`

---

## Threat Model Coverage

All threats from plan's threat register mitigated:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-02-CRAFT-01 | All ingredient checks BEFORE any consumption in single transaction |
| T-02-CRAFT-02 | `DELETE WHERE quantity <= 0` + `quantity_positive CHECK` constraint |
| T-02-CRAFT-03 | Drizzle parameterized queries — customName/customEmoji are bind parameters |
| T-02-CRAFT-05 | `SELECT recipe` returns null → 'not_found' returned before any mutation |
| T-02-GATHER-01 | `tryAcquireCooldown(discordId, gather:<profKey>, 300_000)` — server-side |
| T-02-GATHER-02 | `char.realmId < GATHER_REALM_REQUIREMENTS[tier]` checked before cooldown |

---

## Known Stubs

None — all data flows are wired. Item `nameI18nKey` and recipe data come from DB; no hardcoded placeholder values in user-facing paths.

*Note:* `/thu_thập` uses `'game:items.unknown'` as a fallback i18n key only in the impossible code path where a looked-up item disappears between SELECT and transaction. This is a defensive fallback, not a real stub.

---

## Threat Flags

None. No new network endpoints or auth paths introduced. All DB mutations are scoped to the authenticated Discord user's character.

---

## Self-Check

**Files created/modified:**

```
✓ src/commands/game/thutap.ts        — FOUND
✓ src/commands/game/chetao.ts        — FOUND
✓ src/ui/embeds/buildItemEmbed.ts    — FOUND
✓ src/db/schema/character_items.ts   — MODIFIED (uniqueIndex added)
```

**Commits:**

```
✓ e4ac0e5 — feat(02-07): add /thu_thap gathering command + buildItemEmbed
✓ a0137ec — feat(02-07): add /che_tao crafting command with atomic transaction
```

**Verifications:**

```
✓ npx tsc --noEmit     — EXIT 0
✓ npm run lint         — EXIT 0 (0 errors, 0 warnings)
✓ npm run check-i18n   — ✅ All locale files are in sync
```

## Self-Check: PASSED
