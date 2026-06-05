/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FarmingLoop } from '../selfBotWorker.js';
import { Client, TextChannel } from 'discord.js-selfbot-v13';
import { DEFAULT_FARMING_SETTINGS } from '../../types/farming.js';

vi.mock('discord.js-selfbot-v13', () => {
  const mockSend = vi.fn();
  const mockChannel = {
    isText: () => true,
    send: mockSend,
  };
  const mockChannels = {
    fetch: vi.fn().mockResolvedValue(mockChannel),
  };

  class MockClient {
    on = vi.fn();
    once = vi.fn();
    login = vi.fn().mockResolvedValue('token');
    destroy = vi.fn();
    channels = mockChannels;
    user = { id: 'selfbot123', username: 'selfbot123' };
  }

  return {
    Client: MockClient,
    TextChannel: class {},
    Options: {
      cacheWithLimits: vi.fn(),
    },
  };
});

describe('FarmingLoop', () => {
  let client: any;
  let handleMessageCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create new mock client
    client = new Client() as any;
    
    // Capture event listener registration
    (client.on as any).mockImplementation((event: string, callback: any) => {
      if (event === 'messageCreate') {
        handleMessageCallback = callback;
      }
    });

    // Mock process.send
    if (typeof (process as any).send === 'function') {
      vi.spyOn(process as any, 'send').mockImplementation(vi.fn());
    } else {
      (process as any).send = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse owo cash response and trigger owo give when threshold is met', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      commands: {
        ...DEFAULT_FARMING_SETTINGS.commands,
        hunt: false,
        battle: false,
      },
      moneyTransfer: {
        enabled: true,
        mainAccountId: '999999999999999999',
        threshold: 50000,
      },
      autoGem: {
        ...DEFAULT_FARMING_SETTINGS.autoGem,
        enabled: false,
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();

    // Verify handleMessage is registered
    expect(handleMessageCallback).toBeDefined();

    // Simulate owo cash message response
    const mockMessage = {
      author: { id: '408785106942164992' }, // OwO Bot ID
      content: 'Hey Kyou, you currently have **55,000** cowoncy!',
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 },
    };

    const mockFetch = vi.mocked(client.channels.fetch);
    const mockSendFn = vi.fn();
    mockFetch.mockResolvedValue({
      isText: () => true,
      send: mockSendFn
    } as unknown as TextChannel);

    await handleMessageCallback(mockMessage);

    // Balance is 55,000. Reserve is 1,000. Give amount = 54,000
    // Check that loop triggered 'owo give <@999999999999999999> 54000'
    expect(mockSendFn).toHaveBeenCalledWith('owo give <@999999999999999999> 54000');
    
    loop.stop();
  });

  it('should NOT trigger owo give if balance is below threshold', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      commands: {
        ...DEFAULT_FARMING_SETTINGS.commands,
        hunt: false,
        battle: false,
      },
      moneyTransfer: {
        enabled: true,
        mainAccountId: '999999999999999999',
        threshold: 50000,
      },
      autoGem: {
        ...DEFAULT_FARMING_SETTINGS.autoGem,
        enabled: false,
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();

    // Simulate owo cash response below threshold
    const mockMessage = {
      author: { id: '408785106942164992' },
      content: 'Hey Kyou, you currently have **45,000** cowoncy!',
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 },
    };

    const mockFetch = vi.mocked(client.channels.fetch);
    const mockSendFn = vi.fn();
    mockFetch.mockResolvedValue({
      isText: () => true,
      send: mockSendFn
    } as unknown as TextChannel);

    await handleMessageCallback(mockMessage);

    // Give should not be called
    expect(mockSendFn).not.toHaveBeenCalled();
    
    loop.stop();
  });

  it('should detect captcha and stop loop, destroying client and sending IPC status', async () => {
    const loop = new FarmingLoop(client, DEFAULT_FARMING_SETTINGS, 'channel123', '5');
    loop.start();

    const mockMessage = {
      author: { id: '408785106942164992' },
      content: 'solve the captcha: https://owobot.com/captcha',
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 },
    };

    await handleMessageCallback(mockMessage);

    // Verify it sent CAPTCHA_DETECTED status via IPC
    expect(process.send).toHaveBeenCalledWith({
      type: 'STATUS',
      botId: '5',
      discordId: 'selfbot123',
      status: 'CAPTCHA_DETECTED'
    });

    // Verify it destroyed the client to prevent further actions
    expect(client.destroy).toHaveBeenCalled();

    loop.stop();
  });

  it('should parse owo inv response and populate inventory cache correctly', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      autoGem: {
        enabled: true,
        preferredTiers: { hunting: 3, lucky: 3, empowering: 1 },
        useSpecialGemsDuringEvents: true
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();
    await new Promise(resolve => setTimeout(resolve, 0));

    const mockMessage = {
      author: { id: '408785106942164992' },
      content: '',
      channel: { id: 'channel123' },
      attachments: { size: 0 },
      embeds: [{
        title: 'selfbot123\'s inventory',
        description: 'Gems list:\n`49` x2\n`50` x10\n`51` x5\n`58` x3\n`65`\n`72` x10', // 72 is out of range
        author: { name: 'selfbot123\'s inventory' }
      }]
    };

    await handleMessageCallback(mockMessage);

    const cache = (loop as any).inventoryCache;
    expect(cache.hunting).toEqual(['51', '51', '51', '51', '51']);
    expect(cache.lucky).toEqual(['58', '58', '58']);
    expect(cache.empowering).toEqual(['65']);
    expect((loop as any).lootboxCount).toBe(10);
    expect((loop as any).fabledLootboxCount).toBe(2);

    loop.stop();
  });

  it('should check hunt responses and trigger owo use command when active gems are missing', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      autoGem: {
        enabled: true,
        preferredTiers: { hunting: 3, lucky: 3, empowering: 1 },
        useSpecialGemsDuringEvents: true
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Pre-populate inventory cache
    const cache = (loop as any).inventoryCache;
    cache.hunting = ['51', '52'];
    cache.lucky = ['58', '59'];
    cache.empowering = ['65', '66'];

    // Simulate owo hunt response where only hunting gem is active
    const mockMessage = {
      author: { id: '408785106942164992' },
      content: '**selfbot123** [💎] found a Common Animal!',
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 }
    };

    const mockFetch = vi.mocked(client.channels.fetch);
    const mockSendFn = vi.fn();
    mockFetch.mockResolvedValue({
      isText: () => true,
      send: mockSendFn
    } as unknown as TextChannel);

    await handleMessageCallback(mockMessage);

    // Hunting gem is present (💎), but lucky (🍀) and empowering (⚔️) are missing.
    // It should use lucky ('58') and empowering ('65') in a single command.
    expect(mockSendFn).toHaveBeenCalledWith('owo use 58 65');
    
    // Cached items should be removed
    expect(cache.lucky).toEqual(['59']);
    expect(cache.empowering).toEqual(['66']);
    expect(cache.hunting).toEqual(['51', '52']); // Hunting gem not used

    loop.stop();
  });

  it('should trigger inventory sync when cache is depleted', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      autoGem: {
        enabled: true,
        preferredTiers: { hunting: 3, lucky: 3, empowering: 1 },
        useSpecialGemsDuringEvents: true
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Cache is empty
    const cache = (loop as any).inventoryCache;
    cache.hunting = [];
    cache.lucky = [];
    cache.empowering = [];
    (loop as any).lastInventorySync = 0; // Force sync bypass throttling

    const mockMessage = {
      author: { id: '408785106942164992' },
      content: '**selfbot123** found a Common Animal!', // No active gems
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 }
    };

    const mockFetch = vi.mocked(client.channels.fetch);
    const mockSendFn = vi.fn();
    mockFetch.mockResolvedValue({
      isText: () => true,
      send: mockSendFn
    } as unknown as TextChannel);

    await handleMessageCallback(mockMessage);

    // Active gems are missing and cache is empty, should trigger owo inv
    expect(mockSendFn).toHaveBeenCalledWith('owo inv');

    loop.stop();
  });

  it('should open lootboxes and then trigger inventory sync when cache is depleted but lootboxes are available', async () => {
    const settings = {
      ...DEFAULT_FARMING_SETTINGS,
      active: true,
      autoGem: {
        enabled: true,
        preferredTiers: { hunting: 3, lucky: 3, empowering: 1 },
        useSpecialGemsDuringEvents: true
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123', '5');
    loop.start();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Cache is empty, but we have lootboxes
    const cache = (loop as any).inventoryCache;
    cache.hunting = [];
    cache.lucky = [];
    cache.empowering = [];
    (loop as any).lootboxCount = 5;
    (loop as any).fabledLootboxCount = 1;
    (loop as any).lastInventorySync = 0;

    const mockMessage = {
      author: { id: '408785106942164992' },
      content: '**selfbot123** found a Common Animal!', // No active gems
      channel: { id: 'channel123' },
      embeds: [],
      attachments: { size: 0 }
    };

    const mockFetch = vi.mocked(client.channels.fetch);
    const mockSendFn = vi.fn();
    mockFetch.mockResolvedValue({
      isText: () => true,
      send: mockSendFn
    } as unknown as TextChannel);

    await handleMessageCallback(mockMessage);

    // Should open lootboxes (both regular and fabled) and then call owo inv
    expect(mockSendFn).toHaveBeenCalledWith('owo lb all');
    expect(mockSendFn).toHaveBeenCalledWith('owo lb f');
    expect(mockSendFn).toHaveBeenCalledWith('owo inv');

    // Counts should be reset to 0
    expect((loop as any).lootboxCount).toBe(0);
    expect((loop as any).fabledLootboxCount).toBe(0);

    loop.stop();
  });
});
