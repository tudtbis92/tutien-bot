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
 * @param ownerId The owner's Discord ID
 * @param selfBotId Optional Discord ID of the self-bot if different from owner
 * @returns The created channel ID or null if failed
 */
export async function createFarmingChannel(client: Client, ownerId: string, selfBotId?: string | null): Promise<string | null> {
  const context = { 
    authServerId: config.AUTH_SERVER_ID, 
    categoryId: config.FARMING_CATEGORY_ID, 
    ownerId,
    selfBotId
  };

  if (client.shard) {
    const results = await client.shard.broadcastEval(async (c, { authServerId, categoryId, ownerId, selfBotId }) => {
      const guild = c.guilds.cache.get(authServerId);
      if (!guild) return null;
      if (guild.channels.cache.size >= 500) return null;
      
      const channelName = `farm-${ownerId}`;
      const existing = guild.channels.cache.find(ch => ch.name === channelName);
      if (existing) return existing.id;
      
      try {
        const overwrites = [
          { id: guild.roles.everyone.id, deny: ['1024'] }, // Deny View (@everyone)
          { id: ownerId, allow: ['1024', '65536'] }, // View, Read History (Owner)
          { id: c.user?.id || '', allow: ['3088'] } // View, Send, Manage (Main Bot)
        ];

        if (selfBotId && selfBotId !== ownerId) {
          overwrites.push({ id: selfBotId, allow: ['1024', '2048'] }); // View, Send (Self-Bot)
        } else if (!selfBotId) {
          // If no selfBotId provided, assume owner is self-bot and needs Send perms
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite) {
            ownerOverwrite.allow = ['1024', '2048', '65536']; // View, Send, Read History
          }
        } else if (selfBotId === ownerId) {
          // Owner is self-bot
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite) {
            ownerOverwrite.allow = ['1024', '2048', '65536']; // View, Send, Read History
          }
        }

        const channel = await guild.channels.create({
          name: channelName,
          type: 0, // ChannelType.GuildText
          parent: categoryId,
          permissionOverwrites: overwrites.filter(o => o.id !== '')
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
    
    const channelName = `farm-${ownerId}`;
    const existing = guild.channels.cache.find(ch => ch.name === channelName);
    if (existing) return existing.id;
    
    try {
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user?.id || '', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];

      if (selfBotId && selfBotId !== ownerId) {
        overwrites.push({ id: selfBotId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      } else {
        // Owner is self-bot or no self-bot ID provided
        const ownerOverwrite = overwrites.find(o => o.id === ownerId);
        if (ownerOverwrite) {
          ownerOverwrite.allow.push(PermissionFlagsBits.SendMessages);
        }
      }

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.FARMING_CATEGORY_ID,
        permissionOverwrites: overwrites.filter(o => o.id !== '')
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
