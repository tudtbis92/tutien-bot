import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { config } from '../config.js';
import { runVwapRecalc } from '../jobs/vwapRecalc.js';
import { runFootballFetchFixtures } from '../jobs/footballFetchFixtures.js';
import { runFootballRefreshOdds } from '../jobs/footballRefreshOdds.js';
import { runFootballPollScores } from '../jobs/footballPollScores.js';
import { runFootballResolveMatches } from '../jobs/footballResolveMatches.js';
import { runFootballCrawlOdds } from '../jobs/footballCrawlOdds.js';
import { registerActivityWorker } from './activityWorker.js';
import { registerVoiceMinuteWorker, clearOrphanedVoiceSessions } from './voiceWorker.js';
import { logger } from '../utils/logger.js';

// IMPORTANT: Workers and cron schedules must ONLY be registered in bot.ts (ShardingManager).
// Shards import this module only to call boss.send() — never boss.work() or boss.schedule().
// Shard instances use initPgBossForShard() which disables schedule/supervise/migrate.

// Exported so event handlers (messageCreate, voiceStateUpdate, etc.) can fire-and-forget boss.send().
// In bot.ts: initialized via initPgBoss() — full instance with workers, schedules, maintenance.
// In shard.ts: initialized via initPgBossForShard() — send-only instance (no workers, no crons).
// Note: boss is null until one of the init functions completes; events only fire after client.login()
// which is called after init, so boss!.send() is safe in event handlers.
export let boss: PgBoss | null = null;

/**
 * Initialize pg-boss and register all scheduled jobs.
 * Called exactly once from bot.ts after config is loaded.
 */
export async function initPgBoss(): Promise<void> {
  boss = new PgBoss({
    // pg-boss needs direct DB connection (not PgBouncer) for advisory locks
    connectionString: config.DATABASE_URL_DIRECT,
    schema: 'pgboss',
    schedule: true,              // Enable cron scheduling
    supervise: true,             // Enable maintenance monitoring
    migrate: true,               // Auto-run pg-boss schema migrations on start
    max: 3,                      // Internal connection pool size
    application_name: 'tutien-bot-scheduler',
    monitorIntervalSeconds: 120, // Correct option name (not monitorStateIntervalSeconds)
  });

  boss.on('error', (error: Error) => logger.error('pgBoss', error.message, error));

  await boss.start();
  logger.info('pgBoss', 'Started');

  await registerJobs(boss);

  // Startup orphan sweep: clear voice sessions orphaned by previous bot restart
  // Must run AFTER boss.start() but BEFORE shards spawn and start generating events
  await clearOrphanedVoiceSessions();
}

/**
 * Initialize pg-boss in SHARD process — send-only mode.
 * Shards need to send jobs (boss.send()) but must NOT run workers, crons, or maintenance.
 * Only bot.ts runs the full instance with workers, schedules, and maintenance.
 *
 * Disabling schedule/supervise/migrate prevents shard instances from:
 *   - Competing for the cron lock (would create duplicate scheduled jobs)
 *   - Running advisory-lock maintenance (incompatible with PgBouncer transaction mode)
 *   - Re-running migrations (handled once by bot.ts on startup)
 *
 * Called from shard.ts before client.login() so boss is ready when events fire.
 */
export async function initPgBossForShard(): Promise<void> {
  boss = new PgBoss({
    connectionString: config.DATABASE_URL_DIRECT,
    schema: 'pgboss',
    schedule: false,   // Shards do NOT schedule cron jobs
    supervise: false,  // Shards do NOT run maintenance monitoring
    migrate: false,    // Shards do NOT run pg-boss migrations (bot.ts does this once)
    max: 2,            // Minimal pool — shards only send, don't run workers
    application_name: 'tutien-bot-shard-sender',
  });

  boss.on('error', (error: Error) => logger.error('pgBoss', `Shard sender error: ${error.message}`, error));

  await boss.start();
  logger.info('pgBoss', 'Shard sender started (send-only mode)');
}

async function registerJobs(b: PgBoss): Promise<void> {
  // Register ActivityWorker — 5-layer anti-farming guard (localConcurrency: 5)
  await registerActivityWorker(b);

  // Register VoiceMinuteWorker — periodic voice tu vi awards (every 1 minute)
  await registerVoiceMinuteWorker(b);

  // Ensure queue exists before scheduling
  await b.createQueue('vwap-recalc');

  // schedule() is idempotent — safe to call on every restart
  // If a schedule already exists for this queue name, it is updated (not duplicated)
  await b.schedule('vwap-recalc', '0 * * * *', {});

  // Register the worker handler — pg-boss WorkHandler receives an array of jobs
  // Each job is processed independently: one failure does not block remaining jobs.
  // Note: localConcurrency: 1 means pg-boss dispatches one job at a time in practice,
  // but the try/catch per-job pattern is correct for future batched queue types.
  await b.work('vwap-recalc', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runVwapRecalc(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (vwap-recalc) failed — skipping, next run in 1h`, err);
        // Do not re-throw: isolates this job's failure from the rest of the batch.
        // VWAP is recalculated every hour — a failed run is self-healing.
      }
    }
  });

  // Register Football Fetch Fixtures
  await b.createQueue('football-fetch-fixtures');
  await b.schedule('football-fetch-fixtures', '0 */6 * * *', {});
  await b.work('football-fetch-fixtures', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runFootballFetchFixtures(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (football-fetch-fixtures) failed`, err);
      }
    }
  });

  // Register Football Refresh Odds
  await b.createQueue('football-refresh-odds');
  await b.schedule('football-refresh-odds', '0 */2 * * *', {});
  await b.work('football-refresh-odds', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runFootballRefreshOdds(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (football-refresh-odds) failed`, err);
      }
    }
  });

  // Register Football Poll Scores
  await b.createQueue('football-poll-scores');
  await b.schedule('football-poll-scores', '*/15 * * * *', {});
  await b.work('football-poll-scores', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runFootballPollScores(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (football-poll-scores) failed`, err);
      }
    }
  });

  // Register Football Resolve Matches
  await b.createQueue('football-resolve-matches');
  await b.schedule('football-resolve-matches', '0 */2 * * *', {});
  await b.work('football-resolve-matches', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runFootballResolveMatches(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (football-resolve-matches) failed`, err);
      }
    }
  });

  // Register Football Crawl Odds (Correct Score via Playwright)
  await b.createQueue('football-crawl-odds');
  await b.schedule('football-crawl-odds', '0 */12 * * *', {});
  await b.work('football-crawl-odds', { localConcurrency: 1 }, async (jobs: Job[]) => {
    for (const job of jobs) {
      try {
        await runFootballCrawlOdds(job);
      } catch (err) {
        logger.error('pgBoss', `Job ${job.id} (football-crawl-odds) failed`, err);
      }
    }
  });

  logger.info('pgBoss', 'Jobs registered: activity-queue, voice-minute-tick, vwap-recalc @ 0 * * * *, football-fetch-fixtures @ 0 */6 * * *, football-refresh-odds @ 0 */2 * * *, football-poll-scores @ */15 * * * *, football-resolve-matches @ 0 */2 * * *, football-crawl-odds @ 0 */12 * * *');
}

/**
 * Graceful pg-boss shutdown. Call from bot.ts SIGTERM/SIGINT handler.
 */
export async function stopPgBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    boss = null;
    logger.info('pgBoss', 'Stopped gracefully');
  }
}
