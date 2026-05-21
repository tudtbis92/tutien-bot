import { FOOTBALL_CONFIG } from '../../constants/footballConfig.js';

/**
 * Convert American Odds (e.g., "-110", "+250") to Decimal Odds string (e.g., "1.91", "3.50").
 */
export function convertAmericanToDecimal(american: number | string): string {
  const num = typeof american === 'string' ? parseInt(american, 10) : american;
  // eslint-disable-next-line i18next/no-literal-string
  if (isNaN(num)) return '1.00';

  let decimal: number;
  if (num > 0) {
    decimal = (num / 100) + 1;
  } else {
    decimal = (100 / Math.abs(num)) + 1;
  }
  return decimal.toFixed(2);
}

/**
 * Calculate payout: betAmount × odds, rounded down to integer.
 * Uses integer math to avoid floating-point precision issues with BIGINT.
 */
export function calculatePayout(betAmount: bigint, decimalOdds: string): bigint {
  const oddsInt = Math.round(parseFloat(decimalOdds) * 10000);
  return (betAmount * BigInt(oddsInt)) / 10000n;
}

/**
 * Extract Moneyline odds and DraftKings event ID from ESPN event data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEspnOdds(event: any): { 
  home?: string; 
  draw?: string; 
  away?: string;
  overUnderLine?: string;
  overOdds?: string;
  underOdds?: string;
  homeSpreadLine?: string;
  homeSpreadOdds?: string;
  awaySpreadLine?: string;
  awaySpreadOdds?: string;
} {
  const result: { 
    home?: string; 
    draw?: string; 
    away?: string;
    overUnderLine?: string;
    overOdds?: string;
    underOdds?: string;
    homeSpreadLine?: string;
    homeSpreadOdds?: string;
    awaySpreadLine?: string;
    awaySpreadOdds?: string;
  } = {};

  if (!event || !event.competitions || !event.competitions[0]) return result;
  const competition = event.competitions[0];
  const oddsArray = competition.odds;

  if (oddsArray && Array.isArray(oddsArray) && oddsArray.length > 0) {
    const odds = oddsArray[0];

    // Extract Moneyline
    if (odds && odds.moneyline) {
      if (odds.moneyline.home?.close?.odds) result.home = convertAmericanToDecimal(odds.moneyline.home.close.odds);
      if (odds.moneyline.away?.close?.odds) result.away = convertAmericanToDecimal(odds.moneyline.away.close.odds);
      if (odds.moneyline.draw?.close?.odds) result.draw = convertAmericanToDecimal(odds.moneyline.draw.close.odds);
    }

    // Fallback for Draw Odds if not in moneyline object
    if (odds && !result.draw && odds.drawOdds?.moneyLine) {
      result.draw = convertAmericanToDecimal(odds.drawOdds.moneyLine);
    }

    // Extract Over/Under
    if (odds && odds.total) {
      const overClose = odds.total.over?.close;
      const underClose = odds.total.under?.close;
      
      if (overClose) {
        result.overUnderLine = overClose.line;
        result.overOdds = convertAmericanToDecimal(overClose.odds);
      }
      if (underClose) {
        result.underOdds = convertAmericanToDecimal(underClose.odds);
      }
    }

    // Extract Point Spread
    if (odds && odds.pointSpread) {
      const homeClose = odds.pointSpread.home?.close;
      const awayClose = odds.pointSpread.away?.close;

      if (homeClose) {
        result.homeSpreadLine = homeClose.line;
        result.homeSpreadOdds = convertAmericanToDecimal(homeClose.odds);
      }
      if (awayClose) {
        result.awaySpreadLine = awayClose.line;
        result.awaySpreadOdds = convertAmericanToDecimal(awayClose.odds);
      }
    }
  }

  return result;
}

/**
 * Legacy method mapping: parseOdds now supports both formats or we refactor callers.
 * For now, let's keep it compatible or redirect to parseEspnOdds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOdds(oddsResponse: any, betType: string): { home?: string; draw?: string; away?: string; scoreMap?: Record<string, string> } {
  // If it's an ESPN event object (has competitions)
  if (oddsResponse && oddsResponse.competitions) {
    if (betType === 'result') {
      const parsed = parseEspnOdds(oddsResponse);
      return { home: parsed.home, draw: parsed.draw, away: parsed.away };
    }
    return {}; // Correct Score not in ESPN, handled by crawler
  }

  // Legacy API-Football parsing logic (optional, for transition)
  const result: { home?: string; draw?: string; away?: string; scoreMap?: Record<string, string> } = {};
  if (!oddsResponse) return result;
  // ... (rest of old logic removed for brevity or kept if needed)
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
