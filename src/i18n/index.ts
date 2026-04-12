import i18next from 'i18next';
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Locale files are at project root /locales/{lng}/{ns}.json
const LOCALES_PATH = path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json');

export type SupportedLocale = 'vi' | 'en' | 'zh-cn';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['vi', 'en', 'zh-cn'];
export const DEFAULT_LOCALE: SupportedLocale = 'vi';

/**
 * Initialize i18next for a shard process. Call from shard.ts before client.login().
 * Uses preload to ensure all locales are ready before any command runs.
 * i18next is module-level singleton — each shard process has its own instance.
 */
export async function initI18n(): Promise<void> {
  await i18next
    .use(FsBackend)
    .init<FsBackendOptions>({
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      preload: SUPPORTED_LOCALES,   // Load all 3 at startup — avoids lazy-load race conditions
      lowerCaseLng: true,           // Keep locale codes lowercase (zh-cn NOT zh-CN) — must match locales/ dir names on Linux
      ns: ['common', 'game', 'combat', 'marketplace', 'admin'],
      defaultNS: 'common',
      fallbackNS: 'common',         // Key not found in ns → try common
      interpolation: {
        escapeValue: false,         // Discord renders plain text, not HTML
      },
      backend: {
        loadPath: LOCALES_PATH,
      },
    });

  logger.info('i18n', 'Initialized — locales: vi, en, zh-cn');
}

/**
 * Resolve display locale for a Discord interaction.
 * Priority order (D-11):
 *   1. User's stored locale preference (users.locale from DB)
 *   2. Discord interaction locale header
 *   3. Default: 'vi'
 */
export function resolveLocale(
  userStoredLocale: string | null | undefined,
  interactionLocale: string | null | undefined,
): SupportedLocale {
  const normalize = (raw: string | null | undefined): SupportedLocale | null => {
    if (!raw) return null;
    const l = raw.toLowerCase();
    if (l === 'vi') return 'vi';
    if (l.startsWith('en')) return 'en';
    if (l.startsWith('zh')) return 'zh-cn';
    return null;
  };

  return normalize(userStoredLocale)
    ?? normalize(interactionLocale)
    ?? DEFAULT_LOCALE;
}

/**
 * Get a t() function bound to a specific locale.
 * Use this in every command handler after resolveLocale().
 *
 * @example
 *   const locale = resolveLocale(user?.locale, interaction.locale);
 *   const t = getT(locale);
 *   await interaction.reply(t('common:errors.notRegistered'));
 */
export function getT(locale: SupportedLocale) {
  return i18next.getFixedT(locale);
}
