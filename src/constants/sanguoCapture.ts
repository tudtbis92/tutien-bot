/**
 * Sanguo capture constants — the single server-side capture config (D-09).
 *
 * 5-tier capture fee model (D-09): each tier has a fee + a capture-chance
 * multiplier. Phases 10-11 activate tiers 1-3; tiers 4-5 unlock ONLY when the
 * player holds the requiresItem (Phase 11 shop / events) — the engine and
 * schema model all 5 tiers from day one.
 *
 * CONTRACT: these values are signed into docs/economy-budget.md
 * (RE-SIGN 2026-08-13, Phase 10 D-20) — the fee table below is the D-20
 * economy contract. Any rebalancing requires a NEW economy sign-off (D-18
 * one-way gate). NOTE (P10-review F8): the fee schedule is the A1 draft
 * (10/30/80/200/500) HALVED to 5/15/40/100/250 — the A1 draft breached the
 * ~416/hr gross magnitude bound at realistic cadence under effective capture
 * chances; the ratios (1:3:8:20:50) and all capture multipliers are preserved.
 *
 * ANTI-TAMPER (UI-SPEC / Pitfall 3): the capture fee NEVER rides the customId
 * or the interaction payload — `sanguo:capture:tier:{n}` carries only the tier
 * number; fee + multiplier resolve server-side from CAPTURE_TIERS inside the
 * capture transaction. A crafted customId cannot change the price.
 *
 * HIDDEN MECHANICS (D-12): this module is NEVER rendered. No tier multiplier,
 * flee %, pity increment, base capture rate, or rarity distribution may appear
 * in any UI surface — the config file is a server-side constant only.
 */

export interface CaptureTier {
  /** Tier number (1-5). The only value that crosses the UI boundary. */
  tier: number;
  /** Fee in Linh thạch — bigint to match users.balance (walletTransactions.ts:17). */
  fee: bigint;
  /** Capture-chance multiplier for this tier (multiplies the base rarity chance). */
  multiplier: number;
  /** Item code gate for tiers 4-5 (Phase 11/events); null = fee-only tier. */
  requiresItem: string | null;
}

/**
 * The 5 capture tiers (D-09). Tiers 1-3 are active in Phase 10; tiers 4-5 are
 * item-gated (requiresItem) and unlock via special items (Phase 11/events).
 * Fee + multiplier strictly ascending per tier. D-20 signed values.
 */
export const CAPTURE_TIERS: readonly CaptureTier[] = [
  { tier: 1, fee: 5n, multiplier: 1.0, requiresItem: null },
  { tier: 2, fee: 15n, multiplier: 1.5, requiresItem: null },
  { tier: 3, fee: 40n, multiplier: 2.0, requiresItem: null },
  { tier: 4, fee: 100n, multiplier: 3.0, requiresItem: 'capture_tier4_key' },
  { tier: 5, fee: 250n, multiplier: 5.0, requiresItem: 'capture_tier5_key' },
] as const;

/**
 * Base capture chance per rarity (1-5, strictly decreasing — rarer is harder,
 * D-08). Multiplied by hpFactor × tier multiplier + pity, clamped [0,1]
 * (RESEARCH Pattern 2; clamp AFTER pity).
 */
export const CAPTURE_BASE_BY_RARITY: Readonly<Record<number, number>> = {
  1: 0.8,
  2: 0.55,
  3: 0.35,
  4: 0.2,
  5: 0.1,
};

/**
 * Flee chance per rarity (1-5, strictly increasing — rarer flees more, D-10).
 * Fired ONCE per failed capture attempt; flee resolves the encounter.
 */
export const FLEE_RATE_BY_RARITY: Readonly<Record<number, number>> = {
  1: 0.1,
  2: 0.2,
  3: 0.35,
  4: 0.55,
  5: 0.75,
};

/** Pity: +5pp capture chance for the NEXT attempt after each failure (D-11). */
export const PITY_INCREMENT = 0.05;

/**
 * Rarity distribution — percent weights per rarity (60/25/10/4/1). Consumed by
 * the 10-04 content seed distribution and the D-20 economy re-sign.
 */
export const RARITY_DISTRIBUTION: Readonly<Record<number, number>> = {
  1: 60,
  2: 25,
  3: 10,
  4: 4,
  5: 1,
};

/**
 * Pokemon-standard HP factor (Bulbapedia Gen III-V): lower current HP -> higher
 * capture chance. `(3×hpMax − 2×hpCurrent) / (3×hpMax)`, 0 for hpMax <= 0,
 * clamped to [0,1] (RESEARCH:432). Battle performance directly feeds capture
 * odds (Pitfall 5).
 */
export function hpFactor(hpMax: number, hpCurrent: number): number {
  if (hpMax <= 0) return 0;
  const factor = (3 * hpMax - 2 * hpCurrent) / (3 * hpMax);
  return Math.min(1, Math.max(0, factor));
}
