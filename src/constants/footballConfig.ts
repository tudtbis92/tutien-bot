/**
 * Configuration constants for the football prediction system in TuTien Bot.
 * All monetary values (MIN_BET, MAX_BET) are represented as BigInt (n suffix)
 * to prevent floating-point precision issues and align with the user balance schema.
 */
export const FOOTBALL_CONFIG = {
  // Min wager in Linh Thach per prediction bet
  MIN_BET: 100n,

  // Max wager in Linh Thach per prediction bet to prevent massive economy inflation/destabilization
  MAX_BET: 1000000n,

  // Interval in minutes for polling match status and scores from API-Football
  POLLING_INTERVAL_MINUTES: 15,

  // How many hours before kickoff predictions can be made or edited
  PREDICTION_OPEN_HOURS: 24,

  // Fetch upcoming match odds up to 7 days before kickoff
  ODDS_FETCH_DAYS_BEFORE_KICKOFF: 7,

  // Max number of fixture IDs that can be queried in a single batch from the API
  MAX_BATCH_FIXTURE_IDS: 20,
} as const;

export type FootballConfig = typeof FOOTBALL_CONFIG;
