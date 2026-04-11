import { ShardingManager } from 'discord.js';
import { config } from './config.js';
import { initPgBoss, stopPgBoss } from './workers/pgBoss.js';
import { startHealthServer } from './workers/health.js';
import { registerCommands } from './utils/registerCommands.js';
import { db, pool } from './db/client.js';
import { redis } from './cache/redis.js';
import { logger } from './utils/logger.js';
import { sql } from 'drizzle-orm';

const manager = new ShardingManager('./dist/shard.js', {
  token: config.DISCORD_TOKEN,
  totalShards: 'auto',   // Discord recommends ~1,000 guilds/shard
  mode: 'process',       // Separate OS processes (not worker threads)
});

manager.on('shardCreate', (shard) => {
  logger.info('ShardingManager', `Shard ${shard.id} launching`);
  shard.on('ready', () => logger.info('ShardingManager', `Shard ${shard.id} ready`));
  shard.on('disconnect', () => logger.warn('ShardingManager', `Shard ${shard.id} disconnected`));
  shard.on('reconnecting', () => logger.info('ShardingManager', `Shard ${shard.id} reconnecting`));
  shard.on('death', (proc) => {
    const exitCode = 'exitCode' in proc ? proc.exitCode : 'unknown';
    logger.error('ShardingManager', `Shard ${shard.id} died (exit code: ${exitCode})`);
  });
});

async function main(): Promise<void> {
  logger.info('ShardingManager', 'Starting TuTien Bot...');

  // Step 1: Preflight — verify DB and Redis are reachable before spawning shards
  // Fail fast here rather than having shards die silently on first DB/Redis access
  logger.info('ShardingManager', 'Preflight: checking DB connection...');
  await db.execute(sql`SELECT 1`);
  logger.info('ShardingManager', 'Preflight: DB ok');

  logger.info('ShardingManager', 'Preflight: checking Redis connection...');
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error('Redis ping failed');
  logger.info('ShardingManager', 'Preflight: Redis ok');

  // Step 2: Register slash commands with Discord REST API — ONCE here in the manager.
  // NEVER register in shard.ts/commandLoader — N shards × PUT /commands = race conditions
  // and wasted rate-limit budget. This call is idempotent; safe on every restart.
  await registerCommands();

  // Step 3: pg-boss ONLY in ShardingManager — never in shards
  await initPgBoss();

  // Step 4: Health check HTTP server ONLY in ShardingManager
  await startHealthServer(manager);

  // Step 5: Spawn all shards — manager queries Discord for optimal shard count
  await manager.spawn();

  logger.info('ShardingManager', 'All shards launched');
}

// Graceful shutdown — close all connections cleanly before exit
async function shutdown(): Promise<void> {
  logger.info('ShardingManager', 'Shutting down...');
  await stopPgBoss();
  await pool.end();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  logger.error('ShardingManager', 'Fatal error during startup', err);
  process.exit(1);
});
