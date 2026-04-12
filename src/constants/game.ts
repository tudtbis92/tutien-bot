/**
 * Game configuration constants for TuTien Bot.
 * All values are intentionally hidden from players per D-04 (hidden mechanics philosophy).
 * Never display raw rate values in UI — only show outcomes and character names.
 *
 * Source: CONTEXT.md D-01..D-04, RESEARCH.md "Agent-Designed Constants"
 */
export const GAME_CONFIG = {
  // ── Tu Vi Accumulation Rates (D-01) ──
  // Base rates before spiritual root multiplier is applied
  MESSAGE_TV: 10,         // Per valid message (≥10 chars, passes quality gate)
  VOICE_TV_PER_MIN: 5,    // Per active voice minute (up to VOICE_MAX_MINUTES)
  REACTION_TV: 2,         // Per valid reaction
  DAILY_CAP: 10_000,      // Hard daily ceiling, resets at midnight UTC
  VOICE_MAX_MINUTES: 60,  // Max minutes credited per voice session

  // ── Cooldowns ──
  MESSAGE_COOLDOWN_MS: 60_000,   // 60 seconds between message tu vi awards per user/channel
  REACTION_COOLDOWN_MS: 60_000,  // 60 seconds between reaction tu vi awards per user/channel

  // ── Spiritual Root Multipliers (D-02) ──
  // Flat multiplier applied to ALL tu vi sources — hidden game mechanic
  // Kim (Metal) is rarest and strongest; Thổ (Earth) is balanced baseline
  SPIRITUAL_ROOT_MULTIPLIERS: {
    kim: 1.2,   // Metal — rarest (15% weight), highest multiplier
    hoa: 1.15,  // Fire
    moc: 1.1,   // Wood
    thuy: 1.05, // Water
    tho: 1.0,   // Earth — balanced root, no bonus (most common alongside moc/thuy)
  } as const,

  // ── Spiritual Root Assignment Weights (D-04, Pattern 4) ──
  // Used by weighted random selection at /start command
  // Lower weight = rarer; Kim and Thổ are rarest (15 each)
  SPIRITUAL_ROOT_WEIGHTS: {
    kim: 15,
    hoa: 20,
    moc: 25,
    thuy: 25,
    tho: 15,
  } as const,

  // ── Anti-Farming: Anomaly Detection (D-09) ──
  // After 10+ quality gate or daily cap violations per day → set anomaly_flag for admin review
  ANOMALY_THRESHOLD: 10,

  // ── Daily Streak Bonus Table (CORE-07, RESEARCH.md "Daily Streak Bonus") ──
  // Streak bonus added DIRECTLY to tu_vi — bypasses daily cap (it's a reward, not activity income)
  // Bonus awarded once per day on first successful tu vi accumulation
  STREAK_BONUSES: [
    { minDays: 1,  maxDays: 6,          bonus: 200   },
    { minDays: 7,  maxDays: 13,         bonus: 600   },
    { minDays: 14, maxDays: 20,         bonus: 1_200 },
    { minDays: 21, maxDays: 29,         bonus: 2_000 },
    { minDays: 30, maxDays: Infinity,   bonus: 3_000 },
  ] as const,
} as const;

export type GameConfig = typeof GAME_CONFIG;
