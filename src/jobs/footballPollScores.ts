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
    logo?: string;
    color?: string;
    alternateColor?: string;
  };
  score: string;
  shootoutScore?: number;
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
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
          gt(footballMatches.kickoffAt, twentyFourHoursAgo)
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

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const formatDateUTC = (d: Date): string => {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };
  const datesParam = `${formatDateUTC(twentyFourHoursAgo)}-${formatDateUTC(tomorrow)}`;
  
  try {
    const allLiveEvents = (await apiClient.getFixtureScores(
      leagueIds,
      { dates: datesParam },
      0
    )) as EspnEvent[]; // Bypass cache

    let updatedCount = 0;

    for (const event of allLiveEvents) {
      try {
        const fixtureId = event.id;
        const competition = event.competitions[0];
        if (!competition) continue;

        const espnStatus = competition.status.type.name;
        let newStatus = 'NS';
        if (espnStatus === 'STATUS_FINAL' || espnStatus === 'STATUS_FULL_TIME') newStatus = 'FT';
        else if (espnStatus === 'STATUS_FINAL_PEN') newStatus = 'PEN';
        else if (espnStatus === 'STATUS_FINAL_AET') newStatus = 'AET';
        else if (
          espnStatus === 'STATUS_IN_PROGRESS' ||
          espnStatus === 'STATUS_FIRST_HALF' ||
          espnStatus === 'STATUS_SECOND_HALF'
        ) {
          newStatus = 'LIVE';
        }
        else if (espnStatus === 'STATUS_HALFTIME') newStatus = 'HT';

        const homeCompetitor = competition.competitors.find((c) => c.homeAway === 'home');
        const awayCompetitor = competition.competitors.find((c) => c.homeAway === 'away');
        if (!homeCompetitor || !awayCompetitor) continue;

        const homeScore = parseInt(homeCompetitor.score, 10) || 0;
        const awayScore = parseInt(awayCompetitor.score, 10) || 0;

        const homePenaltyScore = homeCompetitor.shootoutScore !== undefined ? parseInt(String(homeCompetitor.shootoutScore), 10) : null;
        const awayPenaltyScore = awayCompetitor.shootoutScore !== undefined ? parseInt(String(awayCompetitor.shootoutScore), 10) : null;

        const dbMatch = matchesToPoll.find((m) => m.fixtureId === fixtureId);
        if (!dbMatch) continue;

        // Skip updating if scores, status, logos, colors, and penalty scores are identical
        if (
          dbMatch.status === newStatus &&
          dbMatch.homeScore === homeScore &&
          dbMatch.awayScore === awayScore &&
          dbMatch.homeTeamLogo === (homeCompetitor.team.logo || null) &&
          dbMatch.awayTeamLogo === (awayCompetitor.team.logo || null) &&
          dbMatch.homeTeamColor === (homeCompetitor.team.color || null) &&
          dbMatch.awayTeamColor === (awayCompetitor.team.color || null) &&
          dbMatch.homePenaltyScore === homePenaltyScore &&
          dbMatch.awayPenaltyScore === awayPenaltyScore
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
            homeTeamLogo: homeCompetitor.team.logo || null,
            awayTeamLogo: awayCompetitor.team.logo || null,
            homeTeamColor: homeCompetitor.team.color || null,
            awayTeamColor: awayCompetitor.team.color || null,
            homePenaltyScore,
            awayPenaltyScore,
            updatedAt: new Date(),
          })
          .where(eq(footballMatches.fixtureId, fixtureId))
          .returning();

        if (updatedRows.length > 0) {
          updatedCount++;
          const updatedMatch = updatedRows[0];

          // Update the announcement embed
          await updateLiveScoreEmbed(updatedMatch);

          // Resolve wagers if finished
          if (['FT', 'AET', 'PEN'].includes(newStatus)) {
            logger.info('FootballPollScores', `Match ${updatedMatch.id} finished with status ${newStatus}. Triggering resolution...`);
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
