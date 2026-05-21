import type { Job } from 'pg-boss';
import { eq, and, between, or, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { parseOdds } from '../services/football/oddsCalculator.js';
import { updateLiveScoreEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

export async function runFootballRefreshOdds(job: Job): Promise<void> {
  logger.info('FootballRefreshOdds', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Matches starting in the next 24h that haven't been updated in the last 2 hours
  const matchesToRefresh = await db
    .select()
    .from(footballMatches)
    .where(
      and(
        eq(footballMatches.status, 'NS'),
        between(footballMatches.kickoffAt, now, next24h),
        or(
          isNull(footballMatches.updatedAt),
          lt(footballMatches.updatedAt, twoHoursAgo)
        )
      )
    );

  if (matchesToRefresh.length === 0) {
    logger.info('FootballRefreshOdds', 'No matches require odds refresh at this time.');
    logger.info('FootballRefreshOdds', `Job completed: ${job.id}`);
    return;
  }

  logger.info('FootballRefreshOdds', `Refreshing odds for ${matchesToRefresh.length} matches...`);
  let refreshedCount = 0;

  for (const match of matchesToRefresh) {
    try {
      const oddsRes = await apiClient.getFixtureOdds(match.fixtureId, 0); // Force bypass API cache for fresh odds
      const resultOdds = parseOdds(oddsRes, 'result');
      const scoreOdds = parseOdds(oddsRes, 'score');

      const updatedRows = await db
        .update(footballMatches)
        .set({
          homeOdds: resultOdds.home || match.homeOdds,
          drawOdds: resultOdds.draw || match.drawOdds,
          awayOdds: resultOdds.away || match.awayOdds,
          exactScoreOdds: scoreOdds.scoreMap || match.exactScoreOdds,
          updatedAt: new Date(),
        })
        .where(eq(footballMatches.id, match.id))
        .returning();

      if (updatedRows.length > 0) {
        refreshedCount++;
        // If the match was already announced, update its embed with fresh odds
        if (updatedRows[0].announcementMessageId) {
          await updateLiveScoreEmbed(updatedRows[0]);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('FootballRefreshOdds', `Failed to refresh odds for match ID ${match.id} (Fixture: ${match.fixtureId}): ${errMsg}`);
    }
  }

  logger.info('FootballRefreshOdds', `Job completed: ${job.id}. Refreshed odds for ${refreshedCount}/${matchesToRefresh.length} matches.`);
}
