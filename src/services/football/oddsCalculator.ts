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

  if (!event || !event.competitions || !event.competitions[0]) return fillDefaultOdds(result);
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

  return fillDefaultOdds(result);
}

/**
 * Automatically populate missing betting markets (Over/Under and Spreads) with realistic defaults.
 */
/* eslint-disable i18next/no-literal-string */
export function fillDefaultOdds(oddsInfo: {
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
}) {
  // 1. Fill Over/Under if missing
  if (!oddsInfo.overUnderLine) {
    oddsInfo.overUnderLine = '2.5';
    oddsInfo.overOdds = '1.90';
    oddsInfo.underOdds = '1.90';
  }

  // 2. Fill Point Spread if missing
  if (!oddsInfo.homeSpreadLine) {
    oddsInfo.homeSpreadOdds = '1.90';
    oddsInfo.awaySpreadOdds = '1.90';

    const homeVal = oddsInfo.home ? parseFloat(oddsInfo.home) : 2.0;
    const awayVal = oddsInfo.away ? parseFloat(oddsInfo.away) : 2.0;

    if (homeVal < awayVal) {
      // Home is favored
      if (homeVal >= 1.8) {
        oddsInfo.homeSpreadLine = '0';
        oddsInfo.awaySpreadLine = '0';
      } else if (homeVal >= 1.5) {
        oddsInfo.homeSpreadLine = '-0.5';
        oddsInfo.awaySpreadLine = '+0.5';
      } else if (homeVal >= 1.3) {
        oddsInfo.homeSpreadLine = '-1.0';
        oddsInfo.awaySpreadLine = '+1.0';
      } else if (homeVal >= 1.15) {
        oddsInfo.homeSpreadLine = '-1.5';
        oddsInfo.awaySpreadLine = '+1.5';
      } else {
        oddsInfo.homeSpreadLine = '-2.0';
        oddsInfo.awaySpreadLine = '+2.0';
      }
    } else {
      // Away is favored (or equal)
      if (awayVal >= 1.8) {
        oddsInfo.homeSpreadLine = '0';
        oddsInfo.awaySpreadLine = '0';
      } else if (awayVal >= 1.5) {
        oddsInfo.homeSpreadLine = '+0.5';
        oddsInfo.awaySpreadLine = '-0.5';
      } else if (awayVal >= 1.3) {
        oddsInfo.homeSpreadLine = '+1.0';
        oddsInfo.awaySpreadLine = '-1.0';
      } else if (awayVal >= 1.15) {
        oddsInfo.homeSpreadLine = '+1.5';
        oddsInfo.awaySpreadLine = '-1.5';
      } else {
        oddsInfo.homeSpreadLine = '+2.0';
        oddsInfo.awaySpreadLine = '-2.0';
      }
    }
  }

  return oddsInfo;
}
/* eslint-enable i18next/no-literal-string */

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
