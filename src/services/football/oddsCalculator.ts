import { FOOTBALL_CONFIG } from '../../constants/footballConfig.js';

/**
 * Calculate payout: betAmount × odds, rounded down to integer.
 * Uses integer math to avoid floating-point precision issues with BIGINT.
 *
 * @param betAmount - Wagered linh thạch (BIGINT)
 * @param decimalOdds - Bookmaker odds as string (e.g., "2.50")
 * @returns Payout amount (BIGINT) — includes original stake
 */
export function calculatePayout(betAmount: bigint, decimalOdds: string): bigint {
  const oddsInt = Math.round(parseFloat(decimalOdds) * 10000);
  return (betAmount * BigInt(oddsInt)) / 10000n;
}

/**
 * Extract Home/Draw/Away odds strings or score mapping from oddsResponse.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOdds(oddsResponse: any, betType: string): { home?: string; draw?: string; away?: string; scoreMap?: Record<string, string> } {
  const result: { home?: string; draw?: string; away?: string; scoreMap?: Record<string, string> } = {};

  if (!oddsResponse) return result;

  let fixtureOdds = oddsResponse;
  if (oddsResponse.response && Array.isArray(oddsResponse.response)) {
    fixtureOdds = oddsResponse.response[0];
  } else if (Array.isArray(oddsResponse)) {
    fixtureOdds = oddsResponse[0];
  }

  if (!fixtureOdds || !fixtureOdds.bookmakers || !Array.isArray(fixtureOdds.bookmakers)) {
    return result;
  }

  const bookmakers = fixtureOdds.bookmakers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookmaker = bookmakers.find((b: any) => b.name?.toLowerCase() === 'bet365') || bookmakers[0];

  if (!bookmaker || !bookmaker.bets || !Array.isArray(bookmaker.bets)) {
    return result;
  }

  if (betType === 'result') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bet = bookmaker.bets.find((b: any) => b.id === 1 || b.name?.toLowerCase() === 'match winner');
    if (bet && bet.values && Array.isArray(bet.values)) {
      for (const val of bet.values) {
        const valStr = val.value?.toLowerCase();
        if (valStr === 'home') {
          result.home = val.odd;
        } else if (valStr === 'draw') {
          result.draw = val.odd;
        } else if (valStr === 'away') {
          result.away = val.odd;
        }
      }
    }
  } else if (betType === 'score') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bet = bookmaker.bets.find((b: any) => b.id === 8 || b.name?.toLowerCase() === 'correct score');
    if (bet && bet.values && Array.isArray(bet.values)) {
      const scoreMap: Record<string, string> = {};
      for (const val of bet.values) {
        if (val.value && val.odd) {
          const normScore = val.value.replace(/\s+/g, '').replace(':', '-');
          scoreMap[normScore] = val.odd;
        }
      }
      result.scoreMap = scoreMap;
    }
  }

  return result;
}

/**
 * Validate that the bet amount falls within MIN_BET and MAX_BET configuration limits.
 */
export function validateBetAmount(amount: bigint): { valid: boolean; error?: string } {
  if (amount < FOOTBALL_CONFIG.MIN_BET) {
    return {
      valid: false,
      error: `Bet amount is too low. Minimum bet is ${FOOTBALL_CONFIG.MIN_BET} Linh Thạch.`,
    };
  }
  if (amount > FOOTBALL_CONFIG.MAX_BET) {
    return {
      valid: false,
      error: `Bet amount is too high. Maximum bet is ${FOOTBALL_CONFIG.MAX_BET} Linh Thạch.`,
    };
  }
  return { valid: true };
}

/**
 * Parse Correct Score odds into Map of "homeGoals-awayGoals" → odds string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCorrectScoreOdds(oddsResponse: any): Map<string, string> {
  const result = new Map<string, string>();
  if (!oddsResponse) return result;

  let fixtureOdds = oddsResponse;
  if (oddsResponse.response && Array.isArray(oddsResponse.response)) {
    fixtureOdds = oddsResponse.response[0];
  } else if (Array.isArray(oddsResponse)) {
    fixtureOdds = oddsResponse[0];
  }

  if (!fixtureOdds || !fixtureOdds.bookmakers || !Array.isArray(fixtureOdds.bookmakers)) {
    return result;
  }

  const bookmakers = fixtureOdds.bookmakers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookmaker = bookmakers.find((b: any) => b.name?.toLowerCase() === 'bet365') || bookmakers[0];

  if (!bookmaker || !bookmaker.bets || !Array.isArray(bookmaker.bets)) {
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bet = bookmaker.bets.find((b: any) => b.id === 8 || b.name?.toLowerCase() === 'correct score');
  if (bet && bet.values && Array.isArray(bet.values)) {
    for (const val of bet.values) {
      if (val.value && val.odd) {
        const normScore = val.value.replace(/\s+/g, '').replace(':', '-');
        result.set(normScore, val.odd);
      }
    }
  }

  return result;
}
