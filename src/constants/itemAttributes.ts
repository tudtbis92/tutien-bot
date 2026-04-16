/**
 * Per-profession unique item archetypes and attribute pools.
 *
 * Each profession produces one unique item type when rollUniqueChance() succeeds.
 * Attribute pools define the 4 possible random attributes for each archetype.
 * At crafting time, 2-4 attributes are randomly selected from the pool and given random float values.
 *
 * Source: CONTEXT.md D-26, RESEARCH.md "Per-Profession Unique Item Archetypes"
 */

/** A single profession's unique item archetype definition */
export interface ProfessionUniqueArchetype {
  /** Matches professionTypeEnum values in src/db/schema/recipes.ts */
  professionType: string;
  /** i18n key for the unique item type name */
  uniqueItemNameI18nKey: string;
  /** Pool of 4 possible attribute names for random rolls */
  attributePool: readonly [string, string, string, string];
}

/**
 * Unique item archetypes for all 10 professions.
 * Source: RESEARCH.md table "Per-Profession Unique Item Archetypes"
 */
export const PROFESSION_UNIQUE_ARCHETYPES: readonly ProfessionUniqueArchetype[] = [
  {
    professionType: 'luyen_dan',
    uniqueItemNameI18nKey: 'game:items.unique.than_dan',
    attributePool: [
      'cultivation_multiplier',
      'daily_cap_boost',
      'breakthrough_luck',
      'spirit_recovery',
    ],
  },
  {
    professionType: 'luyen_khi_nc',
    uniqueItemNameI18nKey: 'game:items.unique.khi_luyen_tu',
    attributePool: [
      'passive_tuvi_rate',
      'energy_efficiency',
      'realm_affinity',
      'meditation_bonus',
    ],
  },
  {
    professionType: 'tran_phap',
    uniqueItemNameI18nKey: 'game:items.unique.ky_tran_co',
    attributePool: [
      'defense_layer',
      'trap_power',
      'area_effect',
      'duration_hours',
    ],
  },
  {
    professionType: 'linh_tru',
    uniqueItemNameI18nKey: 'game:items.unique.linh_thien',
    attributePool: [
      'shared_boost_percent',
      'hunger_resistance',
      'social_bonus',
      'duration_hours',
    ],
  },
  {
    professionType: 'luyen_co',
    uniqueItemNameI18nKey: 'game:items.unique.co_trung_vuong',
    attributePool: [
      'venom_potency',
      'swarm_size',
      'poison_duration',
      'mutation_chance',
    ],
  },
  {
    professionType: 'duoc_su',
    uniqueItemNameI18nKey: 'game:items.unique.linh_thao_than',
    attributePool: [
      'yield_multiplier',
      'rare_ingredient_chance',
      'growth_speed',
      'harvest_bonus',
    ],
  },
  {
    professionType: 'thuan_thu',
    uniqueItemNameI18nKey: 'game:items.unique.than_linh_thu',
    attributePool: [
      'combat_power',
      'loyalty_bond',
      'bloodline_purity',
      'growth_potential',
    ],
  },
  {
    professionType: 'luyen_kim',
    uniqueItemNameI18nKey: 'game:items.unique.than_binh',
    attributePool: [
      'attack_bonus',
      'defense_bonus',
      'spiritual_root_affinity',
      'durability',
    ],
  },
  {
    professionType: 'phu_su',
    uniqueItemNameI18nKey: 'game:items.unique.than_phu',
    attributePool: [
      'seal_power',
      'activation_speed',
      'talisman_durability',
      'elemental_affinity',
    ],
  },
  {
    professionType: 'thuat_su',
    uniqueItemNameI18nKey: 'game:items.unique.thien_menh_thu',
    attributePool: [
      'fortune_modifier',
      'event_luck',
      'prediction_duration',
      'wisdom_boost',
    ],
  },
] as const;

/**
 * Three-outcome craft roll.
 *
 * Base rates (tier 1, Luyện Khí — majorRealmIndex 0, profLevel 0):
 *   fail:    40.00%
 *   success: 59.98%
 *   unique:   0.02%
 *
 * Tier penalty: each tier above 1 adds +10% to failRate.
 *   tierPenalty = (itemTier - 1) * 0.10
 *
 * Scaling per main realm (getMajorRealmIndex(realmId)):
 *   fail    -= 3% per realm index  (floor at 0%)
 *   success += 3% per realm index
 *   unique  unchanged
 *
 * Scaling per allocated skill point in the relevant profession:
 *   unique  += 0.02% per point  (e.g. profLevel 1 → 0.04%, profLevel 2 → 0.06%)
 *   fail    -= 0.02% per point  (floor at 0%)
 *   success fills remainder     (1 − fail − unique)
 *
 * @param majorRealmIndex - getMajorRealmIndex(character.realmId); range 0–11
 * @param profLevel       - allocated skill points in the recipe's profession
 * @param itemTier        - tier of the result item (1-based); higher tier → harder craft
 */
export function craftRoll(
  majorRealmIndex: number,
  profLevel: number,
  itemTier: number,
): 'fail' | 'success' | 'unique' {
  const tierPenalty = (itemTier - 1) * 0.10;
  const uniqueRate = 0.0002 + profLevel * 0.0002;
  const failRate = Math.max(0, 0.40 + tierPenalty - majorRealmIndex * 0.03 - profLevel * 0.0002);
  // successRate = 1 − failRate − uniqueRate (fills automatically)

  const roll = Math.random();
  if (roll < uniqueRate) return 'unique';
  if (roll < uniqueRate + failRate) return 'fail';
  return 'success';
}

/**
 * @deprecated Use craftRoll() instead.
 * Kept for reference; will be removed in a future cleanup pass.
 */
export function rollUniqueChance(profLevel: number): boolean {
  return craftRoll(0, profLevel, 1) === 'unique';
}

/**
 * Material tier requirements for gathering commands.
 * Index = material tier (0=common, 1=uncommon, 2=rare, 3=epic)
 * Source: RESEARCH.md "Gathering Yield Formula"
 */
export const GATHER_TIER_REQUIREMENTS = [0, 3, 8, 15] as const;

/**
 * Minimum realm_id to gather each material tier.
 * tier 0: any realm; tier 1: Trúc Cơ+; tier 2: Hóa Thần+; tier 3: Đại Thừa+
 * Source: RESEARCH.md "Gathering Yield Formula"
 */
export const GATHER_REALM_REQUIREMENTS = [0, 9, 18, 27] as const;
