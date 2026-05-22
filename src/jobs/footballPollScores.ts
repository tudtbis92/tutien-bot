import type { Job } from 'pg-boss';
import { eq, and, or, lt, gt, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { updateLiveScoreEmbed, resolveMatchBets } from '../services/football/matchLifecycleService.js';
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

export async function runFootballPollScores(job: Job): Promise<void> {
  logger.info('FootballPollScores', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  // ESPN scoreboard only returns matches for the current day/window.
  // NS matches older than 6h won't appear in scoreboard response — resolveMatches handles those.
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  // Poll active matches + NS matches that should have started within the last 6h
  const matchesToPoll = await db
    .select()
    .from(footballMatches)
    .where(
      or(
        and(
          inArray(footballMatches.status, ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']),
          gt(footballMatches.kickoffAt, twoHoursAgo)
        ),
        and(
          eq(footballMatches.status, 'NS'),
          lt(footballMatches.kickoffAt, now),
          gt(footballMatches.kickoffAt, sixHoursAgo)
        )
      )
    );

  if (matchesToPoll.length === 0) {
    logger.info('FootballPollScores', 'No active or starting matches require live score polling at this time.');
    logger.info('FootballPollScores', `Job completed: ${job.id}`);
    return;
  }

  // Group matches by league to optimize API calls
  const leagueIds = Array.from(new Set(matchesToPoll.map((m) => m.leagueId)));
  
  try {
    const allLiveEvents = (await apiClient.getFixtureScores(leagueIds, 0)) as EspnEvent[]; // Bypass cache

    let updatedCount = 0;

    for (const event of allLiveEvents) {
      try {
        const fixtureId = event.id;
        const competition = event.competitions[0];
        if (!competition) continue;

        const espnStatus = competition.status.type.name;
        let newStatus = 'NS';
        if (espnStatus === 'STATUS_FINAL') newStatus = 'FT';
        else if (espnStatus === 'STATUS_IN_PROGRESS') newStatus = 'LIVE';
        else if (espnStatus === 'STATUS_HALFTIME') newStatus = 'HT';

        const homeCompetitor = competition.competitors.find((c) => c.homeAway === 'home');
        const awayCompetitor = competition.competitors.find((c) => c.homeAway === 'away');
        if (!homeCompetitor || !awayCompetitor) continue;

        const homeScore = parseInt(homeCompetitor.score, 10) || 0;
        const awayScore = parseInt(awayCompetitor.score, 10) || 0;

        const dbMatch = matchesToPoll.find((m) => m.fixtureId === fixtureId);
        if (!dbMatch) continue;

        // Skip updating if scores and status are identical
        if (
          dbMatch.status === newStatus &&
          dbMatch.homeScore === homeScore &&
          dbMatch.awayScore === awayScore
        ) {
          continue;
        }

        // Update database match row
        const updatedRows = await db
          .update(footballMatches)
          .set({
            status: newStatus,
            homeScore,
            awayScore,
            updatedAt: new Date(),
          })
          .where(eq(footballMatches.fixtureId, fixtureId))
          .returning();

        if (updatedRows.length > 0) {
          updatedCount++;
          const updatedMatch = updatedRows[0];

          // Update the announcement embed
          await updateLiveScoreEmbed(updatedMatch);

          // Resolve bets if finished
          if (newStatus === 'FT') {
            logger.info('FootballPollScores', `Match ${updatedMatch.id} finished. Triggering resolution...`);
            await resolveMatchBets(updatedMatch);
          }
        }
      } catch (fixtureErr: unknown) {
        logger.error('FootballPollScores', `Failed to process update for fixture ${event.id}`, fixtureErr);
      }
    }

    logger.info('FootballPollScores', `Job completed: ${job.id}. Updated ${updatedCount} matches.`);
  } catch (err: unknown) {
    logger.error('FootballPollScores', `Failed to poll active matches`, err);
  }
}
