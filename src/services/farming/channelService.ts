/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, ChannelType, PermissionFlagsBits, type OverwriteData, ShardingManager } from 'discord.js';
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
        const VIEW_CHANNEL = 1024n;
        const SEND_MESSAGES = 2048n;
        const READ_HISTORY = 65536n;
        const MANAGE_CHANNELS = 16n;

        const overwrites: { id: string; deny?: bigint[]; allow?: bigint[] }[] = [
          { id: guild.roles.everyone.id, deny: [VIEW_CHANNEL] },
          { id: ownerId, allow: [VIEW_CHANNEL, READ_HISTORY] },
          { id: c.user?.id ?? '', allow: [VIEW_CHANNEL, SEND_MESSAGES, MANAGE_CHANNELS] }
        ];

        if (selfBotId && selfBotId !== ownerId) {
          overwrites.push({ id: selfBotId, allow: [VIEW_CHANNEL, SEND_MESSAGES] });
        } else if (!selfBotId) {
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite?.allow) {
            ownerOverwrite.allow = [VIEW_CHANNEL, SEND_MESSAGES, READ_HISTORY];
          }
        } else if (selfBotId === ownerId) {
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite?.allow) {
            ownerOverwrite.allow = [VIEW_CHANNEL, SEND_MESSAGES, READ_HISTORY];
          }
        }

        const channel = await guild.channels.create({
          name: channelName,
          type: 0, // ChannelType.GuildText
          parent: categoryId,
          permissionOverwrites: overwrites.filter(o => o.id !== '') as any
        });
        return channel.id;
      } catch (err) {
        console.error(`[Shard ${c.shard?.ids?.join(',')} - ChannelService] Failed to create farming channel for user ${ownerId}:`, err);
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
      const overwrites: OverwriteData[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user?.id ?? '', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];

      if (selfBotId && selfBotId !== ownerId) {
        overwrites.push({ id: selfBotId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      } else {
        // Owner is self-bot or no self-bot ID provided
        const ownerOverwrite = overwrites.find(o => o.id === ownerId);
        if (ownerOverwrite?.allow && Array.isArray(ownerOverwrite.allow)) {
          (ownerOverwrite.allow as bigint[]).push(PermissionFlagsBits.SendMessages);
        }
      }

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.FARMING_CATEGORY_ID,
        permissionOverwrites: overwrites.filter(o => o.id !== '')
      });
      return channel.id;
    } catch (err) {
      console.error(`[ChannelService] Failed to create farming channel locally for user ${ownerId}:`, err);
      return null;
    }
  }
}

/**
 * Creates a private farming channel for the user, called from ShardingManager process.
 * @param manager The ShardingManager instance
 * @param ownerId The owner's Discord ID
 * @param selfBotId Optional Discord ID of the self-bot
 * @returns The created channel ID or null if failed
 */
export async function createFarmingChannelFromManager(manager: ShardingManager, ownerId: string, selfBotId?: string | null): Promise<string | null> {
  const context = { 
    authServerId: config.AUTH_SERVER_ID, 
    categoryId: config.FARMING_CATEGORY_ID, 
    ownerId,
    selfBotId
  };

  try {
    const results = await manager.broadcastEval(async (c, { authServerId, categoryId, ownerId, selfBotId }) => {
      const guild = c.guilds.cache.get(authServerId);
      if (!guild) return null;
      if (guild.channels.cache.size >= 500) return null;
      
      const channelName = `farm-${ownerId}`;
      const existing = guild.channels.cache.find(ch => ch.name === channelName);
      if (existing) return existing.id;
      
      try {
        const VIEW_CHANNEL = 1024n;
        const SEND_MESSAGES = 2048n;
        const READ_HISTORY = 65536n;
        const MANAGE_CHANNELS = 16n;

        const overwrites: { id: string; deny?: bigint[]; allow?: bigint[] }[] = [
          { id: guild.roles.everyone.id, deny: [VIEW_CHANNEL] },
          { id: ownerId, allow: [VIEW_CHANNEL, READ_HISTORY] },
          { id: c.user?.id ?? '', allow: [VIEW_CHANNEL, SEND_MESSAGES, MANAGE_CHANNELS] }
        ];

        if (selfBotId && selfBotId !== ownerId) {
          overwrites.push({ id: selfBotId, allow: [VIEW_CHANNEL, SEND_MESSAGES] });
        } else if (!selfBotId) {
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite?.allow) {
            ownerOverwrite.allow = [VIEW_CHANNEL, SEND_MESSAGES, READ_HISTORY];
          }
        } else if (selfBotId === ownerId) {
          const ownerOverwrite = overwrites.find(o => o.id === ownerId);
          if (ownerOverwrite?.allow) {
            ownerOverwrite.allow = [VIEW_CHANNEL, SEND_MESSAGES, READ_HISTORY];
          }
        }

        const channel = await guild.channels.create({
          name: channelName,
          type: 0, // ChannelType.GuildText
          parent: categoryId,
          permissionOverwrites: overwrites.filter(o => o.id !== '') as any
        });
        return channel.id;
      } catch (err) {
        console.error(`[Shard ${c.shard?.ids?.join(',')} - ChannelService] Failed to create farming channel for user ${ownerId}:`, err);
        return null;
      }
    }, { context });
    
    return results.find(id => id !== null) || null;
  } catch (err) {
    console.error(`[ChannelService] broadcastEval failed during channel creation for user ${ownerId}:`, err);
    return null;
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
