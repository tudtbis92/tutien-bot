import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apiCache } from '../../db/schema/apiCache.js';
import { logger } from '../../utils/logger.js';

export class FootballApiClient {
  constructor(private dbClient: typeof db = db) {}

  /**
   * Query cache for a key if still valid.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getCache(key: string): Promise<any | null> {
    try {
      const cached = await this.dbClient
        .select()
        .from(apiCache)
        .where(and(eq(apiCache.cacheKey, key), gt(apiCache.expiresAt, new Date())))
        .limit(1);

      if (cached.length > 0) {
        return cached[0].responseData;
      }
    } catch (err) {
      logger.error('FootballApiClient', `Error reading cache for key ${key}`, err);
    }
    return null;
  }

  /**
   * Insert/Update cache for a key with TTL.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async setCache(key: string, endpoint: string, data: any, ttlMinutes: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      await this.dbClient
        .insert(apiCache)
        .values({
          cacheKey: key,
          endpoint,
          responseData: data,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: apiCache.cacheKey,
          set: {
            responseData: data,
            expiresAt,
            createdAt: new Date(),
          },
        });
    } catch (err) {
      logger.error('FootballApiClient', `Error writing cache for key ${key}`, err);
    }
  }

  /**
   * Perform fetch from ESPN scoreboard API with database caching.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async fetch(leagueSlug: string, params: Record<string, string> = {}, ttlMinutes: number = 60): Promise<any> {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const cacheKey = `espn:${leagueSlug}?${sortedParams}`;

    if (ttlMinutes > 0) {
      const cachedData = await this.getCache(cacheKey);
      if (cachedData !== null) {
        return cachedData;
      }
    }

    const queryParamsString = sortedParams ? `?${sortedParams}` : '';
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard${queryParamsString}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          // eslint-disable-next-line i18next/no-literal-string
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`ESPN API returned non-OK status: ${response.status} ${response.statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await response.json()) as any;

      if (ttlMinutes > 0) {
        await this.setCache(cacheKey, `/scoreboard/${leagueSlug}`, data, ttlMinutes);
      }

      return data;
    } catch (err) {
      logger.error('FootballApiClient', `Fetch failed for URL ${url}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Fetch scoreboard for a league.
   */
  public async getScoreboard(leagueSlug: string, ttlMinutes = 60): Promise<unknown> {
    return this.fetch(leagueSlug, {}, ttlMinutes);
  }

  /**
   * Legacy method mapping: getFixtures now uses scoreboard.
   * Note: season parameter is currently ignored for ESPN scoreboard.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtures(leagueId: string, _season: number, _params: Record<string, string> = {}, ttlMinutes = 60): Promise<any[]> {
    const data = await this.getScoreboard(leagueId, ttlMinutes);
    return data.events || [];
  }

  /**
   * Legacy method mapping: getFixtureScores now uses scoreboard for active leagues.
   */
  public async getFixtureScores(leagueIds: string[], ttlMinutes = 5): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const slug of leagueIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await this.getScoreboard(slug, ttlMinutes)) as any;
      if (data.events) {
        results.push(...data.events);
      }
    }
    return results;
  }

  /**
   * Fetch a single match's latest data.
   */
  public async getFixtureResult(fixtureId: string, leagueSlug: string, ttlMinutes = 15): Promise<unknown | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await this.getScoreboard(leagueSlug, ttlMinutes)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.events?.find((e: any) => e.id === fixtureId) || null;
  }

  /**
   * Fetch odds (Moneyline) for a fixture from ESPN.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtureOdds(fixtureId: string, leagueSlug: string, ttlMinutes = 60): Promise<any | null> {
    return this.getFixtureResult(fixtureId, leagueSlug, ttlMinutes);
  }
}

export const apiFootballFetch = async (leagueSlug: string, params: Record<string, string> = {}, ttlMinutes = 60) => {
  const client = new FootballApiClient();
  return client.fetch(leagueSlug, params, ttlMinutes);
};
