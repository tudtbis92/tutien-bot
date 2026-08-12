/**
 * Phase 08 Sanguo Content Seed (TQC-02, D-05/D-06/D-09/D-10/D-11/D-12)
 * Phase 08 post-gate: hero classifications (faction/role/class/family) from
 * scripts/data/sanguo-classifications.json — 14 flat factions seeded first,
 * heroes reference faction_id FK.
 *
 * Seeds: 14 hero_factions, 132 heroes (heroes-v1.json + classifications),
 * 5-10 placeholder map_nodes, 2-4 sanguo_items.
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
// Flat faction catalog (Phase 8 post-gate — hero_factions reference table).
// 14 top-level codes; hero factions resolved from sanguo-classifications.json.
// ---------------------------------------------------------------------------
interface FactionDef {
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  sortOrder: number;
}

const FACTIONS: FactionDef[] = [
  { code: 'han', nameVi: 'Hán', nameEn: 'Han', nameZh: '汉', sortOrder: 1 },
  { code: 'nguy', nameVi: 'Ngụy', nameEn: 'Wei', nameZh: '魏', sortOrder: 2 },
  { code: 'thuc', nameVi: 'Thục', nameEn: 'Shu', nameZh: '蜀', sortOrder: 3 },
  { code: 'ngo', nameVi: 'Ngô', nameEn: 'Wu', nameZh: '吴', sortOrder: 4 },
  { code: 'thap_thuong_thi', nameVi: 'Thập Thường Thị', nameEn: 'Ten Attendants', nameZh: '十常侍', sortOrder: 5 },
  { code: 'khan_vang', nameVi: 'Khăn Vàng', nameEn: 'Yellow Turbans', nameZh: '黄巾', sortOrder: 6 },
  { code: 'luong_chau', nameVi: 'Lương Châu', nameEn: 'Liang Province', nameZh: '凉州', sortOrder: 7 },
  { code: 'quan_hung', nameVi: 'Quần Hùng', nameEn: 'Warlords', nameZh: '群雄', sortOrder: 8 },
  { code: 'nam_man', nameVi: 'Nam Man', nameEn: 'Southern Man', nameZh: '南蛮', sortOrder: 9 },
  { code: 'o_hoan', nameVi: 'Ô Hoàn', nameEn: 'Wuhuan', nameZh: '乌桓', sortOrder: 10 },
  { code: 'son_viet', nameVi: 'Sơn Việt', nameEn: 'Shanyue', nameZh: '山越', sortOrder: 11 },
  { code: 'tien_ti', nameVi: 'Tiên Ti', nameEn: 'Xianbei', nameZh: '鲜卑', sortOrder: 12 },
  { code: 'hung_no', nameVi: 'Hung Nô', nameEn: 'Xiongnu', nameZh: '匈奴', sortOrder: 13 },
  { code: 'trieu_tien', nameVi: 'Triều Tiên cổ', nameEn: 'Ancient Korean Kingdoms', nameZh: '朝鲜古国', sortOrder: 14 },
];

// ---------------------------------------------------------------------------
// Bloodline family catalog (Phase 8 post-gate — hero_families reference table).
// One row per DISTINCT lineage — a surname like Liu/张 can host several
// unrelated families, so codes are bloodline-specific (liu_hoang_toc for the
// Han imperial Liu clan, zhang_khan_vang for the three Yellow Turban Zhang
// brothers, etc.). Chemistry (Phase 11) matches on exact family_id.
// ---------------------------------------------------------------------------
interface FamilyDef {
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

const FAMILIES: FamilyDef[] = [
  { code: 'liu_hoang_toc', nameVi: 'Lưu hoàng tộc', nameEn: 'Liu Imperial Clan', nameZh: '刘氏皇族' },
  { code: 'ha_ngoai_thich', nameVi: 'Hà thị ngoại thích', nameEn: 'He Consort Clan', nameZh: '何氏外戚' },
  { code: 'zhang_khan_vang', nameVi: 'Trương thị Khăn Vàng', nameEn: 'Zhang Yellow Turbans', nameZh: '张氏黄巾' },
  { code: 'sun', nameVi: 'Tôn thị', nameEn: 'Sun Clan', nameZh: '孙氏' },
  { code: 'cao', nameVi: 'Tào thị', nameEn: 'Cao Clan', nameZh: '曹氏' },
  { code: 'ma', nameVi: 'Mã thị', nameEn: 'Ma Clan', nameZh: '马氏' },
  { code: 'dong', nameVi: 'Đổng thị', nameEn: 'Dong Clan', nameZh: '董氏' },
  { code: 'yuan', nameVi: 'Viên thị', nameEn: 'Yuan Clan', nameZh: '袁氏' },
  { code: 'xiahou', nameVi: 'Hạ Hầu thị', nameEn: 'Xiahou Clan', nameZh: '夏侯氏' },
  { code: 'kuai', nameVi: 'Khoái thị', nameEn: 'Kuai Clan', nameZh: '蒯氏' },
  { code: 'shi', nameVi: 'Sĩ thị', nameEn: 'Shi Clan', nameZh: '士氏' },
  { code: 'kong', nameVi: 'Khổng thị', nameEn: 'Kong Clan', nameZh: '孔氏' },
];

// ---------------------------------------------------------------------------
// Spouse relations (Phase 8 post-gate — hero_relations, direct marriage only).
// In-law relations excluded by design: bond targets (Mi phu nhân, Thái phu
// nhân...) are NOT roster heroes, so no pair can be formed. hero_a < hero_b
// is enforced by caller (lexicographic hero_id order).
// ---------------------------------------------------------------------------
const SPOUSE_PAIRS: [string, string][] = [
  ['han_ling_di', 'ha_thai_hau'],
  ['han_ling_di', 'vuong_my_nhan'],
];

// ---------------------------------------------------------------------------
// Hero classification (Phase 8 post-gate) — committed Tavily-researched map.
// Keyed by hero_id; each entry { faction, role, class, family }.
// ---------------------------------------------------------------------------
interface HeroClassification {
  faction: string;
  role: NonNullable<typeof schema.heroes.$inferInsert['role']>;
  class: NonNullable<typeof schema.heroes.$inferInsert['class']>;
  family: string | null;
}

const CLASSIFICATIONS_PATH = fileURLToPath(new URL('./data/sanguo-classifications.json', import.meta.url));
function loadClassifications(): Record<string, HeroClassification> {
  try {
    return JSON.parse(fs.readFileSync(CLASSIFICATIONS_PATH, 'utf8')) as Record<string, HeroClassification>;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-classifications.json not found — 132 hero classifications required');
    process.exit(1);
  }
}

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
  // --- Hero factions (Phase 8 post-gate — flat reference table, seed first) ---
  const factionRows: (typeof schema.heroFactions.$inferInsert)[] = FACTIONS.map((f) => ({
    code: f.code,
    nameVi: f.nameVi,
    nameEn: f.nameEn,
    nameZh: f.nameZh,
    sortOrder: f.sortOrder,
  }));
  let factionCount = 0;
  for (const row of factionRows) {
    const [inserted] = await db
      .insert(schema.heroFactions)
      .values(row)
      .onConflictDoUpdate({
        target: schema.heroFactions.code,
        set: {
          nameVi: row.nameVi,
          nameEn: row.nameEn,
          nameZh: row.nameZh,
          sortOrder: row.sortOrder,
        },
      })
      .returning({ id: schema.heroFactions.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert faction: ${row.code}`);
    factionCount++;
  }
  const factionIdByCode = new Map<string, number>();
  const factionRowsOut = await db.select().from(schema.heroFactions);
  for (const f of factionRowsOut) factionIdByCode.set(f.code, f.id);

  // --- Hero families (Phase 8 post-gate — bloodline reference table) ---------
  let familyCount = 0;
  for (const fam of FAMILIES) {
    const [inserted] = await db
      .insert(schema.heroFamilies)
      .values(fam)
      .onConflictDoUpdate({
        target: schema.heroFamilies.code,
        set: { nameVi: fam.nameVi, nameEn: fam.nameEn, nameZh: fam.nameZh },
      })
      .returning({ id: schema.heroFamilies.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert family: ${fam.code}`);
    familyCount++;
  }
  const familyIdByCode = new Map<string, number>();
  const familyRowsOut = await db.select().from(schema.heroFamilies);
  for (const fam of familyRowsOut) familyIdByCode.set(fam.code, fam.id);

  // --- Heroes (D-09: all 132, fail fast) -----------------------------------
  const classifications = loadClassifications();
  const rawHeroes = JSON.parse(fs.readFileSync(HEROES_JSON_PATH, 'utf8')) as HeroJsonEntry[];
  if (rawHeroes.length !== 132) {
    throw new Error(`[Seed] Expected 132 heroes in heroes-v1.json, got ${rawHeroes.length}`);
  }

  // Fail fast on missing classification / unmapped faction — never silently skip
  const heroRows: (typeof schema.heroes.$inferInsert)[] = rawHeroes.map((h) => {
    const cls = classifications[h.id];
    if (!cls) throw new Error(`[Seed] Missing classification for hero ${h.id}`);
    const factionId = factionIdByCode.get(cls.faction);
    if (!factionId) throw new Error(`[Seed] Unmapped faction "${cls.faction}" for hero ${h.id}`);
    const familyId = cls.family ? familyIdByCode.get(cls.family) : undefined;
    if (cls.family && !familyId) throw new Error(`[Seed] Unmapped family "${cls.family}" for hero ${h.id}`);
    // D-06: nameZh from the committed Tavily-researched map (never agent-guessed)
    const nameZh = zhNames.heroes[h.id] ?? null;
    return {
      heroId: h.id,
      nameVi: h.name,
      nameEn: h.en,
      nameZh,
      factionId,
      role: cls.role,
      class: cls.class,
      familyId: familyId ?? null,
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
          factionId: row.factionId,
          role: row.role,
          class: row.class,
          familyId: row.familyId,
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

  // --- Hero relations (Phase 8 post-gate — direct spouse pairs only) ---------
  let relationCount = 0;
  const heroIdToDbId = new Map<string, number>();
  const heroesOut = await db.select({ heroId: schema.heroes.heroId, id: schema.heroes.id }).from(schema.heroes);
  for (const h of heroesOut) heroIdToDbId.set(h.heroId, h.id);
  for (const [a, b] of SPOUSE_PAIRS) {
    const aId = heroIdToDbId.get(a);
    const bId = heroIdToDbId.get(b);
    if (!aId || !bId) throw new Error(`[Seed] Spouse pair references unknown hero: ${a}/${b}`);
    // Undirected pair: enforce hero_a < hero_b (numeric) to avoid duplicates
    const [inserted] = await db
      .insert(schema.heroRelations)
      .values({
        heroAId: Math.min(aId, bId),
        heroBId: Math.max(aId, bId),
        relationType: 'spouse',
      })
      .onConflictDoNothing()
      .returning({ id: schema.heroRelations.id });
    if (inserted) relationCount++;
  }

  console.log(`[Seed] ${factionCount} factions, ${familyCount} families, ${relationCount} relations, ${heroCount} heroes, ${nodeCount} map_nodes, ${itemCount} items upserted`);
  console.log('[Seed] Sanguo seed complete!');
}

seed()
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
