import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';
import { ESLintUtils } from '@typescript-eslint/utils';

// Custom D-15 rule: raw Discord emoji IDs / emoji markup must only be produced by
// heroEmoji() from src/assets/sanguoEmojis.ts (the generated registry). The
// registry file itself is exempt via context.filename check.
const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/genZVN2021/tutien-bot#${name}`,
);

const noEmojiId = createRule({
  name: 'no-emoji-id',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block raw Discord emoji IDs and emoji markup outside src/assets/sanguoEmojis.ts (D-15)',
    },
    schema: [],
    messages: {
      emojiLiteral:
        'Raw Discord emoji ID/markup must only be produced by heroEmoji() from src/assets/sanguoEmojis.ts (D-15).',
    },
  },
  defaultOptions: [],
  create(context) {
    // Normalize Windows separators so the registry path check is platform-stable
    const filename = context.filename.replace(/\\/g, '/');
    // The generated registry is the single allowed source of emoji IDs (D-13/D-15)
    if (filename.endsWith('src/assets/sanguoEmojis.ts')) return {};
    // Tests legitimately assert heroEmoji() markup output — exempt them (i18next precedent)
    if (filename.includes('/__tests__/') || /\.(test|spec)\.ts$/.test(filename)) return {};
    const emojiMarkup = /^<a?:\w+:\d{17,20}>$/;
    const bareId = /^\d{17,20}$/;
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (emojiMarkup.test(node.value) || bareId.test(node.value)) {
          context.report({ node, messageId: 'emojiLiteral' });
        }
      },
    };
  },
});

export default [
  // TypeScript recommended rules for all src/ TypeScript files
  ...tseslint.configs.recommended,

  // i18next flat config recommended (ESLint 9 / flat config format)
  i18next.configs['flat/recommended'],

  {
    files: ['src/**/*.ts'],
    rules: {
      // TypeScript: allow underscore-prefixed unused variables (e.g., _request)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // i18next: detect hardcoded user-facing strings — promoted to 'error' in T-12
      // callees.exclude: patterns matched against full callee source text
      // words.exclude: patterns matched against the trimmed string value
      'i18next/no-literal-string': ['error', {
        mode: 'all',
        callees: {
          exclude: [
            // Console / structured logger — developer-facing context/message strings
            'console\\.log', 'console\\.error', 'console\\.warn', 'console\\.debug', 'console\\.info',
            'logger\\.info', 'logger\\.warn', 'logger\\.error', 'logger\\.debug',
            'log',
            // Error constructors — internal, not user display
            'new Error', 'new TypeError', 'new RangeError',
            // pg-boss queue/job names — internal identifiers
            'b\\.createQueue', 'b\\.schedule', 'b\\.work',
            'boss\\.createQueue', 'boss\\.schedule', 'boss\\.work',
            // Discord.js event registration — event names are symbols
            'manager\\.on', 'shard\\.on', 'client\\.on', 'client\\.once',
            'redis\\.on', 'pool\\.on', 'boss\\.on',
            // Drizzle schema DSL — column names are DB-level identifiers
            'serial', 'varchar', 'bigint', 'boolean', 'timestamp', 'check', 'uniqueIndex',
            'pgTable',
            // HTTP route registration — URL paths are not user-facing
            'fastify\\.get', 'fastify\\.post',
            // Discord REST API
            'rest\\.put', 'Routes\\.applicationCommands',
            // Redis protocol commands
            'redis\\.set', 'redis\\.get', 'redis\\.ping', 'redis\\.pttl',
            // SlashCommandBuilder — command names/descriptions are static Discord API strings
            'new SlashCommandBuilder',
            '\\.setName', '\\.setDescription',
            '\\.setNameLocalizations', '\\.setDescriptionLocalizations',
            // i18n translation function — keys are identifiers, not user strings
            '^t$', 'getT',
            // Node.js path/file operations
            'join', 'path\\.join', 'path\\.dirname', 'dirname', 'fileURLToPath',
            'readdirSync', 'statSync', 'existsSync',
            // Number formatting
            '\\.toLocaleString',
          ],
        },
        words: {
          exclude: [
            // kebab-case / dot-notation / path-like identifiers (no spaces)
            '^[a-z][a-z0-9\\-_.:/]+$',
            // SCREAMING_SNAKE_CASE constants
            '^[A-Z][A-Z0-9_]+$',
            // camelCase technical values
            '^[a-z][a-zA-Z0-9]+$',
            // PascalCase single words
            '^[A-Z][a-zA-Z0-9]+$',
            // Locale codes (xx, xx-XX, xx-xxx)
            '^[a-z]{2}(-[a-zA-Z]{2,4})?$',
            // Strings ending with ...
            '\\.\\.\\.$',
            // Strings starting with [ (log context prefixes)
            '^\\[',
            // Strings starting with . or / (file paths)
            '^[./]',
            // Short strings 1-3 chars
            '^.{1,3}$',
            // N/A
            '^N\\/A$',
            // IP addresses
            '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$',
            // Any string containing only words (no user-facing punctuation)
            // Matches log messages like 'Redis ping failed', 'Connection closed'
            '^[A-Z][a-zA-Z0-9 ]+$',
            // Relative file paths (./dist/... etc)
            '^\\./',
          ],
        },
      }],
    },
  },

  // Custom D-15 emoji-ID rule — scoped to the Discord client surface (src/commands + src/ui),
  // the only places emoji markup/IDs can reach embed output. Pre-existing bare IDs in
  // non-surface files (e.g. OWO_BOT_ID in src/types/farming.ts) stay untouched (scope boundary).
  {
    files: ['src/commands/**/*.ts', 'src/ui/**/*.ts'],
    plugins: { local: { rules: { 'no-emoji-id': noEmojiId } } },
    rules: { 'local/no-emoji-id': 'error' },
  },

  // Test files: disable i18next rule — test descriptions/assertions are not user-facing strings
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // Exclude non-source files from i18next lint
  {
    ignores: [
      'dist/**',
      'migrations/**',
      'scripts/**',
      'ecosystem.config.js',
      'drizzle.config.ts',
      'eslint.config.mjs',
    ],
  },
];
