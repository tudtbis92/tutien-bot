/* eslint-disable i18next/no-literal-string */
import { Client, ChannelType, PermissionFlagsBits } from 'discord.js';
import { config } from '../../config.js';

/**
 * Extracts the user ID from a Discord token.
 * Discord tokens follow the format: base64(userId).randomString.randomString
 * @param token The Discord user token
 * @returns The user ID if valid, null otherwise
 */
export function getUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    
    const decoded = Buffer.from(parts[0], 'base64').toString('utf8');
    
    // Basic validation: user ID should be numeric
    if (/^\d+$/.test(decoded)) {
      return decoded;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a private farming channel for the user, traversing shards if necessary.
 * @param client The discord.js client
 * @param userId The user ID to create the channel for
 * @returns The created channel ID or null if failed
 */
export async function createFarmingChannel(client: Client, userId: string): Promise<string | null> {
  const context = { 
    authServerId: config.AUTH_SERVER_ID, 
    categoryId: config.FARMING_CATEGORY_ID, 
    userId 
  };

  if (client.shard) {
    const results = await client.shard.broadcastEval(async (c, { authServerId, categoryId, userId }) => {
      const guild = c.guilds.cache.get(authServerId);
      if (!guild) return null;
      if (guild.channels.cache.size >= 500) return null;
      
      const channelName = `farm-${userId}`;
      const existing = guild.channels.cache.find(ch => ch.name === channelName);
      if (existing) return existing.id;
      
      try {
        const channel = await guild.channels.create({
          name: channelName,
          type: 0, // ChannelType.GuildText
          parent: categoryId,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: ['1024'] }, // ViewChannel
            { id: userId, allow: ['1024', '2048', '65536'] } // View, Send, ReadHistory
          ]
        });
        return channel.id;
      } catch {
        return null;
      }
    }, { context });
    
    return results.find(id => id !== null) || null;
  } else {
    // Non-sharded fallback
    const guild = client.guilds.cache.get(config.AUTH_SERVER_ID);
    if (!guild) return null;
    if (guild.channels.cache.size >= 500) return null;
    
    const channelName = `farm-${userId}`;
    const existing = guild.channels.cache.find(ch => ch.name === channelName);
    if (existing) return existing.id;
    
    try {
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.FARMING_CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });
      return channel.id;
    } catch {
      return null;
    }
  }
}

/**
 * Deletes a farming channel by ID.
 * @param client The discord.js client
 * @param channelId The channel ID to delete
 * @returns True if deleted successfully, false otherwise
 */
export async function deleteFarmingChannel(client: Client, channelId: string): Promise<boolean> {
  if (client.shard) {
    const results = await client.shard.broadcastEval(async (c, { authServerId, channelId }) => {
      const guild = c.guilds.cache.get(authServerId);
      if (!guild) return false;
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await channel.delete().catch(() => null);
        return true;
      }
      return false;
    }, { context: { authServerId: config.AUTH_SERVER_ID, channelId } });
    
    return results.some(res => res === true);
  } else {
    const guild = client.guilds.cache.get(config.AUTH_SERVER_ID);
    if (!guild) return false;
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      await channel.delete().catch(() => null);
      return true;
    }
    return false;
  }
}
