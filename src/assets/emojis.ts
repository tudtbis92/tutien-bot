/**
 * Typed emoji registry. ALL custom Discord emoji strings must be declared here.
 * Never hardcode emoji IDs in command/event files.
 * Usage: import { EMOJI } from '@/assets/emojis.js'; then use EMOJI.SPIRIT_STONE
 *
 * Phase 1: placeholder values — replace with real emoji IDs after creating
 * custom emojis in the Discord Developer Portal.
 * Format: '<:name:id>' for custom server emojis, or Unicode for standard emojis.
 */
export const EMOJI = {
  // Currency
  SPIRIT_STONE: '💎',        // TODO: Replace with custom <:linh_thach:ID>
  CULTIVATION: '✨',          // TODO: Replace with custom <:tu_vi:ID>

  // Status
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',

  // Realms (Phase 2 will expand this)
  REALM: '⛰️',
  BREAKTHROUGH: '🌟',

  // UI
  SEPARATOR: '─',
} as const;

export type EmojiKey = keyof typeof EMOJI;
