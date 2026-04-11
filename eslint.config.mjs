import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

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

      // i18next: detect hardcoded user-facing strings
      // PHASE 1: Start as 'warn' — mode: 'all' generates false positives in Node.js
      // (console.log, new Error(), pg-boss queue names, config keys all get flagged)
      // T-12 will tune exclusion lists and promote to 'error'
      'i18next/no-literal-string': ['warn', {
        mode: 'all',
        ignoreCallee: [
          // Console / logging — these are developer-facing, not user-facing
          'console.log', 'console.error', 'console.warn', 'console.debug', 'console.info',
          'logger.info', 'logger.warn', 'logger.error', 'logger.debug',
          // Error constructors — internal errors, not user display
          'new Error', 'new TypeError', 'new RangeError',
          // pg-boss internal queue names — not user-facing
          'boss.createQueue', 'boss.schedule', 'boss.work',
          // process
          'process.exit', 'process.env',
        ],
      }],
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
