/**
 * Missing i18n key detector.
 * Usage: npx tsx scripts/check-i18n.ts
 * Compares keys across all locale files; reports mismatches to stdout.
 * Non-zero exit code if any keys are missing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '../locales');
const NAMESPACES = ['common', 'game', 'combat', 'marketplace', 'admin'];
const LOCALES = ['vi', 'en', 'zh-cn'];

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...getKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

let hasMissing = false;

for (const ns of NAMESPACES) {
  const localeKeys: Record<string, Set<string>> = {};

  for (const locale of LOCALES) {
    const filePath = path.join(LOCALES_DIR, locale, `${ns}.json`);
    try {
      const content = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      localeKeys[locale] = new Set(getKeys(content));
    } catch {
      console.error(`❌ Missing file: locales/${locale}/${ns}.json`);
      hasMissing = true;
      localeKeys[locale] = new Set();
    }
  }

  // Find keys in VI (reference) missing from other locales
  const viKeys = localeKeys['vi'] ?? new Set<string>();
  for (const locale of LOCALES.filter(l => l !== 'vi')) {
    const otherKeys = localeKeys[locale] ?? new Set<string>();
    const missing = [...viKeys].filter(k => !otherKeys.has(k));
    if (missing.length > 0) {
      console.warn(`⚠️  ${ns}/${locale} missing ${missing.length} keys from vi:`);
      missing.forEach(k => console.warn(`   - ${k}`));
      hasMissing = true;
    }
  }
}

if (!hasMissing) {
  console.log('✅ All locale files are in sync.');
}

process.exit(hasMissing ? 1 : 0);
