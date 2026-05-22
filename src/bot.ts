import { ShardingManager } from 'discord.js';
import { config } from './config.js';
import { initPgBoss, stopPgBoss, boss } from './workers/pgBoss.js';
import { startHealthServer } from './workers/health.js';
import { registerCommands } from './utils/registerCommands.js';
import { db, pool } from './db/client.js';
import { redis } from './cache/redis.js';
import { logger } from './utils/logger.js';
import { sql, isNull, and, eq, or } from 'drizzle-orm';
import { footballMatches } from './db/schema/footballMatches.js';
import { initI18n } from './i18n/index.js';
import { fillDefaultOdds } from './services/football/oddsCalculator.js';
import { updatePredictionEmbeds } from './services/football/matchLifecycleService.js';

// eslint-disable-next-line i18next/no-literal-string -- deployment artifact path, not user-facing
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

  // Step 2.5: Initialize i18next for the ShardingManager process
  // Required because pg-boss workers run in this process and send translated embeds
  logger.info('ShardingManager', 'Initializing i18n...');
  await initI18n();

  // Step 3: pg-boss ONLY in ShardingManager — never in shards
  await initPgBoss();

  // Step 3b: Startup check — if no upcoming fixtures in DB, trigger fetch immediately
  {
    const fromDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(footballMatches)
      .where(sql`kickoff_at >= ${fromDate.toISOString()}`);

    if ((row?.count ?? 0) === 0) {
      logger.info('StartupCheck', 'No upcoming fixtures found. Triggering immediate fetch...');
      void boss!.send('football-fetch-fixtures', {});
    } else {
      logger.info('StartupCheck', `${row!.count} upcoming fixtures already in DB. Skipping startup fetch.`);
    }
  }

  // Step 3c: Announce scan — sweep prediction channels to ensure no active matches within 24h are missed
  logger.info('StartupCheck', 'Triggering match announcements scan on startup...');
  void boss!.send('football-announce-matches', {});

  // Step 3d: Fix historical matches with missing secondary markets (Over/Under or Spread is NULL)
  try {
    logger.info('StartupCheck', 'Scanning for matches with missing secondary markets...');
    const brokenMatches = await db
      .select()
      .from(footballMatches)
      .where(
        and(
          eq(footballMatches.status, 'NS'),
          or(
            isNull(footballMatches.overUnderLine),
            isNull(footballMatches.homeSpreadLine)
          )
        )
      );

    if (brokenMatches.length > 0) {
      logger.info('StartupCheck', `Found ${brokenMatches.length} matches missing secondary markets. Repairing...`);
      let repairedCount = 0;
      for (const match of brokenMatches) {
        try {
          const filled = fillDefaultOdds({
            home: match.homeOdds ?? undefined,
            draw: match.drawOdds ?? undefined,
            away: match.awayOdds ?? undefined,
            overUnderLine: match.overUnderLine ?? undefined,
            overOdds: match.overOdds ?? undefined,
            underOdds: match.underOdds ?? undefined,
            homeSpreadLine: match.homeSpreadLine ?? undefined,
            homeSpreadOdds: match.homeSpreadOdds ?? undefined,
            awaySpreadLine: match.awaySpreadLine ?? undefined,
            awaySpreadOdds: match.awaySpreadOdds ?? undefined,
          });

          const updatedRows = await db
            .update(footballMatches)
            .set({
              overUnderLine: filled.overUnderLine,
              overOdds: filled.overOdds,
              underOdds: filled.underOdds,
              homeSpreadLine: filled.homeSpreadLine,
              homeSpreadOdds: filled.homeSpreadOdds,
              awaySpreadLine: filled.awaySpreadLine,
              awaySpreadOdds: filled.awaySpreadOdds,
              updatedAt: new Date(),
            })
            .where(eq(footballMatches.id, match.id))
            .returning();

          if (updatedRows.length > 0) {
            repairedCount++;
            // Cập nhật lại tin nhắn prediction đã gửi trên Discord
            await updatePredictionEmbeds(updatedRows[0]);
          }
        } catch (matchErr) {
          logger.error('StartupCheck', `Failed to repair markets for match ID ${match.id}`, matchErr);
        }
      }
      logger.info('StartupCheck', `Successfully repaired ${repairedCount}/${brokenMatches.length} matches.`);
    } else {
      logger.info('StartupCheck', 'No matches require secondary markets repair.');
    }
  } catch (repairErr) {
    logger.error('StartupCheck', 'Failed to scan/repair historical matches', repairErr);
  }

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
