/**
 * Phase 08 Sanguo Content Seed (TQC-02, D-05/D-06/D-09/D-10/D-11/D-12)
 *
 * Seeds: 132 heroes (heroes-v1.json), 5-10 placeholder map_nodes, 2-4 sanguo_items.
 *
 * Idempotent: INSERT ... ON CONFLICT DO UPDATE keyed on natural keys
 * (heroes.heroId, map_nodes.code, sanguo_items.code) — re-running updates
 * changed content and never duplicates rows (D-11).
 *
 * name_zh is sourced from scripts/data/sanguo-zh-names.json (D-06) — the
 * committed Tavily-researched ZH-CN map keyed by hero_id / node code / item
 * code. The data file is dev-time only (never read at runtime); a missing file
 * logs a warning and yields an empty map so a deploy without the data still
 * runs, seeding name_zh NULL. The upsert set clauses carry nameZh via a
 * clobber-safe conditional spread: nameZh is written whenever a researched
 * value exists, and an entry-less re-run can never clobber a researched value
 * with NULL (D-11/D-06).
 *
 * Dev-time source: scripts/data/heroes-v1.json (committed repo copy — deploy-safe
 * default; override with env SANGUO_HEROES_SOURCE for the sibling repo). Requires:
 * DATABASE_URL_DIRECT (bypasses PgBouncer).
 *
 * representative_hero_id values are written in the heroes.hero_id (snake_case)
 * space; heroEmoji() resolves them to their 3-letter emoji prefix via the
 * generated SANSUO_HERO_EMOJI_CODES map (CR-01 review fix).
 *
 * Run: npx tsx scripts/seed-sanguo.ts  (or: npm run seed:sanguo)
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
// The committed repo copy (scripts/data/heroes-v1.json) is the deploy-safe
// default: the Linux server has no sibling repo. Local regeneration may point
// SANGUO_HEROES_SOURCE at the sibling repo's heroes-v1.json instead.
const HEROES_JSON_PATH =
  process.env['SANGUO_HEROES_SOURCE'] ?? fileURLToPath(new URL('./data/heroes-v1.json', import.meta.url));
const ZH_NAMES_PATH = fileURLToPath(new URL('./data/sanguo-zh-names.json', import.meta.url));

// Committed Tavily-researched ZH-CN name map (D-06). Missing file -> empty map
// so a deploy without the data still runs (seeds name_zh NULL).
interface ZhNames {
  heroes: Record<string, string>;
  mapNodes: Record<string, string>;
  items: Record<string, string>;
}
const EMPTY_ZH: ZhNames = { heroes: {}, mapNodes: {}, items: {} };
function loadZhNames(): ZhNames {
  try {
    return JSON.parse(fs.readFileSync(ZH_NAMES_PATH, 'utf8')) as ZhNames;
  } catch {
    console.warn('[Seed] WARNING: scripts/data/sanguo-zh-names.json not found — seeding name_zh as NULL');
    return EMPTY_ZH;
  }
}
const zhNames = loadZhNames();

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
    // D-06: nameZh from the committed Tavily-researched map (never agent-guessed)
    const nameZh = zhNames.heroes[h.id] ?? null;
    return {
      heroId: h.id,
      nameVi: h.name,
      nameEn: h.en,
      nameZh,
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
    // Clobber-safe set (D-11/D-06): nameZh only when a researched value exists,
    // so an entry-less re-run can never overwrite a researched value with NULL.
    const zh = row.nameZh;
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
          ...(zh ? { nameZh: zh } : {}),
        },
      })
      .returning({ id: schema.heroes.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert hero: ${row.heroId}`);
    heroCount++;
  }

  // --- Map nodes (D-10 placeholders) ---------------------------------------
  let nodeCount = 0;
  for (const node of MAP_NODES) {
    const zh = zhNames.mapNodes[node.code] ?? null;
    const [inserted] = await db
      .insert(schema.mapNodes)
      .values({
        code: node.code,
        nameVi: node.nameVi,
        nameEn: node.nameEn,
        nameZh: zh,
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
          ...(zh ? { nameZh: zh } : {}),
        },
      })
      .returning({ id: schema.mapNodes.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert map node: ${node.code}`);
    nodeCount++;
  }

  // --- Sanguo items ----------------------------------------------------------
  let itemCount = 0;
  for (const item of SANGUO_ITEMS) {
    const zh = zhNames.items[item.code] ?? null;
    const [inserted] = await db
      .insert(schema.sanguoItems)
      .values({
        code: item.code,
        nameVi: item.nameVi,
        nameEn: item.nameEn,
        nameZh: zh,
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
          ...(zh ? { nameZh: zh } : {}),
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
