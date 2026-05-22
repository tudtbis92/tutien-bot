import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PredictionImageService } from '../predictionImageService.js';
import type { FootballMatch } from '../../../db/schema/footballMatches.js';

describe('PredictionImageService', () => {
  let imageService: PredictionImageService;

  const mockMatch: FootballMatch = {
    id: 12345,
    fixtureId: 'espn:12345',
    leagueId: 'eng.1',
    leagueName: 'Premier League',
    season: 2026,
    homeTeamId: '1',
    homeTeamName: 'Arsenal',
    awayTeamId: '2',
    awayTeamName: 'Chelsea',
    kickoffAt: new Date(),
    status: 'NS',
    homeScore: 0,
    awayScore: 0,
    homeOdds: '2.00',
    drawOdds: '3.40',
    awayOdds: '3.50',
    overUnderLine: '2.5',
    overOdds: '1.90',
    underOdds: '1.90',
    homeSpreadLine: '0',
    homeSpreadOdds: '1.90',
    awaySpreadLine: '0',
    awaySpreadOdds: '1.90',
    homeTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/1.png',
    awayTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/2.png',
    homeTeamColor: 'ef4444',
    awayTeamColor: '06b6d4',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    imageService = PredictionImageService.getInstance();
    imageService.clearCache();
    vi.restoreAllMocks();
  });

  it('should be a singleton instance', () => {
    const anotherInstance = PredictionImageService.getInstance();
    expect(imageService).toBe(anotherInstance);
  });

  it('should successfully generate a PNG buffer for a mock match', async () => {
    // Mock the fetch call for logos to prevent network requests during tests
    const mockResponse = {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const buffer = await imageService.getClashCardBuffer(mockMatch);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should coalesce concurrent calls for the same match ID', async () => {
    // Mock fetch to be slow so concurrent requests are active at the same time
    const mockResponse = {
      ok: true,
      arrayBuffer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new ArrayBuffer(8);
      },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    // Fire three concurrent generation requests for the same match
    const p1 = imageService.getClashCardBuffer(mockMatch);
    const p2 = imageService.getClashCardBuffer(mockMatch);
    const p3 = imageService.getClashCardBuffer(mockMatch);

    const [b1, b2, b3] = await Promise.all([p1, p2, p3]);

    // All buffers should be the same identical buffer in memory
    expect(b1).toBe(b2);
    expect(b2).toBe(b3);

    // fetch should only have been called twice (once for home logo, once for away logo)
    // instead of six times (2 logos * 3 calls)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should fallback gracefully to initials if team logos fail to load', async () => {
    // Mock fetch to reject with a connection timeout / error
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection timed out'));

    const buffer = await imageService.getClashCardBuffer(mockMatch);

    // Image buffer should still be drawn successfully using vector letter initials
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
