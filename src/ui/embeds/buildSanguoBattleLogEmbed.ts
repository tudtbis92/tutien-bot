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
 * ≤ ~2,000 chars < 4,096). Colors: SEASON for encounters, NEUTRAL for spar
 * (D-17), GOLD for the 3v1 boss legion log (Phase 11, D-24/D-25 — GOLD is the
 * reserved boss accent). Every embed carries embedFooter(shardId) +
 * setTimestamp().
 *
 * Phase 11 (D-29/D-31) skill-aware turn lines: when skill context is supplied,
 * a turn renders the MP-economy lines — `skills.battle_mp_gain` (normal-attack
 * MP gain), `skills.battle_special` (special attack), `skills.no_mp`
 * (insufficient-MP fallback) — and the caller-supplied support-effect lines
 * render via `skills.battle_support`. All skill/MP values come RESOLVED from
 * the caller (the embed is pure — it never reads the DB). D-12 hidden
 * mechanics: no raw IV/rarity/weight numbers, no formula details.
 */
export interface SanguoBattleLogEmbedData {
  /** Player (active companion) per-locale display name (D-07). */
  playerName: string;
  /** Enemy per-locale display name (wild hero or boss zone name). */
  enemyName: string;
  /** Pre-rendered hero emoji markup — not rendered in the log itself. */
  enemyEmoji?: string;
  /** The engine's turn log — attacker/defender are heroId strings. */
  roundLogs: TurnLog[];
  winner: 'player' | 'enemy';
  rounds: number;
  playerHpAfter: number;
  enemyHpAfter: number;
  /** D-17: spar renders NEUTRAL + the no-stakes hint, never a capture CTA. */
  spar: boolean;
  /** Phase 11 (D-25): the forced 3v1 boss legion log — GOLD + 3v1 title. */
  legion?: boolean;
  /** Player heroId string — maps turn-log heroIds to display names. */
  playerHeroId?: string;
  /** Enemy heroId string ('boss:{zone}' for bosses) — display-name map. */
  enemyHeroId?: string;
  /** Skill-aware turn context (D-29/D-31) — provided by the legion/handler
   *  resolution. Names/costs/mp gains are per-attacker heroId. */
  skills?: TurnSkillsContext;
  /** Phase 11 (D-18): pre-resolved support-effect lines (skills.battle_support)
   *  that fired this battle — rendered between the turns and the resolution. */
  supportLines?: string[];
  shardId?: number;
}

/** Skill-aware turn resolution context, keyed by attacker heroId. */
export interface TurnSkillsContext {
  /** attacker heroId → the special skill's display name. */
  names?: Record<string, string>;
  /** attacker heroId → the special skill's MP cost (incl. the no_mp line). */
  costs?: Record<string, number>;
  /** attacker heroId → the normal attack's MP gain (battle_mp_gain line). */
  mpGains?: Record<string, number>;
  /** attacker heroId → the special skill's emoji markup (battle_special). */
  emojis?: Record<string, string>;
}

/** D-07 budget: ≤ 20 turn lines in the description. */
export const MAX_TURN_LINES = 20;

/**
 * One turn line. `names` maps heroId → per-locale display name. When skill
 * context (TurnSkillsContext) is supplied, the MP-economy turn variants render:
 *  - `mpFallback` → skills.no_mp (intended special → normal fallback, D-29)
 *  - `action === 'special'` → skills.battle_special (name + cost + dmg)
 *  - normal attack → the base turn/crit line, appended with skills.battle_mp_gain
 *    when the attacker's mp gain is known.
 * Without skill context the line is byte-identical to the Phase 10 rendering.
 */
export function formatTurnLine(
  log: TurnLog,
  t: TFunction,
  names?: Record<string, string>,
  skills?: TurnSkillsContext,
): string {
  const attacker = names?.[log.attacker] ?? log.attacker;
  const defender = names?.[log.defender] ?? log.defender;

  if (skills && log.mpFallback) {
    const cost = skills.costs?.[log.attacker] ?? 0;
    return t('sanguo:skills.no_mp', { hero: attacker, cost });
  }
  if (skills && log.action === 'special') {
    const skill = skills.names?.[log.attacker] ?? '';
    const cost = skills.costs?.[log.attacker] ?? 0;
    const emoji = skills.emojis?.[log.attacker] ?? '';
    return t('sanguo:skills.battle_special', { skill_emoji: emoji, hero: attacker, skill, cost, dmg: log.dmg });
  }

  const key = log.crit ? 'sanguo:battle.turn_crit' : 'sanguo:battle.turn';
  let line = t(key, { n: log.round, attacker, defender, dmg: log.dmg });
  if (skills && log.action === 'normal' && skills.mpGains?.[log.attacker] != null) {
    line += '\n' + t('sanguo:skills.battle_mp_gain', { hero: attacker, mp: skills.mpGains[log.attacker]! });
  }
  return line;
}

export function buildSanguoBattleLogEmbed(
  data: SanguoBattleLogEmbedData,
  t: TFunction,
): EmbedBuilder {
  const names: Record<string, string> = {};
  if (data.playerHeroId) names[data.playerHeroId] = data.playerName;
  if (data.enemyHeroId) names[data.enemyHeroId] = data.enemyName;

  // D-07: the LAST ≤20 turns (the decisive closing rounds) — bounds the
  // description at ≤ ~2,000 chars, safely under the 4,096 limit (the 3v1
  // legion log adds MP/skill/support lines but stays within budget).
  const lines = data.roundLogs
    .slice(-MAX_TURN_LINES)
    .map((log) => formatTurnLine(log, t, names, data.skills));
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

  const supportBody = data.supportLines?.length ? data.supportLines.join('\n') : '';
  const body = [logBody, supportBody, resolution].filter(Boolean).join('\n');

  const color = data.legion ? COLORS.GOLD : data.spar ? COLORS.NEUTRAL : COLORS.SEASON;
  const title = data.legion
    ? t('sanguo:battle.legion_log_title', { player: data.playerName, enemy: data.enemyName })
    : t('sanguo:battle.log_title', { player: data.playerName, enemy: data.enemyName });

  return new EmbedBuilder()
    // theme.ts COLORS only — never hardcode hex (UI-SPEC color contract).
    .setColor(color)
    .setTitle(title)
    .setDescription(body)
    .setFooter(embedFooter(data.shardId))
    .setTimestamp();
}
