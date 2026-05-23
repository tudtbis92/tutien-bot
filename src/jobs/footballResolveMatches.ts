import type { Job } from 'pg-boss';
import { eq, and, lt, gt, not, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { footballBets } from '../db/schema/footballBets.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { resolveMatchBets, updateLiveScoreEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  team: {
    id: string;
    displayName: string;
  };
  score: string;
}

interface EspnEvent {
  id: string;
  competitions: {
    competitors: EspnCompetitor[];
    status: {
      type: {
        name: string;
      };
    };
  }[];
}

export async function runFootballResolveMatches(job: Job): Promise<void> {
  logger.info('FootballResolveMatches', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1a. Fetch matches that have pending bets in the system
  const matchesWithPendingBets = await db
    .select({
      id: footballMatches.id,
      fixtureId: footballMatches.fixtureId,
      leagueId: footballMatches.leagueId,
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
      overUnderLine: footballMatches.overUnderLine,
      homeSpreadLine: footballMatches.homeSpreadLine,
      awaySpreadLine: footballMatches.awaySpreadLine,
    })
    .from(footballMatches)
    .innerJoin(footballBets, eq(footballMatches.id, footballBets.fixtureId))
    .where(eq(footballBets.status, 'pending'));

  // 1b. Fetch stale matches (older than 2h, newer than 7d) that are not finished
  const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'INT', 'SUSP'];
  const staleUnfinishedMatches = await db
    .select()
    .from(footballMatches)
    .where(
      and(
        lt(footballMatches.kickoffAt, sixHoursAgo),
        gt(footballMatches.kickoffAt, sevenDaysAgo),
        not(inArray(footballMatches.status, FINISHED_STATUSES))
      )
    );

  // De-duplicate matches
  const uniqueMatchesMap = new Map();
  for (const m of matchesWithPendingBets) uniqueMatchesMap.set(m.id, m);
  for (const m of staleUnfinishedMatches) uniqueMatchesMap.set(m.id, m);
  const uniqueMatches = Array.from(uniqueMatchesMap.values());

  if (uniqueMatches.length === 0) {
    logger.info('FootballResolveMatches', 'No matches require resolution at this time.');
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
      // Query direct result from ESPN
      const resultObj = (await apiClient.getFixtureResult(match.fixtureId, match.leagueId, 0)) as EspnEvent; // Bypass cache for resolving
      
      if (!resultObj) {
        logger.warn('FootballResolveMatches', `Could not fetch API result for match ID ${match.id} (Fixture: ${match.fixtureId})`);
        continue;
      }

      const competition = resultObj.competitions[0];
      if (!competition) continue;

      const espnStatus = competition.status.type.name;
      let newStatus = 'FT';
      if (espnStatus === 'STATUS_FINAL' || espnStatus === 'STATUS_FULL_TIME') newStatus = 'FT';
      else if (espnStatus === 'STATUS_POSTPONED') newStatus = 'PST';
      else if (espnStatus === 'STATUS_CANCELED') newStatus = 'CANC';

      const homeCompetitor = competition.competitors.find((c) => c.homeAway === 'home');
      const awayCompetitor = competition.competitors.find((c) => c.homeAway === 'away');
      if (!homeCompetitor || !awayCompetitor) continue;

      const homeScore = parseInt(homeCompetitor.score, 10) || 0;
      const awayScore = parseInt(awayCompetitor.score, 10) || 0;

      // Update match row
      const updatedRows = await db
        .update(footballMatches)
        .set({
          status: newStatus,
          homeScore,
          awayScore,
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
