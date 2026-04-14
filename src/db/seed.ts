/**
 * Phase 02.1 Seed Script
 *
 * Seeds: items (50 raw + 44 crafted), recipes (44), recipe_ingredients (~110),
 *        gather_pool_items (50 raw materials with weights and realm gates)
 *
 * Idempotent: uses INSERT ... ON CONFLICT DO UPDATE to allow re-running safely.
 * Requires: DATABASE_URL_DIRECT (bypasses PgBouncer for direct connection)
 *
 * Run: npx tsx src/db/seed.ts
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import type { ItemType } from './schema/items.js';
import type { ProfessionType } from './schema/recipes.js';

// ---------------------------------------------------------------------------
// DB connection (direct — bypasses PgBouncer)
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[Seed] DATABASE_URL_DIRECT or DATABASE_URL must be set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const db = drizzle({ client: pool, schema });

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface RawItemDef {
  slug: string;
  type: ItemType;
  tier: number;
  basePrice: bigint;
}

interface CraftedItemDef {
  slug: string;
  type: ItemType;
  tier: number;
  basePrice: bigint;
  profession: ProfessionType;
  minProfessionLevel: number;
  ingredients: { slug: string; quantity: number }[];
}

// ---------------------------------------------------------------------------
// Raw Materials — 50 items (5 per profession × 10 professions)
// ---------------------------------------------------------------------------
const RAW_ITEMS: RawItemDef[] = [
  // LUYỆN ĐAN
  { slug: 'linh_thao_so_khai',   type: 'consumable', tier: 1, basePrice: 2n },
  { slug: 'thanh_tam_hoa',       type: 'consumable', tier: 2, basePrice: 5n },
  { slug: 'huyen_tinh_thao',     type: 'consumable', tier: 3, basePrice: 12n },
  { slug: 'dan_nguyen_qua',      type: 'consumable', tier: 4, basePrice: 30n },
  { slug: 'cuu_diep_linh_chi',   type: 'consumable', tier: 5, basePrice: 80n },

  // LUYỆN KHÍ NGHỀ
  { slug: 'khi_tu_thach',        type: 'material',   tier: 1, basePrice: 2n },
  { slug: 'linh_khi_tinh',       type: 'material',   tier: 2, basePrice: 5n },
  { slug: 'thuan_khi_ngoc',      type: 'material',   tier: 3, basePrice: 12n },
  { slug: 'thien_nguyen_tinh',   type: 'material',   tier: 4, basePrice: 30n },
  { slug: 'hu_khong_khi_doan',   type: 'material',   tier: 5, basePrice: 80n },

  // TRẬN PHÁP
  { slug: 'tran_van_thach',      type: 'formation',  tier: 1, basePrice: 2n },
  { slug: 'linh_sa',             type: 'formation',  tier: 2, basePrice: 5n },
  { slug: 'tran_co_ngoc',        type: 'formation',  tier: 3, basePrice: 12n },
  { slug: 'co_tran_van_phien',   type: 'formation',  tier: 4, basePrice: 30n },
  { slug: 'thien_dia_tran_tinh', type: 'formation',  tier: 5, basePrice: 80n },

  // LINH TRÙ
  { slug: 'linh_mi',             type: 'food',       tier: 1, basePrice: 2n },
  { slug: 'thanh_lo_thao',       type: 'food',       tier: 2, basePrice: 5n },
  { slug: 'huyen_vu_nam',        type: 'food',       tier: 3, basePrice: 12n },
  { slug: 'phuong_hoang_qua',    type: 'food',       tier: 4, basePrice: 30n },
  { slug: 'long_tuy_tinh_hoa',   type: 'food',       tier: 5, basePrice: 80n },

  // LUYỆN CỔ TRÙNG
  { slug: 'son_truong_mat',      type: 'companion',  tier: 1, basePrice: 2n },
  { slug: 'doc_truong_nhuong',   type: 'companion',  tier: 2, basePrice: 5n },
  { slug: 'linh_truong_kien',    type: 'companion',  tier: 3, basePrice: 12n },
  { slug: 'co_doc_tinh',         type: 'companion',  tier: 4, basePrice: 30n },
  { slug: 'van_truong_than_co',  type: 'companion',  tier: 5, basePrice: 80n },

  // DƯỢC SƯ
  { slug: 'tieu_can_thao',       type: 'material',   tier: 1, basePrice: 2n },
  { slug: 'hoa_ich_tho',         type: 'material',   tier: 2, basePrice: 5n },
  { slug: 'sam_linh_can',        type: 'material',   tier: 3, basePrice: 12n },
  { slug: 'thien_nien_do_quyen', type: 'material',   tier: 4, basePrice: 30n },
  { slug: 'van_linh_tien_hoa',   type: 'material',   tier: 5, basePrice: 80n },

  // THUẦN THÚ
  { slug: 'thu_long_tho',        type: 'companion',  tier: 1, basePrice: 2n },
  { slug: 'tieu_thu_loi',        type: 'companion',  tier: 2, basePrice: 5n },
  { slug: 'linh_thu_vay',        type: 'companion',  tier: 3, basePrice: 12n },
  { slug: 'manh_thu_nanh',       type: 'companion',  tier: 4, basePrice: 30n },
  { slug: 'than_thu_tinh_huyet', type: 'companion',  tier: 5, basePrice: 80n },

  // LUYỆN KIM
  { slug: 'pho_thong_khoang',    type: 'equipment',  tier: 1, basePrice: 2n },
  { slug: 'thiet_linh_phien',    type: 'equipment',  tier: 2, basePrice: 5n },
  { slug: 'thanh_dong_khoi',     type: 'equipment',  tier: 3, basePrice: 12n },
  { slug: 'bach_ngan_tinh',      type: 'equipment',  tier: 4, basePrice: 30n },
  { slug: 'cuc_pham_than_kim',   type: 'equipment',  tier: 5, basePrice: 80n },

  // PHÙ SƯ (formerly khai_linh)
  { slug: 'linh_sa_boi',         type: 'scroll',     tier: 1, basePrice: 2n },
  { slug: 'phu_giay_linh',       type: 'scroll',     tier: 2, basePrice: 5n },
  { slug: 'huyen_muc_tinh',      type: 'scroll',     tier: 3, basePrice: 12n },
  { slug: 'kim_sa_linh',         type: 'scroll',     tier: 4, basePrice: 30n },
  { slug: 'tien_bich_huyet',     type: 'scroll',     tier: 5, basePrice: 80n },

  // THUẬT SƯ
  { slug: 'tien_tri_gian',       type: 'scroll',     tier: 1, basePrice: 2n },
  { slug: 'van_menh_soi',        type: 'scroll',     tier: 2, basePrice: 5n },
  { slug: 'tinh_tu_tinh',        type: 'scroll',     tier: 3, basePrice: 12n },
  { slug: 'co_ngu_gian_phien',   type: 'scroll',     tier: 4, basePrice: 30n },
  { slug: 'thien_co_cuon',       type: 'scroll',     tier: 5, basePrice: 80n },
];

// ---------------------------------------------------------------------------
// Crafted Items — 44 items with recipes
// ---------------------------------------------------------------------------
const CRAFTED_ITEMS: CraftedItemDef[] = [
  // LUYỆN ĐAN (5)
  {
    slug: 'khi_hoi_dan', type: 'consumable', tier: 3, basePrice: 30n,
    profession: 'luyen_dan', minProfessionLevel: 1,
    ingredients: [{ slug: 'linh_thao_so_khai', quantity: 3 }, { slug: 'tieu_can_thao', quantity: 2 }],
  },
  {
    slug: 'tam_thanh_dan', type: 'consumable', tier: 3, basePrice: 80n,
    profession: 'luyen_dan', minProfessionLevel: 5,
    ingredients: [{ slug: 'thanh_tam_hoa', quantity: 5 }, { slug: 'hoa_ich_tho', quantity: 3 }],
  },
  {
    slug: 'huyen_tinh_dan', type: 'consumable', tier: 4, basePrice: 200n,
    profession: 'luyen_dan', minProfessionLevel: 10,
    ingredients: [{ slug: 'huyen_tinh_thao', quantity: 4 }, { slug: 'thanh_tam_hoa', quantity: 2 }],
  },
  {
    slug: 'ngu_linh_dan', type: 'consumable', tier: 4, basePrice: 500n,
    profession: 'luyen_dan', minProfessionLevel: 20,
    ingredients: [
      { slug: 'dan_nguyen_qua', quantity: 3 },
      { slug: 'huyen_tinh_thao', quantity: 2 },
      { slug: 'cuu_diep_linh_chi', quantity: 1 },
    ],
  },
  {
    slug: 'cuu_chuyen_kim_dan', type: 'consumable', tier: 5, basePrice: 1500n,
    profession: 'luyen_dan', minProfessionLevel: 35,
    ingredients: [{ slug: 'cuu_diep_linh_chi', quantity: 3 }, { slug: 'dan_nguyen_qua', quantity: 2 }],
  },

  // LUYỆN KHÍ NGHỀ (4)
  {
    slug: 'tu_khi_binh', type: 'artifact', tier: 3, basePrice: 30n,
    profession: 'luyen_khi_nc', minProfessionLevel: 1,
    ingredients: [{ slug: 'khi_tu_thach', quantity: 3 }, { slug: 'tran_van_thach', quantity: 2 }],
  },
  {
    slug: 'linh_khi_duong', type: 'artifact', tier: 3, basePrice: 80n,
    profession: 'luyen_khi_nc', minProfessionLevel: 5,
    ingredients: [{ slug: 'linh_khi_tinh', quantity: 4 }, { slug: 'khi_tu_thach', quantity: 2 }],
  },
  {
    slug: 'thuan_khi_tru', type: 'artifact', tier: 4, basePrice: 200n,
    profession: 'luyen_khi_nc', minProfessionLevel: 10,
    ingredients: [{ slug: 'thuan_khi_ngoc', quantity: 3 }, { slug: 'linh_khi_tinh', quantity: 2 }],
  },
  {
    slug: 'thien_nguyen_dinh', type: 'artifact', tier: 4, basePrice: 600n,
    profession: 'luyen_khi_nc', minProfessionLevel: 20,
    ingredients: [{ slug: 'thien_nguyen_tinh', quantity: 3 }, { slug: 'thuan_khi_ngoc', quantity: 2 }],
  },

  // TRẬN PHÁP (4)
  {
    slug: 'ket_gioi_phu', type: 'formation', tier: 3, basePrice: 30n,
    profession: 'tran_phap', minProfessionLevel: 1,
    ingredients: [{ slug: 'tran_van_thach', quantity: 3 }, { slug: 'linh_sa', quantity: 2 }],
  },
  {
    slug: 'cong_kich_tran_ban', type: 'formation', tier: 3, basePrice: 80n,
    profession: 'tran_phap', minProfessionLevel: 5,
    ingredients: [{ slug: 'linh_sa', quantity: 4 }, { slug: 'tran_van_thach', quantity: 2 }],
  },
  {
    slug: 'ho_than_tran_co', type: 'formation', tier: 4, basePrice: 200n,
    profession: 'tran_phap', minProfessionLevel: 10,
    ingredients: [{ slug: 'tran_co_ngoc', quantity: 3 }, { slug: 'linh_sa', quantity: 2 }],
  },
  {
    slug: 'thien_dia_cam_che', type: 'formation', tier: 4, basePrice: 600n,
    profession: 'tran_phap', minProfessionLevel: 20,
    ingredients: [{ slug: 'thien_dia_tran_tinh', quantity: 3 }, { slug: 'co_tran_van_phien', quantity: 2 }],
  },

  // LINH TRÙ (4)
  {
    slug: 'thanh_tam_canh', type: 'food', tier: 3, basePrice: 30n,
    profession: 'linh_tru', minProfessionLevel: 1,
    ingredients: [{ slug: 'linh_mi', quantity: 3 }, { slug: 'thanh_lo_thao', quantity: 2 }],
  },
  {
    slug: 'linh_thu_thai', type: 'food', tier: 3, basePrice: 80n,
    profession: 'linh_tru', minProfessionLevel: 5,
    ingredients: [{ slug: 'thanh_lo_thao', quantity: 4 }, { slug: 'linh_mi', quantity: 2 }],
  },
  {
    slug: 'huyen_vu_ninh', type: 'food', tier: 4, basePrice: 200n,
    profession: 'linh_tru', minProfessionLevel: 10,
    ingredients: [
      { slug: 'huyen_vu_nam', quantity: 3 },
      { slug: 'thanh_lo_thao', quantity: 2 },
      { slug: 'phuong_hoang_qua', quantity: 1 },
    ],
  },
  {
    slug: 'phung_hoang_yen', type: 'food', tier: 4, basePrice: 600n,
    profession: 'linh_tru', minProfessionLevel: 20,
    ingredients: [{ slug: 'phuong_hoang_qua', quantity: 3 }, { slug: 'long_tuy_tinh_hoa', quantity: 2 }],
  },

  // LUYỆN CỔ TRÙNG (5)
  {
    slug: 'doc_truong_so', type: 'companion', tier: 3, basePrice: 30n,
    profession: 'luyen_co', minProfessionLevel: 1,
    ingredients: [{ slug: 'son_truong_mat', quantity: 5 }, { slug: 'doc_truong_nhuong', quantity: 3 }],
  },
  {
    slug: 'linh_truong_binh', type: 'companion', tier: 3, basePrice: 80n,
    profession: 'luyen_co', minProfessionLevel: 5,
    ingredients: [{ slug: 'doc_truong_nhuong', quantity: 4 }, { slug: 'son_truong_mat', quantity: 3 }],
  },
  {
    slug: 'co_nguyen_truong', type: 'companion', tier: 4, basePrice: 200n,
    profession: 'luyen_co', minProfessionLevel: 10,
    ingredients: [{ slug: 'linh_truong_kien', quantity: 3 }, { slug: 'doc_truong_nhuong', quantity: 2 }],
  },
  {
    slug: 'truong_vuong_tieu', type: 'companion', tier: 4, basePrice: 500n,
    profession: 'luyen_co', minProfessionLevel: 20,
    ingredients: [{ slug: 'co_doc_tinh', quantity: 3 }, { slug: 'linh_truong_kien', quantity: 2 }],
  },
  {
    slug: 'van_doc_than_truong', type: 'companion', tier: 5, basePrice: 1500n,
    profession: 'luyen_co', minProfessionLevel: 35,
    ingredients: [{ slug: 'van_truong_than_co', quantity: 3 }, { slug: 'co_doc_tinh', quantity: 2 }],
  },

  // DƯỢC SƯ (4)
  {
    slug: 'linh_thao_thuoc_bot', type: 'consumable', tier: 3, basePrice: 30n,
    profession: 'duoc_su', minProfessionLevel: 1,
    ingredients: [{ slug: 'tieu_can_thao', quantity: 5 }, { slug: 'linh_thao_so_khai', quantity: 2 }],
  },
  {
    slug: 'ich_tho_cao', type: 'consumable', tier: 3, basePrice: 80n,
    profession: 'duoc_su', minProfessionLevel: 5,
    ingredients: [{ slug: 'hoa_ich_tho', quantity: 4 }, { slug: 'tieu_can_thao', quantity: 3 }],
  },
  {
    slug: 'sam_linh_duoc', type: 'consumable', tier: 4, basePrice: 200n,
    profession: 'duoc_su', minProfessionLevel: 10,
    ingredients: [{ slug: 'sam_linh_can', quantity: 3 }, { slug: 'hoa_ich_tho', quantity: 2 }],
  },
  {
    slug: 'van_linh_dich', type: 'consumable', tier: 4, basePrice: 600n,
    profession: 'duoc_su', minProfessionLevel: 20,
    ingredients: [{ slug: 'van_linh_tien_hoa', quantity: 3 }, { slug: 'thien_nien_do_quyen', quantity: 2 }],
  },

  // THUẦN THÚ (4) — crafted items are Linh Thú (spirit beasts)
  {
    slug: 'tu_linh_cuu', type: 'companion', tier: 3, basePrice: 30n,
    profession: 'thuan_thu', minProfessionLevel: 1,
    ingredients: [{ slug: 'thu_long_tho', quantity: 5 }, { slug: 'tieu_thu_loi', quantity: 2 }],
  },
  {
    slug: 'phong_loan_linh', type: 'companion', tier: 3, basePrice: 80n,
    profession: 'thuan_thu', minProfessionLevel: 5,
    ingredients: [{ slug: 'tieu_thu_loi', quantity: 4 }, { slug: 'thu_long_tho', quantity: 3 }],
  },
  {
    slug: 'vun_linh_nhan', type: 'companion', tier: 4, basePrice: 200n,
    profession: 'thuan_thu', minProfessionLevel: 10,
    ingredients: [{ slug: 'linh_thu_vay', quantity: 3 }, { slug: 'tieu_thu_loi', quantity: 2 }],
  },
  {
    slug: 'than_thu_bao_than', type: 'companion', tier: 4, basePrice: 600n,
    profession: 'thuan_thu', minProfessionLevel: 20,
    ingredients: [{ slug: 'than_thu_tinh_huyet', quantity: 3 }, { slug: 'manh_thu_nanh', quantity: 2 }],
  },

  // LUYỆN KIM (5)
  {
    slug: 'so_cap_dao_phien', type: 'equipment', tier: 3, basePrice: 30n,
    profession: 'luyen_kim', minProfessionLevel: 1,
    ingredients: [{ slug: 'pho_thong_khoang', quantity: 4 }, { slug: 'thiet_linh_phien', quantity: 2 }],
  },
  {
    slug: 'trung_cap_giap_manh', type: 'equipment', tier: 3, basePrice: 80n,
    profession: 'luyen_kim', minProfessionLevel: 5,
    ingredients: [{ slug: 'thiet_linh_phien', quantity: 4 }, { slug: 'pho_thong_khoang', quantity: 2 }],
  },
  {
    slug: 'thanh_dong_vu_khi', type: 'equipment', tier: 4, basePrice: 200n,
    profession: 'luyen_kim', minProfessionLevel: 10,
    ingredients: [{ slug: 'thanh_dong_khoi', quantity: 3 }, { slug: 'thiet_linh_phien', quantity: 2 }],
  },
  {
    slug: 'bach_ngan_an_giam', type: 'equipment', tier: 4, basePrice: 500n,
    profession: 'luyen_kim', minProfessionLevel: 20,
    ingredients: [{ slug: 'bach_ngan_tinh', quantity: 3 }, { slug: 'thanh_dong_khoi', quantity: 2 }],
  },
  {
    slug: 'than_kim_chu_phap', type: 'equipment', tier: 5, basePrice: 1500n,
    profession: 'luyen_kim', minProfessionLevel: 35,
    ingredients: [{ slug: 'cuc_pham_than_kim', quantity: 3 }, { slug: 'bach_ngan_tinh', quantity: 2 }],
  },

  // PHÙ SƯ (4) — crafted items are Phù Chú (talismans)
  {
    slug: 'hoa_phu_so_cap', type: 'scroll', tier: 3, basePrice: 30n,
    profession: 'phu_su', minProfessionLevel: 1,
    ingredients: [{ slug: 'linh_sa_boi', quantity: 4 }, { slug: 'phu_giay_linh', quantity: 2 }],
  },
  {
    slug: 'ho_than_phu', type: 'scroll', tier: 3, basePrice: 80n,
    profession: 'phu_su', minProfessionLevel: 5,
    ingredients: [{ slug: 'phu_giay_linh', quantity: 4 }, { slug: 'linh_sa_boi', quantity: 3 }],
  },
  {
    slug: 'loi_phu_trung_cap', type: 'scroll', tier: 4, basePrice: 200n,
    profession: 'phu_su', minProfessionLevel: 10,
    ingredients: [{ slug: 'huyen_muc_tinh', quantity: 3 }, { slug: 'phu_giay_linh', quantity: 2 }],
  },
  {
    slug: 'phong_an_dai_phu', type: 'scroll', tier: 4, basePrice: 600n,
    profession: 'phu_su', minProfessionLevel: 20,
    ingredients: [
      { slug: 'kim_sa_linh', quantity: 3 },
      { slug: 'huyen_muc_tinh', quantity: 2 },
      { slug: 'tien_bich_huyet', quantity: 1 },
    ],
  },

  // THUẬT SƯ (4)
  {
    slug: 'boi_toan_gian', type: 'scroll', tier: 3, basePrice: 30n,
    profession: 'thuat_su', minProfessionLevel: 1,
    ingredients: [{ slug: 'tien_tri_gian', quantity: 4 }, { slug: 'van_menh_soi', quantity: 2 }],
  },
  {
    slug: 'menh_van_tinh', type: 'scroll', tier: 3, basePrice: 80n,
    profession: 'thuat_su', minProfessionLevel: 5,
    ingredients: [{ slug: 'van_menh_soi', quantity: 4 }, { slug: 'tien_tri_gian', quantity: 2 }],
  },
  {
    slug: 'tinh_tu_menh_ban', type: 'scroll', tier: 4, basePrice: 200n,
    profession: 'thuat_su', minProfessionLevel: 10,
    ingredients: [{ slug: 'tinh_tu_tinh', quantity: 3 }, { slug: 'van_menh_soi', quantity: 2 }],
  },
  {
    slug: 'thien_co_du_trac', type: 'scroll', tier: 4, basePrice: 600n,
    profession: 'thuat_su', minProfessionLevel: 20,
    ingredients: [{ slug: 'thien_co_cuon', quantity: 3 }, { slug: 'co_ngu_gian_phien', quantity: 2 }],
  },
];

// ---------------------------------------------------------------------------
// Gather pool config: tier → { minMajorRealmIndex, weight }
// ---------------------------------------------------------------------------
const TIER_POOL_CONFIG: Record<number, { minMajorRealmIndex: number; weight: number }> = {
  1: { minMajorRealmIndex: 0, weight: 100 }, // Luyện Khí+, most common
  2: { minMajorRealmIndex: 0, weight: 30 },  // Luyện Khí+, uncommon
  3: { minMajorRealmIndex: 1, weight: 10 },  // Trúc Cơ+, rare
  4: { minMajorRealmIndex: 2, weight: 3 },   // Kim Đan+, epic
  5: { minMajorRealmIndex: 3, weight: 1 },   // Nguyên Anh+, legendary
};

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  console.log('[Seed] Starting Phase 02.1 seed...');

  // Step 1: Upsert all items (raw + crafted) and build slug → id map
  console.log('[Seed] Upserting items...');
  const slugToId = new Map<string, number>();

  const allItemDefs = [
    ...RAW_ITEMS.map((r) => ({
      nameI18nKey: `game:items.raw.${r.slug}`,
      type: r.type,
      tier: r.tier,
      basePrice: r.basePrice,
      isUnique: false,
    })),
    ...CRAFTED_ITEMS.map((c) => ({
      nameI18nKey: `game:items.crafted.${c.slug}`,
      type: c.type,
      tier: c.tier,
      basePrice: c.basePrice,
      isUnique: false,
    })),
  ];

  for (const itemDef of allItemDefs) {
    const [row] = await db
      .insert(schema.items)
      .values(itemDef)
      .onConflictDoUpdate({
        target: schema.items.nameI18nKey,
        // targetWhere narrows conflict resolution to the partial unique index
        // (only applies when is_unique = false — i.e., catalog items)
        targetWhere: sql`is_unique = false`,
        set: {
          type: itemDef.type,
          tier: itemDef.tier,
          basePrice: itemDef.basePrice,
        },
      })
      .returning({ id: schema.items.id });

    if (!row) throw new Error(`[Seed] Failed to upsert item: ${itemDef.nameI18nKey}`);
    // Extract slug from i18n key
    const slug = itemDef.nameI18nKey.split('.').pop()!;
    slugToId.set(slug, row.id);
  }

  console.log(`[Seed] Upserted ${allItemDefs.length} items.`);

  // Step 2: Upsert recipes and recipe_ingredients
  console.log('[Seed] Upserting recipes...');
  let recipeCount = 0;
  let ingredientCount = 0;

  for (const crafted of CRAFTED_ITEMS) {
    const resultItemId = slugToId.get(crafted.slug);
    if (!resultItemId) throw new Error(`[Seed] No id for crafted item: ${crafted.slug}`);

    // Upsert recipe (unique on result_item_id)
    const [recipeRow] = await db
      .insert(schema.recipes)
      .values({
        resultItemId,
        professionType: crafted.profession,
        minProfessionLevel: crafted.minProfessionLevel,
      })
      .onConflictDoUpdate({
        target: schema.recipes.resultItemId,
        set: {
          professionType: crafted.profession,
          minProfessionLevel: crafted.minProfessionLevel,
        },
      })
      .returning({ id: schema.recipes.id });

    if (!recipeRow) throw new Error(`[Seed] Failed to upsert recipe for: ${crafted.slug}`);
    recipeCount++;

    // Delete old ingredients and re-insert (simplest idempotent approach)
    await db
      .delete(schema.recipeIngredients)
      .where(sql`recipe_id = ${recipeRow.id}`);

    for (const ing of crafted.ingredients) {
      const ingredientItemId = slugToId.get(ing.slug);
      if (!ingredientItemId) throw new Error(`[Seed] No id for ingredient: ${ing.slug}`);

      await db.insert(schema.recipeIngredients).values({
        recipeId: recipeRow.id,
        itemId: ingredientItemId,
        quantity: ing.quantity,
      });
      ingredientCount++;
    }
  }

  console.log(`[Seed] Upserted ${recipeCount} recipes, ${ingredientCount} ingredients.`);

  // Step 3: Populate gather_pool_items (raw materials only)
  console.log('[Seed] Upserting gather pool...');
  let poolCount = 0;

  for (const raw of RAW_ITEMS) {
    const itemId = slugToId.get(raw.slug);
    if (!itemId) throw new Error(`[Seed] No id for raw item: ${raw.slug}`);

    const poolConfig = TIER_POOL_CONFIG[raw.tier];
    if (!poolConfig) throw new Error(`[Seed] No pool config for tier: ${raw.tier}`);

    await db
      .insert(schema.gatherPoolItems)
      .values({
        itemId,
        minMajorRealmIndex: poolConfig.minMajorRealmIndex,
        weight: poolConfig.weight,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: schema.gatherPoolItems.itemId,
        set: {
          minMajorRealmIndex: poolConfig.minMajorRealmIndex,
          weight: poolConfig.weight,
          isActive: true,
        },
      });

    poolCount++;
  }

  console.log(`[Seed] Upserted ${poolCount} gather pool entries.`);
  console.log('[Seed] Phase 02.1 seed complete!');
}

seed()
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
