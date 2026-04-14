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
 * Roll whether a craft attempt creates a unique item.
 *
 * Probability scales with profession level (1 to 42):
 * - Level 1:  1.0%
 * - Level 10: 4.15%
 * - Level 20: 7.65%
 * - Level 42: ~15% (capped)
 *
 * Source: CONTEXT.md D-26, RESEARCH.md "Unique Item Trigger Probability"
 */
export function rollUniqueChance(profLevel: number): boolean {
  const probability = Math.min(0.15, 0.01 + (profLevel - 1) * 0.0035);
  return Math.random() < probability;
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
