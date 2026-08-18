import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sanguoSkills, type SanguoSkill } from '../../db/schema/sanguoSkills.js';
import { cryptoUniform } from './encounterService.js';

/**
 * Skill spawn roll service (Phase 11, D-30/D-31).
 *
 * D-30: heroes spawn with skills ROLLED AT ENCOUNTER SPAWN from their CLASS's
 * pool, weighted by skill rarity — the NORMAL slot pool is common 80 / rare 20,
 * the SPECIAL slot pool is common 60 / rare 30 / epic 10 (D-30 weights; the
 * rarity weights are hidden mechanics, D-12 — never rendered).
 *
 * CRYPTO RNG MANDATE (ASVS V6 / Pitfall 4): every roll here is a PLAYER-FACING
 * draw and rides crypto — `cryptoUniform` by default (crypto.randomInt-based).
 * The `rng` parameter exists ONLY so tests can inject deterministic draws
 * (analog: encounterService.ts / encounterLevelService.ts). pure-rand NEVER
 * appears here (it exists only inside the seeded battle replay, D-06).
 */
export type SkillRarity = 'common' | 'rare' | 'epic';

/** D-30 rarity weights — the NORMAL slot pool (common 80 / rare 20). */
export const NORMAL_SLOT_RARITY_WEIGHT: Readonly<Record<SkillRarity, number>> = {
  common: 80,
  rare: 20,
  epic: 0, // normal slots never roll epic (the 11-02 seed has no epic normal skills)
};

/** D-30 rarity weights — the SPECIAL slot pool (common 60 / rare 30 / epic 10). */
export const SPECIAL_SLOT_RARITY_WEIGHT: Readonly<Record<SkillRarity, number>> = {
  common: 60,
  rare: 30,
  epic: 10,
};

function cumulativeWeight(weights: Readonly<Record<SkillRarity, number>>): Readonly<Record<SkillRarity, number>> {
  // Cumulative prefix sums in rarity order (common → rare → epic); epic is
  // always 0 for the normal table (weight 0 above, so it never rolls).
  const order: SkillRarity[] = ['common', 'rare', 'epic'];
  const out: Record<SkillRarity, number> = { common: 0, rare: 0, epic: 0 };
  let acc = 0;
  for (const r of order) {
    acc += (weights as Record<SkillRarity, number>)[r] ?? 0;
    out[r] = acc;
  }
  return out;
}

/**
 * D-30 rarity-weighted cumulative pick over a class pool. `weights` maps
 * rarity → weight (NORMAL_SLOT_RARITY_WEIGHT for a normal slot pool,
 * SPECIAL_SLOT_RARITY_WEIGHT for a special slot pool). The cumulative walk
 * picks the skill whose rarity band `rng() × totalWeight` lands in (half-open;
 * an exact band boundary falls to the NEXT-higher rarity). Returns null when
 * the pool is empty (the spawn insert writes null skill ids).
 */
export function rollSkill(
  classPool: SanguoSkill[],
  rng: () => number = cryptoUniform,
  weights: Readonly<Record<SkillRarity, number>> = SPECIAL_SLOT_RARITY_WEIGHT,
): SanguoSkill | null {
  if (classPool.length === 0) return null;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return null;
  const cum = cumulativeWeight(weights);
  const roll = rng() * totalWeight;
  for (const skill of classPool) {
    const rarity = (skill.rarity as SkillRarity) ?? 'common';
    if (roll < (cum[rarity] ?? 0)) return skill;
  }
  return classPool[classPool.length - 1] ?? null;
}

export interface SpawnSkillRoll {
  normalId: number | null;
  specialId: number | null;
}

/** Minimal query executor — default `db`, but the spawn factory injects `tx` so
 *  the skill roll rides the SAME single-writer transaction as the
 *  encounter_runs insert (Pitfall 5). */
export type QueryExecutor = Pick<typeof db, 'select'>;

/**
 * D-30/D-31 spawn roll: query the class's normal + special pools and roll one
 * skill per slot — written to encounter_runs.skill_normal_id /
 * skill_special_id, carried to battle + capture. Crypto-backed; injectable rng
 * for deterministic tests.
 */
export async function rollSkillsForSpawn(
  classId: string,
  rng: () => number = cryptoUniform,
  executor: QueryExecutor = db,
): Promise<SpawnSkillRoll> {
  const normalPool = await executor
    .select()
    .from(sanguoSkills)
    .where(and(eq(sanguoSkills.class, classId), eq(sanguoSkills.slot, 'normal')))
    .limit(50);
  const specialPool = await executor
    .select()
    .from(sanguoSkills)
    .where(and(eq(sanguoSkills.class, classId), eq(sanguoSkills.slot, 'special')))
    .limit(50);

  const normal = rollSkill(normalPool, rng, NORMAL_SLOT_RARITY_WEIGHT);
  const special = rollSkill(specialPool, rng, SPECIAL_SLOT_RARITY_WEIGHT);
  return { normalId: normal?.id ?? null, specialId: special?.id ?? null };
}