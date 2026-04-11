import { Events, type Interaction } from 'discord.js';
import { logger } from '../utils/logger.js';
import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../i18n/index.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands?.get(interaction.commandName);

  if (!command) {
    logger.warn('InteractionCreate', `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('InteractionCreate', `Error in command ${interaction.commandName}`, err);

    // TODO (Phase 2): Fetch user locale from DB for stored preference
    const locale = resolveLocale(null, interaction.locale);
    const t = getT(locale);

    const errorEmbed = buildErrorEmbed(t('errors.internalError'));

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
