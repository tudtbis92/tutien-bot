import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { config } from '../config.js';
import { runVwapRecalc } from '../jobs/vwapRecalc.js';
import { logger } from '../utils/logger.js';

// IMPORTANT: This module must ONLY be imported by bot.ts (ShardingManager).
// NEVER import this in shard.ts — each shard calling boss.start() creates
// duplicate cron jobs and redundant maintenance workers.

let boss: PgBoss | null = null;

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
}

async function registerJobs(b: PgBoss): Promise<void> {
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

  logger.info('pgBoss', 'Jobs registered: vwap-recalc @ 0 * * * * (top of hour)');
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
