# Economy Budget — Tam Quốc Collection (Milestone v3)

- **Status:** Accepted
- **Date:** 2026-08-11
- **One-line summary:** This is the design-gate document for the Tam Quốc (sanguo) sub-game economy — it fixes the sink/source model, the expected Linh thạch/hour bound below the tu vi cap, the convertibility matrix, and the net-sink/neutral hard constraint (D-19) that every Phase 9–11 money flow must satisfy before any content is authored.

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
| Linh thạch | Sinks (gather, farming subscriptions, football wagers) | Yes (spend) | Live sinks above; future sinks: travel, shop, evolution |
| Linh thạch | Future travel / shop / evolution | Yes (spend) | Phase 9 (travel, TQC-06), Phase 11 (shop/evolution, TQC-16/TQC-15) — all must go through `wallet.deductBalance` (D-03) |
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

- **Phase 9** (travel costs TQC-06, encounter yields TQC-08) MUST comply with D-19 — travel prices are sinks, encounter yields must never turn the loop into a net source.
- **Phase 10** (TQC-12) — the starter faucet is the ONLY faucet; no other money-minting mechanic may be introduced.
- **Phase 11** (TQC-14/15/16/17 — evolution fees, shop sinks, hồn ngọc conversion) MUST comply with D-19 and close the loop: every sink goes through `wallet.deductBalance` (D-03), hồn ngọc never converts to Linh thạch, boss drops are items only.
- **No content work in Phases 9–11 may proceed on the assumption of a net source.**

**Consumers:** Phase 12 monitoring/audit (TQC-19) consumes this document as the audit baseline; the marketplace figures herein are spec-only (planned, not live) until Phase 12 re-verifies them against code.

Any future rebalancing of the economy budget requires a **new sign-off** in this document (D-18 one-way gate).

