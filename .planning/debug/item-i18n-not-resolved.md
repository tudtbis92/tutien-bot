---
status: diagnosed
trigger: "Item names in /gather and /recipes embeds show translated names (e.g. 'Khí Tu Thạch'), not raw i18n keys"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: The `items.raw.*` and `items.crafted.*` key subtrees are entirely absent from `locales/vi/game.json` (and all locale files), causing i18next to return the raw key string as a fallback.
test: Searched all files under `locales/` for the string "items" — zero matches.
expecting: If hypothesis is correct, every item name call like `t('game:items.raw.khi_tu_thach')` will return the literal string `'items.raw.khi_tu_thach'` because i18next's key-miss fallback returns the last path segment(s) of the key.
next_action: DIAGNOSED — root cause confirmed. No fix applied (goal: find_root_cause_only).

## Symptoms

expected: Embed shows translated item names — e.g. 'Khí Tu Thạch'
actual: Embed shows raw i18n key string — e.g. 'items.raw.khi_tu_thach'
errors: None reported — no crash, just wrong display
reproduction: Test 2 (/gather result embed) and Test 6 (/recipes embed)
started: Discovered during UAT of phase 02.1

## Eliminated

- hypothesis: Namespace prefix missing — t() called without 'game:' prefix
  evidence: gather.ts line 204 calls `t(key)` where key comes from DB as `game:items.raw.${slug}` (seed.ts line 403). The `game:` prefix IS present. Also buildRecipesEmbed.ts line 65 calls `t(recipe.outputNameKey)` where outputNameKey is set to `resultItem?.nameI18nKey` which includes the namespace prefix. Namespace handling is correct.
  timestamp: 2026-04-14T00:00:00Z

- hypothesis: i18next not initialized before command runs
  evidence: `initI18n()` uses `preload: SUPPORTED_LOCALES` which synchronously loads all locales at startup. `getT()` calls `i18next.getFixedT(locale)` which works on the pre-loaded singleton. No async race possible. i18next initialization is not the cause.
  timestamp: 2026-04-14T00:00:00Z

- hypothesis: Wrong namespace — 'game' namespace not registered
  evidence: `src/i18n/index.ts` line 28 registers `ns: ['common', 'game', 'combat', 'marketplace', 'admin']`. The 'game' namespace is explicitly registered and `locales/vi/game.json` exists and loads. Other game: keys (e.g. `game:gather.success`) work fine. Namespace registration is not the cause.
  timestamp: 2026-04-14T00:00:00Z

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  checked: src/db/seed.ts lines 402–410
  found: Raw items get nameI18nKey = `game:items.raw.${slug}` (e.g. `game:items.raw.khi_tu_thach`). Crafted items get `game:items.crafted.${slug}`.
  implication: DB stores full namespaced keys. Commands read these keys verbatim from DB and pass them to t().

- timestamp: 2026-04-14T00:00:00Z
  checked: locales/vi/game.json (full file, 155 lines)
  found: Contains keys for: realms, breakthrough, spiritual_root, start, profile, leaderboard, profession, gather, language, craft, recipes. NO `items` key exists anywhere in the file.
  implication: `t('game:items.raw.khi_tu_thach')` hits a key-miss. i18next returns the unresolved key string as fallback ('items.raw.khi_tu_thach' — the key without the namespace prefix).

- timestamp: 2026-04-14T00:00:00Z
  checked: bash search `Get-Content locales/vi/game.json | Select-String "items"` — zero output
  found: Confirmed zero occurrences of "items" in game.json.
  implication: This is not a typo or nesting error; the entire `items` section was never written to the locale file.

- timestamp: 2026-04-14T00:00:00Z
  checked: locales/ directory listing
  found: Files present: vi/game.json, vi/common.json, vi/admin.json, vi/marketplace.json, vi/combat.json. No separate items file. Items translations must live within game.json.
  implication: The fix is a pure locale file addition — no code changes needed.

- timestamp: 2026-04-14T00:00:00Z
  checked: gather.ts lines 188–205 (single-gather path) and 201–205 (multi-gather path)
  found: Single gather passes nameI18nKey to `buildItemEmbed` which calls `t(data.itemNameI18nKey)` (buildItemEmbed.ts line 56). Multi-gather calls `t(key)` directly at line 204. Both paths go through the same missing translation key.
  implication: Both Test 2 (single gather) and multi-gather are affected by the same root cause.

- timestamp: 2026-04-14T00:00:00Z
  checked: buildRecipesEmbed.ts lines 65 and 80
  found: `t(recipe.outputNameKey)` and `t(ing.nameKey)` — both call t() with keys sourced from DB (nameI18nKey column). Same missing translation applies to output names AND ingredient names.
  implication: Test 6 (/recipes) shows broken keys for both the recipe output AND its ingredient list.

- timestamp: 2026-04-14T00:00:00Z
  checked: Full RAW_ITEMS list in seed.ts (50 items, lines 56–126)
  found: Slugs include: linh_thao_so_khai, thanh_tam_hoa, huyen_tinh_thao, dan_nguyen_qua, cuu_diep_linh_chi, khi_tu_thach, linh_khi_tinh, thuan_khi_ngoc, thien_nguyen_tinh, hu_khong_khi_doan, tran_van_thach, linh_sa, tran_co_ngoc, co_tran_van_phien, thien_dia_tran_tinh, linh_mi, thanh_lo_thao, huyen_vu_nam, phuong_hoang_qua, long_tuy_tinh_hoa, son_truang_mat, doc_truong_nhuong, linh_truong_kien, co_doc_tinh, van_truong_than_co, tieu_can_thao, hoa_ich_tho, sam_linh_can, thien_nien_do_quyen, van_linh_tien_hoa, thu_long_tho, tieu_thu_loi, linh_thu_vay, manh_thu_nanh, than_thu_tinh_huyet, pho_thong_khoang, thiet_linh_phien, thanh_dong_khoi, bach_ngan_tinh, cuc_pham_than_kim, linh_sa_boi, phu_giay_linh, huyen_muc_tinh, kim_sa_linh, tien_bich_huyet, tien_tri_gian, van_menh_soi, tinh_tu_tinh, co_ngu_gian_phien, thien_co_cuon.
  implication: All 50 raw items need translations under `items.raw.*` in game.json. Crafted items also need `items.crafted.*` entries.

## Resolution

root_cause: The `items.raw.*` and `items.crafted.*` translation key subtrees were never added to `locales/vi/game.json` (or any locale file). The seed script stores full namespaced keys like `game:items.raw.khi_tu_thach` in the DB, and commands correctly pass those keys to `t()`. However when i18next cannot find the key in the loaded namespace, it returns the key path without the namespace prefix as a fallback string — producing the visible `items.raw.khi_tu_thach` output. No code is wrong; the locale files are simply incomplete.

fix: (not applied — find_root_cause_only mode)
  Add an `"items"` section to `locales/vi/game.json` (and equivalently to `locales/en/game.json` and `locales/zh-cn/game.json`) with `"raw"` and `"crafted"` subsections containing one key per item slug. For example:
  ```json
  "items": {
    "unknown": "Vật phẩm không rõ",
    "raw": {
      "khi_tu_thach": "Khí Tu Thạch",
      "linh_khi_tinh": "Linh Khí Tinh",
      ...
    },
    "crafted": {
      "khi_hoi_dan": "Khí Hồi Đan",
      ...
    }
  }
  ```
  No code changes are required. The entire call chain (DB key → t() → embed) is correct.

verification: (not applied)
files_changed: []
