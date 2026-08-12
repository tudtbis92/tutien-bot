---
quick_id: 260811-lld
slug: post-gate-phase-8-schema-redesign-locked
description: Post-gate Phase 8 schema redesign — IV 6 stats rename, flat hero_factions, heroes role/class/family, formations schema, Tavily research 132 heroes, reseed
status: complete
date: 2026-08-11
tasks: 3
commits: 6
---

# Quick Task: Post-gate Phase 8 Schema Redesign

**Locked decisions applied:** IV rename (STR/AGI/INT/MOV/LEA/CHA), flat faction table (14 codes), 9 roles, 8 classes, family column, formations schema — per user sign-off on 2026-08-11.

## Accomplishments

- **Task 1 (schema):** `userHeroes.ts` IV columns renamed to `iv_str/agi/int/mov/lea/cha` (0-31 CHECKs renamed); `heroes.ts` dropped `hero_faction` pgEnum → `faction_id` FK to new `hero_factions` table, role enum expanded to 9 (`ruler/general/strategist/civil/royal/eunuch/religious/tribal/scholar`), new `hero_class` enum (8: vanguard/cavalry/archer/spellcaster/schemer/vu_co/thu_binh/cong_binh) + `family` varchar(30) nullable; new `heroFactions.ts` (14 flat factions, per-locale names, sort_order) + `formations.ts` (formations/formation_slots/user_formations catalog — buy/sell logic deferred Phase 11). Commit `17637eb`.
- **Task 2 (research):** `scripts/data/sanguo-classifications.json` — all 132 heroes assigned `{ faction, role, class, family }` via Tavily research + domain verification. 14 factions in use: quan_hung 39, han 27, khan_vang 15, thap_thuong_thi 10, nguy 9, luong_chau 7, tien_ti 5, trieu_tien 5, thuc 4, hung_no 4, o_hoan 4, ngo 3, son_viet 1. 12 families (liu 6, zhang 3, kuai/shi/xiahou/gongsun/yuan 2 each, sun/dong/kong/cao/ma 1 each). Commit `7abcdfc`.
- **Task 3 (seed + migration):** migration `0015_post_gate_sanguo_redesign.sql` (CREATE hero_class enum + hero_factions/formations/formation_slots/user_formations tables, hero_role 9-value, heroes faction_id/class/family, user_heroes IV rename, 0 DROP TABLE); seed updated to upsert 14 factions first then heroes with faction_id FK lookup + role/class/family clobber-safe; double-run idempotent (14/132/7/3 unchanged). Commit `2b86898`.

## Key Decisions

- **14 flat factions** (user-approved post-gate): the user chose to promote Ngoại Tộc members (Nam Man, Ô Hoàn, Sơn Việt, Tiên Ti, Hung Nô) to top-level + add `trieu_tien` (5 Korean kings) and `quan_hung` (warlords: Yuan Shao, Yuan Shu, Dong Zhuo, Gongsun Zan, independent governors). Chemistry = flat match per earlier decision.
- **dianwu correction:** `heroes-v1.json` id `dianwu` is **Điền Ngô (滇吾) — Qiang chieftain** (title "Qiang Chieftain", people=qiang, curved bow), NOT Dian Wei (典韦) the Cao Cao bodyguard. Initially misclassified nguy/general; research (Book of Later Han Qiang refs) confirmed luong_chau/tribal/archer. Name_zh 滇吾 matches.
- **Family = bloodline reference table (follow-up commit `6cd2f20`):** user flagged surname-collision risk (Liu = 4th most common surname, granted to Xiongnu/Turkic converts → multiple unrelated Liu families). Researched & converted `heroes.family varchar` → `hero_families` reference table + `family_id` FK. Chemistry matches exact family_id. Also found + fixed a REAL false bond: Gongsun Zan ≠ Gongsun Du ("Despite sharing the same surname... not actually related", Sanguozhi). Han imperial clan (`liu_hoang_toc`, 9: 3 emperors + liu_bei/biao/yan/yao/dai/yu) and He consort clan (`ha_ngoai_thich`, 3: ha_tien/ha_thai_hau/ha_mieu) are separate bloodlines joined by marriage. Yellow Turban Zhang brothers → `zhang_khan_vang`. 12 families, 28 heroes assigned. Migration 0016 additive.
- **Formations schema designed now** (user chose option a): catalog tables present; buy/sell + battleEngine consumption deferred to Phase 11.
- **Spouse relations (commit `0a069c7`):** user chose direct-marriage-only. `hero_relations` table (hero_a < hero_b, unique index, relation_type enum `spouse`), tier-1 bond equal to family (decision a). In-law excluded (bond targets Mi phu nhân / Thái phu nhân not in roster). Seeded: han_ling_di↔ha_thai_hau, han_ling_di↔vuong_my_nhan. Migration 0017 additive; idempotent via onConflictDoNothing.
- **IV grade bands recorded** (100=Hoang Kim, 90-99=Hong ngoc, 80-89=Lam cap, 60-79=Luc cap, <60=Hoi cap) — display logic deferred to Phase 10, no runtime UI in this task.

## Deviation Notes (all necessary, documented)

- **drizzle-kit `generate` required TTY** for enum/column rename prompts (hero_role value change + IV column renames). Patched `node_modules/drizzle-kit/bin.cjs` `promptNamedWithSchemasConflict` + `promptColumnsConflicts` to auto-resolve (all created = new, all missing = deleted, no renames) then **restored** the original bundle. Migration output verified equivalent to the interactive path.
- **`formations.basePrice`** used `default(0n)` → drizzle-kit crashed on BigInt serialize; fixed to `default(sql\`0\`)` (matches `sanguoItems.ts` pattern).
- **Migration 0015 added `TRUNCATE TABLE heroes RESTART IDENTITY CASCADE`** at the top: the 0014-seeded 132 hero rows would break `ADD COLUMN faction_id integer NOT NULL` and the `role` text→enum cast (old value `military` not in new enum). user_heroes/encounter_runs are empty (Phase 9/10 consumers) so the cascade is safe; seed re-upserts all 132 heroes idempotently afterward. Deploy.sh already runs seed after migrate.

## Gates

- `npm run typecheck` ✓
- `npm run lint` ✓ (eslint src --max-warnings=0)
- `npm run check-i18n` ✓ (All locale files are in sync)
- `npx vitest run` ✓ (20 files, 140 tests)
- DB: migrate exit 0; seed double-run 14/132/7/3 identical; faction_id/role/class NOT NULL on all 132; name_zh NOT NULL 132; formations tables present in pg_catalog.
