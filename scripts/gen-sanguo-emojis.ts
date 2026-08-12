/**
 * Build-time generator for the sanguo emoji registry (D-13).
 *
 * Reads the sibling repo's emojis.json (E:\Saeth\sanguo_assets\assets\emojis.json
 * by default, override with env SANGUO_EMOJIS_SOURCE) and its codes.js hero-id
 * mapping (E:\Saeth\sanguo_assets\src\data\codes.js by default, override with
 * env SANGUO_HERO_CODES_SOURCE), and emits the committed registry module
 * src/assets/sanguoEmojis.ts.
 *
 * The generated SANSUO_HERO_EMOJI_CODES map lets heroEmoji() accept a
 * snake_case hero id (heroes.hero_id / map_nodes.representative_hero_id space,
 * D-07/D-11) and resolve it to its 3-letter emoji prefix — the map command
 * renders a heroEmoji() marker per zone from the DB value.
 *
 * Runtime NEVER reads the sibling repo — the committed generated file is the
 * only runtime source of emoji data.
 *
 * Usage: npx tsx scripts/gen-sanguo-emojis.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = process.env.SANGUO_EMOJIS_SOURCE ?? 'E:\\Saeth\\sanguo_assets\\assets\\emojis.json';
const CODES_PATH = process.env.SANGUO_HERO_CODES_SOURCE ?? 'E:\\Saeth\\sanguo_assets\\src\\data\\codes.js';
const OUT_PATH = path.join(__dirname, '../src/assets/sanguoEmojis.ts');
const MIN_HERO_PREFIXES = 132;
const TIER_VARIANTS = ['_t0', '_t0_star', '_t1', '_t1_star', '_t2', '_t2_star', '_t3', '_t3_star'] as const;
// Key shape: '<hero_id>_t<tier>[_star]' — e.g. abt_t0, abt_t3_star
const KEY_PATTERN = /^[a-z0-9_]+_t[0-3](_star)?$/;

interface EmojisFile {
  applicationId: string;
  emojis: Record<string, string>;
}

function fail(message: string): never {
  console.error(`❌ gen-sanguo-emojis: ${message}`);
  process.exit(1);
}

function loadSource(): EmojisFile {
  let raw: string;
  try {
    raw = readFileSync(SOURCE_PATH, 'utf-8');
  } catch (err) {
    fail(`cannot read source file ${SOURCE_PATH} — ${(err as Error).message}`);
  }
  let data: EmojisFile;
  try {
    data = JSON.parse(raw) as EmojisFile;
  } catch (err) {
    fail(`source file is not valid JSON: ${(err as Error).message}`);
  }
  if (!data || typeof data !== 'object' || typeof data.applicationId !== 'string' || !data.emojis) {
    fail('source file must contain top-level applicationId (string) and emojis (object)');
  }
  // Discord snowflakes are 17-20 digit unsigned 64-bit ids (the D-16 value is 19 digits)
  if (!/^\d{17,20}$/.test(data.applicationId)) {
    fail(`applicationId "${data.applicationId}" is not a valid Discord application id (17-20 digits)`);
  }
  return data;
}

function validateEmojis(emojis: Record<string, string>): void {
  const entries = Object.entries(emojis);
  for (const [key, value] of entries) {
    if (!KEY_PATTERN.test(key)) {
      fail(`emoji key "${key}" does not match pattern <hero_id>_t<tier>[_star]`);
    }
    if (!/^\d{17,20}$/.test(value)) {
      fail(`emoji value for "${key}" ("${value}") is not a valid Discord emoji id`);
    }
  }
  const prefixes = new Set<string>();
  for (const key of Object.keys(emojis)) {
    prefixes.add(key.replace(/_t[0-3](_star)?$/, ''));
  }
  if (prefixes.size < MIN_HERO_PREFIXES) {
    fail(`only ${prefixes.size} distinct hero prefixes — expected at least ${MIN_HERO_PREFIXES}`);
  }
  // WR-03 (review): every hero prefix must have the complete tier/star variant set,
  // otherwise heroEmoji()'s t0 fallback silently renders the wrong visual.
  for (const prefix of prefixes) {
    const missing = TIER_VARIANTS.filter((v) => emojis[`${prefix}${v}`] === undefined);
    if (missing.length > 0) {
      fail(`hero prefix "${prefix}" is missing emoji variants: ${missing.join(', ')}`);
    }
  }
}

interface HeroCodesModule {
  HERO_CODES?: Record<string, string>;
}

async function loadHeroCodes(): Promise<Record<string, string>> {
  try {
    const mod = (await import(pathToFileURL(CODES_PATH).href)) as HeroCodesModule;
    if (!mod.HERO_CODES || typeof mod.HERO_CODES !== 'object') {
      fail(`codes module ${CODES_PATH} does not export a HERO_CODES object`);
    }
    return mod.HERO_CODES as Record<string, string>;
  } catch (err) {
    fail(`cannot load hero codes from ${CODES_PATH} — ${(err as Error).message}`);
  }
}

function validateHeroCodes(heroCodes: Record<string, string>, emojis: Record<string, string>): void {
  const prefixes = new Set(Object.keys(emojis).map((k) => k.replace(/_t[0-3](_star)?$/, '')));
  const heroIds = Object.keys(heroCodes);
  if (heroIds.length < MIN_HERO_PREFIXES) {
    fail(`only ${heroIds.length} hero codes — expected at least ${MIN_HERO_PREFIXES}`);
  }
  const codeSet = new Set<string>();
  for (const [heroId, code] of Object.entries(heroCodes)) {
    if (typeof code !== 'string' || code.length === 0) {
      fail(`hero "${heroId}" has an invalid code "${code}"`);
    }
    const prefix = code.toLowerCase();
    if (!prefixes.has(prefix)) {
      fail(`hero "${heroId}" code "${code}" has no matching emoji prefix "${prefix}" — registry and codes.js are out of sync`);
    }
    if (codeSet.has(code.toLowerCase())) {
      fail(`duplicate emoji prefix "${code.toLowerCase()}" (heroes ${heroId} and another) — codes are not unique`);
    }
    codeSet.add(code.toLowerCase());
  }
  for (const prefix of prefixes) {
    if (!codeSet.has(prefix)) {
      fail(`emoji prefix "${prefix}" has no hero id in codes.js — every registry prefix must map to a hero`);
    }
  }
}

function renderKeyLines(emojis: Record<string, string>): string[] {
  return Object.keys(emojis)
    .sort() // deterministic: stable sorted order → idempotent output
    .map((key) => `  ${key}: '${emojis[key]}',`);
}

function renderFile(applicationId: string, emojis: Record<string, string>, heroCodes: Record<string, string>): string {
  const keyLines = renderKeyLines(emojis);
  const codeLines = Object.keys(heroCodes)
    .sort()
    .map((heroId) => `  ${heroId}: '${heroCodes[heroId]!.toLowerCase()}',`);
  return `/* eslint-disable i18next/no-literal-string -- generated emoji registry: IDs are machine data, not UI strings */
// Generated by scripts/gen-sanguo-emojis.ts — DO NOT EDIT BY HAND.
// Source: sibling repo emojis.json + codes.js (dev-time only; runtime never reads it — D-13)

export const SANSUO_EMOJI_APPLICATION_ID = '${applicationId}' as const;

export const SANSUO_EMOJIS = {
${keyLines.join('\n')}
} as const;

/**
 * snake_case hero id (heroes.hero_id / map_nodes.representative_hero_id space,
 * D-07/D-11) -> 3-letter emoji prefix. Generated from the sibling repo's
 * codes.js so heroEmoji() can render a marker for a DB-stored hero id.
 */
export const SANSUO_HERO_EMOJI_CODES = {
${codeLines.join('\n')}
} as const;

export type SanguoEmojiKey = keyof typeof SANSUO_EMOJIS;
export type SanguoTier = 0 | 1 | 2 | 3;

/**
 * Resolve a hero id to its 3-letter emoji prefix. Accepts either the snake_case
 * hero id (looked up in SANSUO_HERO_EMOJI_CODES) or a direct registry prefix
 * (used as-is). Throws when the hero id is unknown to both.
 */
export function heroEmojiPrefix(heroId: string): string {
  const code = (SANSUO_HERO_EMOJI_CODES as Record<string, string | undefined>)[heroId];
  if (code !== undefined) return code;
  if ((SANSUO_EMOJIS as Record<string, unknown>)[\`\${heroId}_t0\`] !== undefined) return heroId;
  throw new Error(\`EMOJI_NOT_FOUND:\${heroId}\`);
}

/**
 * Sole render point for sanguo emoji (D-15).
 * Returns renderable Discord markup '<a:name:id>' — all sanguo emojis are
 * animated (GIF), and Discord renders animated emoji ONLY via the '<a:' prefix;
 * '<:name:id>' would show as literal text (SC3 / verified 2026-08-12: 1056/1056
 * sanguo emojis are animated in the app).
 * Missing tier variant falls back to the hero's t0 entry; an unknown hero id
 * throws — never returns '' or a raw literal.
 */
export function heroEmoji(heroId: string, tier: SanguoTier = 0, star = false): string {
  const prefix = heroEmojiPrefix(heroId);
  const requestedKey = \`\${prefix}_t\${tier}\${star ? '_star' : ''}\` as SanguoEmojiKey;
  const resolvedKey: SanguoEmojiKey =
    SANSUO_EMOJIS[requestedKey] !== undefined
      ? requestedKey
      : (\`\${prefix}_t0\` as SanguoEmojiKey);
  const id = SANSUO_EMOJIS[resolvedKey];
  if (id === undefined) {
    throw new Error(\`EMOJI_NOT_FOUND:\${heroId}\`);
  }
  return \`<a:\${resolvedKey}:\${id}>\`;
}

/** Pure startup contract (D-14): registry applicationId must equal CLIENT_ID. */
export function assertEmojiApplicationId(registryAppId: string, clientId: string): boolean {
  return registryAppId === clientId;
}
`;
}

// --- main ---
const source = loadSource();
validateEmojis(source.emojis);
const heroCodes = await loadHeroCodes();
validateHeroCodes(heroCodes, source.emojis);

const output = renderFile(source.applicationId, source.emojis, heroCodes);
mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, output, 'utf-8');

const count = Object.keys(source.emojis).length;
const prefixes = new Set(Object.keys(source.emojis).map((k) => k.replace(/_t[0-3](_star)?$/, '')));
console.log(`✅ Wrote ${OUT_PATH} (${count} emoji keys, ${prefixes.size} hero prefixes, ${Object.keys(heroCodes).length} hero-id mappings, applicationId ${source.applicationId})`);
