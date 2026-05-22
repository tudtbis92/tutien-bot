import { describe, it, expect } from 'vitest';
import {
  calculatePayout,
  validateBetAmount,
  convertAmericanToDecimal,
  parseEspnOdds,
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

describe('convertAmericanToDecimal', () => {
  it('should convert positive odds correctly', () => {
    // +295 -> (295/100) + 1 = 3.95
    expect(convertAmericanToDecimal(295)).toBe('3.95');
    expect(convertAmericanToDecimal('+295')).toBe('3.95');
  });

  it('should convert negative odds correctly', () => {
    // -105 -> (100/105) + 1 = 1.9523... -> 1.95
    expect(convertAmericanToDecimal(-105)).toBe('1.95');
    expect(convertAmericanToDecimal('-105')).toBe('1.95');
  });

  it('should handle even odds', () => {
    expect(convertAmericanToDecimal(100)).toBe('2.00');
    expect(convertAmericanToDecimal(-100)).toBe('2.00');
  });
});

describe('parseEspnOdds', () => {
  const mockEspnEvent = {
    id: '740966',
    competitions: [
      {
        odds: [
          {
            moneyline: {
              home: { close: { odds: '-105' } },
              away: { close: { odds: '+240' } },
              draw: { close: { odds: '+295' } },
            },
            link: {
              href: 'https://sportsbook.draftkings.com/gateway?preurl=https%3A%2F%2Fsportsbook.draftkings.com%2Fevent%2F34167921',
            },
          },
        ],
      },
    ],
  };

  it('should parse ESPN moneyline odds correctly and fill default secondary markets', () => {
    const result = parseEspnOdds(mockEspnEvent);
    expect(result.home).toBe('1.95');
    expect(result.away).toBe('3.40');
    expect(result.draw).toBe('3.95');

    // Default Over/Under filled by fillDefaultOdds
    expect(result.overUnderLine).toBe('2.5');
    expect(result.overOdds).toBe('1.90');
    expect(result.underOdds).toBe('1.90');

    // Default Spread filled by fillDefaultOdds
    expect(result.homeSpreadLine).toBe('0');
    expect(result.homeSpreadOdds).toBe('1.90');
    expect(result.awaySpreadLine).toBe('0');
    expect(result.awaySpreadOdds).toBe('1.90');
  });

  it('should handle missing odds gracefully', () => {
    const result = parseEspnOdds({});
    expect(result.home).toBeUndefined();
    expect(result.away).toBeUndefined();
    expect(result.draw).toBeUndefined();
    expect(result.overUnderLine).toBe('2.5');
    expect(result.homeSpreadLine).toBe('0');
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
