import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import type { TurnLog } from '../../services/sanguo/battleEngine.js';

/**
 * Battle log embed (D-07) — the FULL turn-by-turn battle log in ONE embed.
 *
 * Budgets (UI-SPEC): description-only (NEVER fields-per-round — 25-field cap),
 * at most MAX_TURN_LINES lines (the engine logs up to ROUND_CAP × 2 actions =
 * 40 entries; the LAST 20 decide the outcome and bound the description at
 * ~1,700 chars < 4,096). Colors: SEASON for encounters, NEUTRAL for spar
 * (D-17 — no stakes, no HP loss, no reward). Every embed carries
 * embedFooter(shardId) + setTimestamp().
 *
 * D-12 hidden-mechanics: the log renders turn lines only — no raw IV/rarity
 * numbers, no formula details, nothing but attacker → defender damage.
 */
export interface SanguoBattleLogEmbedData {
  /** Player (active companion) per-locale display name (D-07). */
  playerName: string;
  /** Enemy per-locale display name (wild hero or boss zone name). */
  enemyName: string;
  /** Pre-rendered hero emoji markup — not rendered in the log itself
   * (kept for interface symmetry with the encounter/capture embeds). */
  enemyEmoji?: string;
  /** The engine's turn log — attacker/defender are heroId strings. */
  roundLogs: TurnLog[];
  winner: 'player' | 'enemy';
  rounds: number;
  playerHpAfter: number;
  enemyHpAfter: number;
  /** D-17: spar renders NEUTRAL + the no-stakes hint, never a capture CTA. */
  spar: boolean;
  /** Player heroId string — maps turn-log heroIds to display names. */
  playerHeroId?: string;
  /** Enemy heroId string ('boss:{zone}' for bosses) — display-name map. */
  enemyHeroId?: string;
  shardId?: number;
}

/** D-07 budget: ≤ 20 turn lines in the description. */
export const MAX_TURN_LINES = 20;

/**
 * One turn line, ≤ ~80 chars. `names` maps heroId → per-locale display name;
 * when absent (or unknown ids) the raw heroId renders — defensive only, the
 * handlers always resolve display names.
 */
export function formatTurnLine(
  log: TurnLog,
  t: TFunction,
  names?: Record<string, string>,
): string {
  const attacker = names?.[log.attacker] ?? log.attacker;
  const defender = names?.[log.defender] ?? log.defender;
  const key = log.crit ? 'sanguo:battle.turn_crit' : 'sanguo:battle.turn';
  return t(key, { n: log.round, attacker, defender, dmg: log.dmg });
}

export function buildSanguoBattleLogEmbed(
  data: SanguoBattleLogEmbedData,
  t: TFunction,
): EmbedBuilder {
  const names: Record<string, string> = {};
  if (data.playerHeroId) names[data.playerHeroId] = data.playerName;
  if (data.enemyHeroId) names[data.enemyHeroId] = data.enemyName;

  // D-07: the LAST ≤20 turns (the decisive closing rounds) — bounds the
  // description at ≤ ~1,700 chars, safely under the 4,096 limit.
  const lines = data.roundLogs
    .slice(-MAX_TURN_LINES)
    .map((log) => formatTurnLine(log, t, names));
  const logBody = lines.join('\n');

  let resolution: string;
  if (data.winner === 'player') {
    resolution = t('sanguo:battle.win');
    if (data.spar) {
      resolution += '\n' + t('sanguo:battle.spar_hint');
    }
  } else {
    resolution = t('sanguo:battle.loss', { enemy: data.enemyName });
  }
  // IN-02: the rounds count is rendered (was computed but never shown).
  resolution += '\n' + t('sanguo:battle.rounds_line', { n: data.rounds });

  return new EmbedBuilder()
    // theme.ts COLORS only — never hardcode hex (UI-SPEC color contract).
    .setColor(data.spar ? COLORS.NEUTRAL : COLORS.SEASON) // D-17 spar = NEUTRAL
    .setTitle(t('sanguo:battle.log_title', { player: data.playerName, enemy: data.enemyName }))
    .setDescription([logBody, resolution].filter(Boolean).join('\n'))
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
