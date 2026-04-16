import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildProfileEmbed } from '../../ui/embeds/buildProfileEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

/* eslint-disable i18next/no-literal-string -- slash command descriptions are static Discord API strings, not runtime i18n */
export const data = new SlashCommandBuilder()
  .setName('profile')
  .setNameLocalizations({ 'en-US': 'profile', 'zh-CN': 'profile' })
  .setDescription('Xem hồ sơ tu tiên của bạn')
  .setDescriptionLocalizations({
    'en-US': 'View your cultivation profile',
    'zh-CN': '查看你的修仙档案',
  });
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, user, shardId } = await fetchCommandContext(interaction);

  // User has no character — guide them to /start
  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  // Build and send profile embed
  const embed = buildProfileEmbed(
    {
      discordTag: interaction.user.tag,
      avatarURL: interaction.user.displayAvatarURL(),
      spiritualRoot: char.spiritualRoot,
      realmId: char.realmId,
      tuVi: char.tuVi,
      dailyTuvi: char.dailyTuvi,
      streakDays: char.streakDays,
      professionPoints: (char.professionPoints as Record<string, number>) ?? {},
      balance: user?.balance,
    },
    t,
  );

  await interaction.editReply({ embeds: [embed] });
}
