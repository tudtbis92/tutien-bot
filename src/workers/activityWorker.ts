import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { db } from '../db/client.js';
import { characters } from '../db/schema/characters.js';
import { guildActivity } from '../db/schema/guild_activity.js';
import { redis } from '../cache/redis.js';
import { GAME_CONFIG } from '../constants/game.js';
import { REALM_CONFIG } from '../constants/realms.js';
import { eq, sql, and } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import type { SpiritualRoot } from '../db/schema/characters.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityJobData = {
  type: 'message' | 'reaction' | 'voice_join' | 'voice_leave';
  userId: string;
  guildId: string;
  channelId: string;
  // Pre-computed flags for message type (raw content is NOT stored — privacy)
  hasRepeatPattern?: boolean;    // Layer 3: /(.)\1{4,}/ quality gate result
  contentFingerprint?: string;   // Layer 3: first 50 normalized chars for dup detection
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
  // ── Layer 1: Intentionally removed ───────────────────────────────────────
  // Original intent: re-verify Redis cooldown key in worker to detect Redis-wipe
  // duplicates. However, tryAcquireCooldown() sets the key BEFORE enqueueing, so
  // the key is always live (TTL > 0) for every valid job — causing all jobs to be
  // silently dropped. Layer 2b (DB lastMessageAt timestamp) is the correct and
  // sufficient source of truth for cooldown enforcement; it survives Redis restarts.

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
      const valid = await isContentValid(data, char.discordId);
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

    // Pre-check: if tuVi has already reached the breakthrough threshold, stop accumulating.
    // Player must /breakthrough before earning more. This is a soft cap (read-then-check),
    // race window is acceptable because: (a) row is locked by FOR UPDATE above, and
    // (b) slight overage at the exact threshold moment is a game design non-issue.
    //
    // tuVi is CUMULATIVE — must compare against ABSOLUTE threshold (entryThreshold + tuViRequired),
    // NOT tuViRequired alone (which is an incremental value relative to entryThreshold).
    const currentRealm = REALM_CONFIG[char.realmId];
    if (currentRealm && isFinite(currentRealm.tuViRequired)) {
      const absoluteCap = currentRealm.entryThreshold + currentRealm.tuViRequired;
      if (Number(char.tuVi) >= absoluteCap) {
        // Already at or past breakthrough threshold — no award, no anomaly
        return;
      }
    }
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
    // Schedule streak update after transaction commits — fire-and-forget with error log
    updateStreak(char.id, data.timestamp, charForStreak).catch((err) =>
      logger.error('ActivityWorker', `updateStreak failed for char ${char.id}`, err),
    );
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
 * Accepts pre-computed flags from the gateway event (raw content is not stored).
 * Returns false (invalid) if content has a repeat pattern or is a recent duplicate.
 */
async function isContentValid(data: ActivityJobData, discordId: string): Promise<boolean> {
  // Check for repeating character runs (e.g., "aaaaaa") — pre-computed in messageCreate
  if (data.hasRepeatPattern) return false;

  // Duplicate content check: Redis SET NX with 5-minute window per user
  // Uses pre-normalized fingerprint (first 50 chars, lowercase, collapsed whitespace)
  const fingerprint = data.contentFingerprint ?? '';
  if (!fingerprint) return false; // Empty fingerprint = treat as invalid
  const dupKey = `dup:${discordId}:${fingerprint}`;

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
