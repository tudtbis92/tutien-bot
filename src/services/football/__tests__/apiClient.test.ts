import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock env variables BEFORE any imports using vi.hoisted
vi.hoisted(() => {
  process.env.DISCORD_TOKEN = 'mock-discord-token-which-is-at-least-50-characters-long-so-it-passes-validation';
  process.env.CLIENT_ID = 'mock-client-id';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/mock';
  process.env.DATABASE_URL_DIRECT = 'postgresql://localhost:5432/mock';
  process.env.REDIS_URL = 'redis://localhost:6379';
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
      json: async () => ({
        events: [{ id: '123' }],
      }),
    });

    const result = await client.fetch('eng.1', { limit: '10' });
    expect(result).toEqual({ events: [{ id: '123' }] });

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
        responseData: { events: [{ id: '456' }] },
      },
    ]);

    const result = await client.fetch('eng.1', { limit: '10' });
    expect(result).toEqual({ events: [{ id: '456' }] });

    // Should NOT call global fetch
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('should handle API fetch failure', async () => {
    mockFetch.mockResolvedValue({
      status: 500,
      ok: false,
      statusText: 'Internal Server Error',
    });

    await expect(client.fetch('eng.1', {}, 0)).rejects.toThrow('ESPN API returned non-OK status: 500 Internal Server Error');
  });
});
