import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apiCache } from '../../db/schema/apiCache.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { FOOTBALL_CONFIG } from '../../constants/footballConfig.js';

export interface ApiKeyEntry {
  key: string;
  remaining: number;
  last429At: number | null;
}

export class FootballApiClient {
  private currentKeyIndex = 0;
  private keyStates = new Map<string, { remaining: number; last429: number }>();

  constructor(private dbClient: typeof db = db) {}

  /**
   * Retrieve the next available API key from the pool, skipping those in cooldown (last 429 within 60s).
   */
  private getNextKey(): string {
    const keys = config.API_FOOTBALL_KEYS.split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      // eslint-disable-next-line i18next/no-literal-string
      throw new Error('API_FOOTBALL_KEYS is not configured.');
    }

    const now = Date.now();
    let selectedKey: string | null = null;

    for (let i = 0; i < keys.length; i++) {
      const idx = (this.currentKeyIndex + i) % keys.length;
      const key = keys[idx];
      const state = this.keyStates.get(key) || { remaining: 100, last429: 0 };

      // Skip keys with a 429 within 60 seconds
      if (now - state.last429 < 60000) {
        continue;
      }

      selectedKey = key;
      this.currentKeyIndex = (idx + 1) % keys.length;
      break;
    }

    // Fallback: if all keys are in cooldown, pick the oldest rate-limited key
    if (!selectedKey) {
      logger.warn('FootballApiClient', 'All API keys are currently in rate limit cooldown. Falling back to oldest.');
      let oldestKey = keys[0];
      let oldestTime = now;

      for (const key of keys) {
        const state = this.keyStates.get(key);
        if (state && state.last429 < oldestTime) {
          oldestTime = state.last429;
          oldestKey = key;
        }
      }

      selectedKey = oldestKey;
      this.currentKeyIndex = (keys.indexOf(selectedKey) + 1) % keys.length;
    }

    return selectedKey;
  }

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
   * Perform fetch with key rotation, backoff on 429, and database caching.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async fetch(path: string, params: Record<string, string> = {}, ttlMinutes: number = 60): Promise<any> {
    // 1. Build cache key from path + sorted params
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    const cacheKey = sortedParams ? `${path}?${sortedParams}` : path;

    // 2. Check cache first (skip caching if ttlMinutes <= 0)
    if (ttlMinutes > 0) {
      const cachedData = await this.getCache(cacheKey);
      if (cachedData !== null) {
        logger.debug('FootballApiClient', `Cache hit for ${cacheKey}`);
        // API-Football wraps its response payload inside the 'response' property of the API return body.
        // If we cached the full API return body, we should return cachedData.response.
        // Let's ensure we cache the whole API response and return response from it.
        return cachedData.response;
      }
    }

    const keys = config.API_FOOTBALL_KEYS.split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const maxAttempts = Math.max(1, keys.length);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const key = this.getNextKey();
      const queryParamsString = sortedParams ? `?${sortedParams}` : '';
      const url = `https://v3.football.api-sports.io${path}${queryParamsString}`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-apisports-key': key,
            'Accept': 'application/json',
          },
        });

        // Track remaining quota if headers exist
        const remainingHeader =
          response.headers.get('x-ratelimit-requests-remaining') ||
          response.headers.get('x-rate-limit-remaining');
        if (remainingHeader) {
          const remainingNum = parseInt(remainingHeader, 10);
          if (!isNaN(remainingNum)) {
            const state = this.keyStates.get(key) || { remaining: 100, last429: 0 };
            state.remaining = remainingNum;
            this.keyStates.set(key, state);
          }
        }

        // Handle 429
        if (response.status === 429) {
          const state = this.keyStates.get(key) || { remaining: 0, last429: 0 };
          state.last429 = Date.now();
          state.remaining = 0;
          this.keyStates.set(key, state);
          logger.warn('FootballApiClient', `Rate limited (429) for key ...${key.slice(-4)}. Rotating. Attempt ${attempt}/${maxAttempts}`);

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          } else {
            // eslint-disable-next-line i18next/no-literal-string
    throw new Error('All API keys returned 429 Rate Limit.');
          }
        }

        if (!response.ok) {
          throw new Error(`API returned non-OK status: ${response.status} ${response.statusText}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await response.json()) as any;

        // Parse JSON response. If data.errors has keys, throw Error with error details.
        // Wait: API-Football sometimes returns errors: [] (empty array) or errors: { token: "Error" } (object).
        // Let's handle both.
        if (data.errors && Object.keys(data.errors).length > 0) {
          const errorMsg = JSON.stringify(data.errors);
          // If the error indicates a subscription/limit error, we could rotate, but typically it is a configuration or query error.
          throw new Error(`API Football error: ${errorMsg}`);
        }

        // Cache the full response if TTL is greater than 0
        if (ttlMinutes > 0) {
          await this.setCache(cacheKey, path, data, ttlMinutes);
        }

        return data.response;
      } catch (err) {
        logger.error('FootballApiClient', `Fetch attempt ${attempt} failed for URL ${url}: ${err instanceof Error ? err.message : String(err)}`);
        if (attempt === maxAttempts) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('Fetch failed after all key rotation attempts');
  }

  /**
   * Fetch fixtures for a league and season.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtures(leagueId: number, season: number, ttlMinutes = 60): Promise<any[]> {
    // eslint-disable-next-line i18next/no-literal-string
    return this.fetch('/fixtures', { league: String(leagueId), season: String(season) }, ttlMinutes);
  }

  /**
   * Fetch odds for a fixture.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtureOdds(fixtureId: number, ttlMinutes = 60): Promise<any[]> {
    // eslint-disable-next-line i18next/no-literal-string
    return this.fetch('/odds', { fixture: String(fixtureId) }, ttlMinutes);
  }

  /**
   * Fetch scores for multiple fixtures, automatically batching to max 20 per call.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtureScores(fixtureIds: number[], ttlMinutes = 5): Promise<any[]> {
    const maxBatch = FOOTBALL_CONFIG.MAX_BATCH_FIXTURE_IDS;
    if (fixtureIds.length === 0) return [];

    const batches: number[][] = [];
    for (let i = 0; i < fixtureIds.length; i += maxBatch) {
      batches.push(fixtureIds.slice(i, i + maxBatch));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    for (const batch of batches) {
      // eslint-disable-next-line i18next/no-literal-string
      const response = await this.fetch('/fixtures', { ids: batch.join('-') }, ttlMinutes);
      if (Array.isArray(response)) {
        results.push(...response);
      }
    }
    return results;
  }

  /**
   * Fetch the result and detail of a single fixture.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getFixtureResult(fixtureId: number, ttlMinutes = 15): Promise<any | null> {
    // eslint-disable-next-line i18next/no-literal-string
    const response = await this.fetch('/fixtures', { id: String(fixtureId) }, ttlMinutes);
    return response && response.length > 0 ? response[0] : null;
  }
}

// Export a convenience instance using the default db client
export const apiFootballFetch = async (path: string, params: Record<string, string> = {}, ttlMinutes = 60) => {
  const client = new FootballApiClient();
  return client.fetch(path, params, ttlMinutes);
};
