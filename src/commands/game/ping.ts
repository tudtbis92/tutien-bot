import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';
import { resolveLocale, getT } from '../../i18n/index.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and status');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = resolveLocale(null, interaction.locale);
  const t = getT(locale);

  const latency = interaction.client.ws.ping;
  const shard = interaction.client.shard?.ids[0] ?? 'N/A';
  const embed = buildSuccessEmbed(
    t('system.botName'),
    t('system.pingDescription', { latency, shard }),
    interaction.client.shard?.ids[0],
  );

  await interaction.reply({ embeds: [embed] });
}
