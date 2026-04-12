import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { db } from '../db/client.js';
import { characters } from '../db/schema/characters.js';
import { guildActivity } from '../db/schema/guild_activity.js';
import { getCooldownTTL } from '../cache/cooldown.js';
import { redis } from '../cache/redis.js';
import { GAME_CONFIG } from '../constants/game.js';
import { eq, sql, and } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import type { SpiritualRoot } from '../db/schema/characters.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityJobData = {
  type: 'message' | 'reaction' | 'voice_join' | 'voice_leave';
  userId: string;
  guildId: string;
  channelId: string;
  content?: string;
  timestamp: number;
  // voice-specific
  selfMute?: boolean;
  selfDeaf?: boolean;
};

type _Character = {
  id: number;
  discordId: string;
  spiritualRoot: SpiritualRoot;
  lastMessageAt: Date | null;
  lastReactionAt: Date | null;
  voiceSessionStartedAt: Date | null;
  dailyTuvi: number;
  tuVi: bigint;
  streakDays: number;
  lastActiveDate: string | null;
  anomalyFlag: boolean;
};

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register the ActivityWorker with pg-boss.
 * MUST be called in bot.ts (ShardingManager), NEVER in shard.ts.
 *
 * localConcurrency: 5 — safe because Layers 2-4 run inside db.transaction() with
 * SELECT FOR UPDATE row lock on the characters row. Two workers processing jobs for
 * the SAME user will queue at the DB row lock; different users run fully in parallel.
 * This eliminates global queue bottleneck while preserving per-user serialization.
 */
export async function registerActivityWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue('activity-queue');

  await boss.work(
    'activity-queue',
    { localConcurrency: 5 }, // Per-user serialization via SELECT FOR UPDATE — not global queue lock
    async (jobs: Job<ActivityJobData>[]) => {
      for (const job of jobs) {
        try {
          await processActivityJob(job.data);
        } catch (err) {
          logger.error('ActivityWorker', `Job ${job.id} failed`, err);
          // Do not re-throw — isolates per-job failures; other jobs in batch continue
        }
      }
    },
  );

  logger.info('ActivityWorker', 'Registered (activity-queue, concurrency: 5)');
}

// ── Job Processor ─────────────────────────────────────────────────────────────

async function processActivityJob(data: ActivityJobData): Promise<void> {
  // ── Layer 1: Redis re-verify ──────────────────────────────────────────────
  // Confirms Redis was not wiped mid-restart. If TTL > 0, the cooldown key is still
  // live — this job arrived out-of-order or is a duplicate. Drop silently.
  // Note: voice_join/voice_leave skip cooldown re-verify (no cooldown key for voice)
  if (data.type === 'message' || data.type === 'reaction') {
    const ttl = await getCooldownTTL(data.userId, data.channelId);
    if (ttl > 0) return; // Redis key still live — already processed recently
  }

  // ── voice_join: just set session start timestamp, no tu vi award ──────────
  if (data.type === 'voice_join') {
    await db
      .update(characters)
      .set({ voiceSessionStartedAt: sql`now()` })
      .where(eq(characters.discordId, data.userId));
    return;
  }

  // ── Layers 2–4 inside a single DB transaction with SELECT FOR UPDATE ──────
  // Row-level lock on characters serializes processing for the SAME user at DB level.
  // Two workers processing different users run fully in parallel (no global bottleneck).
  await db.transaction(async (tx) => {
    // ── Layer 2a: Fetch character with row lock ───────────────────────────
    const [char] = await tx
      .select()
      .from(characters)
      .where(eq(characters.discordId, data.userId))
      .for('update'); // SELECT ... FOR UPDATE — row-level lock

    if (!char) return; // User not registered — drop job silently

    // ── voice_leave: clear voice session start (VoiceMinuteWorker awards tu vi) ──
    if (data.type === 'voice_leave') {
      await tx
        .update(characters)
        .set({ voiceSessionStartedAt: null })
        .where(eq(characters.id, char.id));
      return;
    }

    // From here: message or reaction types only

    // ── Layer 2b: DB-backed cooldown check ───────────────────────────────
    // Redis is L1 cache; DB timestamps are the truth (survive Redis restarts).
    const now = data.timestamp;
    if (data.type === 'message' && char.lastMessageAt) {
      const msSinceLast = now - char.lastMessageAt.getTime();
      if (msSinceLast < GAME_CONFIG.MESSAGE_COOLDOWN_MS) return;
    }
    if (data.type === 'reaction' && char.lastReactionAt) {
      const msSinceLast = now - char.lastReactionAt.getTime();
      if (msSinceLast < GAME_CONFIG.REACTION_COOLDOWN_MS) return;
    }

    // ── Layer 3: Content quality gate (message type only) ────────────────
    if (data.type === 'message') {
      const content = data.content ?? '';
      const valid = await isContentValid(content, char.discordId);
      if (!valid) {
        await incrementAnomalyCounter(char.id);
        return;
      }
    }

    // ── Compute base tu vi amount + spiritual root multiplier ────────────
    const base = getTuviAmount(data.type);
    const multiplier = GAME_CONFIG.SPIRITUAL_ROOT_MULTIPLIERS[char.spiritualRoot];
    const amount = Math.floor(base * multiplier);

    // ── Layer 4: Atomic daily cap check + tu vi award (RETURNING pattern) ─
    // UPDATE ... WHERE daily_tuvi + amount <= DAILY_CAP RETURNING
    // If RETURNING is empty: cap hit — track anomaly, do not award.
    // This is the ONLY correct atomic pattern — never read-then-write for cap checks.
    const updateSet: Record<string, unknown> = {
      tuVi: sql`${characters.tuVi} + ${amount}`,
      dailyTuvi: sql`${characters.dailyTuvi} + ${amount}`,
    };
    if (data.type === 'message') {
      updateSet.lastMessageAt = sql`now()`;
    } else if (data.type === 'reaction') {
      updateSet.lastReactionAt = sql`now()`;
    }

    const [updated] = await tx
      .update(characters)
      .set(updateSet)
      .where(
        and(
          eq(characters.id, char.id),
          // Atomic guard: only executes UPDATE if cap not exceeded
          sql`${characters.dailyTuvi} + ${amount} <= ${GAME_CONFIG.DAILY_CAP}`,
        ),
      )
      .returning({ dailyTuvi: characters.dailyTuvi, tuVi: characters.tuVi });

    if (!updated) {
      // RETURNING empty = daily cap hit
      await incrementAnomalyCounter(char.id);
      return;
    }

    // ── Post-award: upsert guild_activity for guild leaderboard ──────────
    await tx
      .insert(guildActivity)
      .values({ characterId: char.id, guildId: data.guildId, lastActiveAt: sql`now()` })
      .onConflictDoUpdate({
        target: [guildActivity.characterId, guildActivity.guildId],
        set: { lastActiveAt: sql`now()` },
      });

    // ── Post-award: daily streak logic (runs outside tx to avoid long hold) ─
    // Streak bonus goes DIRECTLY to tu_vi (bypasses daily cap — it's a reward)
    // Called outside transaction to release row lock before streak DB write
    const charForStreak = { ...char, streakDays: char.streakDays, lastActiveDate: char.lastActiveDate };
    // Schedule streak update after transaction commits — use void (non-blocking)
    void updateStreak(char.id, data.timestamp, charForStreak);
  });
}

// ── Layer 5: Anomaly Counter ──────────────────────────────────────────────────

/**
 * Increment anomaly counter for a character in Redis.
 * Key: anomaly:{charId}:{utcDate} with 25h TTL.
 * If counter exceeds ANOMALY_THRESHOLD, set anomaly_flag = true in DB.
 */
async function incrementAnomalyCounter(charId: number): Promise<void> {
  const utcDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `anomaly:${charId}:${utcDate}`;

  const count = await redis.incr(key);
  if (count === 1) {
    // First increment — set 25-hour TTL (covers midnight rollover)
    await redis.expire(key, 25 * 60 * 60);
  }

  if (count >= GAME_CONFIG.ANOMALY_THRESHOLD) {
    // Set anomaly_flag in DB for admin review
    await db
      .update(characters)
      .set({ anomalyFlag: true })
      .where(eq(characters.id, charId));
    logger.warn('ActivityWorker', `anomaly_flag set for character ${charId} (${count} violations today)`);
  }
}

// ── Content Quality Gate (Layer 3) ───────────────────────────────────────────

/**
 * Validate message content quality to prevent spam farming.
 * Returns false (invalid) if content contains repeating char runs or is a recent duplicate.
 */
async function isContentValid(content: string, discordId: string): Promise<boolean> {
  // Check for repeating character runs (e.g., "aaaaaa", "hhhhhhh")
  if (/(.)\1{4,}/.test(content)) return false;

  // Duplicate content check: Redis SET with 5-minute window per user
  // Uses a simple hash: first 50 chars normalized (lowercase, trim whitespace runs)
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 50);
  const dupKey = `dup:${discordId}:${normalized}`;

  // SET NX with 5-minute TTL — if key exists, content is a duplicate
  const isNew = await redis.set(dupKey, '1', 'EX', 300, 'NX');
  return isNew === 'OK'; // OK = first time seeing this content; null = duplicate
}

// ── Tu Vi Amount Calculator ───────────────────────────────────────────────────

function getTuviAmount(type: ActivityJobData['type']): number {
  switch (type) {
    case 'message':
      return GAME_CONFIG.MESSAGE_TV;
    case 'reaction':
      return GAME_CONFIG.REACTION_TV;
    case 'voice_leave':
      return 0; // Voice awards handled by VoiceMinuteWorker
    default:
      return 0;
  }
}

// ── Streak Logic (CORE-07) ────────────────────────────────────────────────────

/**
 * Update daily streak after a successful tu vi award.
 * Streak bonus is awarded DIRECTLY to tu_vi (bypasses daily cap).
 */
async function updateStreak(
  charId: number,
  timestamp: number,
  char: { streakDays: number; lastActiveDate: string | null },
): Promise<void> {
  const today = new Date(timestamp).toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // Calculate yesterday's date string
  const yesterdayDate = new Date(timestamp - 86_400_000);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  if (char.lastActiveDate === today) {
    // Already processed streak today — no change
    return;
  }

  let newStreakDays: number;
  if (char.lastActiveDate === yesterday) {
    // Consecutive day — extend streak
    newStreakDays = char.streakDays + 1;
  } else {
    // Streak broken (null or older than yesterday) — reset to 1
    newStreakDays = 1;
  }

  // Find streak bonus for new streak length
  const bonus =
    GAME_CONFIG.STREAK_BONUSES.find(
      (tier) => newStreakDays >= tier.minDays && newStreakDays <= tier.maxDays,
    )?.bonus ?? 0;

  // Atomic streak update + bonus award
  // Streak bonus bypasses daily cap (direct tu_vi increment without WHERE cap check)
  await db
    .update(characters)
    .set({
      streakDays: newStreakDays,
      lastActiveDate: today,
      // Award streak bonus directly to tu_vi — bypasses DAILY_CAP (it's a reward, not activity income)
      ...(bonus > 0 ? { tuVi: sql`${characters.tuVi} + ${bonus}` } : {}),
    })
    .where(
      and(
        eq(characters.id, charId),
        // Idempotency guard: only update if lastActiveDate hasn't been updated concurrently
        sql`(${characters.lastActiveDate} IS NULL OR ${characters.lastActiveDate} < ${today})`,
      ),
    );
}
