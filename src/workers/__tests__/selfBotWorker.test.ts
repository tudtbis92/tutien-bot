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
    user = { id: 'selfbot123' };
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
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123');
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
      }
    };

    const loop = new FarmingLoop(client, settings, 'channel123');
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
    const loop = new FarmingLoop(client, DEFAULT_FARMING_SETTINGS, 'channel123');
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
      botId: 'selfbot123',
      status: 'CAPTCHA_DETECTED'
    });

    // Verify it destroyed the client to prevent further actions
    expect(client.destroy).toHaveBeenCalled();

    loop.stop();
  });
});
