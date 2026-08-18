/**
 * Sanguo chemistry constants — the hidden chemistry balance contract (D-19,
 * EA FC-grounded). Links -> points -> tier -> buff: each matching link type
 * adds fixed points (family + spouse are tier-1 strongest, faction mid, role
 * weakest — Phase 8 locked hierarchy); each main's point sum maps to a
 * chemistry tier whose % buff multiplies the main's combat stats.
 *
 * CONTRACT: these values are the chemistry balance contract (RESEARCH Pattern
 * 2, flagged assumption A3 — signed 2026-08-14). The chemistry service
 * (11-05) computes per-main points and tier; the buff is pre-baked into the
 * mains' CombatantInput BEFORE runLegionBattle so the sanguo_battles.input
 * snapshot stays replay-faithful (D-06). The 11-08 balance pass may tune the
 * point values / thresholds / buff percentages — the tier LABEL set
 * (S/A/B/C/D) is UI-SPEC-locked and never changes.
 *
 * HIDDEN MECHANICS (D-12): this module is NEVER rendered. Chemistry points
 * and buff % must never reach a UI surface — only the tier LABEL and the
 * link COUNT render (UI-SPEC D-19 contract).
 *
 * BONUS-ONLY (EA FC 0-chemistry grounding): 0 links -> no tier, no penalty.
 * A main with zero matching supports fights at base stats.
 *
 * STRICT CLASS-MATCH (D-20): a hero contributes chemistry/support ONLY when
 * placed in a slot matching their class — wrong slot = zero contribution.
 * The point tables here assume class-matched slots only.
 */

/** D-19: points awarded per matching relationship between a PAIR of heroes
 *  (family/spouse 3, faction 2, role 1 — EA FC-style, unchanged). The pair's
 *  STRONGEST single relationship counts (first-match, never summed). */
export const CHEMISTRY_POINTS: Readonly<Record<'family' | 'spouse' | 'faction' | 'role', number>> = {
  family: 3,
  spouse: 3,
  faction: 2,
  role: 1,
};

/** CR-11-09: chemistry LEVEL (bậc) thresholds — a hero's TOTAL points (summed
 *  over its active linked neighbors) map to a level 0-3, capped at 3. The
 *  thresholds are 1-2 → L1, 3-4 → L2, 5+ → L3 (user-signed 2026-08-18). */
export const CHEMISTRY_LEVEL_THRESHOLDS: readonly { min: number; level: 0 | 1 | 2 | 3 }[] = [
  { min: 5, level: 3 },
  { min: 3, level: 2 },
  { min: 1, level: 1 },
  { min: 0, level: 0 },
] as const;

/** CR-11-09: the CUMULATIVE additive stat buff per chemistry level, applied to
 *  the three primary combat stats (STR/AGI/INT) only. Index = level:
 *  L0 +0, L1 +2, L2 +7 (+2+5), L3 +17 (+2+5+10). User-signed 2026-08-18. */
export const CHEMISTRY_STAT_BUFF: readonly number[] = [0, 2, 7, 17] as const;

