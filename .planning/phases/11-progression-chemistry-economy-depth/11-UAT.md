---
status: testing
phase: 11-progression-chemistry-economy-depth
source: [11-VERIFICATION.md]
started: 2026-08-18T11:20:00Z
updated: 2026-08-18T11:20:00Z
---

## Current Test

number: 1
name: Shop/legion/hero-actions/boss-capture loading-state + shop tab rendering
expected: |
  Open `/sanguo shop` in a live Discord server — the two currency tabs render
  (💎 Linh thạch with heal_pill 50💎 + booster_x2 100💎 purchasable rows;
  🎁 Sự kiện with the locked capture_key shown-but-locked, no buy button).
  All component presses (buy/use/convert/evolve/reroll/legion) complete via
  deferReply → editReply within the 3s window (no duplicate defer).
awaiting: user response

## Tests

### 1. Shop/legion/hero-actions/boss-capture loading-state + shop tab rendering
expected: Shop tabs + buy/use/convert/evolve/reroll/legion presses respond within the 3s latency window; the Event tab is non-empty by construction.
result: [pending]

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
