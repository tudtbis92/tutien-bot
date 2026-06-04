import { ChatInputCommandInteraction } from 'discord.js';

const AUTHORIZED_GUILD = '1465226886018760839';
const AUTHORIZED_USER = '898126643598606367';

export function isAuthorizedAdmin(interaction: ChatInputCommandInteraction): boolean {
  return interaction.guildId === AUTHORIZED_GUILD || interaction.user.id === AUTHORIZED_USER;
}
