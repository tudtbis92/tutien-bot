import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, EMOJI, embedFooter } from '../theme.js';
import { REALM_CONFIG } from '../../constants/realms.js';
import { GAME_CONFIG } from '../../constants/game.js';
import { formatBalance } from '../../utils/format.js';
import type { SpiritualRoot } from '../../db/schema/characters.js';

/**
 * Data required to render the character profile embed.
 * All fields come from the characters table row.
 */
export interface ProfileEmbedData {
  discordTag: string;
  avatarURL: string | null;
  spiritualRoot: SpiritualRoot;
  realmId: number;
  tuVi: bigint;
  dailyTuvi: number;
  streakDays: number;
  professionPoints: Record<string, number>;
}

/** Build a 10-block Unicode progress bar (▰▰▰▱▱▱▱▱▱▱ style) */
function buildProgressBar(current: number, max: number, blocks = 10): string {
  if (max <= 0) return EMOJI.PROGRESS.repeat(blocks);
  const filled = Math.min(blocks, Math.floor((current / max) * blocks));
  return EMOJI.PROGRESS.repeat(filled) + EMOJI.PROGRESS_EMPTY.repeat(blocks - filled);
}

/**
 * Build the character profile embed.
 * Shows realm name (from REALM_CONFIG i18nKey), spiritual root name only (no multiplier),
 * tu vi progress bar (relative to current tier's entry threshold), daily cap, and streak.
 *
 * @param data - Character display data
 * @param t - Bound i18next TFunction for the correct locale
 */
export function buildProfileEmbed(data: ProfileEmbedData, t: TFunction): EmbedBuilder {
  const realm = REALM_CONFIG[data.realmId];
  const realmName = t(realm!.i18nKey);
  const rootName = t(`game:spiritual_root.${data.spiritualRoot}`);

  // Progress within current tier: tuVi - entryThreshold / tuViRequired
  const entryThreshold = BigInt(realm!.entryThreshold);
  const tuViRequired = realm!.tuViRequired; // Infinity at max tier
  const progressAbsolute = data.tuVi > entryThreshold ? data.tuVi - entryThreshold : 0n;

  let tuViStr: string;
  let progressBar: string;
  if (!isFinite(tuViRequired)) {
    // Max tier — no advancement possible
    tuViStr = `${formatBalance(data.tuVi)}`;
    progressBar = EMOJI.PROGRESS.repeat(10);
  } else {
    const progressNum = Number(progressAbsolute);
    progressBar = buildProgressBar(progressNum, tuViRequired);
    tuViStr = `${progressBar}\n${formatBalance(progressAbsolute)} / ${formatBalance(BigInt(tuViRequired))}`;
  }

  const dailyProgress = `${data.dailyTuvi.toLocaleString()} / ${GAME_CONFIG.DAILY_CAP.toLocaleString()}`;

  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setAuthor({ name: data.discordTag, iconURL: data.avatarURL ?? undefined })
    .setTitle(t('game:profile.title'))
    .addFields(
      { name: `${EMOJI.REALM} ${t('game:profile.realm')}`, value: realmName, inline: true },
      { name: `${EMOJI.ROOT} ${t('game:profile.spiritual_root')}`, value: rootName, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: `${EMOJI.TU_VI} ${t('game:profile.tu_vi')}`, value: tuViStr, inline: false },
      { name: `${EMOJI.QUOTA} ${t('game:profile.daily_cap')}`, value: dailyProgress, inline: true },
      { name: `${EMOJI.STREAK} ${t('game:profile.streak')}`, value: `${data.streakDays}`, inline: true },
    )
    .setFooter(embedFooter())
    .setTimestamp();
}
