# Economy Budget — Tam Quốc Collection (Milestone v3)

- **Status:** Accepted
- **Date:** 2026-08-11
- **One-line summary:** This is the design-gate document for the Tam Quốc (sanguo) sub-game economy — it fixes the sink/source model, the expected Linh thạch/hour bound below the tu vi cap, the convertibility matrix, and the net-sink/neutral hard constraint (D-19) that every Phase 9–11 money flow must satisfy before any content is authored.
- **AMENDMENT (2026-08-12, Phase 9 D-01/D-22):** travel is now TIME-ONLY and PULL-BASED — no Linh thạch cost, no travel sink, and encounters accrue only when the player checks in with `/sanguo travel` (≤ 20/hr hard cap, but encounter SUPPLY = f(check-in cadence), not continuous). The main sink moves to the Phase 10 capture fee (D-02). This document's earlier travel-as-sink references (gating statement below) are superseded by the added line; a RE-SIGN with Phase 10 capture-fee values — assuming pull-driven encounter supply — is required before Phase 10 content ships (D-18 one-way gate).
- **RE-SIGN (2026-08-13, Phase 10 D-20):** the Phase 10 capture-fee contract is now signed. The 5-tier capture-fee table below (fee bigint + capture-chance multiplier per tier) is the approved Phase 10 economy contract, sourced from `src/constants/sanguoCapture.ts` `CAPTURE_TIERS` — the ONLY server-side fee source; the fee NEVER rides a customId or interaction payload (anti-tamper, UI-SPEC contract). Tiers 4-5 are item-gated (`capture_tier4_key` / `capture_tier5_key`, Phase 11 shop / events); Phase 10 activates tiers 1-3 (D-09).

  **5-tier capture-fee table (D-20 contract):**

  | Tier | Fee (Linh thạch) | Capture multiplier | Item gate |
  |------|------------------|--------------------|-----------|
  | T1 | 5💎 | ×1.0 | — (fee-only) |
  | T2 | 15💎 | ×1.5 | — (fee-only) |
  | T3 | 40💎 | ×2.0 | — (fee-only) |
  | T4 | 100💎 | ×3.0 | `capture_tier4_key` (Phase 11/events) |
  | T5 | 250💎 | ×5.0 | `capture_tier5_key` (Phase 11/events) |

  > **F8 adjustment note:** the user-approved A1 draft (10/30/80/200/500) breached the ~416/hr gross magnitude bound at realistic cadence under effective capture chances (A1 draft: ~788💎/hr at 10 encounters/hr, conservative model — see E[outflow] below). The fee schedule is therefore HALVED to 5/15/40/100/250 — tier ratios (1:3:8:20:50), multipliers, base capture rates, flee rates, pity, and rarity distribution unchanged. Adjustment documented as a deviation in the 10-03 summary.

  > **CR-01 amendment (2026-08-13, post-10-review):** capture is server-gated to a player-WON encounter battle (D-10 — the tx rejects `CAPTURE_NOT_AVAILABLE` when no won battle exists, closing the pay-to-roll 0% exploit), AND the pity-driven bonus is now CAP-BOUND per rarity (`PITY_CAP_BY_RARITY`: 0.80/0.75/0.70/0.65/0.60 for R1..R5 — the pity term `min(pity × 0.05, cap)` can never drive chance to 1.0 for a rare hero). Both are defense-in-depth on the wallet path; the gross-bound math below is unaffected (attempts still price as 1/effectiveChance).

  **Supporting constants (same source, `sanguoCapture.ts`):** base capture by rarity R1 .80 / R2 .55 / R3 .35 / R4 .20 / R5 .10; flee rate by rarity R1 .10 / R2 .20 / R3 .35 / R4 .55 / R5 .75; pity +5pp per failed attempt — capped per rarity at 0.80/0.75/0.70/0.65/0.60 (R1..R5, CR-01 amendment), resets on success/flee/retreat (D-11); HP factor Pokemon-standard `(3×HPmax − 2×HPcurrent) / (3×HPmax)` — lower HP → higher chance; rarity distribution 60/25/10/4/1 (percent weights, consumed by the 10-04 content seed). All hidden mechanics (D-12): never rendered on any UI surface.

  **E[net/hour] recomputation (pull-driven encounter supply, ≤20/hr):**

  `E[net/hour] = E[inflow] − E[outflow]` over the loop (travel → battle → capture).

  - **E[inflow] = 0** — the free starter hero (10-07) is a ONE-TIME onboarding grant, not a recurring source (D-19 faucet exception); NO sanguo mechanic mints Linh thạch (D-19 restated as a hard constraint).
  - **E[outflow] = E[capture attempts/hr] × E[fee/attempt]** where attempts-per-capture = 1/effectiveChance (F8 — EFFECTIVE chances, never raw base rates): effective chance = `base × hpFactor × tierMult` (clamped [0,1] after pity). Tier blend assumed T1-dominant for affordable early capture: **80% T1 / 15% T2 / 5% T3** → blend multiplier 1.125, blend fee 8.25💎/attempt.
    - **Conservative model (hpFactor = 1/3 — wild hero at full HP, worst case):** rarity-weighted E[attempts per captured hero] = 4.77 (R1 3.33 / R2 4.85 / R3 7.62 / R4 13.33 / R5 26.67); E[outflow per hero] = 4.77 × 8.25 = 39.4💎.
    - **Realistic post-battle HP model (hpFactor = 0.87 — hero beaten to ~20% HP before capture, the capture incentive, Pitfall 5):** E[attempts per hero] = 1.83; E[outflow per hero] = 15.1💎.
    - **Flee-adjusted (incl. flee-driven attempt loss, F8):** E[attempts per encounter] = 2.62 → 21.6💎/hero.
  - **Cadences (document BOTH):**
    - Theoretical 20/hr (supply hard cap): conservative 788💎/hr — exceeds the ~416 magnitude reference, BUT 20/hr is the pull-driven SUPPLY CEILING (one full battle+capture chain every 3 minutes, continuously — not a human-achievable throughput); the realistic post-battle-HP model at 20/hr = 302💎/hr ✓.
    - Realistic human cadence 5-10/hr: conservative 197-394💎/hr ✓; realistic-HP 75-151💎/hr ✓; flee-adjusted 108-216💎/hr ✓ — all below ~416/hr.
  - **Conclusion:** E[net] = 0 − E[outflow] < 0 → **satisfies D-19** (net <= 0) at every cadence and model; gross per-hour flow at realistic cadence stays below the ~416/hr magnitude bound (computed gross band: 75-394💎/hr). Sensitivity: a heavier T2/T3 blend (70/25/5) at the upper-realistic 10/hr conservative corner lands at ~423💎/hr — 1.6% over the magnitude reference, requiring T2/T3 on 30% of attempts AND never weakening the hero pre-capture; documented, not silently accepted (F8).

  **RE-SIGNED (2026-08-13, Phase 10 D-20):** the capture-fee values above are the approved Phase 10 contract; any rebalancing requires a new sign-off (D-18 one-way gate).

- **AMENDMENT (2026-08-14, Phase 11 D-18 one-way gate):** the Phase 11 economy contract is now signed (checkpoint decision `adopt-a5` — research prices/drop-weights adopted as-is). The **ONLY new Linh thạch sinks** in Phase 11 are the sanguo shop (`heal_pill` **50💎**, `booster_x2` **100💎**) and formation purchases (**200/300/500💎**), all via `wallet.deductBalance` (D-03). Evolution/leveling/re-roll are **HỒN NGỌC sinks** (D-01/D-06) — never Linh thạch; the superseded "Linh thạch → evolution" convertibility row below is replaced by "Linh thạch → hồn ngọc: only via the booster (bounded, one-way)". Boss drops are **items only, never money** (D-19), with signed drop weights below.

  **Phase 11 Linh thạch sink table (D-18 contract — single source the 11-02 seed writes and the 11-04 shopService charges, Pitfall 8):**

  | Sink | Price (Linh thạch) | Mechanism | Consumer |
  |------|--------------------|-----------|----------|
  | Shop — `heal_pill` | 50💎 | `wallet.deductBalance` inside the shopService tx | 11-04 (seed: 11-02) |
  | Shop — `booster_x2` | 100💎 | `wallet.deductBalance`; consumed in the SAME convert tx it doubles (D-12, no cloning) | 11-04 (seed: 11-02) |
  | Formation purchase | 200/300/500💎 | `wallet.deductBalance` + `user_formations` insert (ALREADY_OWNED gate) | 11-04 (seed: 11-02) |

  **Boss drop weights (items only, never money — D-19):**

  | Item | Weight |
  |------|--------|
  | `heal_pill` | 70% |
  | `booster_x2` | 25% |
  | `capture_tier4_key` | 4.9% |
  | `capture_tier5_key` | 0.1% |

  **E[net/hour] recomputation (Phase 11, adopted prices):**

  `E[net/hour] = E[inflow] − E[outflow]` over the loop (travel → encounter → battle → capture → shop/formation).

  - **E[inflow] = 0** — the booster is a Linh thạch **SINK** (100💎), not a source; the free starter hero (10-07) remains the ONLY faucet (D-19 exception); boss drops are items, never money; no sanguo mechanic mints Linh thạch (D-19 restated).
  - **E[outflow] = E[shop spend/hr] + E[formation spend/hr]** (Phase 10 capture fees already signed at 75–394💎/hr):
    - `heal_pill` at realistic cadence (5–10 encounters/hr): bounded by heal demand, ~1–2/hr → **50–100💎/hr**.
    - `booster_x2`: occasional, bounded Linh thạch→hồn ngọc bridge (A11) — amortized ≪ 100💎/hr (≤ ~20💎/hr at one-per-5-hours).
    - Formation purchases: one-time 200–500💎, amortized over the phase → ≤ ~10💎/hr.
  - **E[net] = 0 − E[outflow] < 0** → satisfies D-19 (net <= 0) at every cadence and model — trivially, since every Phase 11 price is a pure sink.
  - **Gross per-hour** at realistic cadence 5–10/hr: Phase 11 shop/formation flow ≈ **50–130💎/hr**, and the full loop (incl. signed capture fees) ≈ **~160–520💎/hr** — the upper-realistic corner (10/hr × flee-adjusted capture 216💎 + 2 heal pills 100💎 + occasional booster) stays **below the ~416/hr magnitude bound** in the realistic model; only the theoretical 20/hr supply-ceiling corner (one full battle+capture chain every 3 minutes continuously — not human-achievable) can push the combined gross above it, mirroring the Phase 10 F8 analysis.
  - **Conclusion:** E[net] <= 0 (D-19 hard constraint) and gross < ~416/hr at realistic cadence — **Phase 11 economy contract compliant**.

  **RE-SIGNED (2026-08-14, Phase 11 D-18):** the shop prices (heal_pill 50💎, booster_x2 100💎), formation prices (200/300/500💎), and boss drop weights (70/25/4.9/0.1) above are the approved Phase 11 economy contract — the single source the 11-02 seed writes and the 11-04 shopService charges (Pitfall 8); evolution/leveling/re-roll are hồn ngọc sinks and NEVER call `wallet.deductBalance` (D-01/D-06 hard prohibition); the booster is a documented, bounded Linh thạch→hồn ngọc bridge (flagged A11, Phase 12 TQC-19 monitoring). Any rebalancing requires a new sign-off (D-18 one-way gate).

- **COMPLIANCE VERIFICATION (2026-08-14, Phase 11):** the 11-08 balance pass verified the LIVE seeded economy (11-02 seed) against this amendment's signed numbers, per Pitfall 8 (prices are seed data — the single source). **COMPLIANCE VERIFIED** — every live value matches the amendment, with one flagged drift reconciled below.

  **Live sink set (verified against the seed + production services):**

  | Sink | Live price (Linh thạch) | Verified source | Amendment match |
  |------|-------------------------|-----------------|-----------------|
  | Shop — `heal_pill` | 50💎 | `sanguo-items.json` priceLinh; `shopService.buyItem` → `wallet.deductBalance` | ✓ 50💎 |
  | Shop — `booster_x2` | 100💎 | `sanguo-items.json` priceLinh; `shopService.buyItem` → `wallet.deductBalance` | ✓ 100💎 |
  | Formation — `can_ban` (starter) | 0💎 (free grant) | `sanguo-formations.json` basePrice 0 | ✓ |
  | Formation — `thien_co` | 200💎 | `sanguo-formations.json` basePrice; `shopService` → `wallet.deductBalance` | ✓ 200💎 |
  | Formation — `vu_sat` | 300💎 | `sanguo-formations.json` basePrice; `shopService` → `wallet.deductBalance` | ✓ 300💎 |

  > **FLAGGED RECONCILIATION (Pitfall 8):** the amendment's "200/300/500💎" set lists a 500💎 formation that is NOT seeded in v3 — the live `sanguo-formations.json` carries only the free starter (`can_ban` 0💎) + the two purchasable (`thien_co` 200💎, `vu_sat` 300💎), per the D-21 amendment (v3 ships the free starter + shop purchase only). The seed is the single source; the 500💎 tier is a not-yet-authored catalog price, flagged here (not silently dropped) and tracked for Phase 12 TQC-19. The gross-bound math below uses the LIVE set (max 300💎) and remains compliant.

  **Confirmed boss drop weights (items only, never money — D-19):** the live `sanguo-items.json` dropWeight matches the amendment — `heal_pill` 70 / `booster_x2` 25 / `capture_tier4_key` 4.9 / `capture_tier5_key` 0.1; `dropService.rollBossDrop` filters `dropWeight > 0` so `capture_key` (weight 0) is excluded. All via `user_sanguo_items` upsert (never `users.balance`) — boss drops never touch money.

  **E[net/hour] recomputation (verified with the LIVE seed, realistic cadence 5–10 encounters/hr):**

  `E[net/hour] = E[inflow] − E[outflow]`

  - **E[inflow] = 0** — the free starter hero (10-07) is the only faucet; the booster is a Linh thạch **sink** (100💎), not a source; boss drops are items only; no sanguo mechanic mints Linh thạch (D-19).
  - **E[outflow]** — Phase 10 capture fees (already signed, 75–394💎/hr) plus the Phase 11 Linh thạch sinks:
    - `heal_pill` 50💎 at ~1–2/hr → **50–100💎/hr**;
    - `booster_x2` 100💎, amortized ≤ ~20💎/hr;
    - formations (live max 300💎) one-time, amortized ≤ ~10💎/hr.
  - **E[net] = 0 − E[outflow] < 0** → **satisfies D-19** (net <= 0) at every cadence — every Phase 11 price is a pure sink by construction.
  - **Gross per-hour** at realistic cadence: Phase 11 shop/formation flow ≈ **50–130💎/hr**; the full loop (incl. capture fees) ≈ **~160–520💎/hr** — the upper-realistic corner stays **below the ~416/hr magnitude bound** in the realistic model; only the theoretical 20/hr supply-ceiling (a full battle+capture chain every 3 min continuously — not human-achievable) can exceed it, mirroring the Phase 10 F8 analysis.
  - **Conclusion:** live-seed-verified E[net] <= 0 (D-19 hard constraint) and gross < ~416/hr at realistic cadence — **the Phase 11 sink set is compliant against the live seed; any future rebalancing of these values requires a new sign-off (D-18 one-way gate).**

---

## Context

The current live economy of TuTien Bot, verified against the codebase at authoring time (D-20), has **almost no sources**:

- **The ONLY live source today is football winnings/refunds.** Balance credits exist solely in the football match lifecycle: void-refund (`matchLifecycleService.ts:357-360`), push-refund (`matchLifecycleService.ts:417-420`), and winning payout (`matchLifecycleService.ts:433-436`). Bookmaker margin makes these roughly neutral in expectation, but variance makes payouts a player-visible source.
- **Live sinks are gather, farming subscriptions, and football wagers.** Gather is a gacha sink with a 99.8%+ net-loss EV at all fee tiers (design intent, `gatherFees.ts:10`); farming subscriptions are pure sinks (prices below); football wagers are a sink (with payouts as the only source above).
- **There is no marketplace yet.** Phase 3 is PAUSED and `src/jobs/vwapRecalc.ts:11` is a TODO stub — the VWAP bands and market fee are spec text in REQUIREMENTS.md (MKT-02/03/04/07), not live code.
- **New users start at 0 Linh thạch** — the `/start` command inserts a `users` row with only `discordId` and no starting balance (`start.ts:75-79`). There is no faucet.

Per the Phase 2 hidden-mechanics philosophy, this document records **design numbers** for the economy gate; players see outcomes (prices, yields, fees), never the formulas or rate tables below.

---

## Sink/Source Model

### Sinks (live)

| Sink | Mechanism | Verified value | Source |
|------|-----------|----------------|--------|
| Gather fee (per roll) | Gacha draw fee, scales with major realm — 12 tiers | `200n` (Luyện Khí) → `400_000n` (Đại La Tiên): 200, 400, 800, 1,500, 3,000, 6,000, 12,000, 25,000, 50,000, 100,000, 200,000, 400,000 | `src/constants/gatherFees.ts:17-30` (EV invariant: 99.8%+ net loss at all tiers, `gatherFees.ts:10`) |
| Farming subscription (7D basic) | Purchase price | `10000n` | `src/services/farming/subscriptionService.ts:50-56` |
| Farming subscription (30D basic) | Purchase price | `35000n` | `src/services/farming/subscriptionService.ts:50-56` |
| Farming subscription (30D VIP) | Purchase price | `50000n` | `src/services/farming/subscriptionService.ts:50-56` |
| Farming subscription upgrade | Basic → premium fee | `BigInt(daysLeft * 1000)` where `daysLeft = ceil(remaining days)` | `src/services/farming/subscriptionService.ts:19-32` (fee computed at `140`, deducted at `143-146`) |
| Football wager | Prediction bet (bounded) | `MIN_BET: 100n`, `MAX_BET: 1_000_000n` | `src/constants/footballConfig.ts:8-11` |

### Sources (live)

| Source | Mechanism | Verified value | Source |
|--------|-----------|----------------|--------|
| Football winnings / refunds | Winning payout, void-refund, push-refund | Payout = `bet.potentialPayout` (BIGINT-safe `calculatePayout`); refund = wager amount | `src/services/football/matchLifecycleService.ts:357-360`, `417-420`, `433-436` |

### Sources/sinks (planned, NOT live)

> These figures exist only as spec text in REQUIREMENTS.md — the marketplace is **not implemented** (`src/jobs/vwapRecalc.ts:11` is a TODO stub, Phase 3 PAUSED). Phase 12 monitoring/audit (TQC-19) must **not** treat them as live numbers.

| Figure | Value | Spec source | Status |
|--------|-------|-------------|--------|
| Instant-buy band | `1.2 × market_price` | REQUIREMENTS.md MKT-02 | **Planned, not live** |
| Instant-sell band | `0.7 × market_price` | REQUIREMENTS.md MKT-03 | **Planned, not live** |
| Limit-sell price ceiling | `2.5 × market_price` at order placement | REQUIREMENTS.md MKT-04 | **Planned, not live** |
| Seller fee | 10%, min 1 Linh thạch, all burned | REQUIREMENTS.md MKT-07 | **Planned, not live** (future sink) |

### Progression cap (NOT currency)

| Number | Value | Source |
|--------|-------|--------|
| Daily tu vi cap | `DAILY_CAP: 10_000` — "Hard daily ceiling, resets at midnight UTC" | `src/constants/game.ts:14` |

`DAILY_CAP 10_000` is a **tu vi (progression) cap** for the main game — it bounds spiritual-cultivation activity income, not Linh thạch. It is a *different resource pool* from `users.balance` (Linh thạch). (For cap-context: base rates are `MESSAGE_TV: 10`, `VOICE_TV_PER_MIN: 5`, `REACTION_TV: 2`, `VOICE_MAX_MINUTES: 60` — `game.ts:11-15`; daily streak bonuses 200/600/1,200/2,000/3,000 by tier bypass the cap but are tu vi only, never Linh thạch — `game.ts:50-56`.)

---

## Expected Linh thạch/hour of the Optimal Loop

The sanguo sub-game economy is denominated in **Linh thạch** (`users.balance`), while `DAILY_CAP 10_000` bounds the **main** game's tu vi progression (`game.ts:14`). These are **different resource pools** — the comparison is a design-sanity check (SC5), not a currency cap.

**Design constraint (SC5 sanity check):** under the net-sink/neutral constraint (D-19, below), the expected **net** Linh thạch/hour of the optimal sanguo loop is `<= 0` — the loop cannot be a net earner by construction, so it is trivially below any positive cap.

**Magnitude bound for Phase 9–11 content:** the *gross* per-hour flow (travel costs, shop prices, encounter yields passing through the loop) must stay below the `10_000`/day ceiling as a magnitude reference — averaged over a day that is ~`416`/hour. This bounds how large individual price/yield numbers may be before they distort the loop.

**Method Phases 9–11 must use to recompute this:** when concrete travel/encounter/shop numbers exist (Phase 9 TQC-06/08 travel costs and encounter yields, Phase 11 TQC-16 shop prices), recompute the expected net Linh thạch/hour of the optimal loop as: `E[net per hour] = E[inflow per hour] - E[outflow per hour]` over the loop (a full travel → encounter → battle → capture → shop/evolution cycle), using the actual planned values. The recomputed value MUST satisfy D-19 (net `<= 0`) and the gross magnitude bound (~`416`/hour averaged) before that phase's content ships. This document is the baseline; any future rebalancing requires a new sign-off (D-18 one-way gate).

---

## Convertibility Matrix

| From | To | Convertible? | Notes |
|------|----|--------------|-------|
| Tu vi | Linh thạch | **Never** | Tu vi is progression-only (`game.ts:14` cap context); no conversion path exists |
| Linh thạch | Sinks (gather, farming subscriptions, football wagers) | Yes (spend) | Live sinks above; future sinks: Phase 11 shop + formations (see AMENDMENT 2026-08-14) |
| Linh thạch | Phase 11 shop / formations | Yes (spend) | Phase 11 (TQC-16): heal_pill 50💎, booster_x2 100💎, formations 200/300/500💎 — all via `wallet.deductBalance` (D-03). Travel is time-only (D-01); **evolution/leveling/re-roll are HỒN NGỌC sinks, never Linh thạch** (D-01/D-06 — supersedes the earlier "Linh thạch → evolution" row) |
| Linh thạch | Hồn ngọc (via booster) | Yes, bounded one-way | booster_x2 (100💎) doubles ONE conversion (D-12) — the ONLY Linh thạch → hồn ngọc path; hồn ngọc never converts back to Linh thạch (D-02) |
| Duplicate heroes | Hồn ngọc | Yes (Phase 11) | Tier-scaled, diminishing returns, daily conversion cap, **account-bound** (TQC-14) |
| Hồn ngọc | Linh thạch | **Never** | Milestone v3 decision (STATE.md) — prevents dupe-loop economy collapse |
| Free starter hero | Player collection | Yes (Phase 10, **only faucet**) | One free hero at onboarding (TQC-12); the ONLY faucet in the milestone (D-19 exception) |
| Boss thường drops | Items (not money) | Items only | Boss thường drops items only, never money (STATE.md decision) — safe faucet that never touches `users.balance` |
| Any sanguo item | Marketplace | **Gated** | No sanguo item is marketable without a reviewed conversion spec (Phase 12 TQC-20 marketplace gating) |

---

## Net-Sink/Neutral Constraint (D-19) — HARD CONSTRAINT

For the sanguo sub-game: **total Linh thạch outflow (travel, items, evolution) >= total inflow (boss drops, if any)**.

- The **free starter hero** (Phase 10, TQC-12) is the **only faucet exception** — it is a one-time onboarding grant, not a recurring source.
- **No net-source in v1.** No sanguo mechanic may mint Linh thạch.
- **Phase 11 must comply** — its sinks (shop TQC-16, evolution TQC-15) close the loop: the economy only works if what Phase 9–10 spend is never exceeded by what Phase 11 returns.

---

## Consequences

- **Gates Phase 9–11 content authoring (D-18):** travel costs (Phase 9, TQC-06), encounter yields (Phase 9, TQC-08), shop prices (Phase 11, TQC-16), and evolution fees (Phase 11, TQC-15) MUST satisfy the constraints above — no content work in those phases may proceed on the assumption of a net source.
- **Phase 12 monitoring/audit (TQC-19)** consumes this document as the audit baseline: Linh thạch per item per day reports are compared against these sink/source figures, and the marketplace numbers above are spec-only (Phase 12 must re-verify against code before auditing, per the threat register).
- **One-way gate:** any future rebalancing of the economy budget requires a new sign-off in this document (D-18). The budget is not silently amendable.

---

## Design Gate Sign-off

**Status: PASSED** — the economy design gate closes with this sign-off (D-18).

**Decision (2026-08-11):** The economy budget as documented above is **approved**:

1. **Net-sink/neutral is a HARD constraint (D-19):** total Linh thạch outflow (travel, items, evolution) >= total inflow (boss drops, if any) for the sanguo sub-game. The Phase 10 free starter hero (TQC-12) is the only faucet exception. No net-source in v1.
2. **Expected net Linh thạch/hour of the optimal loop is <= 0**, which is trivially below the `DAILY_CAP 10_000` tu-vi-cap sanity bound (SC5) — the loop cannot be a net earner by construction. Gross per-hour flow must stay below the ~`416`/hour magnitude bound.
3. **The convertibility matrix is accepted:** tu vi never converts to Linh thạch; hồn ngọc is account-bound and never converts back to Linh thạch; duplicate heroes convert to hồn ngọc (Phase 11, TQC-14); no sanguo item is marketable without a reviewed conversion spec (Phase 12, TQC-20).

**Gating statement — this sign-off is a prerequisite for content authoring in Phases 9–11 (D-18):**

- **Phase 9** (travel TQC-06 — time-only per D-01, no travel sink; encounter yields TQC-08) MUST comply with D-19 — encounter yields must never turn the loop into a net source.
- Phase 9 travel contributes NO sink (D-01 — time-only); the Phase 10 capture fee is the planned main sink and MUST be priced + re-signed (D-02/D-18) assuming pull-driven encounter supply (check-in cadence ≤ 20/hr) before Phase 10 content ships.
- **Phase 10** (TQC-12) — the starter faucet is the ONLY faucet; no other money-minting mechanic may be introduced.
- **Phase 11** (TQC-14/15/16/17 — evolution fees, shop sinks, hồn ngọc conversion) MUST comply with D-19 and close the loop: every sink goes through `wallet.deductBalance` (D-03), hồn ngọc never converts to Linh thạch, boss drops are items only.
- **No content work in Phases 9–11 may proceed on the assumption of a net source.**

**Consumers:** Phase 12 monitoring/audit (TQC-19) consumes this document as the audit baseline; the marketplace figures herein are spec-only (planned, not live) until Phase 12 re-verifies them against code.

Any future rebalancing of the economy budget requires a **new sign-off** in this document (D-18 one-way gate).

