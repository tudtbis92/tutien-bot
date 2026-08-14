---
status: complete
phase: 10-battle-capture
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md, 10-05-SUMMARY.md, 10-06-SUMMARY.md, 10-07-SUMMARY.md]
started: 2026-08-14T02:00:00Z
updated: 2026-08-14T03:20:00Z
---

## Current Test

number: 8
name: Boss Capture Decision (D-13)
expected: |
  Win a boss battle then press capture. Confirm the current behavior surfaces BOSS_CAPTURE_UNAVAILABLE (known stub). Decide/acknowledge the boss→heroes mapping as a future content/schema decision (WINDOWS.md #5), not a Phase 10 blocker.
awaiting: none

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running bot/server. Clear ephemeral state. Start the application from scratch. Bot boots without errors, migration 0019 applies cleanly, seed:sanguo completes, and a primary query returns live data.
result: pass
source: user
note: |
  Deployed 2026-08-14. Migration 0019 applied (journal 19 rows, all 132 heroes carry stats/rarity/tier),
  seed 18 zones/73 nodes/162 edges/208 rates unchanged, bot Shard 0 ready, /health ok,
  /sanguo subcommands map/travel/battle/heroes/hero registered. CR-10-01 (seed node-ID wipe) fixed
  during UAT — travel returned NODE_NOT_FOUND because the reseed deleted map_nodes (ids 38/48 → gone);
  seed now deletes only stale nodes, ids preserved (109–158 stable across re-runs); affected journey reset.

### 2. D-20 Capture-Fee Re-Sign Acknowledgment
expected: Confirm the 10-03 F8 economy adjustment — fees halved to 5/15/40/100/250 (bigint × multipliers 1.0/1.5/2.0/3.0/5.0, tiers 4-5 item-gated) vs the user-approved A1 draft 10/30/80/200/500 — is acceptable as the signed D-20 contract. The re-sign recomputed E[net/hour] under effective chances: E[inflow]=0 → E[net]<0 (D-19 hard constraint), gross 75-394💎/hr at realistic 5-10/hr cadence < ~416/hr bound.
result: pass
source: user
note: |
  ACCEPTED 2026-08-14. User verified the free-income side of the D-19 math: grep of all creditBalance
  call sites confirms football (payout = betAmount × odds, min 100 / max 1,000,000💎) is the ONLY
  Linh thạch source — activity/tu vi, gather (99.8% loss EV), farming, sanguo all produce NO free
  currency; new users start at 0💎 with no faucet. With zero guaranteed free income, the sink fees
  hold E[net]<0. Signed as the D-20 contract (5/15/40/100/250 × 1.0/1.5/2.0/3.0/5.0).

### 3. Content Prominence Ranking (Rarity 5/4/3)
expected: Eyeball the agent-discretion prominence assignment that drives capture odds + collection display: rarity 5 = Tào Tháo + Quan Vũ; rarity 4 = Lưu Bị, Trương Phi, Đổng Trác, Viên Thiệu, Tôn Kiên; rarity 3 = 13 major warlords/top generals (Trương Giác, Công Tôn Toản, Hạ Hầu Đôn/Uyên, Hoàng Phủ Tung, Hà Tiến, Lưu Biểu, Viên Thuật, Trương Lỗ, Khổng Dung, Đào Khiêm, Hoàng Cái, Trình Phổ). Distribution 79/33/13/5/2 ≈ signed 60/25/10/4/1. Confirm the ranking is acceptable.
result: pass
source: user
note: |
  ACCEPTED 2026-08-14 — ranking confirmed acceptable as-is.

### 4. Boss Template Values (Zone-Scaled)
expected: Eyeball the boss stat templates (sanguoBoss.ts, A3): rarity 5, HP 420-525 / STR 108-145 (~2× a rarity-5 hero), zone-flavored across all 18 map_zones (nomad frontiers STR/MOV/HP heavy, southern provinces AGI/INT, central heartlands balanced). Confirm the difficulty balance is acceptable before it drives live boss fights.
result: pass
source: user
note: |
  ACCEPTED FOR PHASE 10 as the zone-template implementation (A3), WITH a recorded redesign decision:
  the user's boss vision differs from the current zone-template model and will be RE-DESIGNED. Per the
  user (2026-08-14): boss battle should be 3v1 — the player fields a formation of 3 main generals
  (tương chủ lực) + 9 support generals (tướng hỗ trợ) against a boss that is a RANDOM general drawn
  from the zone (like a normal encounter, not an abstract zone template); boss stats are tier-2 (t2)
  with IV 100. This replaces the current zone-scaled abstract template (hero_id NULL / boss:zone).
  Tracked as a Phase 11+ design item (see Gaps / WINDOWS.md). Not a Phase 10 blocker.

### 5. Live-Discord Vertical Loop + 3s Latency Backstops
expected: In a live guild, run the full loop: starter pick → /sanguo travel → encounter → fight → battle log → Bắt → tier → capture → collection line + companion switch → map position. Every embed/button renders correctly, the battle log shows the turn-by-turn seeded log (≤20 lines), the capture view shows the single capture % + 3 tier buttons + retreat, and each interaction (battle start, tier press, heroes collection) replies within Discord's 3s window (deferReply → editReply).
result: pass
source: user
note: |
  PASS 2026-08-14 — verified from live production data: 2 sanguo_battles (both winner='player',
  seeded roundLogs present, 12 & 6 rounds), 2 capture_attempts (tier 1, fee 5💎 each, displayed_chance
  0.8, outcome success, pity_before 0), 3 user_heroes (starter + 2 captured), 1 user_sanguo_state
  (starter picked), 2 encounter_runs status='captured'. Wallet audit matches: 2× deduct 5💎
  reason 'sanguo_capture_t1'. All interactions replied within the 3s window (no latency errors in logs).

### 6. CR-01 Anti-Tamper: Capture Without a Won Battle
expected: Craft a sanguo:capture:tier:1 customId (or press capture on a pending encounter with NO battle fought). The attempt is rejected with CAPTURE_NOT_AVAILABLE and NO fee is charged (wallet unchanged). After 20 failed attempts the chance must NOT climb to 1.0 (pity cap by rarity).
result: pass
source: user
note: |
  PASS 2026-08-14 — CAPTURE_NOT_AVAILABLE guard verified live (captureService throws before any fee
  when no player-won battle exists); pity cap by rarity (0.80/0.75/0.70/0.65/0.60) prevents chance
  reaching 1.0. Automated coverage: captureService.test.ts.

### 7. CR-02 Stale Fight Button: Re-Battle a Won Encounter
expected: After winning an encounter battle, press an OLD fight button from a previous check-in embed. The second battle is rejected (BATTLE_ALREADY_FOUGHT) and the capture view is shown instead — no re-roll of wild IV/HP, no loss that would destroy the capture window.
result: pass
source: user
note: |
  PASS 2026-08-14 — BATTLE_ALREADY_FOUGHT guard verified live (startEncounterBattle rejects a second
  battle for an encounter with an existing completed battle; UI routes to the capture view). Automated
  coverage: battleCheckInService.test.ts.

### 8. Boss Capture Decision (D-13)
expected: Win a boss battle then press capture. Confirm the current behavior surfaces BOSS_CAPTURE_UNAVAILABLE (known stub — no heroes row exists for a captured boss, guard fires pre-fee). Decide/acknowledge the boss→heroes mapping as a future content/schema decision (WINDOWS.md #5), not a Phase 10 blocker.
result: pass
source: user
note: |
  DEFERRED (accepted, not a blocker) 2026-08-14 — BOSS_CAPTURE_UNAVAILABLE acknowledged as a known
  stub. Boss→heroes mapping deferred to Phase 11+ content/schema work, superseded by the Test-4
  redesign (boss = random zone general, t2 + IV 100, 3v1 battle) which itself provides a heroes row
  for capture. Tracked in WINDOWS.md #5.

### 9. Seeded replayable battle engine runBattle(seed, player, enemy) implementing the locked D-05 formula (combatStat=base+IV, MOV/AGI/player turn ladder, class-based attack type, damage floor, crit ×2, HP clamp, round-cap resolution)
expected: Seeded replayable battle engine runBattle(seed, player, enemy) implementing the locked D-05 formula (combatStat=base+IV, MOV/AGI/player turn ladder, class-based attack type, damage floor, crit ×2, HP clamp, round-cap resolution)
result: pass
source: automated
coverage_id: 10-01:D1

### 10. D-06 battle-only mandate — pure-rand imports exist ONLY in battleEngine.ts (scoped grep gate); engine is I/O-free and entropy-free
expected: D-06 battle-only mandate — pure-rand imports exist ONLY in battleEngine.ts (scoped grep gate); engine is I/O-free and entropy-free
result: pass
source: automated
coverage_id: 10-01:D2

### 11. pure-rand@8.4.2 exact-pinned as the only new milestone dependency
expected: pure-rand@8.4.2 exact-pinned as the only new milestone dependency
result: pass
source: automated
coverage_id: 10-01:D3

### 12. heroes carries the 8 base-stat columns STR/AGI/INT/MOV/LEA/CHA + HP + MP, hidden rarity (1-5) with check constraint, and public display tier (★1-5) with check constraint — combatStat = base + IV, HP/MP base-only (D-02/D-05/D-08)
expected: heroes carries the 8 base-stat columns STR/AGI/INT/MOV/LEA/CHA + HP + MP, hidden rarity (1-5) with check constraint, and public display tier (★1-5) with check constraint — combatStat = base + IV, HP/MP base-only (D-02/D-05/D-08)
result: pass
source: automated
coverage_id: 10-02:D1

### 13. user_heroes carries hp_current (0 = fainted) + captured_zone (zone snapshot at capture); the six iv_* columns and 0-31 checks remain Phase-8-final (TQC-02)
expected: user_heroes carries hp_current (0 = fainted) + captured_zone (zone snapshot at capture); the six iv_* columns and 0-31 checks remain Phase-8-final (TQC-02)
result: pass
source: automated
coverage_id: 10-02:D2

### 14. sanguo_battles carries the D-06 replay record — encounter_id nullable FK, type ('encounter'|'spar'), seed bigint mode 'number', input/result jsonb
expected: sanguo_battles carries the D-06 replay record — encounter_id nullable FK, type ('encounter'|'spar'), seed bigint mode 'number', input/result jsonb
result: pass
source: automated
coverage_id: 10-02:D3

### 15. encounter_runs carries pity_count (smallint default 0) — the per-encounter bad-luck counter (D-11); status vocabulary extends to captured/fled/skipped/escaped in the comment (A7, kept varchar)
expected: encounter_runs carries pity_count (smallint default 0) — the per-encounter bad-luck counter (D-11); status vocabulary extends to captured/fled/skipped/escaped in the comment (A7, kept varchar)
result: pass
source: automated
coverage_id: 10-02:D4

### 16. capture_attempts audit table records EVERY attempt — user_id, encounter_id, tier, fee, displayed_chance, roll, outcome, pity_before, created_at + (user_id, created_at) index (TQC-11/SC2 repudiation)
expected: capture_attempts audit table records EVERY attempt — user_id, encounter_id, tier, fee, displayed_chance, roll, outcome, pity_before, created_at + (user_id, created_at) index (TQC-11/SC2 repudiation)
result: pass
source: automated
coverage_id: 10-02:D5

### 17. user_sanguo_state holds one row per user — active_hero_id FK user_heroes.id + starter_views counter (A4/D-14 rotation)
expected: user_sanguo_state holds one row per user — active_hero_id FK user_heroes.id + starter_views counter (A4/D-14 rotation)
result: pass
source: automated
coverage_id: 10-02:D6

### 18. Migration 0019 generated via drizzle-kit (not hand-written) and applied to the dev DB — all new columns/tables observable via information_schema probe (schema push gate)
expected: Migration 0019 generated via drizzle-kit (not hand-written) and applied to the dev DB — all new columns/tables observable via information_schema probe (schema push gate)
result: pass
source: automated
coverage_id: 10-02:D7

### 19. CAPTURE_TIERS 5-tier capture-fee contract — fee bigint matching users.balance, strictly ascending fee+multiplier, requiresItem gate on tiers 4-5 (null on 1-3), D-20 signed values
expected: CAPTURE_TIERS 5-tier capture-fee contract — fee bigint matching users.balance, strictly ascending fee+multiplier, requiresItem gate on tiers 4-5 (null on 1-3), D-20 signed values
result: pass
source: automated
coverage_id: 10-03:D1

### 20. CAPTURE_BASE_BY_RARITY + FLEE_RATE_BY_RARITY (5 keys 1-5, base strictly decreasing, flee strictly increasing, all in [0,1]) + PITY_INCREMENT (0, 0.25] + RARITY_DISTRIBUTION summing to 100
expected: CAPTURE_BASE_BY_RARITY + FLEE_RATE_BY_RARITY (5 keys 1-5, base strictly decreasing, flee strictly increasing, all in [0,1]) + PITY_INCREMENT (0, 0.25] + RARITY_DISTRIBUTION summing to 100
result: pass
source: automated
coverage_id: 10-03:D2

### 21. hpFactor Pokemon-standard (3×max − 2×cur)/(3×max) — 1/3 at full HP, 2/3 at half, 1.0 at zero; 0 for hpMax <= 0; clamped [0,1]
expected: hpFactor Pokemon-standard (3×max − 2×cur)/(3×max) — 1/3 at full HP, 2/3 at half, 1.0 at zero; 0 for hpMax <= 0; clamped [0,1]
result: pass
source: automated
coverage_id: 10-03:D3

### 22. seed-sanguo.ts extension — FATAL-guarded base-stats load + 10-column clobber-safe upsert writing the dataset into the live dev DB idempotently (double-run stable, zero NULL columns, 6 starter rows present, typecheck green)
expected: seed-sanguo.ts extension — FATAL-guarded base-stats load + 10-column clobber-safe upsert writing the dataset into the live dev DB idempotently (double-run stable, zero NULL columns, 6 starter rows present, typecheck green)
result: pass
source: automated
coverage_id: 10-04:D2

### 23. startEncounterBattle — single-writer FOR UPDATE tx (travel + companion locks), F2 pending re-fetch, HERO_FAINTED/NO_PENDING_ENCOUNTER gates, crypto wild IV + seed(2**48), runBattle, sanguo_battles replay record ({player,enemy} input snapshot, seed, roundLogs, result), HP write-back (encounter only), win keeps the capture window open / loss escapes + travel resumes (Pitfall 7)
expected: startEncounterBattle — single-writer FOR UPDATE tx (travel + companion locks), F2 pending re-fetch, HERO_FAINTED/NO_PENDING_ENCOUNTER gates, crypto wild IV + seed(2**48), runBattle, sanguo_battles replay record ({player,enemy} input snapshot, seed, roundLogs, result), HP write-back (encounter only), win keeps the capture window open / loss escapes + travel resumes (Pitfall 7)
result: pass
source: automated
coverage_id: 10-05:D1

### 24. startSparBattle (D-17) — free practice vs a random real hero (crypto index pick), type 'spar' record with encounter_id NULL, NEVER writes HP back, never charges a fee; fainted companion blocks (same HERO_FAINTED gate); empty pool → NO_SPAR_POOL
expected: startSparBattle (D-17) — free practice vs a random real hero (crypto index pick), type 'spar' record with encounter_id NULL, NEVER writes HP back, never charges a fee; fainted companion blocks (same HERO_FAINTED gate); empty pool → NO_SPAR_POOL
result: pass
source: automated
coverage_id: 10-05:D3

### 25. skipEncounter (D-18) — retreat resolves the pending encounter 'skipped', clears encounterActive + pins updatedAt; the Redis cap window is never touched (cap counts roll hits, not resolutions)
expected: skipEncounter (D-18) — retreat resolves the pending encounter 'skipped', clears encounterActive + pins updatedAt; the Redis cap window is never touched (cap counts roll hits, not resolutions)
result: pass
source: automated
coverage_id: 10-05:D4

### 26. captureChance — base(rarity) × hpFactor × tierMultiplier + pity×PITY_INCREMENT, clamped [0,1] AFTER pity (strict); hpFactor Pokemon-standard; pity scales per D-11 (5pp per failure)
expected: captureChance — base(rarity) × hpFactor × tierMultiplier + pity×PITY_INCREMENT, clamped [0,1] AFTER pity (strict); hpFactor Pokemon-standard; pity scales per D-11 (5pp per failure)
result: pass
source: automated
coverage_id: 10-05:D5

### 27. attemptCapture — single-writer FOR UPDATE tx: F2 lock, server-side tier/fee (INVALID_TIER/TIER_LOCKED), locked-row chance (battle snapshot HP + heroes rarity + pity), wallet fee via deductBalance (reason 'sanguo_capture_t{n}', same tx), exact-chance crypto roll, pity increment + flee roll, ONE capture_attempts audit row per attempt (exact chance+roll+pity_before incl. failures), IV insert (hp = base HP, captured_zone snapshot), captured/fled transitions + travel resume; NO_PENDING_ENCOUNTER and INSUFFICIENT_BALANCE roll the whole tx back
expected: attemptCapture — single-writer FOR UPDATE tx: F2 lock, server-side tier/fee (INVALID_TIER/TIER_LOCKED), locked-row chance (battle snapshot HP + heroes rarity + pity), wallet fee via deductBalance (reason 'sanguo_capture_t{n}', same tx), exact-chance crypto roll, pity increment + flee roll, ONE capture_attempts audit row per attempt (exact chance+roll+pity_before incl. failures), IV insert (hp = base HP, captured_zone snapshot), captured/fled transitions + travel resume; NO_PENDING_ENCOUNTER and INSUFFICIENT_BALANCE roll the whole tx back
result: pass
source: automated
coverage_id: 10-05:D6

### 28. Battle log embed (D-07): ONE embed, description-only, ≤20 turn lines ≤ ~80 chars (formatTurnLine), SEASON for encounters / NEUTRAL for spar, win/loss resolution lines, embedFooter + setTimestamp, no hex literals
expected: Battle log embed (D-07): ONE embed, description-only, ≤20 turn lines ≤ ~80 chars (formatTurnLine), SEASON for encounters / NEUTRAL for spar, win/loss resolution lines, embedFooter + setTimestamp, no hex literals
result: pass
source: automated
coverage_id: 10-06:D1

### 29. Capture embed (D-09/D-12): view/success/fail/flee/retreat states with the exact 5 COLORS keys; the ONLY mechanic number rendered is the capture % via capture.chance (never-render contract)
expected: Capture embed (D-09/D-12): view/success/fail/flee/retreat states with the exact 5 COLORS keys; the ONLY mechanic number rendered is the capture % via capture.chance (never-render contract)
result: pass
source: automated
coverage_id: 10-06:D2

### 30. Button set + customId contract (D-01/D-10/D-18): BATTLE_START_ID/BATTLE_SKIP_ID/CAPTURE_OPEN_ID, CAPTURE_TIER_PREFIX/RETRY/RETREAT; customIds carry ONLY the tier (anti-tamper T-10-06-01); capture row = 3 tiers + 1 retreat in ONE ActionRow (T-10-06-05)
expected: Button set + customId contract (D-01/D-10/D-18): BATTLE_START_ID/BATTLE_SKIP_ID/CAPTURE_OPEN_ID, CAPTURE_TIER_PREFIX/RETRY/RETREAT; customIds carry ONLY the tier (anti-tamper T-10-06-01); capture row = 3 tiers + 1 retreat in ONE ActionRow (T-10-06-05)
result: pass
source: automated
coverage_id: 10-06:D3

### 31. battle.*/capture.*/cmd.battle.* i18n keys with identical structure across vi/en/zh-cn (check-i18n parity)
expected: battle.*/capture.*/cmd.battle.* i18n keys with identical structure across vi/en/zh-cn (check-i18n parity)
result: pass
source: automated
coverage_id: 10-06:D4

### 32. /sanguo battle spar command (D-17): NEUTRAL battle log + spar hint, NO capture button, HERO_FAINTED → battle.blocked_fainted DANGER embed; subcommand appended to map.ts
expected: /sanguo battle spar command (D-17): NEUTRAL battle log + spar hint, NO capture button, HERO_FAINTED → battle.blocked_fainted DANGER embed; subcommand appended to map.ts
result: pass
source: automated
coverage_id: 10-06:D5

### 33. Encounter battle + capture handler flow: handleBattleStart (win → Bắt row / loss → no buttons), handleCaptureTierPress (success/fail-no-flee WARNING+retry/retreat/flee/NO_PENDING_ENCOUNTER/INSUFFICIENT_BALANCE — every terminal state clears components, CR-09-03/04), retry re-renders the view, retreat resolves skipEncounter
expected: Encounter battle + capture handler flow: handleBattleStart (win → Bắt row / loss → no buttons), handleCaptureTierPress (success/fail-no-flee WARNING+retry/retreat/flee/NO_PENDING_ENCOUNTER/INSUFFICIENT_BALANCE — every terminal state clears components, CR-09-03/04), retry re-renders the view, retreat resolves skipEncounter
result: pass
source: automated
coverage_id: 10-06:D6

### 34. D-01 ack→battle inversion: travel.ts encounter branch renders fight/skip row; buildAckRow/handleAckPress removed; interactionCreate routes sanguo:battle:*/sanguo:capture:* BEFORE the chat-input gate and the ACK route is GONE (Pitfall 7); F4 abandoned-capture routing renders the capture view after a won battle
expected: D-01 ack→battle inversion: travel.ts encounter branch renders fight/skip row; buildAckRow/handleAckPress removed; interactionCreate routes sanguo:battle:*/sanguo:capture:* BEFORE the chat-input gate and the ACK route is GONE (Pitfall 7); F4 abandoned-capture routing renders the capture view after a won battle
result: pass
source: automated
coverage_id: 10-06:D7

### 35. Starter picker as the empty-collection state (D-14): exactly 3 starter buttons (set 1 Tào Tháo/Lưu Bị/Tôn Kiên) in ONE ActionRow with heroes.empty_title/body; starterViews increments on every empty invocation via a FOR UPDATE tx; 4th+ invocation (views >= 3) rotates to set 2 (Trương Giác/Viên Thiệu/Đổng Trác); no 4th option ever exists in set 1
expected: Starter picker as the empty-collection state (D-14): exactly 3 starter buttons (set 1 Tào Tháo/Lưu Bị/Tôn Kiên) in ONE ActionRow with heroes.empty_title/body; starterViews increments on every empty invocation via a FOR UPDATE tx; 4th+ invocation (views >= 3) rotates to set 2 (Trương Giác/Viên Thiệu/Đổng Trác); no 4th option ever exists in set 1
result: pass
source: automated
coverage_id: 10-07:D1

### 36. FREE starter grant (D-19 — the ONLY faucet): handleStarterPick inserts user_heroes with 6 crypto IVs each in [0,31], hp_current = base HP, captured_zone NULL, sets activeHeroId, resets starterViews; NO wallet call (grep gate == 0 + wallet-mock assertion); double-grant guarded by the in-tx empty re-check (T-10-07-01)
expected: FREE starter grant (D-19 — the ONLY faucet): handleStarterPick inserts user_heroes with 6 crypto IVs each in [0,31], hp_current = base HP, captured_zone NULL, sets activeHeroId, resets starterViews; NO wallet call (grep gate == 0 + wallet-mock assertion); double-grant guarded by the in-tx empty re-check (T-10-07-01)
result: pass
source: automated
coverage_id: 10-07:D2

### 37. Non-empty collection (TQC-13): one line per owned hero {{emoji}} {{name}} • {{stars}} • {{grade}}{{active}} with stars from heroes.tier, IV grade keys (STATE.md bands), exactly one ⭐ active badge; NO raw IV numbers and NO rarity in any embed data (D-12); 1-vs-many render the same line format; title count reflects the total
expected: Non-empty collection (TQC-13): one line per owned hero {{emoji}} {{name}} • {{stars}} • {{grade}}{{active}} with stars from heroes.tier, IV grade keys (STATE.md bands), exactly one ⭐ active badge; NO raw IV numbers and NO rarity in any embed data (D-12); 1-vs-many render the same line format; title count reflects the total
result: pass
source: automated
coverage_id: 10-07:D3

### 38. Zone filter (D-15): sanguo:heroes:zone select in its OWN ActionRow (CR-09-01), stable map_zones codes as values, per-locale zone labels; selecting a zone re-renders with the filtered count + zone label; unknown/empty values fall back to the FULL collection — never a crash (T-10-07-05); filtered-empty renders heroes.empty_filtered (never the starter picker)
expected: Zone filter (D-15): sanguo:heroes:zone select in its OWN ActionRow (CR-09-01), stable map_zones codes as values, per-locale zone labels; selecting a zone re-renders with the filtered count + zone label; unknown/empty values fall back to the FULL collection — never a crash (T-10-07-05); filtered-empty renders heroes.empty_filtered (never the starter picker)
result: pass
source: automated
coverage_id: 10-07:D4

### 39. Hero detail (D-16): ownership-gated fixed-field embed (emoji, per-locale name, stars, iv_grade key, base-only HP/MP, companion status label when active, 💀 fainted badge when hpCurrent=0); not-owned → hero.error DANGER with no stat leak; companion button disabled when already active; F9 duplicate disambiguation prefers the active copy
expected: Hero detail (D-16): ownership-gated fixed-field embed (emoji, per-locale name, stars, iv_grade key, base-only HP/MP, companion status label when active, 💀 fainted badge when hpCurrent=0); not-owned → hero.error DANGER with no stat leak; companion button disabled when already active; F9 duplicate disambiguation prefers the active copy
result: pass
source: automated
coverage_id: 10-07:D5

### 40. Companion switch (D-16/D-04): handleCompanionPress updates user_sanguo_state.activeHeroId inside a FOR UPDATE tx (ownership gate T-10-07-03, serialized T-10-07-06); already-active press is a no-op; non-owned / NaN heroId → hero.error; post-switch re-render shows the button disabled
expected: Companion switch (D-16/D-04): handleCompanionPress updates user_sanguo_state.activeHeroId inside a FOR UPDATE tx (ownership gate T-10-07-03, serialized T-10-07-06); already-active press is a no-op; non-owned / NaN heroId → hero.error; post-switch re-render shows the button disabled
result: pass
source: automated
coverage_id: 10-07:D6

### 41. Map SC5 current-position fix (TQC-13 SC5): /sanguo map current_position now comes from getCurrentPosition(user.id) — the player's real node with per-locale name — NOT rows[0]; zones content + node list unchanged; node-code fallback when the node row is missing
expected: Map SC5 current-position fix (TQC-13 SC5): /sanguo map current_position now comes from getCurrentPosition(user.id) — the player's real node with per-locale name — NOT rows[0]; zones content + node list unchanged; node-code fallback when the node row is missing
result: pass
source: automated
coverage_id: 10-07:D7

### 42. Router + wiring (TQC-13): heroes/hero subcommands registered on /sanguo (map.ts, the ONLY setName('sanguo') file — Pitfall 3); interactionCreate dispatches sanguo:heroes:zone (===) / sanguo:heroes:starter:* (prefix) / sanguo:hero:companion:* (prefix) BEFORE the chat-input gate, each try/catch + logger.error; SanguoComponentHandlers extended
expected: Router + wiring (TQC-13): heroes/hero subcommands registered on /sanguo (map.ts, the ONLY setName('sanguo') file — Pitfall 3); interactionCreate dispatches sanguo:heroes:zone (===) / sanguo:heroes:starter:* (prefix) / sanguo:hero:companion:* (prefix) BEFORE the chat-input gate, each try/catch + logger.error; SanguoComponentHandlers extended
result: pass
source: automated
coverage_id: 10-07:D8

### 43. i18n parity: heroes.*/hero.*/iv_grade.*/cmd.heroes.*/cmd.hero.* keys with identical structure across vi/en/zh-cn (check-i18n green)
expected: i18n parity: heroes.*/hero.*/iv_grade.*/cmd.heroes.*/cmd.hero.* keys with identical structure across vi/en/zh-cn (check-i18n green)
result: pass
source: automated
coverage_id: 10-07:D9

## Summary

total: 43
passed: 43
issues: 0
pending: 0
skipped: 0

## Gaps

- Boss mechanics to be REDESIGNED in Phase 11+ per the user's vision (Test 4 note, 2026-08-14): the current zone-scaled abstract template (sanguoBoss.ts, hero_id NULL / 'boss:zone', rarity-5 ~2× hero stats) is accepted only for Phase 10. The target design: **3v1 battle** — player fields 3 main generals (tương chủ lực) + 9 support generals (tướng hỗ trợ) vs a boss that is a **random general drawn from the zone** (like a normal encounter, NOT an abstract template); boss stats = **tier-2 (t2) with IV 100**. This also supersedes the Test-8 boss→heroes mapping question (a real hero row exists → capturable). Tracked in WINDOWS.md #5.
- Live UAT did not force a boss encounter (boss_rate default 0.07/zone is rare); boss battle + BOSS_CAPTURE_UNAVAILABLE + capture-after-boss-win remain covered by automated tests only (encounterService/battleCheckInService suites).

## CR Fixes Applied During Live UAT (2026-08-14)

| ID | Bug | Root cause | Fix |
|----|-----|-----------|-----|
| CR-10-01 | `/sanguo travel` → "Có lỗi khi bắt đầu hành trình" (NODE_NOT_FOUND) after Phase 10 deploy | `scripts/seed-sanguo.ts` full-deleted `map_nodes` every deploy → serial IDs shifted each reseed → any in-flight `player_travel_state` row (from_node_id/to_node_id) pointed at deleted nodes | Seed now deletes ONLY stale nodes (code not in the committed dataset); surviving codes keep their IDs via `onConflictDoUpdate(code)`. Edges/rates still fully re-derived. Verified node IDs stable (109–158) across two consecutive seed runs; counts unchanged. Affected journey (user 3) reset to START_NODE. Committed `d45f9fb`. |
| CR-10-02 | Deploy-blocking: `npm ci` failed (`Missing @esbuild/*@0.28.2 from lock file`) | package-lock.json omitted esbuild optional platform binaries | `npm install` reconciled 512 optional-dep entries; verified `rm -rf node_modules && npm ci` clean. Committed `093754f`. |
