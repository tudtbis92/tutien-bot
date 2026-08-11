---
phase: 08-foundation-economy-budget-content-infrastructure
fixed: 2026-08-11T07:10:00Z
source: 08-REVIEW.md
status: fixed
critical_fixed: 2
warning_fixed: 2
warning_documented: 1
info_documented: 4
---

# Review Fix Report — Phase 08

Fixes applied to the findings in `08-REVIEW.md` (scope: critical + warning). Applied inline by the orchestrator after two `gsd-code-fixer` dispatches returned empty results without work.

## Fixed

### CR-01 — `/sanguo map` can never render after seeding (fixed)
- **Root cause:** the seed writes `map_nodes.representative_hero_id` in the `heroes.hero_id` snake_case space (`dong_trac`, `cao_cao`…), but `heroEmoji()` was keyed only by 3-letter emoji prefixes (`abt_t0`…), so `heroEmoji('dong_trac')` threw `EMOJI_NOT_FOUND` and every map invocation rendered the error embed.
- **Fix:**
  - `scripts/gen-sanguo-emojis.ts` now also reads the sibling repo's `codes.js` (env `SANGUO_HERO_CODES_SOURCE`, default `E:\Saeth\sanguo_assets\src\data\codes.js`) and emits a generated `SANSUO_HERO_EMOJI_CODES` map (snake_case hero_id → 3-letter prefix) in `src/assets/sanguoEmojis.ts`. Validates: ≥132 hero codes, every code has a matching registry prefix, every registry prefix has a hero id, codes unique, and each prefix has the complete tier/star variant set (WR-03).
  - `heroEmojiPrefix(heroId)` resolves snake_case ids through the map (or passes a direct prefix through); `heroEmoji()` uses it, so a seeded `representative_hero_id` now renders `<:dtr_t0:…>` markup.
  - Regression tests: `sanguoEmojis.test.ts` (snake_case resolution + full-coverage loop over all 132 mapped hero ids — each must render markup, never throw) and `map.test.ts` (seeded `dong_trac`/`han_xian_di` flow through the command to a renderable zones field).
- **Verify:** `npx vitest run src/assets/__tests__/sanguoEmojis.test.ts src/commands/sanguo/__tests__/map.test.ts` — 6/6 pass. Seed re-run: `132 heroes, 7 map_nodes, 3 items upserted`, idempotent. DB: `representative_hero_id` values `dong_trac, han_xian_di, cao_cao, yuan_shao, sun_jian, liu_biao, liu_bei` all resolve via `heroEmoji`.

### CR-02 — Deploy pipeline hard-fails at the seed step (fixed)
- **Root cause:** `scripts/seed-sanguo.ts` hardcoded the Windows dev path `E:\Saeth\sanguo_assets\src\data\heroes-v1.json`; the Linux server (no sibling repo) hit ENOENT, and `set -e` in `deploy.sh` aborted the deploy before `pm2 restart`.
- **Fix:** `scripts/data/heroes-v1.json` is now a **committed repo copy** (same pattern as the committed `sanguo-zh-names.json`), and the seed resolves the source as `process.env.SANGUO_HEROES_SOURCE ?? fileURLToPath(new URL('./data/heroes-v1.json', import.meta.url))`. Deploy works without the sibling repo; local regeneration can point `SANGUO_HEROES_SOURCE` at the sibling repo.
- **Verify:** seed runs twice from the repo copy — both exit 0 with identical counts; `npm run typecheck` passes.

### WR-01 — `creditBalance` opaque TypeError on missing user (fixed)
- `src/services/wallet.ts` `creditBalance` now checks zero returned rows and throws `Error('USER_NOT_FOUND:<id>')` instead of dereferencing `rows[0]!`. Ledger insert is skipped on that path. Doc comment updated.

### WR-02 — Raw snake_case zone codes rendered to users (fixed)
- `src/commands/sanguo/map.ts` now derives each zone's label from the **first node's per-locale name** in that zone (`pickName(row, locale)`) instead of the raw DB `zone` key (`trung_nguyen`). Honors D-07 (content from DB per-locale columns, never i18n keys, never raw codes). Regression coverage in the map command test.

### WR-03 — `heroEmoji` fallback drops tier/star; generator validates only prefix count (fixed in generator)
- The registry data was already complete (verified: all 132 prefixes have t0/t0_star/t1/t1_star/t2/t2_star/t3/t3_star). The generator now **enforces** per-prefix tier/star completeness and fails fast if any variant is missing, preventing future silent visual regressions.

## Documented (not changed)

### WR-04 — Seed is non-transactional (documented rationale)
- The seed is designed as an idempotent upsert (D-11): a mid-run failure leaves partial content that a re-run heals; the deploy runs the seed once per deploy after migrate. Wrapping all 132+ upserts in a single transaction adds no integrity property beyond what the natural-key upserts + re-run provide, at the cost of a long-lived transaction lock. Accepted; re-visit if the content set grows beyond placeholder scale.

## Info findings (documented)
- Generator absolute source-path default is machine-specific — now overridable via `SANGUO_EMOJIS_SOURCE` / `SANGUO_HERO_CODES_SOURCE` (improved in CR-01/CR-02 fix).
- `zh ? { nameZh }` empty-string edge — research map contains only non-empty names; empty strings would seed `name_zh = ''` (not NULL). Low risk; accepted.
- `check-i18n.ts` extra-key drift / JSON-parse reporting — pre-existing tool behavior, out of Phase 8 scope.
- `map.test.ts` empty-branch-only coverage — the gap that let CR-01 escape CI; now covered (snake_case marker regression test added).

## Final gates
- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `npm run check-i18n` — exit 0
- `npm test` — 20 files, **140/140 tests pass** (137 before review + 3 new regression tests)
- Seed idempotency — second run unchanged counts
- DB assertions — heroes `name_zh NOT NULL` = 132; `map_nodes.representative_hero_id` all non-null and emoji-resolvable
