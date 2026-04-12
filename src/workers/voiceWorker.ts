import { PgBoss } from 'pg-boss';
import { db } from '../db/client.js';
import { characters } from '../db/schema/characters.js';
import { GAME_CONFIG } from '../constants/game.js';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

/**
 * Register the VoiceMinuteWorker with pg-boss.
 * Runs on a 1-minute cron schedule, awarding tu vi for active voice sessions.
 * MUST be called in bot.ts (ShardingManager), NEVER in shard.ts.
 *
 * Voice session lifecycle:
 *  - JOIN  → ActivityWorker sets voice_session_started_at = now()
 *  - TICK  → VoiceMinuteWorker advances session start by 1 minute per tick (mark-as-paid)
 *  - LEAVE → ActivityWorker clears voice_session_started_at = null
 *
 * Orphan protection: Sessions older than 2× VOICE_MAX_MINUTES are cleared on startup
 * to prevent tu vi over-award from missed LEAVE events (e.g., bot restart during session).
 */
export async function registerVoiceMinuteWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue('voice-minute-tick');

  // schedule() is idempotent — safe to call on every restart
  await boss.schedule('voice-minute-tick', '* * * * *', {}); // every minute

  await boss.work('voice-minute-tick', { localConcurrency: 1 }, async () => {
    await processVoiceMinuteTick();
  });

  logger.info('VoiceMinuteWorker', 'Registered (voice-minute-tick @ * * * * *)');
}

/**
 * Award 1 minute of tu vi to all characters currently in voice sessions.
 * Uses the "mark-as-paid" pattern: advance voice_session_started_at by 1 minute per tick.
 * The WHERE clause ensures no double-award even if the job runs slightly late.
 */
async function processVoiceMinuteTick(): Promise<void> {
  // Find all characters with active voice sessions
  const activeSessions = await db
    .select({
      id: characters.id,
      spiritualRoot: characters.spiritualRoot,
      voiceSessionStartedAt: characters.voiceSessionStartedAt,
      dailyTuvi: characters.dailyTuvi,
    })
    .from(characters)
    .where(isNotNull(characters.voiceSessionStartedAt));

  for (const char of activeSessions) {
    if (!char.voiceSessionStartedAt) continue;

    const sessionMs = Date.now() - char.voiceSessionStartedAt.getTime();
    const sessionMins = Math.floor(sessionMs / 60_000);

    if (sessionMins < 1) continue; // Less than 1 full minute elapsed — skip

    // Award exactly 1 minute per tick, regardless of how many minutes have elapsed
    // The outer loop runs every minute; accumulated minutes are paid one at a time.
    const multiplier = GAME_CONFIG.SPIRITUAL_ROOT_MULTIPLIERS[char.spiritualRoot];
    const oneMinuteAmount = Math.floor(GAME_CONFIG.VOICE_TV_PER_MIN * multiplier);

    // Atomic award + session advance — mark-as-paid pattern:
    // Advance voice_session_started_at by 1 minute so the same minute is not paid twice.
    // WHERE clause guards:
    //   1. session still active (IS NOT NULL)
    //   2. daily cap not exceeded
    //   3. session not older than VOICE_MAX_MINUTES (orphan/AFK protection)
    await db
      .update(characters)
      .set({
        tuVi: sql`${characters.tuVi} + ${oneMinuteAmount}`,
        dailyTuvi: sql`${characters.dailyTuvi} + ${oneMinuteAmount}`,
        // Advance the session start by exactly 1 minute — marks this minute as paid
        voiceSessionStartedAt: sql`${characters.voiceSessionStartedAt} + interval '1 minute'`,
      })
      .where(
        and(
          eq(characters.id, char.id),
          isNotNull(characters.voiceSessionStartedAt),
          // Daily cap guard: only award if cap not exceeded
          sql`${characters.dailyTuvi} + ${oneMinuteAmount} <= ${GAME_CONFIG.DAILY_CAP}`,
          // Session length cap: VOICE_MAX_MINUTES per session
          // Prevents AFK farming beyond the configured maximum
          sql`EXTRACT(EPOCH FROM (now() - ${characters.voiceSessionStartedAt})) / 60 <= ${GAME_CONFIG.VOICE_MAX_MINUTES}`,
        ),
      );
  }
}

/**
 * Startup orphan sweep: clear voice sessions that are impossibly old.
 * Called once during bot.ts startup to handle sessions orphaned by bot restart.
 *
 * Sessions older than 2× VOICE_MAX_MINUTES cannot represent a valid active session
 * (they would have been capped at VOICE_MAX_MINUTES by the WHERE clause above).
 * Clearing them prevents infinite tu vi accumulation if LEAVE was missed.
 */
export async function clearOrphanedVoiceSessions(): Promise<void> {
  const orphanThresholdMinutes = GAME_CONFIG.VOICE_MAX_MINUTES * 2;
  const result = await db
    .update(characters)
    .set({ voiceSessionStartedAt: null })
    .where(
      sql`${characters.voiceSessionStartedAt} IS NOT NULL
        AND ${characters.voiceSessionStartedAt} < now() - interval '${sql.raw(String(orphanThresholdMinutes))} minutes'`,
    )
    .returning({ id: characters.id });

  if (result.length > 0) {
    logger.warn(
      'VoiceMinuteWorker',
      `Startup sweep: cleared ${result.length} orphaned voice session(s)`,
    );
  }
}
