import { EmbedBuilder } from 'discord.js';
import type { TFunction } from 'i18next';
import { COLORS, embedFooter } from '../theme.js';
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

/**
 * Build the character profile embed.
 * Shows realm name (from REALM_CONFIG i18nKey), spiritual root name only (no multiplier),
 * tu vi total, daily cap progress, and streak days.
 *
 * @param data - Character display data
 * @param t - Bound i18next TFunction for the correct locale
 */
export function buildProfileEmbed(data: ProfileEmbedData, t: TFunction): EmbedBuilder {
  const realm = REALM_CONFIG[data.realmId];
  // Realm name from i18n key, e.g. 'game:realms.luyen_khi.tang_1' → 'Luyện Khí Tầng Một'
  const realmName = t(realm!.i18nKey);
  // Spiritual root name only — multiplier numbers intentionally hidden per D-04
  const rootName = t(`game:spiritual_root.${data.spiritualRoot}`);
  const tuViStr = formatBalance(data.tuVi);
  const dailyProgress = `${data.dailyTuvi.toLocaleString()} / ${GAME_CONFIG.DAILY_CAP.toLocaleString()}`;

  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setAuthor({ name: data.discordTag, iconURL: data.avatarURL ?? undefined })
    .setTitle(t('game:profile.title'))
    .addFields(
      { name: t('game:profile.realm'), value: realmName, inline: true },
      { name: t('game:profile.spiritual_root'), value: rootName, inline: true },
      { name: '\u200b', value: '\u200b', inline: true }, // empty spacer for 3-column layout
      { name: t('game:profile.tu_vi'), value: tuViStr, inline: true },
      { name: t('game:profile.daily_cap'), value: dailyProgress, inline: true },
      { name: t('game:profile.streak'), value: `${data.streakDays} 🔥`, inline: true },
    )
    .setFooter(embedFooter())
    .setTimestamp();
}
