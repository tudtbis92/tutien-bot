import Fastify from 'fastify';
import type { ShardingManager } from 'discord.js';
import { db } from '../db/client.js';
import { redisHealthCheck } from '../cache/redis.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sql } from 'drizzle-orm';

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

    // Run DB and Redis checks in parallel
    const [dbOk, redisOk] = await Promise.all([
      db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
      redisHealthCheck(),
    ]);

    // Collect shard WebSocket status codes (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
    let shards: { id: number; status: number }[] = [];
    if (manager) {
      try {
        const rawStatuses = await manager.fetchClientValues('ws.status') as number[];
        shards = rawStatuses.map((status, id) => ({ id, status }));
      } catch {
        shards = [];
      }
    }

    const allShardsReady = shards.length === 0 || shards.every((s) => s.status === 1);
    const healthy = dbOk && redisOk && allShardsReady;
    const statusCode = healthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: healthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      responseTimeMs: Date.now() - startTime,
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      shards,
      timestamp: new Date().toISOString(),
    });
  });

  // Graceful shutdown route (for deploy script validation)
  fastify.get('/ready', async (_request, reply) => {
    return reply.status(200).send({ ready: true });
  });

  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info('Health', `Server listening on port ${config.PORT}`);
}
