import { redis } from './redis.js';

/**
 * Atomically acquire a cooldown lock. Returns true if NOT on cooldown (lock acquired).
 * Uses Redis SET NX PX — atomic check-and-set in a single RTT.
 *
 * @param userId - Discord user snowflake
 * @param channelId - Discord channel snowflake
 * @param cooldownMs - Cooldown duration in milliseconds
 * @returns true if cooldown acquired (user may proceed), false if already on cooldown
 */
export async function tryAcquireCooldown(
  userId: string,
  channelId: string,
  cooldownMs: number,
): Promise<boolean> {
  const key = `cooldown:${userId}:${channelId}`;
  // NX = only set if Not eXists; PX = expire in milliseconds
  const result = await redis.set(key, '1', 'PX', cooldownMs, 'NX');
  return result === 'OK';
}

/**
 * Get remaining cooldown TTL in milliseconds. Returns 0 if no active cooldown.
 */
export async function getCooldownTTL(userId: string, channelId: string): Promise<number> {
  const key = `cooldown:${userId}:${channelId}`;
  const ttlMs = await redis.pttl(key);
  return Math.max(0, ttlMs);
}
