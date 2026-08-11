/**
 * Phase 08 Sanguo Content Seed (TQC-02, D-05/D-06/D-09/D-10/D-11/D-12)
 *
 * Seeds: 132 heroes (heroes-v1.json), 5-10 placeholder map_nodes, 2-4 sanguo_items.
 *
 * Idempotent: INSERT ... ON CONFLICT DO UPDATE keyed on natural keys
 * (heroes.heroId, map_nodes.code, sanguo_items.code) — re-running updates
 * changed content and never duplicates rows (D-11).
 *
 * name_zh is intentionally NOT set in this task-4 version (D-06): ZH-CN names
 * come from the Tavily research pass (task 5 of this plan), which extends the
 * set clauses with nameZh sourced from scripts/data/sanguo-zh-names.json.
 * Keeping nameZh out of the task-4 set prevents an empty map from clobbering
 * researched values on a premature re-run.
 *
 * Dev-time source: E:\Saeth\sanguo_assets\src\data\heroes-v1.json (never read
 * at runtime). Requires: DATABASE_URL_DIRECT (bypasses PgBouncer).
 *
 * Run: npx tsx scripts/seed-sanguo.ts  (or: npm run seed:sanguo)
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as schema from '../src/db/schema/index.js';

// ---------------------------------------------------------------------------
// DB connection (direct — bypasses PgBouncer, seed.ts:24-31 pattern)
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[Seed] DATABASE_URL_DIRECT or DATABASE_URL must be set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const db = drizzle({ client: pool, schema });

// ---------------------------------------------------------------------------
// Dev-time content source (D-06/D-09 — dev-only, never read at runtime)
// ---------------------------------------------------------------------------
const HEROES_JSON_PATH = 'E:\\Saeth\\sanguo_assets\\src\\data\\heroes-v1.json';

// ---------------------------------------------------------------------------
// Faction/role mapping (RESEARCH TQC-02 — 10 factions / 5 roles)
// ---------------------------------------------------------------------------
type HeroFaction = NonNullable<typeof schema.heroes.$inferInsert['faction']>;
type HeroRole = NonNullable<typeof schema.heroes.$inferInsert['role']>;

const FACTION_MAP: Record<string, HeroFaction> = {
  'Hoàng tộc': 'hoang_toc',
  'Thập Thường Thị': 'thap_thuong_thi',
  'Triều đình': 'trieu_dinh',
  'Đảng nhân': 'dang_nhan',
  'Tướng triều': 'tuong_trieu',
  'Khăn Vàng': 'khan_vang',
  'Lương Châu': 'luong_chau',
  'Quần hùng': 'quan_hung',
  'Châu mục': 'chau_muc',
  'Ngoại tộc': 'ngoai_toc',
};

// role maps directly to hero_role (royal|eunuch|military|civil|religious)
const ROLE_VALUES: HeroRole[] = ['royal', 'eunuch', 'military', 'civil', 'religious'];

// ---------------------------------------------------------------------------
// Content definitions
// ---------------------------------------------------------------------------
interface HeroJsonEntry {
  id: string;
  name: string;
  en: string;
  title: string;
  faction: string;
  weapon: string;
  detail: string;
  gender: string;
  people: string;
  role: string;
}

// Placeholder map nodes (D-10, 5-10 nodes) — unique code per node, each
// carrying a representativeHeroId (registered hero id) as the /sanguo map
// zone marker (D-07 content-in-DB).
const MAP_NODES = [
  {
    code: 'luoyang',
    nameVi: 'Lạc Dương',
    nameEn: 'Luoyang',
    zone: 'trung_nguyen',
    nodeOrder: 1,
    representativeHeroId: 'dong_trac',
  },
  {
    code: 'changan',
    nameVi: 'Trường An',
    nameEn: 'Chang\u2019an',
    zone: 'quan_trung',
    nodeOrder: 2,
    representativeHeroId: 'han_xian_di',
  },
  {
    code: 'xuchang',
    nameVi: 'Hứa Xương',
    nameEn: 'Xuchang',
    zone: 'trung_nguyen',
    nodeOrder: 3,
    representativeHeroId: 'cao_cao',
  },
  {
    code: 'yecheng',
    nameVi: 'Nghiệp Thành',
    nameEn: 'Yecheng',
    zone: 'trung_nguyen',
    nodeOrder: 4,
    representativeHeroId: 'yuan_shao',
  },
  {
    code: 'jianye',
    nameVi: 'Kiến Nghiệp',
    nameEn: 'Jianye',
    zone: 'giang_dong',
    nodeOrder: 5,
    representativeHeroId: 'sun_jian',
  },
  {
    code: 'jiangling',
    nameVi: 'Giang Lăng',
    nameEn: 'Jiangling',
    zone: 'kinh_chau',
    nodeOrder: 6,
    representativeHeroId: 'liu_biao',
  },
  {
    code: 'chengdu',
    nameVi: 'Thành Đô',
    nameEn: 'Chengdu',
    zone: 'thuc_trung',
    nodeOrder: 7,
    representativeHeroId: 'liu_bei',
  },
];

// Placeholder sanguo_items (2-4) — unique code per item.
const SANGUO_ITEMS = [
  {
    code: 'heal_pill',
    nameVi: 'Đan Trị Thương',
    nameEn: 'Healing Pill',
    itemType: 'support',
    rarity: 1,
    basePrice: 10n,
  },
  {
    code: 'xian_tea',
    nameVi: 'Linh Trà',
    nameEn: 'Spirit Tea',
    itemType: 'support',
    rarity: 1,
    basePrice: 25n,
  },
  {
    code: 'qinglong_dan',
    nameVi: 'Thanh Long Đan',
    nameEn: 'Azure Dragon Pill',
    itemType: 'consumable',
    rarity: 2,
    basePrice: 120n,
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function seed() {
  // --- Heroes (D-09: all 132, fail fast) -----------------------------------
  const rawHeroes = JSON.parse(fs.readFileSync(HEROES_JSON_PATH, 'utf8')) as HeroJsonEntry[];
  if (rawHeroes.length !== 132) {
    throw new Error(`[Seed] Expected 132 heroes in heroes-v1.json, got ${rawHeroes.length}`);
  }

  // Fail fast on unmapped faction/role — never silently skip a hero (T-08-07)
  const factionToEnum = new Map<string, HeroFaction>();
  const roleToEnum = new Map<string, HeroRole>();
  for (const [vi, e] of Object.entries(FACTION_MAP)) factionToEnum.set(vi, e);
  for (const r of ROLE_VALUES) roleToEnum.set(r, r);

  const heroRows: (typeof schema.heroes.$inferInsert)[] = rawHeroes.map((h) => {
    const faction = factionToEnum.get(h.faction);
    if (!faction) throw new Error(`[Seed] Unmapped faction "${h.faction}" for hero ${h.id}`);
    const role = roleToEnum.get(h.role);
    if (!role) throw new Error(`[Seed] Unmapped role "${h.role}" for hero ${h.id}`);
    return {
      heroId: h.id,
      nameVi: h.name,
      nameEn: h.en,
      // nameZh intentionally omitted (D-06 — filled by task-5 Tavily research)
      faction,
      role,
      gender: h.gender ?? null,
      people: h.people ?? null,
      titleVi: h.title ?? null,
      weapon: h.weapon ?? null,
      detailEn: h.detail ?? null,
    };
  });

  let heroCount = 0;
  for (const row of heroRows) {
    const [inserted] = await db
      .insert(schema.heroes)
      .values(row)
      .onConflictDoUpdate({
        target: schema.heroes.heroId,
        set: {
          nameVi: row.nameVi,
          nameEn: row.nameEn,
          titleVi: row.titleVi,
          weapon: row.weapon,
          gender: row.gender,
          people: row.people,
          detailEn: row.detailEn,
          faction: row.faction,
          role: row.role,
        },
      })
      .returning({ id: schema.heroes.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert hero: ${row.heroId}`);
    heroCount++;
  }

  // --- Map nodes (D-10 placeholders) ---------------------------------------
  let nodeCount = 0;
  for (const node of MAP_NODES) {
    const [inserted] = await db
      .insert(schema.mapNodes)
      .values({
        code: node.code,
        nameVi: node.nameVi,
        nameEn: node.nameEn,
        zone: node.zone,
        nodeOrder: node.nodeOrder,
        representativeHeroId: node.representativeHeroId,
      })
      .onConflictDoUpdate({
        target: schema.mapNodes.code,
        set: {
          nameVi: node.nameVi,
          nameEn: node.nameEn,
          zone: node.zone,
          nodeOrder: node.nodeOrder,
          representativeHeroId: node.representativeHeroId,
        },
      })
      .returning({ id: schema.mapNodes.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert map node: ${node.code}`);
    nodeCount++;
  }

  // --- Sanguo items ----------------------------------------------------------
  let itemCount = 0;
  for (const item of SANGUO_ITEMS) {
    const [inserted] = await db
      .insert(schema.sanguoItems)
      .values({
        code: item.code,
        nameVi: item.nameVi,
        nameEn: item.nameEn,
        itemType: item.itemType,
        rarity: item.rarity,
        basePrice: item.basePrice,
      })
      .onConflictDoUpdate({
        target: schema.sanguoItems.code,
        set: {
          nameVi: item.nameVi,
          nameEn: item.nameEn,
          itemType: item.itemType,
          rarity: item.rarity,
          basePrice: item.basePrice,
        },
      })
      .returning({ id: schema.sanguoItems.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert item: ${item.code}`);
    itemCount++;
  }

  console.log(`[Seed] ${heroCount} heroes, ${nodeCount} map_nodes, ${itemCount} items upserted`);
  console.log('[Seed] Sanguo seed complete!');
}

seed()
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
