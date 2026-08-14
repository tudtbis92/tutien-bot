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

/** D-19: points awarded per matching link type (main<->support pairs only,
 *  D-17 — supports never link to each other; they buff, not fight). */
export const CHEMISTRY_POINTS: Readonly<Record<'family' | 'spouse' | 'faction' | 'role', number>> = {
  family: 3,
  spouse: 3,
  faction: 2,
  role: 1,
};

/** D-19: chemistry tier table — a main's total link points -> tier -> buff.
 *  Strictly descending `min` thresholds (S first, 0 last) with strictly
 *  ascending buffs. The final min-0 entry is the bonus-only floor: label
 *  null (no tier line rendered) and buff 0 (no penalty, EA FC grounding).
 *  Buff is MULTIPLICATIVE on the final combatStat:
 *  (base + IV + levelGain) x (1 + buff). */
export const CHEMISTRY_TIERS: readonly { min: number; label: string | null; buff: number }[] = [
  { min: 12, label: 'S', buff: 0.1 },
  { min: 8, label: 'A', buff: 0.08 },
  { min: 5, label: 'B', buff: 0.06 },
  { min: 3, label: 'C', buff: 0.04 },
  { min: 1, label: 'D', buff: 0.02 },
  { min: 0, label: null, buff: 0 },
] as const;
