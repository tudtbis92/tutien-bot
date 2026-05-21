/* eslint-disable i18next/no-literal-string -- API endpoint paths and dynamic data access */
import type { Job } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { CURATED_LEAGUES } from '../constants/footballLeagues.js';
import { parseOdds } from '../services/football/oddsCalculator.js';
import { postPredictionEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

interface ApiLeagueSeason {
  year: number;
  current: boolean;
}

interface ApiLeagueResponse {
  seasons?: ApiLeagueSeason[];
}

/**
 * Determine the current season for a league (caches results inside Database)
 */
async function getLeagueSeason(apiClient: FootballApiClient, leagueId: number): Promise<number> {
  const currentYear = new Date().getFullYear();
  try {
    const response = (await apiClient.fetch('/leagues', { id: String(leagueId) }, 24 * 60)) as ApiLeagueResponse[]; // Cache for 24 hours
    if (response && response.length > 0) {
      const leagueObj = response[0];
      const seasons = leagueObj.seasons || [];
      const currentSeason = seasons.find((s) => s.current === true);
      if (currentSeason) {
        return currentSeason.year;
      }
      const lastSeason = seasons[seasons.length - 1];
      if (lastSeason) {
        return lastSeason.year;
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('FootballFetchFixtures', `Failed to fetch season for league ${leagueId}, falling back to current calendar year: ${errMsg}`);
  }
  return currentYear;
}

export async function runFootballFetchFixtures(job: Job): Promise<void> {
  logger.info('FootballFetchFixtures', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();

  // Prediction opening window: [NOW() + 24h, NOW() + 7d]
  const fromDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const toDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const formatDateString = (d: Date) => d.toISOString().split('T')[0];

  const fromStr = formatDateString(fromDate);
  const toStr = formatDateString(toDate);

  let totalFetched = 0;
  let totalCreated = 0;

  for (const league of CURATED_LEAGUES) {
    try {
      const season = await getLeagueSeason(apiClient, league.id);
      logger.info('FootballFetchFixtures', `Fetching fixtures for ${league.name} (League: ${league.id}, Season: ${season}) from ${fromStr} to ${toStr}`);

      const fixtures = (await apiClient.fetch(
        '/fixtures',
        {
          league: String(league.id),
          season: String(season),
          from: fromStr,
          to: toStr,
        },
        60 // Cache for 1 hour
      )) as Record<string, unknown>[];

      if (!Array.isArray(fixtures)) {
        continue;
      }

      totalFetched += fixtures.length;

      for (const fixture of fixtures) {
        try {
          const fixtureId = fixture.fixture.id;

          // Check if fixture already exists in our database
          const existing = await db
            .select()
            .from(footballMatches)
            .where(eq(footballMatches.fixtureId, fixtureId))
            .limit(1);

          if (existing.length > 0) {
            continue;
          }

          // Fetch match odds close to kickoff
          let resultOdds: ReturnType<typeof parseOdds> = {};
          let scoreOdds: ReturnType<typeof parseOdds> = {};
          try {
            const oddsRes = await apiClient.getFixtureOdds(fixtureId, 120); // Cache for 2 hours
            resultOdds = parseOdds(oddsRes, 'result');
            scoreOdds = parseOdds(oddsRes, 'score');
          } catch (oddsErr: unknown) {
            const oddsErrMsg = oddsErr instanceof Error ? oddsErr.message : String(oddsErr);
            logger.warn('FootballFetchFixtures', `Failed to fetch odds for fixture ${fixtureId}: ${oddsErrMsg}`);
          }

          const insertedMatches = await db
            .insert(footballMatches)
            .values({
              fixtureId,
              leagueId: fixture.league.id,
              leagueName: fixture.league.name,
              season: fixture.league.season,
              homeTeamId: fixture.teams.home.id,
              homeTeamName: fixture.teams.home.name,
              awayTeamId: fixture.teams.away.id,
              awayTeamName: fixture.teams.away.name,
              kickoffAt: new Date(fixture.fixture.date),
              status: fixture.fixture.status.short || 'NS',
              homeScore: fixture.goals.home,
              awayScore: fixture.goals.away,
              homeOdds: resultOdds.home || null,
              drawOdds: resultOdds.draw || null,
              awayOdds: resultOdds.away || null,
              exactScoreOdds: scoreOdds.scoreMap || null,
            })
            .onConflictDoNothing()
            .returning();

          if (insertedMatches.length > 0) {
            totalCreated++;
            // Announce match immediately to configured channels
            await postPredictionEmbed(insertedMatches[0]);
          }
        } catch (fixtureErr: unknown) {
          const fixtureErrMsg = fixtureErr instanceof Error ? fixtureErr.message : String(fixtureErr);
          logger.error('FootballFetchFixtures', `Error inserting fixture ${fixture.fixture?.id}: ${fixtureErrMsg}`, fixtureErr);
        }
      }
    } catch (leagueErr: unknown) {
      const leagueErrMsg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
      logger.error('FootballFetchFixtures', `Failed to fetch fixtures for league ${league.id} (${league.name}): ${leagueErrMsg}`, leagueErr);
    }
  }

  logger.info('FootballFetchFixtures', `Job completed: ${job.id}. Fetched ${totalFetched} fixtures, created ${totalCreated} prediction events.`);
}
