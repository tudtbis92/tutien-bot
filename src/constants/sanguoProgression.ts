/**
 * Sanguo progression constants — the hidden balance contract (D-05/D-06/D-07/
 * D-08/D-09/D-32). The single server-side source for the hồn ngọc level
 * curve, flat per-level stat gain, evolution tier multipliers, evolution
 * costs, and the skill re-roll cost.
 *
 * CONTRACT: these values are the Phase 11 balance contract (RESEARCH Pattern
 * 1, flagged assumptions A1/A2 — signed 2026-08-14). Every service consumes
 * them: level-up (11-03 soulgemService) reads LEVEL_COST for the level button
 * label and the deductHonNgoc charge; the battleEngine level term (11-05)
 * reads STAT_GAIN_PER_LEVEL; the legion builder (11-06) applies
 * TIER_MULTIPLIERS to each main's base stats; evolution (11-03) charges
 * EVOLUTION_COSTS; the skill re-roll (11-03) charges REROLL_COST. The 11-08
 * balance pass re-sanitizes these numbers against the seeded stat ranges —
 * never the D-05 fight formula (locked).
 *
 * NET-SINK (D-19): every cost here is a HỒN NGỌC sink — hồn ngọc is
 * account-bound per hero and NEVER converts to Linh thạch (D-02); these
 * values never touch wallet.deductBalance.
 *
 * HIDDEN MECHANICS (D-12): this module is NEVER rendered. No curve value,
 * stat gain, tier multiplier, or cost may appear in any UI surface except the
 * spendable hồn ngọc costs themselves (the level button label, the evolve
 * confirmation, the re-roll price). Base stats and multipliers never render.
 */

/** D-05: hồn ngọc cost to level from `level` to `level + 1` (level 1..99).
 *  Accelerating curve 1 + floor((level-1)^2/200) — L1->2 = 1, L1->21 ≈ 27,
 *  L1->51 ≈ 264, L1->100 ≈ 1741. IDENTICAL across tiers by construction:
 *  the cost is a pure function of level (evolution never inflates leveling). */
export const LEVEL_COST = (level: number): number => 1 + Math.floor((level - 1) ** 2 / 200);

/** D-08: flat per-level gain added to each of the 6 battle stats
 *  (str/agi/int/mov/lea/cha). combatStat = base + IV + (level-1) x GAIN.
 *  HP/MP stay base-only (D-05). */
export const STAT_GAIN_PER_LEVEL = 2 as const;

/** D-07: evolution tier multipliers applied to all 8 base stats
 *  (Pokémon Go-style boost). t0 1.0 / t1 1.1 / t2 1.25 / t3 1.5 — strictly
 *  increasing; evolution is a power boost, never a sidegrade. */
export const TIER_MULTIPLIERS: Readonly<Record<number, number>> = {
  0: 1.0,
  1: 1.1,
  2: 1.25,
  3: 1.5,
};

/** D-06/D-09: hồn ngọc cost to evolve INTO tier 1/2/3 (t0->t1 20, t1->t2 50,
 *  t2->t3 100). Level gates: t1 needs L20, t2 needs L50, t3 needs L80+ AND an
 *  event-item gate (unreachable in v3 by design). */
export const EVOLUTION_COSTS: Readonly<Record<number, number>> = {
  1: 20,
  2: 50,
  3: 100,
};

/** D-32: hồn ngọc cost to re-roll ONE skill slot (Pokémon Go TM-style). */
export const REROLL_COST = 10 as const;

/** D-01: hard level cap — max level for any hero copy. */
export const MAX_LEVEL = 100 as const;
