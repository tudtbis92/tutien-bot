/**
 * Profession type definitions and Zod schema for TuTien Bot.
 *
 * Professions are stored as JSONB in characters.profession_points.
 * The ProfessionPointsSchema validates this JSONB at runtime to prevent
 * NaN from undefined profession key reads (Pitfall 7 in RESEARCH.md).
 *
 * Source: CONTEXT.md D-22..D-24, RESEARCH.md "Pitfall 7: Profession Points JSONB Type Safety"
 */

import { z } from 'zod';

/**
 * All 10 profession keys — matches professionTypeEnum values in src/db/schema/recipes.ts.
 * These are the JSONB keys stored in characters.profession_points.
 */
export const PROFESSION_KEYS = [
  'luyen_dan',    // Luyện Đan — pill crafting
  'luyen_khi_nc', // Luyện Khí Nghề — qi refinement tools
  'tran_phap',    // Trận Pháp — formation arrays
  'linh_tru',     // Linh Trù — spirit cooking
  'luyen_co',     // Luyện Cổ — artifact refinement
  'duoc_su',      // Dược Sư — herb cultivation
  'thuan_thu',    // Thuần Thú — beast taming
  'luyen_kim',    // Luyện Kim — metal refinement
  'khai_linh',    // Khai Linh — spirit stone excavation
  'thuat_su',     // Thuật Sư — divination
] as const;

export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

/**
 * Zod schema for validating JSONB profession_points data.
 *
 * - All 10 profession keys are optional (missing keys default to 0)
 * - Values must be non-negative integers
 * - Unknown keys are stripped (prevents JSONB bloat from future injection)
 *
 * Usage: `const points = ProfessionPointsSchema.parse(char.professionPoints ?? {});`
 */
export const ProfessionPointsSchema = z
  .object(
    Object.fromEntries(
      PROFESSION_KEYS.map((k) => [k, z.number().int().min(0).default(0)]),
    ) as Record<ProfessionKey, z.ZodDefault<z.ZodNumber>>,
  )
  .partial();

export type ProfessionPoints = z.infer<typeof ProfessionPointsSchema>;

/**
 * Safely get a character's level in a specific profession.
 * Always returns a number ≥ 0; never throws; always validates.
 *
 * @param raw Raw JSONB value from characters.profession_points (may be null/undefined/any)
 * @param key The profession key to look up
 */
export function getProfessionLevel(raw: unknown, key: ProfessionKey): number {
  const parsed = ProfessionPointsSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data[key] ?? 0) : 0;
}

/**
 * Get the total skill points allocated across all professions.
 * Maximum total = characters.realm_id (1 point per tier advanced, per D-24).
 *
 * @param professionPoints Validated ProfessionPoints object
 */
export function getTotalProfessionPoints(professionPoints: ProfessionPoints): number {
  return Object.values(professionPoints).reduce((sum, v) => sum + (v ?? 0), 0);
}
