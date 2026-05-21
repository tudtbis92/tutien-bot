import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock env variables BEFORE any imports using vi.hoisted
vi.hoisted(() => {
  process.env.DISCORD_TOKEN = 'mock-discord-token-which-is-at-least-50-characters-long-so-it-passes-validation';
  process.env.CLIENT_ID = 'mock-client-id';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/mock';
  process.env.DATABASE_URL_DIRECT = 'postgresql://localhost:5432/mock';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.API_FOOTBALL_KEYS = 'key1,key2,key3';
});

// 2. Define hoisted mocks for DB methods
const { mockSelect, mockInsert, mockFrom, mockWhere, mockLimit, mockValues, mockOnConflictDoUpdate } = vi.hoisted(() => {
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockLimit: vi.fn(),
    mockValues: vi.fn(),
    mockOnConflictDoUpdate: vi.fn(),
  };
});

vi.mock('../../../db/client.js', () => {
  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
    },
  };
});

import { FootballApiClient } from '../apiClient.js';

describe('FootballApiClient', () => {
  let client: FootballApiClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);

    // Reset DB mock chain
    mockSelect.mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere.mockReturnValue({
          limit: mockLimit.mockResolvedValue([]), // Default: no cache hit
        }),
      }),
    });

    mockInsert.mockReturnValue({
      values: mockValues.mockReturnValue({
        onConflictDoUpdate: mockOnConflictDoUpdate.mockResolvedValue(undefined),
      }),
    });

    client = new FootballApiClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should fetch from API when cache is empty', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: (name: string) => (name === 'x-ratelimit-requests-remaining' ? '95' : null),
      },
      json: async () => ({
        response: [{ fixture: { id: 123 } }],
      }),
    });

    const result = await client.fetch('/fixtures', { league: '39' });
    expect(result).toEqual([{ fixture: { id: 123 } }]);

    // Should call global fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should check cache and then write to cache
    expect(mockSelect).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should return cached data if present and valid', async () => {
    // Mock cache hit
    mockLimit.mockResolvedValue([
      {
        responseData: { response: [{ cachedFixture: 456 }] },
      },
    ]);

    const result = await client.fetch('/fixtures', { league: '39' });
    expect(result).toEqual([{ cachedFixture: 456 }]);

    // Should NOT call global fetch
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('should rotate keys and retry on 429 rate limit', async () => {
    // Mock first two keys returning 429, third key returning 200
    mockFetch
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          response: [{ success: true }],
        }),
      });

    const result = await client.fetch('/fixtures', { league: '39' }, 0); // ttl = 0 for no cache
    expect(result).toEqual([{ success: true }]);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify key rotation headers
    const calls = mockFetch.mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((calls[0][1] as any).headers['x-apisports-key']).toBe('key1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((calls[1][1] as any).headers['x-apisports-key']).toBe('key2');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((calls[2][1] as any).headers['x-apisports-key']).toBe('key3');
  });

  it('should throw if all keys return 429', async () => {
    mockFetch.mockResolvedValue({
      status: 429,
      ok: false,
      headers: { get: () => null },
    });

    await expect(client.fetch('/fixtures', {}, 0)).rejects.toThrow('All API keys returned 429 Rate Limit.');
  });
});
