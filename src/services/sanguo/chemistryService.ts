/**
 * Sanguo chemistry service — the PURE link -> points -> level -> buff
 * computation (CR-11-09, 2026-08-18 — the POSITION-BASED redesign).
 *
 * The chemistry mechanic is now TWO-STAGE (EA FC-style, user-specified):
 *   1. POSITION GATE: two heroes only form a chemistry pair if they sit in two
 *      slots connected by the formation's chemistry link edge
 *      (formation_chemistry_links). A hero aggregates chemistry from ALL its
 *      linked neighbors that are filled (each slot links to 1-3 others).
 *   2. RELATIONSHIP (unchanged from Phase 11): the PAIR's chemistry points =
 *      the strongest single relationship — family/spouse 3, faction 2, role 1.
 *
 * A hero's total points = the SUM over its active linked neighbors. Points map
 * to a chemistry LEVEL (bậc) 0-3, capped at 3:
 *   0 points -> level 0 (+0)
 *   1-2      -> level 1 (+2 stat)
 *   3-4      -> level 2 (+7 stat, cumulative)
 *   5+       -> level 3 (+17 stat, cumulative +2+5+10)
 * The buff is ADDITIVE on the three PRIMARY combat stats (STR/AGI/INT) only
 * (user decision, 2026-08-18).
 *
 * Pure module (D-06 discipline): NO db/redis/discord imports, NO Math.random,
 * NO Date — chemistry is a deterministic function of the formation link graph +
 * the assigned heroes' relationship data. HIDDEN MECHANICS (D-12): points and
 * buff % NEVER render — only the LEVEL label + the active link COUNT render.
 */
import { CHEMISTRY_POINTS, CHEMISTRY_LEVEL_THRESHOLDS, CHEMISTRY_STAT_BUFF } from '../../constants/sanguoChemistry.js';

/** A hero's chemistry-relevant identity (heroes.faction_id / role / family_id). */
export interface ChemistryLinkInput {
  factionId: number;
  role: string;
  familyId: number | null;
}

/** The neighbor's link identity + the spouse flag (hero_relations spouse). */
export interface NeighborLinkInput extends ChemistryLinkInput {
  /** True when this neighbor is the hero's DIRECT spouse (tier-1, family-equal). */
  spouseOfHero: boolean;
}

/** CR-11-09: the points thresholds for each chemistry level (bậc) 0-3
 *  (re-export of the single-source constant). */
export const CHEMISTRY_LEVELS = CHEMISTRY_LEVEL_THRESHOLDS;

/** CR-11-09: the CUMULATIVE additive stat buff per level (re-export). */
export const CHEMISTRY_STAT_BUFF_TABLE = CHEMISTRY_STAT_BUFF;

/**
 * Per-PAIR chemistry points between a hero and ONE linked neighbor — the
 * strongest SINGLE relationship (FIRST-MATCH, PLAN-FIX P1-3): spouseOfHero OR
 * exact family_id -> family (3) and STOP; else exact faction_id -> faction (2)
 * and STOP; else exact role -> role (1) and STOP; else 0. A single pair NEVER
 * contributes a sum of multiple link types. Values from CHEMISTRY_POINTS.
 */
export function pairChemistryPoints(hero: ChemistryLinkInput, neighbor: NeighborLinkInput): number {
  if (
    neighbor.spouseOfHero ||
    (hero.familyId !== null && neighbor.familyId === hero.familyId)
  ) {
    return CHEMISTRY_POINTS.family;
  }
  if (neighbor.factionId === hero.factionId) {
    return CHEMISTRY_POINTS.faction;
  }
  if (neighbor.role === hero.role) {
    return CHEMISTRY_POINTS.role;
  }
  return 0;
}

/**
 * Map a hero's TOTAL chemistry points (summed over its active linked
 * neighbors) to its chemistry LEVEL 0-3 (capped — max 3 bậc regardless of how
 * many points accumulate, CR-11-09).
 */
export function chemistryLevel(points: number): 0 | 1 | 2 | 3 {
  for (const row of CHEMISTRY_LEVELS) {
    if (points >= row.min) return row.level;
  }
  return 0;
}

/**
 * CR-11-09: apply the ADDITIVE chemistry stat buff to one of the three primary
 * combat stats (STR/AGI/INT). buff = CHEMISTRY_STAT_BUFF[level] (0/2/7/17).
 * The additive value rides on the FINAL combatStat (base×tier + IV + levelGain).
 */
export function applyChemistryBuff(stat: number, level: 0 | 1 | 2 | 3): number {
  return stat + CHEMISTRY_STAT_BUFF[level];
}

/** Back-compat alias (Phase 11 tests used tier → buff). Keep the old
 *  multiplicative contract name mapped to the new additive one so balance-pass
 *  tests only touch the constant table. Deprecated — new callers use
 *  CHEMISTRY_STAT_BUFF directly. */
export function chemistryBuffForLevel(level: 0 | 1 | 2 | 3): number {
  return CHEMISTRY_STAT_BUFF[level];
}

/** D-18: LEA-driven support-effect trigger chance — clamp(0.15 x (1 + (lea-10)
 *  x 0.02), 0.05, 0.35). Unchanged (Phase 8 stat definition). */
export function supportTriggerChance(lea: number): number {
  return Math.min(0.35, Math.max(0.05, 0.15 * (1 + (lea - 10) * 0.02)));
}
