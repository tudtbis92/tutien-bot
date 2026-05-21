import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(50, 'DISCORD_TOKEN looks too short'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required for slash command registration'),

  // Database — runtime connection goes through PgBouncer (port 6432)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgresql:// URL'),

  // Database direct — used ONLY by drizzle-kit migrate (bypasses PgBouncer)
  DATABASE_URL_DIRECT: z.string().url('DATABASE_URL_DIRECT must be a valid postgresql:// URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid redis:// URL'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),

  // API Football keys (comma-separated for key rotation)
  API_FOOTBALL_KEYS: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Config] ❌ Invalid environment variables — bot cannot start:');
  const errors = parsed.error.flatten().fieldErrors;
  for (const [key, msgs] of Object.entries(errors)) {
    console.error(`  ${key}: ${msgs?.join(', ')}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
