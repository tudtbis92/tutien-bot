import { describe, it, expect } from 'vitest';
import {
  calculatePayout,
  parseOdds,
  validateBetAmount,
  extractCorrectScoreOdds,
} from '../oddsCalculator.js';
import { FOOTBALL_CONFIG } from '../../../constants/footballConfig.js';

describe('calculatePayout', () => {
  it('should calculate payout correctly with simple odds', () => {
    // 1000 * 1.50 = 1500
    expect(calculatePayout(1000n, '1.50')).toBe(1500n);
  });

  it('should calculate payout correctly and truncate/round down', () => {
    // 333 * 3.33 = 1108.89 -> 1108n
    expect(calculatePayout(333n, '3.33')).toBe(1108n);
  });

  it('should handle large balances safely without float overflow', () => {
    const hugeBet = 10_000_000_000_000n;
    expect(calculatePayout(hugeBet, '2.50')).toBe(25_000_000_000_000n);
  });
});

describe('parseOdds', () => {
  const mockOddsResponse = {
    response: [
      {
        bookmakers: [
          {
            name: 'bet365',
            bets: [
              {
                id: 1,
                name: 'Match Winner',
                values: [
                  { value: 'Home', odd: '1.50' },
                  { value: 'Draw', odd: '4.00' },
                  { value: 'Away', odd: '6.50' },
                ],
              },
              {
                id: 8,
                name: 'Correct Score',
                values: [
                  { value: '1:0', odd: '7.50' },
                  { value: '2 - 1', odd: '9.00' },
                  { value: '0:0', odd: '12.00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('should parse match winner odds correctly', () => {
    const result = parseOdds(mockOddsResponse, 'result');
    expect(result.home).toBe('1.50');
    expect(result.draw).toBe('4.00');
    expect(result.away).toBe('6.50');
  });

  it('should parse correct score odds correctly', () => {
    const result = parseOdds(mockOddsResponse, 'score');
    expect(result.scoreMap).toBeDefined();
    expect(result.scoreMap?.['1-0']).toBe('7.50');
    expect(result.scoreMap?.['2-1']).toBe('9.00');
    expect(result.scoreMap?.['0-0']).toBe('12.00');
  });

  it('should return empty result for missing bookmakers', () => {
    const result = parseOdds({}, 'result');
    expect(result.home).toBeUndefined();
  });
});

describe('validateBetAmount', () => {
  it('should reject wagers below minimum', () => {
    const belowMin = FOOTBALL_CONFIG.MIN_BET - 1n;
    const result = validateBetAmount(belowMin);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too low');
  });

  it('should reject wagers above maximum', () => {
    const aboveMax = FOOTBALL_CONFIG.MAX_BET + 1n;
    const result = validateBetAmount(aboveMax);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too high');
  });

  it('should accept wagers within range', () => {
    const validAmount = FOOTBALL_CONFIG.MIN_BET + 50n;
    const result = validateBetAmount(validAmount);
    expect(result.valid).toBe(true);
  });
});

describe('extractCorrectScoreOdds', () => {
  const mockOddsResponse = {
    response: [
      {
        bookmakers: [
          {
            name: 'bet365',
            bets: [
              {
                id: 8,
                name: 'Correct Score',
                values: [
                  { value: '1:0', odd: '7.50' },
                  { value: '2 - 1', odd: '9.00' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('should extract correct score values into a map with normalized keys', () => {
    const map = extractCorrectScoreOdds(mockOddsResponse);
    expect(map.get('1-0')).toBe('7.50');
    expect(map.get('2-1')).toBe('9.00');
    expect(map.size).toBe(2);
  });

  it('should return empty map for missing correct score bets', () => {
    const map = extractCorrectScoreOdds({});
    expect(map.size).toBe(0);
  });
});
