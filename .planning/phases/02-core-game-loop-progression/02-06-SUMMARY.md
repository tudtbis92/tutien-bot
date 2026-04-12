---
phase: "02"
plan: "06"
subsystem: profession-system
tags: [profession, skill-points, jsonb, slash-command, embed, i18n, zod]
dependency_graph:
  requires:
    - 02-01  # character schema (professionPoints JSONB, realmId)
  provides:
    - profession allocation system (/nghề_nghiệp command)
    - buildProfessionEmbed.ts (typed embed)
  affects:
    - future gather/craft commands (consume profession points)
tech_stack:
  added: []
  patterns:
    - ProfessionPointsSchema.safeParse() on every JSONB read
    - SlashCommandBuilder static choice name map (module-level, not i18n at build time)
    - Threat-mitigated JSONB writes with Zod strip + cap enforcement
key_files:
  created:
    - src/commands/game/nghenghiep.ts
    - src/ui/embeds/buildProfessionEmbed.ts
  modified: []
decisions:
  - "SlashCommandBuilder choices use static PROFESSION_CHOICE_NAMES map — t() not available at module load time"
  - "Both subcommand names use Vietnamese (xem / phân_bổ) with English/ZH-CN localizations for Discord"
  - "buildProfessionEmbed accepts shardId for footer consistency with other embeds"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 06: Profession System Summary

**One-liner:** `/nghề_nghiệp` command with Zod-validated JSONB reads, realm_id skill point cap enforcement, and 10-profession embed display.

---

## What Was Built

Implements the character specialization system allowing players to allocate skill points into 10 professions. Each realm tier advanced grants 1 lifetime skill point (total = `char.realmId`). No respec — points only increase.

### Files Created

**`src/ui/embeds/buildProfessionEmbed.ts`**
- `ProfessionEmbedData` interface: `{ points: ProfessionPoints; realmId: number }`
- `buildProfessionEmbed(data, t, shardId?)` → `EmbedBuilder`
- Iterates all 10 `PROFESSION_KEYS`, shows allocated points per profession
- Looks up `PROFESSION_UNIQUE_ARCHETYPES` by `professionType` to display unique item archetype name per profession
- Shows total available (= realmId) vs total allocated, remaining points field
- 2-column inline field layout, COLORS.PRIMARY, embedFooter()

**`src/commands/game/nghenghiep.ts`**
- SlashCommandBuilder: `nghề_nghiệp` with EN/ZH-CN localizations
- Subcommand `xem` (view): fetches character, validates JSONB, renders profession embed
- Subcommand `phân_bổ` (allocate):
  - Validates profession key via `PROFESSION_KEYS.includes()` (belt-and-suspenders vs choices)
  - Enforces cap: `totalAllocated + amount <= char.realmId` before any write
  - Atomic `UPDATE characters SET profession_points = $updated WHERE id = $id`
  - Replies with success embed including allocated amount + profession name
- `ProfessionPointsSchema.safeParse()` on every JSONB read (NaN/unknown keys stripped)

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | /nghề_nghiệp command (view + allocate) + buildProfessionEmbed.ts | `61820a0` | `src/commands/game/nghenghiep.ts`, `src/ui/embeds/buildProfessionEmbed.ts` |

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Exit 0 |
| `npm run lint` | ✅ Exit 0 |
| `npm run check-i18n` | ✅ All locale files in sync |
| `addSubcommand` count = 2 | ✅ xem + phân_bổ |
| `ProfessionPointsSchema` in command | ✅ safeParse on every read |
| `getTotalProfessionPoints\|totalAllocated` | ✅ Point cap logic present |
| `insufficient_points` | ✅ Over-allocation guard present |
| `realmId` used as total available | ✅ Matches D-24 |
| `PROFESSION_KEYS\|getProfessionLevel` in embed | ✅ All 10 professions rendered |

---

## Threat Mitigations Applied

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-02-PROF-01: JSONB overflow | `totalAllocated + amount <= char.realmId` before write | ✅ |
| T-02-PROF-02: Unknown profession key | Choices constrain + `PROFESSION_KEYS.includes()` runtime check | ✅ |
| T-02-PROF-03: Negative allocation | `setMinValue(1)` on integer option | ✅ |
| T-02-PROF-04: JSONB type bypass | `ProfessionPointsSchema.safeParse()` on every DB read | ✅ |

---

## Deviations from Plan

None — plan executed exactly as written.

**Note on static choice names:** The plan mentioned "using a static mapping" for SlashCommandBuilder choices, which was implemented as `PROFESSION_CHOICE_NAMES` record at module-level (Vietnamese names matching `game:profession.names.*` values). This is the only correct approach since `t()` is not available at module load time.

---

## Known Stubs

None. The `/nghề_nghiệp xem` and `/nghề_nghiệp phân_bổ` commands are fully wired — they query the real `characters` table and update `profession_points` JSONB atomically. No placeholder data.

**Note:** The unique item archetype names displayed in the embed (e.g., `game:items.unique.than_dan`) are i18n keys not yet defined in locale files. The embed falls back to the key's last segment (e.g., `than_dan`) using i18next `defaultValue`. These will be wired in the gather/craft plans.

---

## Self-Check: PASSED

```
FOUND: src/commands/game/nghenghiep.ts ✓
FOUND: src/ui/embeds/buildProfessionEmbed.ts ✓
FOUND: commit 61820a0 ✓
```
