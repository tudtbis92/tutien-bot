import type { Job } from 'pg-boss';
import { eq, and, between, or, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { parseEspnOdds } from '../services/football/oddsCalculator.js';
import { logger } from '../utils/logger.js';

export async function runFootballRefreshOdds(job: Job): Promise<void> {
  logger.info('FootballRefreshOdds', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

  // Matches starting in the next 24h that haven't been updated in the last 1 hour
  const matchesToRefresh = await db
    .select()
    .from(footballMatches)
    .where(
      and(
        eq(footballMatches.status, 'NS'),
        between(footballMatches.kickoffAt, now, next24h),
        or(
          isNull(footballMatches.updatedAt),
          lt(footballMatches.updatedAt, oneHourAgo)
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

  // Group matches by league
  const byLeague = matchesToRefresh.reduce((map, m) => {
    const list = map.get(m.leagueId) ?? [];
    list.push(m);
    map.set(m.leagueId, list);
    return map;
  }, new Map<string, typeof matchesToRefresh>());

  for (const [leagueId, matches] of byLeague) {
    try {
      // 1 ESPN call per league (bypass cache with ttl = 0)
      const data = (await apiClient.getScoreboard(leagueId, 0)) as { events?: Record<string, unknown>[] };
      const events = data.events || [];
      const eventMap = new Map<string, Record<string, unknown>>(
        events.map((e) => [String(e.id), e])
      );

      for (const match of matches) {
        try {
          const event = eventMap.get(match.fixtureId);
          if (!event) {
            logger.warn('FootballRefreshOdds', `Fixture ${match.fixtureId} not found in ESPN scoreboard for league ${leagueId}`);
            continue;
          }

          const oddsInfo = parseEspnOdds(event);

          const updatedRows = await db
            .update(footballMatches)
            .set({
              homeOdds: oddsInfo.home || match.homeOdds,
              drawOdds: oddsInfo.draw || match.drawOdds,
              awayOdds: oddsInfo.away || match.awayOdds,
              overUnderLine: oddsInfo.overUnderLine || match.overUnderLine,
              overOdds: oddsInfo.overOdds || match.overOdds,
              underOdds: oddsInfo.underOdds || match.underOdds,
              homeSpreadLine: oddsInfo.homeSpreadLine || match.homeSpreadLine,
              homeSpreadOdds: oddsInfo.homeSpreadOdds || match.homeSpreadOdds,
              awaySpreadLine: oddsInfo.awaySpreadLine || match.awaySpreadLine,
              awaySpreadOdds: oddsInfo.awaySpreadOdds || match.awaySpreadOdds,
              updatedAt: new Date(),
            })
            .where(eq(footballMatches.id, match.id))
            .returning();

          if (updatedRows.length > 0) {
            refreshedCount++;
          }
        } catch (matchErr: unknown) {
          const errMsg = matchErr instanceof Error ? matchErr.message : String(matchErr);
          logger.error('FootballRefreshOdds', `Failed to refresh odds for match ID ${match.id} (Fixture: ${match.fixtureId}): ${errMsg}`);
        }
      }
    } catch (leagueErr: unknown) {
      const errMsg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
      logger.error('FootballRefreshOdds', `Failed to fetch scoreboard for league ${leagueId}: ${errMsg}`);
    }
  }

  logger.info('FootballRefreshOdds', `Job completed: ${job.id}. Refreshed odds for ${refreshedCount}/${matchesToRefresh.length} matches.`);
}
