import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

// CRITICAL: Use DATABASE_URL_DIRECT (port 5432, bypasses PgBouncer)
// PgBouncer transaction mode breaks advisory locks used by drizzle-kit migrate
// Runtime code uses DATABASE_URL (port 6432 via PgBouncer)
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL_DIRECT'] ?? process.env['DATABASE_URL']!,
  },
});
