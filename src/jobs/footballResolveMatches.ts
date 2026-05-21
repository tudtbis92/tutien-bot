import type { Job } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { footballBets } from '../db/schema/footballBets.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { resolveMatchBets, updateLiveScoreEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

export async function runFootballResolveMatches(job: Job): Promise<void> {
  logger.info('FootballResolveMatches', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // 1. Fetch matches that have pending bets in the system
  const matchesWithPendingBets = await db
    .select({
      id: footballMatches.id,
      fixtureId: footballMatches.fixtureId,
      status: footballMatches.status,
      homeScore: footballMatches.homeScore,
      awayScore: footballMatches.awayScore,
      homeTeamName: footballMatches.homeTeamName,
      awayTeamName: footballMatches.awayTeamName,
      leagueName: footballMatches.leagueName,
      kickoffAt: footballMatches.kickoffAt,
      homeOdds: footballMatches.homeOdds,
      drawOdds: footballMatches.drawOdds,
      awayOdds: footballMatches.awayOdds,
      exactScoreOdds: footballMatches.exactScoreOdds,
      announcementChannelId: footballMatches.announcementChannelId,
      announcementMessageId: footballMatches.announcementMessageId,
    })
    .from(footballMatches)
    .innerJoin(footballBets, eq(footballMatches.id, footballBets.fixtureId))
    .where(eq(footballBets.status, 'pending'));

  // De-duplicate matches
  const uniqueMatches = Array.from(
    new Map(matchesWithPendingBets.map((m) => [m.id, m])).values()
  );

  if (uniqueMatches.length === 0) {
    logger.info('FootballResolveMatches', 'No matches with pending bets require resolution.');
    logger.info('FootballResolveMatches', `Job completed: ${job.id}`);
    return;
  }

  // 2. Filter matches that are finished OR have elapsed > 2h (stale matches)
  const matchesToResolve = uniqueMatches.filter((m) => {
    const isFinishedStatus = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'INT', 'SUSP'].includes(m.status);
    const isStale = new Date(m.kickoffAt) < twoHoursAgo;
    return isFinishedStatus || isStale;
  });

  if (matchesToResolve.length === 0) {
    logger.info('FootballResolveMatches', `Found ${uniqueMatches.length} pending matches, but none are finished or stale yet.`);
    logger.info('FootballResolveMatches', `Job completed: ${job.id}`);
    return;
  }

  logger.info('FootballResolveMatches', `Resolving ${matchesToResolve.length} matches...`);
  let resolvedCount = 0;

  for (const match of matchesToResolve) {
    try {
      // Query direct result from API-Football
      const resultObj = await apiClient.getFixtureResult(match.fixtureId, 0); // Bypass cache for resolving
      
      if (!resultObj) {
        logger.warn('FootballResolveMatches', `Could not fetch API result for match ID ${match.id} (Fixture: ${match.fixtureId})`);
        continue;
      }

      const newStatus = resultObj.fixture.status.short || 'FT';
      const homeScore = resultObj.goals.home;
      const awayScore = resultObj.goals.away;

      // Update match row
      const updatedRows = await db
        .update(footballMatches)
        .set({
          status: newStatus,
          homeScore: homeScore !== null ? Number(homeScore) : match.homeScore,
          awayScore: awayScore !== null ? Number(awayScore) : match.awayScore,
          updatedAt: new Date(),
        })
        .where(eq(footballMatches.id, match.id))
        .returning();

      if (updatedRows.length > 0) {
        const updatedMatch = updatedRows[0];

        // Resolve all user wagers atomically
        await resolveMatchBets(updatedMatch);

        // Update the announcement embed to final status (FT, void, etc.)
        await updateLiveScoreEmbed(updatedMatch);

        resolvedCount++;
        logger.info('FootballResolveMatches', `Resolved match ${match.id} (Fixture: ${match.fixtureId}) successfully with status: ${newStatus}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('FootballResolveMatches', `Failed to resolve match ID ${match.id} (Fixture: ${match.fixtureId}): ${errMsg}`);
    }
  }

  logger.info('FootballResolveMatches', `Job completed: ${job.id}. Resolved ${resolvedCount}/${matchesToResolve.length} matches.`);
}
