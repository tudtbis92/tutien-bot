---
status: testing
phase: 11-progression-chemistry-economy-depth
source: [11-VERIFICATION.md]
started: 2026-08-18T11:20:00Z
updated: 2026-08-18T12:00:00Z
---

## Current Test

number: 2
name: Legion 4-row assembly UI + chemistry-tier-line display
expected: |
  The /sanguo legion 4-row UI (formation → slot → hero → save) works end-to-end
  with strict class-match; per-main chemistry tier lines render label + link
  count ONLY (never chemistry points/buff%); a saved legion routes to the forced
  legion battle.
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
result: [pending]

### 3. Boss drop + capture embed flow + never-render of hidden weights
expected: Beat a boss thường in live server; guaranteed item drop line + capture view open; capture reveals the copy (stars/grade/Lv20 — never the t0 95/t1 4.98/t2 0.02 weights); all new Phase 11 UI surfaces handle empty/populated/overflow states per UI-SPEC #31.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
