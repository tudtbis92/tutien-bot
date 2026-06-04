import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserIdFromToken, createFarmingChannel, deleteFarmingChannel } from '../channelService.js';
import { Client } from 'discord.js';

// Mock config
vi.mock('../../../config.js', () => ({
  config: {
    AUTH_SERVER_ID: '123456789012345678',
    FARMING_CATEGORY_ID: '876543210987654321',
  }
}));

describe('ChannelService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getUserIdFromToken', () => {
    it('should return user ID for a valid token', () => {
      const userId = '898126643598606367';
      const base64UserId = Buffer.from(userId).toString('base64');
      const token = `${base64UserId}.someRandomString.anotherRandomString`;
      
      const result = getUserIdFromToken(token);
      expect(result).toBe(userId);
    });

    it('should return null if base64 decoded string is not numeric', () => {
      const base64Invalid = Buffer.from('not-numeric').toString('base64');
      const token = `${base64Invalid}.random.random`;
      
      const result = getUserIdFromToken(token);
      expect(result).toBeNull();
    });

    it('should return null if token format is invalid (no dots)', () => {
      const token = 'invalidtokenwithoutdots';
      const result = getUserIdFromToken(token);
      expect(result).toBeNull();
    });
  });

  describe('createFarmingChannel', () => {
    it('should call broadcastEval when sharded', async () => {
      const mockClient = {
        shard: {
          broadcastEval: vi.fn().mockResolvedValue(['55555']),
        }
      } as unknown as Client;

      const result = await createFarmingChannel(mockClient, '898126643598606367');
      expect(result).toBe('55555');
      expect(mockClient.shard!.broadcastEval).toHaveBeenCalled();
    });

    it('should create channel locally when not sharded', async () => {
      const mockChannel = { id: '99999' };
      const mockGuild = {
        channels: {
          cache: {
            size: 10,
            find: vi.fn().mockReturnValue(null), // channel doesn't exist yet
          },
          create: vi.fn().mockResolvedValue(mockChannel),
        },
        roles: {
          everyone: { id: 'everyone-role-id' }
        }
      };

      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue(mockGuild),
          }
        }
      } as unknown as Client;

      const result = await createFarmingChannel(mockClient, '898126643598606367');
      expect(result).toBe('99999');
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'farm-898126643598606367',
        type: expect.anything(),
        parent: '876543210987654321',
        permissionOverwrites: [
          { id: 'everyone-role-id', deny: expect.any(Array) },
          { id: '898126643598606367', allow: expect.any(Array) }
        ]
      });
    });

    it('should return existing channel id if already exists', async () => {
      const mockExistingChannel = { id: '77777', name: 'farm-898126643598606367' };
      const mockGuild = {
        channels: {
          cache: {
            size: 10,
            find: vi.fn().mockReturnValue(mockExistingChannel),
          },
          create: vi.fn(),
        }
      };

      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue(mockGuild),
          }
        }
      } as unknown as Client;

      const result = await createFarmingChannel(mockClient, '898126643598606367');
      expect(result).toBe('77777');
      expect(mockGuild.channels.create).not.toHaveBeenCalled();
    });

    it('should return null if channel limit reached (>= 500)', async () => {
      const mockGuild = {
        channels: {
          cache: {
            size: 500,
          }
        }
      };

      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue(mockGuild),
          }
        }
      } as unknown as Client;

      const result = await createFarmingChannel(mockClient, '898126643598606367');
      expect(result).toBeNull();
    });
  });

  describe('deleteFarmingChannel', () => {
    it('should call broadcastEval when sharded', async () => {
      const mockClient = {
        shard: {
          broadcastEval: vi.fn().mockResolvedValue([true]),
        }
      } as unknown as Client;

      const result = await deleteFarmingChannel(mockClient, '99999');
      expect(result).toBe(true);
      expect(mockClient.shard!.broadcastEval).toHaveBeenCalled();
    });

    it('should delete channel locally when not sharded', async () => {
      const mockChannel = {
        delete: vi.fn().mockResolvedValue(true)
      };
      const mockGuild = {
        channels: {
          cache: {
            get: vi.fn().mockReturnValue(mockChannel),
          }
        }
      };

      const mockClient = {
        guilds: {
          cache: {
            get: vi.fn().mockReturnValue(mockGuild),
          }
        }
      } as unknown as Client;

      const result = await deleteFarmingChannel(mockClient, '99999');
      expect(result).toBe(true);
      expect(mockChannel.delete).toHaveBeenCalled();
    });
  });
});
