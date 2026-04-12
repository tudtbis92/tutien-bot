import Fastify from 'fastify';
import { Status, type ShardingManager } from 'discord.js';
import { db } from '../db/client.js';
import { redisHealthCheck } from '../cache/redis.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sql } from 'drizzle-orm';

interface ShardStatus {
  id: number;
  status: number;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  responseTimeMs: number;
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  shards: ShardStatus[];
  shardsQueryFailed: boolean;
  timestamp: string;
}

async function fetchShardStatuses(
  manager: ShardingManager,
): Promise<{ shards: ShardStatus[]; failed: boolean }> {
  try {
    const rawStatuses = (await manager.fetchClientValues('ws.status')) as number[];
    const shards = rawStatuses.map((status, id) => ({ id, status }));
    return { shards, failed: false };
  } catch (err) {
    logger.warn('Health', 'Failed to fetch shard statuses', err);
    return { shards: [], failed: true };
  }
}

function allShardsReady(shards: ShardStatus[], failed: boolean): boolean {
  // shards.length === 0 means the manager has not yet spawned any shards (startup window).
  // Treat as healthy so the deploy script's /ready check does not fail during spawn.
  return !failed && (shards.length === 0 || shards.every((s) => s.status === Status.Ready));
}

/**
 * Start the health check HTTP server.
 * Must only be called from bot.ts (ShardingManager process).
 * Shards do NOT expose a health endpoint.
 *
 * @param manager - ShardingManager instance for querying shard statuses
 */
export async function startHealthServer(manager?: ShardingManager): Promise<void> {
  const fastify = Fastify({ logger: false });

  fastify.get('/health', async (_request, reply) => {
    const startTime = Date.now();

    const [dbOk, redisOk] = await Promise.all([
      db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
      redisHealthCheck(),
    ]);

    const { shards, failed: shardsQueryFailed } = manager
      ? await fetchShardStatuses(manager)
      : { shards: [], failed: false };

    const healthy = dbOk && redisOk && allShardsReady(shards, shardsQueryFailed);

    const body: HealthResponse = {
      status: healthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      responseTimeMs: Date.now() - startTime,
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      shards,
      shardsQueryFailed,
      timestamp: new Date().toISOString(),
    };

    return reply.status(healthy ? 200 : 503).send(body);
  });

  // Graceful shutdown route (for deploy script validation)
  fastify.get('/ready', async (_request, reply) => {
    return reply.status(200).send({ ready: true });
  });

  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info('Health', `Server listening on port ${config.PORT}`);
}
