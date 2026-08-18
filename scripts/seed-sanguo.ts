/**
 * Phase 08 Sanguo Content Seed (TQC-02, D-05/D-06/D-09/D-10/D-11/D-12)
 * Phase 08 post-gate: hero classifications (faction/role/class/family) from
 * scripts/data/sanguo-classifications.json — 14 flat factions seeded first,
 * heroes reference faction_id FK.
 *
 * Seeds: 14 hero_factions, 132 heroes (heroes-v1.json + classifications),
 * TQC-09 map data (18 map_zones, 73 map_nodes, 162 map_edges, 208
 * hero_zone_rates from scripts/data/sanguo-map-data.json — D-20 full-replace),
 * 2-4 sanguo_items, 2 spouse relations.
 *
 * Idempotent: INSERT ... ON CONFLICT DO UPDATE keyed on natural keys
 * (heroes.heroId, map_nodes.code, sanguo_items.code) — re-running updates
 * changed content and never duplicates rows (D-11). The map-data section is a
 * FULL-REPLACE flow (B3): mapEdges + heroZoneRates + mapNodes are deleted
 * (child→parent) and re-inserted from the committed dataset every run, so the
 * final state is always exactly 18/73/162/208 rows — never accumulating
 * duplicates across re-runs (D-20 idempotency fix).
 *
 * name_zh is sourced from scripts/data/sanguo-zh-names.json (D-06) — the
 * committed Tavily-researched ZH-CN map keyed by hero_id / node code / item
 * code. The data file is dev-time only (never read at runtime); a missing file
 * logs a warning and yields an empty map so a deploy without the data still
 * runs, seeding name_zh NULL. The upsert set clauses carry nameZh via a
 * clobber-safe conditional spread: nameZh is written whenever a researched
 * value exists, and an entry-less re-run can never clobber a researched value
 * with NULL (D-11/D-06). TQC-09 map nodes/zones carry their nameZh inside the
 * committed map dataset itself (transcribed from the RESEARCH zh column where
 * provided; the same clobber-safe spread applies).
 *
 * Phase 10 base stats (10-04, D-02/D-08): scripts/data/sanguo-base-stats.json
 * is a REQUIRED dataset (like classifications — a missing/corrupt file is
 * FATAL, unlike zh-names) carrying { heroId: { str, agi, int, mov, lea, cha,
 * hp, mp, rarity, tier } } for all 132 heroes. The hero upsert set clause
 * writes the ten columns via a clobber-safe spread guarded on the heroId
 * having an entry — a dataset entry missing a heroId leaves the column
 * untouched (never writes NULL over an existing value, mirroring nameZh).
 * The dataset is complete (Task 1 cross-check: 0 missing, 0 orphan), so the
 * spread is unconditional-but-guarded for safety (D-11 clobber-safe).
 *
 * A2 TEMPLATE TABLE (RESEARCH assumption A2 — class-template generation, NOT
 * per-hero hand-tuning): base stats are per-class templates + per-hero
 * modifiers by prominence (rarity) + deterministic hash jitter. The template
 * table, the prominence modifiers and the starter boost are documented in the
 * dataset's generator provenance (10-04-SUMMARY.md); summary of the shapes:
 *   vanguard    ~ high STR/HP (58/210 median),  cavalry ~ high AGI/MOV (62/68),
 *   archer      ~ high AGI/INT (62/52),       spellcaster ~ high INT/MP (66/170),
 *   schemer     ~ high INT/LEA (60/62),       vu_co/thu_binh/cong_binh ~ balanced
 *   MAX(STR,INT). HP/MP in the 50-300 band, six stats in the 10-90 band so
 *   combatStat = base + IV (0-31) yields sane deltas under the D-05 formula.
 * Rarity is binned to the SIGNED D-20 distribution (60/25/10/4/1) —
 * 79/33/13/5/2 for 132 heroes (deviation per bin <= 0.7, small-population
 * rounding per the D-20 re-sign). Public tier (★1-5) is seeded INDEPENDENTLY
 * of hidden rarity (rarity + deterministic hash jitter, clamped 1-5) — the
 * collection renders stars from tier, never rarity (D-12). The six starter
 * heroes (cao_cao/liu_bei/sun_jian/truong_giac/yuan_shao/dong_trac, names
 * locked D-14) carry starter-appropriate stats = class-template median + a
 * small flat boost so the first hero feels usable.
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
import { notInArray, eq } from 'drizzle-orm';
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

// Phase 11 multi-class (hero_classes join table) — the set of formation classes
// each hero may fill (a superset of the primary heroes.class). Content-in-DB,
// consumed by legion slot matching. REQUIRED dataset.
const HERO_CLASSES_PATH = fileURLToPath(new URL('./data/sanguo-hero-classes.json', import.meta.url));
function loadHeroClasses(): Record<string, string[]> {
  try {
    return JSON.parse(fs.readFileSync(HERO_CLASSES_PATH, 'utf8')) as Record<string, string[]>;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-hero-classes.json not found — 132 hero multi-class assignments required');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Phase 10 base stats (10-04, D-02/D-08) — committed dev-time content consumed
// by the hero upsert. REQUIRED (unlike zh-names): a missing/corrupt file is
// FATAL because every battle formula (10-01 combatStat), capture math (10-05)
// and collection line (10-07) reads these numbers — content gates the phase.
// ---------------------------------------------------------------------------
interface HeroBaseStats {
  str: number;
  agi: number;
  int: number;
  mov: number;
  lea: number;
  cha: number;
  hp: number;
  mp: number;
  rarity: number;
  tier: number;
}

const BASE_STATS_PATH = fileURLToPath(new URL('./data/sanguo-base-stats.json', import.meta.url));
function loadBaseStats(): Record<string, HeroBaseStats> {
  try {
    return JSON.parse(fs.readFileSync(BASE_STATS_PATH, 'utf8')) as Record<string, HeroBaseStats>;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-base-stats.json not found — 132 hero base stats (str/agi/int/mov/lea/cha/hp/mp/rarity/tier) required');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// TQC-09 map dataset (D-16/D-17/D-20/D-21) — committed dev-time data consumed
// by the seed. 18 zones / 73 nodes / 162 edges / 208 hero_zone_rates rows
// (machine-verified counts, RESEARCH §TQC-09 Dataset Design). This dataset is
// REQUIRED — a missing/corrupt file is FATAL (unlike zh-names, whose absence
// only yields NULL name_zh). The D-20 full-replace flow deletes the previous
// map data (mapEdges + heroZoneRates + mapNodes, child→parent) and re-inserts
// from this file, so re-runs always end with the same row counts.
// ---------------------------------------------------------------------------
const MAP_DATA_PATH = fileURLToPath(new URL('./data/sanguo-map-data.json', import.meta.url));

interface ZoneDef {
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh?: string;
  sortOrder: number;
}

interface NodeDef {
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh?: string;
  zone: string;
  nodeOrder: number;
  representativeHeroId: string;
}

interface EdgeDef {
  nodeA: string;
  nodeB: string;
  travelSeconds: number;
}

interface HeroZoneRateDef {
  heroId: string;
  zone: string;
  rate: number;
}

interface SanguoMapData {
  zones: ZoneDef[];
  nodes: NodeDef[];
  edges: EdgeDef[];
  heroZoneRates: HeroZoneRateDef[];
}

function loadSanguoMapData(): SanguoMapData {
  try {
    return JSON.parse(fs.readFileSync(MAP_DATA_PATH, 'utf8')) as SanguoMapData;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-map-data.json not found or corrupt — TQC-09 map dataset (18 zones/73 nodes/162 edges/208 rates) required');
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

// ---------------------------------------------------------------------------
// Phase 11 content datasets (11-02, D-11/D-30/D-21) — committed dev-time data
// consumed by the seed. All three are REQUIRED (FATAL on missing/corrupt —
// mirror sanguo-base-stats.json): the shop (11-04), boss drops (11-04) and
// the encounter skill roll (11-06) resolve against these catalogs, so a
// silently-empty catalog would break every Phase 11 service.
//
// sanguo-skills.json    — class-based skill pools (mechanics + emoji ONLY;
//                         names are i18n keys sanguo:skills.*, D-30)
// sanguo-items.json     — the D-11 item catalog (REPLACES the Phase 8
//                         placeholder SANGUO_ITEMS below)
// sanguo-formations.json— starter (free) + purchasable formations with their
//                         12-slot class layouts (D-21)
// ---------------------------------------------------------------------------
interface SkillDef {
  skillId: string;
  class: string;
  slot: 'normal' | 'special';
  rarity: 'common' | 'rare' | 'epic';
  mpCost: number;
  mpGain: number;
  effectType: 'damage' | 'attack_up' | 'hp_regen' | 'mp_regen';
  effectValue: number;
  emoji: string;
}

interface ItemDef {
  code: string;
  nameVi: string;
  nameEn: string;
  itemType: string;
  rarity: number;
  priceLinh: number;
  priceEvent: number;
  saleState: 'sold' | 'locked';
  dropWeight: number;
  emoji: string;
}

interface FormationSlotDef {
  slotOrder: number;
  class: string;
  position: string | null;
}

interface FormationDef {
  code: string;
  nameVi: string;
  nameEn: string;
  slotCount: number;
  basePrice: number;
  emoji: string;
  slots: FormationSlotDef[];
}

const SKILLS_PATH = fileURLToPath(new URL('./data/sanguo-skills.json', import.meta.url));
function loadSkills(): SkillDef[] {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf8')) as { skills: SkillDef[] };
    return data.skills;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-skills.json not found or corrupt — class-based skill pools (normal + special per class) required');
    process.exit(1);
  }
}

const ITEMS_PATH = fileURLToPath(new URL('./data/sanguo-items.json', import.meta.url));
function loadItems(): ItemDef[] {
  try {
    const data = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8')) as { items: ItemDef[] };
    return data.items;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-items.json not found or corrupt — the D-11 item catalog (heal_pill/booster_x2/capture keys) required');
    process.exit(1);
  }
}

const FORMATIONS_PATH = fileURLToPath(new URL('./data/sanguo-formations.json', import.meta.url));
function loadFormations(): FormationDef[] {
  try {
    const data = JSON.parse(fs.readFileSync(FORMATIONS_PATH, 'utf8')) as { formations: FormationDef[] };
    return data.formations;
  } catch {
    console.error('[Seed] FATAL: scripts/data/sanguo-formations.json not found or corrupt — formation catalog (starter + purchasable) required');
    process.exit(1);
  }
}

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
  const baseStats = loadBaseStats();
  for (const row of heroRows) {
    // Clobber-safe set (D-11/D-06): nameZh only when a researched value exists,
    // so an entry-less re-run can never overwrite a researched value with NULL.
    const zh = row.nameZh;
    // Phase 10 base stats (10-04): the ten content columns are written from the
    // committed dataset when the heroId has an entry — an entry-less heroId
    // leaves the columns untouched (never NULL-clobbers, mirroring nameZh).
    // The dataset is complete (132/132), so the spread is unconditional-but-
    // guarded for safety. Starters are already part of the 132-hero set — no
    // separate insert path is needed (10-07 starter picker finds their rows).
    const st = baseStats[row.heroId];
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
          ...(st
            ? {
                str: st.str,
                agi: st.agi,
                int: st.int,
                mov: st.mov,
                lea: st.lea,
                cha: st.cha,
                hp: st.hp,
                mp: st.mp,
                rarity: st.rarity,
                tier: st.tier,
              }
            : {}),
        },
      })
      .returning({ id: schema.heroes.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert hero: ${row.heroId}`);
    heroCount++;
  }

  // --- Hero multi-class (Phase 11, hero_classes join table) -----------------
  // The primary combat class stays on heroes.class (battle attack type + skill
  // pool); the join table carries the set of formation classes the hero may
  // fill in a legion. Full-replace per hero (delete + re-insert) keyed on the
  // unique (hero_id, class) index — idempotent, never accumulates.
  const heroClasses = loadHeroClasses();
  const heroIdToClassDbId = new Map<string, number>();
  const heroDbRows = await db.select({ heroId: schema.heroes.heroId, id: schema.heroes.id }).from(schema.heroes);
  for (const h of heroDbRows) heroIdToClassDbId.set(h.heroId, h.id);

  let classCount = 0;
  for (const h of rawHeroes) {
    const dbId = heroIdToClassDbId.get(h.id);
    if (!dbId) throw new Error(`[Seed] Missing hero row for class assignment: ${h.id}`);
    const clsList = heroClasses[h.id];
    if (!clsList || clsList.length === 0) {
      throw new Error(`[Seed] Missing multi-class assignment for hero ${h.id}`);
    }
    // Ensure the primary class is always present in the set.
    const primary = classifications[h.id].class;
    const fullSet = clsList.includes(primary) ? clsList : [primary, ...clsList];
    await db.delete(schema.heroClasses).where(eq(schema.heroClasses.heroId, dbId));
    for (const cls of fullSet) {
      await db.insert(schema.heroClasses).values({
        heroId: dbId,
        class: cls as NonNullable<typeof schema.heroes.$inferInsert['class']>,
      });
      classCount++;
    }
  }

  // --- Map data (TQC-09, D-20 full-replace) ---------------------------------
  // The committed dataset (scripts/data/sanguo-map-data.json) fully owns the
  // map data: 18 zones, 73 nodes, 162 edges, 208 hero_zone_rates. The D-20
  // reseed REPLACES the Phase 8 placeholder nodes. Child collections (edges +
  // rates, keyed on node ids) are deleted each run and re-derived below.
  //
  // CR-10-01: mapNodes is NOT full-deleted — deleting + re-inserting assigns
  // NEW serial ids each run, orphaning any in-flight player_travel_state row
  // (from_node_id/to_node_id) → NODE_NOT_FOUND on /sanguo travel (observed
  // live 2026-08-14: Phase 10 reseed broke user 3's journey). Instead, ONLY
  // stale nodes (code no longer in the dataset) are deleted; surviving codes
  // keep their ids via the onConflictDoUpdate(code) upsert below.
  const mapData = loadSanguoMapData();
  const mapCodes = new Set(mapData.nodes.map((n) => n.code));

  await db.delete(schema.mapEdges); // child first (no FK) — re-derived below
  await db.delete(schema.heroZoneRates); // child (references heroes + zone code)
  await db.delete(schema.mapNodes).where(notInArray(schema.mapNodes.code, [...mapCodes]));

  // Zones (D-19 reference table) — clobber-safe nameZh spread (Pitfall 6)
  let zoneCount = 0;
  for (const zone of mapData.zones) {
    const zh = zone.nameZh ?? null;
    const [inserted] = await db
      .insert(schema.mapZones)
      .values({
        code: zone.code,
        nameVi: zone.nameVi,
        nameEn: zone.nameEn,
        nameZh: zh,
        sortOrder: zone.sortOrder,
      })
      .onConflictDoUpdate({
        target: schema.mapZones.code,
        set: {
          nameVi: zone.nameVi,
          nameEn: zone.nameEn,
          sortOrder: zone.sortOrder,
          ...(zh ? { nameZh: zh } : {}),
        },
      })
      .returning({ id: schema.mapZones.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert map zone: ${zone.code}`);
    zoneCount++;
  }

  // Nodes — upsert on code, build the code→id map for edges/rates (D-20-resilient)
  let nodeCount = 0;
  const nodeIdByCode = new Map<string, number>();
  for (const node of mapData.nodes) {
    const zh = node.nameZh ?? null;
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
    nodeIdByCode.set(node.code, inserted.id);
    nodeCount++;
  }

  // Edges — canonical undirected pair (node_a < node_b) + onConflictDoNothing
  // keyed on the unique pair index; only inserted rows count (T-09-06).
  let edgeCount = 0;
  for (const edge of mapData.edges) {
    const aId = nodeIdByCode.get(edge.nodeA);
    const bId = nodeIdByCode.get(edge.nodeB);
    if (!aId || !bId) throw new Error(`[Seed] Edge references unknown map node: ${edge.nodeA}/${edge.nodeB}`);
    const [inserted] = await db
      .insert(schema.mapEdges)
      .values({
        nodeAId: Math.min(aId, bId),
        nodeBId: Math.max(aId, bId),
        travelSeconds: edge.travelSeconds,
      })
      .onConflictDoNothing()
      .returning({ id: schema.mapEdges.id });
    if (inserted) edgeCount++;
  }

  // hero_zone_rates (D-16/A3 per-zone granularity) — heroId resolved via the
  // heroIdToDbId map built for the spouse relations below (built before use).
  let rateCount = 0;
  const heroIdToDbId = new Map<string, number>();
  const heroesOut = await db.select({ heroId: schema.heroes.heroId, id: schema.heroes.id }).from(schema.heroes);
  for (const h of heroesOut) heroIdToDbId.set(h.heroId, h.id);
  for (const rate of mapData.heroZoneRates) {
    const heroDbId = heroIdToDbId.get(rate.heroId);
    if (!heroDbId) throw new Error(`[Seed] hero_zone_rate references unknown hero: ${rate.heroId}`);
    const [inserted] = await db
      .insert(schema.heroZoneRates)
      .values({ heroId: heroDbId, zone: rate.zone, rate: rate.rate })
      .onConflictDoNothing()
      .returning({ id: schema.heroZoneRates.id });
    if (inserted) rateCount++;
  }

  // --- Sanguo items (11-02 D-11 catalog — REPLACES the Phase 8 placeholder) --
  // The D-11 catalog is the single source for shop prices + boss drop weights
  // (Pitfall 8 single-source rule). capture_key sale_state stays 'locked'
  // (shown-not-sold, D-15) with dropWeight 0 — the drop pool's
  // WHERE drop_weight > 0 excludes the generic key by construction.
  const items = loadItems();
  const itemCodes = new Set(items.map((i) => i.code));
  let itemCount = 0;
  for (const item of items) {
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
        priceLinh: BigInt(item.priceLinh),
        priceEvent: BigInt(item.priceEvent),
        saleState: item.saleState,
        dropWeight: item.dropWeight,
        emoji: item.emoji,
      })
      .onConflictDoUpdate({
        target: schema.sanguoItems.code,
        set: {
          nameVi: item.nameVi,
          nameEn: item.nameEn,
          itemType: item.itemType,
          rarity: item.rarity,
          priceLinh: BigInt(item.priceLinh),
          priceEvent: BigInt(item.priceEvent),
          saleState: item.saleState,
          dropWeight: item.dropWeight,
          emoji: item.emoji,
          ...(zh ? { nameZh: zh } : {}),
        },
      })
      .returning({ id: schema.sanguoItems.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert item: ${item.code}`);
    itemCount++;
  }
  // Delete codes no longer in the catalog (the Phase 8 placeholder item
  // codes) so no stale purchasable/droppable item survives (T-11-02-02
  // spoofing mitigation).
  const staleRows = await db.delete(schema.sanguoItems).where(notInArray(schema.sanguoItems.code, [...itemCodes]));
  if (staleRows.rowCount > 0) {
    console.log(`[Seed] Removed ${staleRows.rowCount} stale sanguo_items row(s) no longer in the catalog`);
  }

  // --- Sanguo skills (11-02 D-30 class-based pools) -------------------------
  // Mechanics + emoji ONLY — skill names render via i18n keys (sanguo:skills.*).
  // Each class gets a normal pool (common 80 / rare 20 weight) + a special
  // pool (common 60 / rare 30 / epic 10); vu_co carries a support-type
  // special (attack_up "buff sỹ khí", D-18).
  const skills = loadSkills();
  let skillCount = 0;
  for (const sk of skills) {
    const [inserted] = await db
      .insert(schema.sanguoSkills)
      .values({
        code: sk.skillId,
        class: sk.class,
        slot: sk.slot,
        rarity: sk.rarity,
        mpCost: sk.mpCost,
        mpGain: sk.mpGain,
        effectType: sk.effectType,
        effectValue: sk.effectValue,
        emoji: sk.emoji,
      })
      .onConflictDoUpdate({
        target: schema.sanguoSkills.code,
        set: {
          class: sk.class,
          slot: sk.slot,
          rarity: sk.rarity,
          mpCost: sk.mpCost,
          mpGain: sk.mpGain,
          effectType: sk.effectType,
          effectValue: sk.effectValue,
          emoji: sk.emoji,
        },
      })
      .returning({ id: schema.sanguoSkills.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert skill: ${sk.skillId}`);
    skillCount++;
  }

  // --- Formations + slots (11-02 D-21 catalog) ------------------------------
  // Starter 'can_ban' is FREE (basePrice 0 — onboarding grant, D-21); the two
  // purchasable formations carry the checkpoint-confirmed prices (thien_co
  // 200💎 / vu_sat 300💎 from the adopt-a5 200/300/500 set). formation_slots
  // upsert targets the P0-1 unique index (formationId, slotOrder) — added by
  // migration 0020 (11-01).
  const formations = loadFormations();
  let formationCount = 0;
  let formationSlotCount = 0;
  for (const f of formations) {
    const [inserted] = await db
      .insert(schema.formations)
      .values({
        code: f.code,
        nameVi: f.nameVi,
        nameEn: f.nameEn,
        slotCount: f.slotCount,
        basePrice: BigInt(f.basePrice),
        emoji: f.emoji,
      })
      .onConflictDoUpdate({
        target: schema.formations.code,
        set: {
          nameVi: f.nameVi,
          nameEn: f.nameEn,
          slotCount: f.slotCount,
          basePrice: BigInt(f.basePrice),
          emoji: f.emoji,
        },
      })
      .returning({ id: schema.formations.id });
    if (!inserted) throw new Error(`[Seed] Failed to upsert formation: ${f.code}`);
    for (const slot of f.slots) {
      await db
        .insert(schema.formationSlots)
        .values({
          formationId: inserted.id,
          slotOrder: slot.slotOrder,
          class: slot.class,
          position: slot.position ?? null,
          quantity: 1,
        })
        .onConflictDoUpdate({
          target: [schema.formationSlots.formationId, schema.formationSlots.slotOrder],
          set: {
            class: slot.class,
            position: slot.position ?? null,
            quantity: 1,
          },
        });
      formationSlotCount++;
    }
    formationCount++;
  }

  // --- Hero relations (Phase 8 post-gate — direct spouse pairs only) ---------
  // heroIdToDbId was built for the hero_zone_rates loop above (map-data section).
  let relationCount = 0;
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

  console.log(`[Seed] ${factionCount} factions, ${familyCount} families, ${relationCount} relations, ${heroCount} heroes, ${nodeCount} map_nodes, ${zoneCount} map_zones, ${edgeCount} map_edges, ${rateCount} hero_zone_rates, ${itemCount} items, ${skillCount} skills, ${formationCount} formations (${formationSlotCount} slots) upserted`);
  console.log('[Seed] Sanguo seed complete!');
}

seed()
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
