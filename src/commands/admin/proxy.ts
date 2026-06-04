/* eslint-disable i18next/no-literal-string */
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { db } from '../../db/client.js';
import { proxies } from '../../db/schema/farming.js';
import { users } from '../../db/schema/users.js';
import { isAuthorizedAdmin } from '../../utils/adminGuard.js';
import { ProxyService } from '../../services/farming/proxyService.js';
import { eq, inArray } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('proxy')
  .setDescription('Manage the proxy pool (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Adds a proxy to the pool')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('The proxy URL (e.g., http://user:pass@ip:port)')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('location')
          .setDescription('The location of the proxy')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('provider')
          .setDescription('The provider of the proxy')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Displays all proxies, their status, and usage count'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Sets a proxy status to dead and reassigns users')
      .addIntegerOption(option =>
        option.setName('id')
          .setDescription('The ID of the proxy to remove')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('Shows total capacity vs current usage'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAuthorizedAdmin(interaction)) {
    await interaction.reply({ content: 'Unauthorized. This command is restricted.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const url = interaction.options.getString('url', true);
    const location = interaction.options.getString('location', true);
    const provider = interaction.options.getString('provider', true);

    await db.insert(proxies).values({
      url,
      location,
      provider,
      status: 'active',
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await interaction.reply({ content: `Proxy added successfully from provider ${provider} at ${location}.`, ephemeral: true });
  } 
  else if (subcommand === 'list') {
    const allProxies = await db.query.proxies.findMany();
    
    if (allProxies.length === 0) {
      await interaction.reply({ content: 'No proxies found in the pool.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Proxy Pool')
      .setColor(0x0099FF);

    const description = allProxies.map(p => 
      `**ID ${p.id}**: ${p.status === 'active' ? '🟢' : '🔴'} Usage: ${p.usageCount}/3 | ${p.location} (${p.provider})`
    ).join('\n');

    embed.setDescription(description.length > 4096 ? description.substring(0, 4090) + '...' : description);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } 
  else if (subcommand === 'remove') {
    const id = interaction.options.getInteger('id', true);

    const proxy = await db.query.proxies.findFirst({
      where: eq(proxies.id, id)
    });

    if (!proxy) {
      await interaction.reply({ content: `Proxy ID ${id} not found.`, ephemeral: true });
      return;
    }

    // Set to dead
    await db.update(proxies)
      .set({ status: 'dead', updatedAt: new Date() })
      .where(eq(proxies.id, id));

    // Reassign accounts
    const affectedUserIds = await ProxyService.reassignAccountsFromProxy(id);

    const affectedDiscordIds: string[] = [];
    if (affectedUserIds.length > 0) {
      const affectedUsers = await db.query.users.findMany({
        where: inArray(users.id, affectedUserIds)
      });
      affectedDiscordIds.push(...affectedUsers.map(u => u.discordId));
    }

    // Send IPC signals
    if (process.send) {
      for (const discordId of affectedDiscordIds) {
        process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: discordId });
      }
    } else {
      logger.warn('ProxyCommand', 'process.send is undefined, cannot notify ShardingManager about proxy reassignments');
    }

    await interaction.reply({ content: `Proxy ID ${id} marked as dead. Reassigned ${affectedDiscordIds.length} affected user(s).`, ephemeral: true });
  } 
  else if (subcommand === 'stats') {
    const activeProxies = await db.query.proxies.findMany({
      where: eq(proxies.status, 'active')
    });

    const totalCapacity = activeProxies.length * 3;
    const currentUsage = activeProxies.reduce((sum, p) => sum + p.usageCount, 0);

    const embed = new EmbedBuilder()
      .setTitle('Proxy Capacity Stats')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Active Proxies', value: activeProxies.length.toString(), inline: true },
        { name: 'Total Capacity', value: totalCapacity.toString(), inline: true },
        { name: 'Current Usage', value: `${currentUsage} / ${totalCapacity}`, inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
