---
quick_id: 260811-lld
slug: post-gate-phase-8-schema-redesign-locked
description: Post-gate Phase 8 schema redesign — IV 6 stats rename, flat hero_factions table, heroes role/class/family columns, formations schema, Tavily research reassign 132 heroes, reseed
status: planned
tasks: 3
---

# Quick Task: Post-gate Phase 8 Schema Redesign

## Goal

Apply the locked post-gate design decisions to the Phase 8 sanguo schemas + seed: rename IV columns, replace the flat `hero_faction` pgEnum with a `hero_factions` reference table + `faction_id` FK, expand role to 9 values, add `class` (8 values) + `family` columns, design the `formations` schema (buy/sell logic deferred to Phase 11), reassign all 132 heroes via Tavily research into a committed JSON, reseed idempotently, keep all gates green.

## Locked Decisions (do NOT revisit)

- **IV 6 stats**: `iv_str` (vật lý atk+def), `iv_agi` (chính xác+né), `iv_int` (phép atk+def), `iv_mov` (thứ tự đánh), `iv_lea` (↑buff/↓debuff), `iv_cha` (↑hiệu ứng phe địch/↓bị hiệu ứng phe mình). CHECK 0-31. Max sum 186. Grade: 100=Hoang Kim, 90-99=Hong ngoc, 80-89=Lam cap, 60-79=Luc cap, <60=Hoi cap. Record-only — no runtime UI in this task.
- **Faction**: flat, no hierarchy. Top-level codes: `han, nguy, thuc, ngo, thap_thuong_thi, khan_vang, luong_chau, nam_man, o_hoan, son_viet, tien_ti, hung_no`. Reference table `hero_factions` (id serial, code unique, name_vi/name_en/name_zh, sort_order). `heroes.faction` pgEnum replaced by `faction_id` FK.
- **Role** (9): `ruler, general, strategist, civil, royal, eunuch, religious, tribal, scholar`.
- **Class** (8, formation position): `vanguard, cavalry, archer, spellcaster, schemer, vu_co, thu_binh, cong_binh`.
- **Family**: `heroes.family` varchar(30) NULL. ~8-12 families: `sun, cao, xiahou, yuan, zhuge, sima, gongsun, ma, liao, cai` (+ any confirmed by research).
- **Chemistry** (for reference, Phase 11): family > faction > role; active only when class matches formation slot.
- **Formations schema NOW** (buy/sell + battle consumption Phase 11): `formations` (catalog: id, code unique, name per-locale, slot_count, base_price bigint), `formation_slots` (id, formation_id FK, slot_order, class varchar, position varchar, quantity int), `user_formations` (id, user_id FK users.id, formation_id FK, acquired_at).

## Files

- `src/db/schema/userHeroes.ts` — rename 6 iv_* columns
- `src/db/schema/heroes.ts` — replace faction enum with faction_id FK, expand role enum to 9, add class enum (8) + family varchar
- `src/db/schema/heroFactions.ts` — NEW reference table
- `src/db/schema/formations.ts` — NEW: formations + formation_slots + user_formations
- `src/db/schema/index.ts` — append exports under `// Phase 8 schemas` (or `// Phase 8 post-gate`)
- `migrations/0015_*.sql` + snapshot + journal — generated via drizzle-kit
- `scripts/data/sanguo-classifications.json` — NEW committed Tavily-researched map `{ heroId: { faction: code, role, class, family? } }`
- `scripts/seed-sanguo.ts` — faction_id lookup, role/class/family wiring, clobber-safe
- `scripts/data/sanguo-zh-names.json` — unchanged
- `package.json` — unchanged (no new deps)

---

## Task 1: Schema redesign (IV rename + hero_factions + heroes role/class/family + formations)

**Files:** src/db/schema/userHeroes.ts, src/db/schema/heroes.ts, src/db/schema/heroFactions.ts (new), src/db/schema/formations.ts (new), src/db/schema/index.ts

**Action:**
1. `userHeroes.ts`: rename `ivHp→ivStr, ivAtk→ivAgi, ivDef→ivInt, ivSpd→ivMov, ivCrit→ivLea, ivLuck→ivCha`; update the 6 check constraint names (`iv_str_range`...`iv_cha_range`), keep `>= 0 AND <= 31`.
2. `heroes.ts`: drop `heroFactionEnum`; import `heroFactions`; add `factionId: integer('faction_id').notNull().references(() => heroFactions.id)`. Expand `heroRoleEnum` to the 9 values. Add `class` pgEnum `heroClassEnum` (8 values) `notNull` column + `family varchar('family', {length: 30})` nullable. Keep heroId/name_*/title_vi/weapon/detail_en/gender/people.
3. New `heroFactions.ts`: `heroFactions` pgTable with id serial pk, code varchar(30) unique notNull, name_vi/en/zh varchar(100), sort_order integer notNull default 0. Export `HeroFaction`/`NewHeroFaction`.
4. New `formations.ts`: `formations` (id serial pk, code varchar(30) unique notNull, name_vi/en/zh varchar(100), slot_count integer notNull, base_price bigint notNull default 0n), `formation_slots` (id serial pk, formationId integer FK formations.id, slotOrder integer notNull, class varchar(20) notNull, position varchar(30), quantity integer notNull default 1), `user_formations` (id serial pk, userId integer FK users.id, formationId integer FK formations.id, acquiredAt timestamp withTimezone notNull defaultNow). Export types.
5. `index.ts`: append new exports under the Phase 8 barrel block.
6. Run `npm run typecheck`.

**Verify:** typecheck passes; schema exports compile; no other file references `heroFactionEnum`/old iv_* names (grep).

**Done:** typecheck exit 0; grep shows old enum/columns gone from schema barrel consumers.

## Task 2: Tavily research — reassign 132 heroes to faction/role/class/family

**Files:** scripts/data/sanguo-classifications.json (new)

**Action:**
1. Read `scripts/data/heroes-v1.json` (132 entries: id, name, en, faction, role, weapon, detail, people).
2. Tavily-research each hero to assign: `faction` (one of the 12 flat codes), `role` (one of 9), `class` (one of 8), `family` (nullable, one of the confirmed families). Sources: Three Kingdoms wikis/historical references. NEVER agent-guess — every assignment must be supported by a source consulted during research.
3. Produce `scripts/data/sanguo-classifications.json`: `{ "<hero_id>": { "faction": "<code>", "role": "<code>", "class": "<code>", "family": "<code>|null" } }` — all 132 hero_ids present.
4. Spot-check a deterministic sample (e.g., every 11th hero) against independent references; record zero unresolved mismatches in the summary.

**Verify:** file has 132 entries; every faction/role/class value is in the locked vocab; family values ⊆ confirmed family set.

**Done:** sanguo-classifications.json committed with 132 entries + sample verification note.

## Task 3: Seed update + migration + reseed

**Files:** scripts/seed-sanguo.ts, migrations/0015_*.sql (+ meta), scripts/data/sanguo-classifications.json (read)

**Action:**
1. `seed-sanguo.ts`: load `sanguo-classifications.json`; for each hero resolve `factionId` via a `heroFactions` upsert-by-code first (seed the 12 factions before heroes), map `role`/`class` directly, wire `family` via clobber-safe conditional spread (same pattern as nameZh). Update FACTION_MAP removal (no longer maps Vietnamese strings — faction comes from classifications JSON). Update the hero upsert values + onConflictDoUpdate set.
2. Seed the 12 `hero_factions` rows (code + name_vi/en/zh + sort_order) idempotently before heroes.
3. Optionally seed a starter `formations` catalog row(s) + slots (minimal placeholder OK per D-10 spirit) — OR leave formations empty (Phase 11 fills). Prefer empty + note.
4. Generate migration with `npx drizzle-kit generate` (DATABASE_URL_DIRECT present). Confirm: ALTER for iv_* renames (or drop/recreate user_heroes depending on drizzle diff), DROP TYPE hero_faction, CREATE TYPE hero_role/hero_class, CREATE TABLE hero_factions/formations/formation_slots/user_formations, ALTER heroes (add faction_id/class/family, change role type), 0 DROP TABLE outside the Phase 8 set. Do not hand-edit generated SQL.
5. Apply with `npx drizzle-kit migrate`; run `npx tsx scripts/seed-sanguo.ts` TWICE; verify counts: hero_factions=12, heroes=132 (all with faction_id/role/class NOT NULL), sanguo_items=3, map_nodes=7; second run identical counts.
6. Run full gates: `npm run typecheck`, `npm run lint`, `npm run check-i18n`, `npx vitest run`. Fix any test that referenced old iv_* names (wallet/map tests unaffected; userHeroes not yet covered by tests — check grep).

**Verify:** migrate exit 0; double seed identical counts; all gates green.

**Done:** migration 0015 applied + committed; seed double-run idempotent; gates green.

---

## Constraints

- Commit each task atomically (code changes only).
- No runtime read of sibling repo or research data.
- Do NOT update ROADMAP.md.
- Do NOT add runtime UI for IV grades (record-only this task).
