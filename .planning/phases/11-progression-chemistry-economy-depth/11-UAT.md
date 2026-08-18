---
status: testing
phase: 11-progression-chemistry-economy-depth
source: [11-VERIFICATION.md]
started: 2026-08-18T11:20:00Z
updated: 2026-08-18T13:00:00Z
---

## Current Test

number: 3
name: Boss drop + capture embed flow + never-render of hidden weights
expected: |
  Beat a boss thường in live server; guaranteed item drop line + capture view
  open; capture reveals the copy (stars/grade/Lv20 — never the t0 95/t1 4.98/t2
  0.02 weights). Pending — boss encounter rate is low (0.07/zone default).
awaiting: user response

## Tests

### 1. Shop/legion/hero-actions/boss-capture loading-state + shop tab rendering
expected: Shop tabs + buy/use/convert/evolve/reroll/legion presses respond within the 3s latency window; the Event tab is non-empty by construction.
result: pass
source: user
note: |
  PASS 2026-08-18 after CR-11-01 fix + booster rename:
  - Tab switch to Sự kiện was broken — the interaction router called
    handleShopTabPress/handleShopBuyPress but shop.ts/map.ts exported
    handleTabPress/handleBuyPress (name mismatch → branch skipped → Discord
    "interaction failed"). Renamed to match; regression guard added (map.test.ts).
  - Item booster_x2 renamed 'Linh Đan Tăng Tu Vi' → 'Song Hồn Ngọc Đan'
    (double soul-jade on dupe convert) — old name mislabeled the Tam Quốc theme.
  - /sanguo shop now renders both tabs (💎 Linh thạch heal_pill 50💎 + Song Hồn
    Ngọc Đan 100💎; 🎁 Sự kiện capture_key shown-but-locked, no buy button).
    Tab presses + presses complete within 3s, no errors in logs.

### 2. Legion 4-row assembly UI + chemistry-tier-line display
expected: The /sanguo legion 4-row UI (formation → slot → hero → save) works end-to-end with strict class-match; per-main chemistry tier lines render label + link count ONLY (never chemistry points/buff%); a saved legion routes to the forced legion battle.
result: pass
source: user
note: |
  PASS 2026-08-18 (tạm) after CR-11-02→CR-11-09 fixes:
  - CR-11-02: hero-pick menu crash on empty class-matched options (Discord
    BASE_TYPE_BAD_LENGTH) — disabled placeholder option injected.
  - CR-11-03: menu returned CATALOG id instead of COPY id → NOT_OWNED on pick;
    copyId separated from the chemistry catalog id.
  - CR-11-04: re-picking an already-placed hero MOVES it (was HERO_ALREADY_ASSIGNED).
  - CR-11-05: multiple copies all listed + distinguishable (Lv + #n).
  - CR-11-06/07: one copy per hero — different-copy pick REPLACES (evicts old).
  - CR-11-08: no rarity stars in the picker; assigned copies show their slot.
  - CR-11-09: position-based chemistry (EA FC) — per-formation link graphs,
    pair points (family/spouse 3 > faction 2 > role 1), level 0-3 (1-2/3-4/5+),
    additive buff L1+2/L2+7/L3+17 on STR/AGI/INT; chemistry now ACTUALLY applies
    in battle (was display-only). Verified live: Đôn+Uyên (xiahou family) → L3,
    Lỗ (faction-only, family null) → L2 — correct per the formula.
  - CR-11-10 reverted: vu_co/thu_binh/cong_binh stay empty (no hero fits —
    Tavily-verified; filled in a future hero version).

### 3. Boss drop + capture embed flow + never-render of hidden weights
expected: Beat a boss thường in live server; guaranteed item drop line + capture view open; capture reveals the copy (stars/grade/Lv20 — never the t0 95/t1 4.98/t2 0.02 weights); all new Phase 11 UI surfaces handle empty/populated/overflow states per UI-SPEC #31.
result: [pending]
source: user
note: |
  PENDING — encounter boss rate is low (boss_rate default 0.07/zone), will take
  time to trigger naturally. Not blocked; to be completed when a boss encounter
  appears in live play. Covered by automated tests meanwhile (encounterService/
  battleCheckInService/dropService suites).

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

- Boss encounter (test 3) pending live trigger — low natural rate (zone boss_rate
  default 0.07). Will complete UAT test 3 when a boss spawns in play.

## Design Decisions Made During Live UAT (2026-08-18)

| ID | Decision | Detail |
|----|----------|--------|
| DD-11-01 | **Multi-class heroes** | Hero có thể thuộc NHIỀU class (bảng `hero_classes` join, migration 0023) — phản hồi việc Tào Tháo bị khóa vào Mưu Sĩ. `heroes.class` giữ làm PRIMARY class (battle attack type + skill pool); `hero_classes` = tập class hero lắp được vào legion. Legion strict-match theo membership. Content **Tavily-researched** (Wikipedia/TW3K wiki/Baidu/r-threekingdoms), provenance ghi trong seed header. |
| DD-11-02 | **Position-based chemistry (EA FC style)** | Chemistry = 2 tầng: (1) gate vị trí — hero chỉ chemistry với hero ở slot CÓ LIÊN KẾT trong bảng `formation_chemistry_links` (migration 0024, mỗi trận hình topology riêng, mỗi slot 1-3 liên kết); (2) quan hệ — pair points family/spouse 3 > faction 2 > role 1 (giữ nguyên). Hero cộng điểm từ TẤT CẢ link active. |
| DD-11-03 | **Chemistry level 0-3 + additive buff** | Threshold 1-2→L1, 3-4→L2, 5+→L3 (cap 3). Buff CỘNG DỒN additive trên 3 stat chính STR/AGI/INT: L1 +2, L2 +7, L3 +17 (user-signed). Thay hệ cũ multiplicative S/A/B/C/D. |
| DD-11-04 | **Fix chemistry display-only bug** | `bakeMain` trước đây chỉ áp TIER_MULTIPLIERS, KHÔNG áp chemistry buff → chemistry chỉ hiển thị, không ảnh hưởng battle. Giờ `buildLegionInput` tính level từ link graph + assignment, bakeMain áp buff thực. |
| DD-11-05 | **vu_co/thu_binh/cong_binh để TRỐNG** | Research Tavily xác nhận không hero nào trong roster 132 phù hợp 3 class hybrid này (game-archtype tự định nghĩa, `max(STR,INT)`). Revert gán heuristic (CR-11-10). Chấp nhận slot chuyên biệt không lấp được, chờ bổ sung ở hero version sau. |
| DD-11-06 | **Boss encounter redesign (Phase 11+)** | Boss hiện là template zone (hero_id NULL, `boss:zone`, rarity-5 ~2× hero). User vision: boss = **random tướng vùng** (như encounter) với **t2 + IV 100**, battle **3v1** (3 chủ lực + 9 hỗ trợ). Ghi WINDOWS.md #5, Phase 11+ content/schema work. |
| DD-11-07 | **Boss capture defer** | `BOSS_CAPTURE_UNAVAILABLE` là known stub (no heroes row cho boss) — defer, superseded bởi DD-11-06 (boss trở thành tướng thật → capture được). |
| DD-11-08 | **booster_x2 rename** | 'Linh Đan Tăng Tu Vi' (sai chủ đề Tam Quốc, gây confuse) → **'Song Hồn Ngọc Đan'** / 'Double Soul-Jade Pill' — vì item này nhân đôi hồn ngọc khi convert dupe. |
| DD-11-09 | **Test data** | Cấp user 3 legion test Ngụy (Đôn/Uyên/Lỗ chủ lực + support fills). Xác nhận công thức: Đôn+Uyên cùng family xiahou → L3, Lỗ (family null, chỉ faction) → L2. |
| DD-11-10 | **Female heroes hiện tại** | Chỉ 3 nữ tướng trong roster (Hà Thái Hậu/Đổng Thái Hậu/Vương Mỹ nhân), tất cả class `schemer`, role `royal`, faction `han`. Không nữ tướng chiến đấu trong roster Hán mạt hiện tại. |

## CR Fixes Log (Live UAT, 2026-08-18)

| ID | Bug | Root cause | Fix |
|----|-----|-----------|-----|
| CR-11-01 | Shop tab/buy button "interaction failed" | Router gọi `handleShopTabPress`/`handleShopBuyPress` nhưng shop.ts/map.ts export `handleTabPress`/`handleBuyPress` — name mismatch → branch skipped, interaction không được trả lời | Rename handler đúng tên router; thêm regression guard (map.test.ts) assert các handler names |
| CR-11-02 | `/sanguo legion` crash (50035 BASE_TYPE_BAD_LENGTH) | Hero-pick menu render 0 options khi slot class không có hero sở hữu | Inject 1 disabled placeholder option (hero_none) — disabled 0-option vẫn fail validation |
| CR-11-03 | Chọn tướng → NOT_OWNED | Menu trả CATALOG id (heroes.id) nhưng assignHero cần COPY id (userHeroes.id) | Thêm `copyId` riêng (userHeroes.id) cho menu value + assignment map; chemistry giữ catalog id |
| CR-11-04 | Re-pick tướng đã đặt → lỗi | `HERO_ALREADY_ASSIGNED` throw khi copy đã ở slot khác | Re-pick MOVES (xóa slot cũ + gán slot mới); same-slot = no-op |
| CR-11-05 | Nhiều copy không phân biệt được | Label chỉ name+stars+grade — 2 copy cùng IV render giống hệt | Thêm Lv{level} + copy ordinal #n (hero_option_multi); 4 label variants |
| CR-11-06/07 | 1 hero nhiều copy chiếm nhiều slot | Chỉ chặn 1-copy-1-slot, không chặn 1-hero-nhiều-copy | Thêm guard: 1 hero chỉ 1 copy trong legion; different-copy pick REPLACES (evict) thay vì block (user refinement) |
| CR-11-08 | Menu hiện stars + không biết copy đã đặt đâu | Label có ★stars; copy đã assign không hiện vị trí | Bỏ stars (D-12); copy đã assign hiện slot (Chủ lực/Hỗ trợ + số) |
| CR-11-09 | Chemistry position-based redesign | (DD-11-02/03/04) — bảng formation_chemistry_links + level 0-3 + additive buff + fix display-only | Xem Design Decisions |
| CR-11-10 | vu_co/thu_binh/cong_binh 0 hero | Gán heuristic 14 hero — research Tavily xác nhận không phù hợp | REVERT (DD-11-05) — 3 class trống, chờ hero version sau |
