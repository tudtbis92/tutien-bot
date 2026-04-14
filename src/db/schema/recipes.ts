import { pgTable, serial, integer, pgEnum } from 'drizzle-orm/pg-core';
import { items } from './items.js';

// Profession type enum — matches PROFESSION_KEYS in src/types/professions.ts
// These are the internal keys, not display names (display names come from i18n)
export const professionTypeEnum = pgEnum('profession_type', [
  'luyen_dan',   // Luyện Đan — pill crafting
  'luyen_khi_nc', // Luyện Khí Nghề — qi refinement tools
  'tran_phap',   // Trận Pháp — formation arrays
  'linh_tru',    // Linh Trù — spirit cooking
  'luyen_co',    // Luyện Cổ — gu insect cultivation (cổ trùng)
  'duoc_su',     // Dược Sư — herb cultivation
  'thuan_thu',   // Thuần Thú — spirit beast taming (produces Linh Thú)
  'luyen_kim',   // Luyện Kim — metal refinement
  'phu_su',      // Phù Sư — talisman crafting (phù chú)
  'thuat_su',    // Thuật Sư — divination
]);

export type ProfessionType = (typeof professionTypeEnum.enumValues)[number];

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  resultItemId: integer('result_item_id')
    .notNull()
    .references(() => items.id)
    .unique(),
  professionType: professionTypeEnum('profession_type').notNull(),
  // Minimum profession level required to use this recipe
  minProfessionLevel: integer('min_profession_level').notNull().default(1),
});

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
