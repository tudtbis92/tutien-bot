import type { Job } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { CURATED_LEAGUES } from '../constants/footballLeagues.js';
import { parseEspnOdds } from '../services/football/oddsCalculator.js';
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
  date: string;
  competitions: {
    competitors: EspnCompetitor[];
    status: {
      type: {
        name: string;
      };
    };
  }[];
}

export async function runFootballFetchFixtures(job: Job): Promise<void> {
  logger.info('FootballFetchFixtures', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  
  let totalFetched = 0;
  let totalCreated = 0;

  for (const league of CURATED_LEAGUES) {
    try {
      logger.info('FootballFetchFixtures', `Fetching fixtures for ${league.name} (Slug: ${league.id})`);

      const data = (await apiClient.getScoreboard(league.id, 60)) as { events?: EspnEvent[] }; // Cache for 1 hour

      if (!data.events || !Array.isArray(data.events)) {
        continue;
      }

      totalFetched += data.events.length;

      for (const event of data.events) {
        try {
          const fixtureId = event.id; // ESPN event ID
          const competition = event.competitions[0];
          if (!competition) continue;

          // Check if fixture already exists in our database
          const existing = await db
            .select()
            .from(footballMatches)
            .where(eq(footballMatches.fixtureId, fixtureId))
            .limit(1);

          if (existing.length > 0) {
            continue;
          }

          const homeCompetitor = competition.competitors.find((c) => c.homeAway === 'home');
          const awayCompetitor = competition.competitors.find((c) => c.homeAway === 'away');

          if (!homeCompetitor || !awayCompetitor) continue;

          // Parse odds and DraftKings event ID
          const oddsInfo = parseEspnOdds(event);

          const espnStatus = competition.status.type.name;
          let status = 'NS';
          if (espnStatus === 'STATUS_FINAL') status = 'FT';
          else if (espnStatus === 'STATUS_IN_PROGRESS') status = 'LIVE';
          else if (espnStatus === 'STATUS_HALFTIME') status = 'HT';

          const insertedMatches = await db
            .insert(footballMatches)
            .values({
              fixtureId,
              leagueId: league.id,
              leagueName: league.name,
              season: new Date().getFullYear(), // ESPN scoreboard usually shows current season
              homeTeamId: homeCompetitor.team.id,
              homeTeamName: homeCompetitor.team.displayName,
              awayTeamId: awayCompetitor.team.id,
              awayTeamName: awayCompetitor.team.displayName,
              kickoffAt: new Date(event.date),
              status,
              homeScore: parseInt(homeCompetitor.score, 10) || 0,
              awayScore: parseInt(awayCompetitor.score, 10) || 0,
              homeOdds: oddsInfo.home || null,
              drawOdds: oddsInfo.draw || null,
              awayOdds: oddsInfo.away || null,
              overUnderLine: oddsInfo.overUnderLine || null,
              overOdds: oddsInfo.overOdds || null,
              underOdds: oddsInfo.underOdds || null,
              homeSpreadLine: oddsInfo.homeSpreadLine || null,
              homeSpreadOdds: oddsInfo.homeSpreadOdds || null,
              awaySpreadLine: oddsInfo.awaySpreadLine || null,
              awaySpreadOdds: oddsInfo.awaySpreadOdds || null,
            })
            .returning();

          if (insertedMatches.length > 0) {
            totalCreated++;
          }
        } catch (fixtureErr: unknown) {
          logger.error('FootballFetchFixtures', `Error inserting fixture ${event.id}`, fixtureErr);
        }
      }
    } catch (leagueErr: unknown) {
      logger.error('FootballFetchFixtures', `Failed to fetch fixtures for league ${league.id} (${league.name})`, leagueErr);
    }
  }

  logger.info('FootballFetchFixtures', `Job completed: ${job.id}. Fetched ${totalFetched} fixtures, created ${totalCreated} prediction events.`);
}
