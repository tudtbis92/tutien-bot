import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const redisOptions: RedisOptions = {
  retryStrategy(times: number) {
    // Exponential backoff: 50ms → 100ms → 200ms → ... → 2000ms max
    const delay = Math.min(times * 50, 2_000);
    logger.warn('Redis', `Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 20,
  enableOfflineQueue: true,   // Queue commands while reconnecting
  lazyConnect: false,         // Connect immediately on construction
  connectTimeout: 10_000,
};

export const redis = new Redis(config.REDIS_URL, redisOptions);

redis.on('connect', () => logger.info('Redis', 'Connected'));
redis.on('ready', () => logger.info('Redis', 'Ready'));
redis.on('error', (err: Error) => logger.error('Redis', err.message));
redis.on('close', () => logger.warn('Redis', 'Connection closed'));
redis.on('reconnecting', () => logger.info('Redis', 'Reconnecting...'));

/**
 * Ping Redis and return true if responsive.
 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
