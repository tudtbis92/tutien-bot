import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

// Runtime connections go through PgBouncer (port 6432 by convention)
// PgBouncer handles cross-shard connection aggregation
// max: 5 per shard — PgBouncer multiplexes to PostgreSQL max_connections
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error('DB', 'Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });
export { pool };
