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
