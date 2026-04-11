/**
 * Shared UI theme for all Discord embeds.
 * ALL embed colors must come from this file.
 * Never hardcode hex values in embed builder functions.
 *
 * Color naming: describe the semantic purpose, not the hue.
 * (e.g., DANGER not RED — if we ever rebrand to blue error embeds, only this file changes)
 */
export const COLORS = {
  PRIMARY: 0x6B46C1,      // Purple — main brand color, used for profile/info embeds
  SUCCESS: 0x10B981,      // Emerald — positive actions, rewards, level up
  DANGER: 0xEF4444,       // Red — errors, failed actions, warnings
  WARNING: 0xF59E0B,      // Amber — caution, cooldowns, partial failures
  NEUTRAL: 0x6B7280,      // Gray — system messages, help text
  GOLD: 0xF59E0B,         // Gold — currency, leaderboards, rare items
  SEASON: 0x8B5CF6,       // Violet — season-specific embeds
} as const;

export type ColorKey = keyof typeof COLORS;

/**
 * Standard embed footer format.
 * @param shardId - Current shard ID for debugging
 */
export function embedFooter(shardId?: number): { text: string } {
  const shard = shardId !== undefined ? ` • Shard ${shardId}` : '';
  return { text: `Tu Tiên Bot${shard}` };
}
