import { CHEMISTRY_POINTS, CHEMISTRY_TIERS } from '../../constants/sanguoChemistry.js';

/**
 * Sanguo chemistry service — the PURE link -> points -> tier -> buff
 * computation (D-19, EA FC-grounded). Pure module (D-06 discipline, analog:
 * encounterService.ts): NO db/redis/discord imports, NO Math.random, NO Date —
 * chemistry is a deterministic function of the legion slots + hero reference
 * data (faction/family/role/spouse), never a roll.
 *
 * PRECOMPUTE CONTRACT (Pitfall 6, T-11-05-03): chemistry is computed BEFORE
 * the battle engine — the buffed mains are PRE-BAKED into their CombatantInput
 * so the sanguo_battles.input snapshot stays replay-faithful. runLegionBattle
 * never recomputes chemistry (structure, not convention).
 *
 * HIDDEN MECHANICS (D-12): chemistry points and buff % NEVER render. Only the
 * tier LABEL and the link COUNT render (11-07 UI-SPEC).
 *
 * FIRST-MATCH scoring (PLAN-FIX P1-3, locked — 2026-08-14): a single support
 * contributes the strongest SINGLE link it shares with the main — spouse/family
 * 3 > faction 2 > role 1, else 0 — never a sum of multiple link types (a
 * same-family AND same-faction support scores 3, not 5). The S/A/B/C/D
 * thresholds in sanguoChemistry.ts are calibrated on this (max per main = 9
 * supports x 3 = 27).
 *
 * STRICT CLASS-MATCH (D-20): enforced at assembly time (legionService, 11-07)
 * — a wrong-class hero contributes zero chemistry and zero support effect;
 * this module is class-agnostic (it receives the already-validated slots).
 */

/** A hero's chemistry-relevant identity — the columns mainChemistryPoints
 *  reads from the hero's reference data (heroes.faction_id / role /
 *  family_id). */
export interface ChemistryLinkInput {
  factionId: number;
  role: string;
  familyId: number | null;
}

/** A support hero's link identity + the spouse flag (hero_relations
 *  type='spouse', tier-1 equal to family). */
export interface SupportLinkInput extends ChemistryLinkInput {
  /** True when this support is the main's DIRECT spouse — the undirected
   *  spouse bond from hero_relations (tier-1, equal to family bloodline). */
  spouseOfMain: boolean;
}

/** D-19: per-main chemistry points = the sum over the (<= 9) supports, each
 *  contributing the strongest SINGLE link it shares with the main — FIRST-MATCH
 *  (PLAN-FIX P1-3): spouseOfMain OR exact family_id -> family (3) and STOP;
 *  else exact faction_id -> faction (2) and STOP; else exact role -> role (1)
 *  and STOP; else 0. A single support NEVER contributes a sum of multiple link
 *  types. Main<->support pairs ONLY (D-17 — supports never link to each
 *  other). The point values come from CHEMISTRY_POINTS (single source, never
 *  literal 3/2/1). */
export function mainChemistryPoints(main: ChemistryLinkInput, supports: SupportLinkInput[]): number {
  return supports.reduce((sum, support) => {
    if (support.spouseOfMain || (main.familyId !== null && support.familyId === main.familyId)) {
      return sum + CHEMISTRY_POINTS.family;
    }
    if (support.factionId === main.factionId) {
      return sum + CHEMISTRY_POINTS.faction;
    }
    if (support.role === main.role) {
      return sum + CHEMISTRY_POINTS.role;
    }
    return sum;
  }, 0);
}

/** D-19: map a main's point sum to its chemistry tier via CHEMISTRY_TIERS
 *  (walking the strictly-descending min thresholds — S first, 0 last).
 *  Bonus-only floor: 0 points -> { label: null, buff: 0 } (EA FC 0-chemistry,
 *  no penalty). The tier LABEL renders (11-07); points/buff never (D-12). */
export function chemistryTier(points: number): { label: string | null; buff: number } {
  for (const tier of CHEMISTRY_TIERS) {
    if (points >= tier.min) return { label: tier.label, buff: tier.buff };
  }
  return { label: null, buff: 0 }; // unreachable — the min-0 row is last
}

/** D-19: apply the multiplicative chemistry buff to a main's FINAL combatStat
 *  (base + IV + levelGain) — chemistry scales with level (RESEARCH Pattern 2).
 *  Math.round keeps combat stats integers. Pre-baked into the mains' input
 *  BEFORE runLegionBattle (Pitfall 6). */
export function applyChemistryBuff(stat: number, buff: number): number {
  return Math.round(stat * (1 + buff));
}

/** D-18: LEA-driven support-effect trigger chance — clamp(0.15 x (1 + (lea-10)
 *  x 0.02), 0.05, 0.35). Phase 8 stat definition: LEA raises friendly-buff
 *  rate. The battleEngine's runLegionBattle support rolls use this value
 *  (11-05 Task 1 keeps a private copy so the engine stays self-contained;
 *  this export is the canonical source for assembly/UI consumers, 11-06/11-07). */
export function supportTriggerChance(lea: number): number {
  return Math.min(0.35, Math.max(0.05, 0.15 * (1 + (lea - 10) * 0.02)));
}
