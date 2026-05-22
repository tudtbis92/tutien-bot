import type { Job } from 'pg-boss';
import { boss } from '../workers/pgBoss.js';
import { sql } from 'drizzle-orm';
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
  let totalUpdated = 0;
  let newFixturesIn24h = 0;

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
          else if (espnStatus === 'STATUS_POSTPONED') status = 'PST';
          else if (espnStatus === 'STATUS_CANCELED') status = 'CANC';

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
            .onConflictDoUpdate({
              target: footballMatches.fixtureId,
              setWhere: sql`football_matches.status IN ('NS', 'PST')`,
              set: {
                status: sql`CASE
                  WHEN football_matches.status IN ('FT','AET','PEN','1H','HT','2H','LIVE')
                  THEN football_matches.status
                  ELSE excluded.status
                END`,
                kickoffAt: sql`excluded.kickoff_at`,
                homeOdds: sql`COALESCE(excluded.home_odds, football_matches.home_odds)`,
                drawOdds: sql`COALESCE(excluded.draw_odds, football_matches.draw_odds)`,
                awayOdds: sql`COALESCE(excluded.away_odds, football_matches.away_odds)`,
                overUnderLine: sql`COALESCE(excluded.over_under_line, football_matches.over_under_line)`,
                overOdds: sql`COALESCE(excluded.over_odds, football_matches.over_odds)`,
                underOdds: sql`COALESCE(excluded.under_odds, football_matches.under_odds)`,
                homeSpreadLine: sql`COALESCE(excluded.home_spread_line, football_matches.home_spread_line)`,
                homeSpreadOdds: sql`COALESCE(excluded.home_spread_odds, football_matches.home_spread_odds)`,
                awaySpreadLine: sql`COALESCE(excluded.away_spread_line, football_matches.away_spread_line)`,
                awaySpreadOdds: sql`COALESCE(excluded.away_spread_odds, football_matches.away_spread_odds)`,
                updatedAt: new Date(),
              },
            })
            .returning();

          if (insertedMatches.length > 0) {
            const insertedMatch = insertedMatches[0];
            const isNew = Math.abs(insertedMatch.createdAt.getTime() - insertedMatch.updatedAt.getTime()) < 1000;
            if (isNew) {
              totalCreated++;
              
              // Check if kickoff is in the next 24 hours
              const kickoff = new Date(insertedMatch.kickoffAt);
              const limit24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
              if (kickoff > new Date() && kickoff <= limit24h) {
                newFixturesIn24h++;
              }
            } else {
              totalUpdated++;
            }
          }
        } catch (fixtureErr: unknown) {
          logger.error('FootballFetchFixtures', `Error inserting fixture ${event.id}`, fixtureErr);
        }
      }
    } catch (leagueErr: unknown) {
      logger.error('FootballFetchFixtures', `Failed to fetch fixtures for league ${league.id} (${league.name})`, leagueErr);
    }
  }

  if (newFixturesIn24h > 0) {
    logger.info('FootballFetchFixtures', `${newFixturesIn24h} new fixtures in 24h window — triggering announce scan.`);
    if (boss) {
      await boss.send('football-announce-matches', {});
    }
  }

  logger.info('FootballFetchFixtures', `Job completed: ${job.id}. Fetched ${totalFetched} fixtures, created ${totalCreated} new events, updated ${totalUpdated} existing events.`);
}
