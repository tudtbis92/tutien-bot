/**
 * Embed builder for breakthrough attempt outcomes.
 *
 * Four outcomes: success | fail | insufficient | max_realm
 * Each uses an appropriate semantic color from theme.ts (D-16/D-17 visual standards).
 *
 * - success:     COLORS.GOLD     — realm advancement is a golden moment
 * - fail:        COLORS.DANGER   — loss of tu vi is a dangerous setback
 * - insufficient: COLORS.PRIMARY — informational, not an error
 * - max_realm:   COLORS.GOLD     — reaching the peak is still a golden achievement
 */
import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
import { REALM_CONFIG } from '../../constants/realms.js';
import { formatBalance } from '../../utils/format.js';
import { EMOJI } from '../../assets/emojis.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type BreakthroughOutcome = 'success' | 'fail' | 'insufficient' | 'max_realm';

export interface BreakthroughEmbedData {
  outcome: BreakthroughOutcome;
  /** Current realm_id before the attempt */
  currentRealmId: number;
  /** New realm_id after success (success outcome only) */
  newRealmId?: number;
  /** Tu vi lost on failure (fail outcome only) */
  penaltyAmount?: bigint;
  /** Absolute tu vi remaining after penalty (fail outcome only) — converted to relative for display */
  postTuVi?: bigint;
  /** Absolute tu vi threshold required (insufficient outcome only) — not used for display; display derives from REALM_CONFIG */
  required?: number;
  /** Absolute current tu vi (insufficient outcome only) — converted to relative for display */
  current?: bigint;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build an embed for a breakthrough attempt outcome.
 *
 * @param data - Typed outcome data
 * @param t    - Bound translation function (use getT(locale))
 * @param shardId - Optional shard ID for footer
 */
export function buildBreakthroughEmbed(
  data: BreakthroughEmbedData,
  t: TFunction,
  shardId?: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setFooter(embedFooter(shardId))
    .setTimestamp();

  switch (data.outcome) {
    case 'success': {
      const newRealmId = data.newRealmId ?? data.currentRealmId + 1;
      const newRealmTier = REALM_CONFIG[newRealmId];
      const newRealmName = newRealmTier ? t(newRealmTier.i18nKey) : String(newRealmId);
      return embed
        .setColor(COLORS.GOLD)
        .setTitle(`${EMOJI.BREAKTHROUGH} ${t('game:breakthrough.success', { realm: newRealmName })}`)
        .setDescription(newRealmName);
    }

    case 'fail': {
      const penaltyStr = formatBalance(data.penaltyAmount ?? 0n);
      // Convert absolute postTuVi → relative (above entry threshold), matching profile display
      const tier = REALM_CONFIG[data.currentRealmId];
      const entryThreshold = BigInt(tier?.entryThreshold ?? 0);
      const tuViRequired = tier?.tuViRequired ?? 0;
      const absolutePost = data.postTuVi ?? 0n;
      const relativePost = absolutePost > entryThreshold ? absolutePost - entryThreshold : 0n;
      return embed
        .setColor(COLORS.DANGER)
        .setTitle(`${EMOJI.ERROR} ${t('game:breakthrough.fail', { penalty: penaltyStr })}`)
        .setDescription(`${t('game:profile.tu_vi')}: ${formatBalance(relativePost)} / ${formatBalance(BigInt(tuViRequired))}`);
    }

    case 'insufficient': {
      // Convert absolute current tuVi → relative (above entry threshold), matching profile display
      const tier = REALM_CONFIG[data.currentRealmId];
      const entryThreshold = BigInt(tier?.entryThreshold ?? 0);
      const tuViRequired = tier?.tuViRequired ?? 0;
      const absoluteCurrent = data.current ?? 0n;
      const relativeCurrent = absoluteCurrent > entryThreshold ? absoluteCurrent - entryThreshold : 0n;
      const requiredStr = formatBalance(BigInt(tuViRequired));
      return embed
        .setColor(COLORS.PRIMARY)
        .setTitle(`${EMOJI.WARNING} ${t('game:breakthrough.insufficient', { required: requiredStr })}`)
        .setDescription(`${t('game:profile.tu_vi')}: ${formatBalance(relativeCurrent)} / ${requiredStr}`);
    }

    case 'max_realm': {
      return embed
        .setColor(COLORS.GOLD)
        .setTitle(`${EMOJI.REALM} ${t('game:breakthrough.maxRealm')}`)
        .setDescription(t('game:breakthrough.maxRealm'));
    }
  }
}
