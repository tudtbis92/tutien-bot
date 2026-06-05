import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfBotMaster } from '../selfBotMaster.js';
import * as child_process from 'node:child_process';
import { EncryptionService } from '../../services/encryptionService.js';
import { EventEmitter } from 'node:events';
import { DEFAULT_FARMING_SETTINGS } from '../../types/farming.js';
import { FarmingSubscriptionService } from '../../services/farming/subscriptionService.js';

const mockFork = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  fork: mockFork,
}));

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockLeftJoin = vi.fn();
  const chain = { leftJoin: mockLeftJoin, where: mockWhere };
  mockLeftJoin.mockReturnValue(chain);
  const mockFrom = vi.fn(() => chain);
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  
  return { mockWhere, mockFrom, mockSelect, mockSet, mockUpdate, mockLeftJoin };
});

vi.mock('../../db/client.js', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate
  }
}));

vi.mock('../../services/encryptionService.js');
const mockCreateFarmingChannelFromManager = vi.hoisted(() => vi.fn());
const mockGetUserIdFromToken = vi.hoisted(() => vi.fn().mockReturnValue('123456789'));
vi.mock('../../services/farming/channelService.js', () => ({
  createFarmingChannelFromManager: mockCreateFarmingChannelFromManager,
  getUserIdFromToken: mockGetUserIdFromToken,
}));
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));
vi.mock('../../db/schema/farming.js', () => ({
  farmingAccounts: {
    status: 'status',
    userId: 'userId',
    proxyId: 'proxyId',
  },
  proxies: {
    id: 'id',
  },
  farmingSubscriptions: {
    userId: 'userId',
    planType: 'planType',
    expiresAt: 'expiresAt',
  },
}));

describe('SelfBotMaster', () => {
  let master: SelfBotMaster;

  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { leftJoin: mocks.mockLeftJoin, where: mocks.mockWhere };
    mocks.mockLeftJoin.mockReturnValue(chain);
    mocks.mockSelect.mockImplementation(() => ({ from: mocks.mockFrom }));
    mocks.mockFrom.mockImplementation(() => chain);
    mocks.mockUpdate.mockImplementation(() => ({ set: mocks.mockSet }));
    mocks.mockSet.mockImplementation(() => ({ where: mocks.mockWhere }));
    
    // We reset the instance to get a clean state per test
    // @ts-expect-error -- accessing private static for testing
    SelfBotMaster.instance = undefined;
    master = SelfBotMaster.getInstance();
  });

  afterEach(() => {
    master.stop();
  });

  it('can spawn a worker process when needed', async () => {
    const mockAccounts = Array(10).fill(0).map((_, i) => ({
      account: {
        userId: i + 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: null,
        workerId: null,
        channelId: null,
        settings: null
      },
      proxy: null,
      subscription: {
        userId: i + 1,
        planType: 'basic',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }));

    mocks.mockWhere.mockResolvedValueOnce(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('decrypted_token');

    const mockChild = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild.send = vi.fn();
    mockChild.kill = vi.fn();
    mockFork.mockReturnValue(mockChild);

    await master.rebalance();

    expect(mockFork).toHaveBeenCalled();
    expect(master.getWorkerCount()).toBe(1);
    expect(master.getActiveBotCount()).toBe(10);
  });

  it('correctly calculates worker assignment for a list of bots (100 per worker)', async () => {
    const mockAccounts = Array(250).fill(0).map((_, i) => ({
      account: {
        userId: i + 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: null,
        workerId: null,
        channelId: null,
        settings: null
      },
      proxy: null,
      subscription: {
        userId: i + 1,
        planType: 'basic',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }));

    mocks.mockWhere.mockResolvedValueOnce(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('decrypted_token');

    const createMockChild = () => {
      const mockChild = new EventEmitter() as unknown as child_process.ChildProcess;
      mockChild.send = vi.fn();
      mockChild.kill = vi.fn();
      return mockChild;
    };

    mockFork.mockImplementation(createMockChild);

    await master.rebalance();

    // 250 bots / 100 bots per worker = 3 workers
    expect(mockFork).toHaveBeenCalledTimes(3);
    expect(master.getWorkerCount()).toBe(3);
    expect(master.getActiveBotCount()).toBe(250);
  });

  it('sends START_BOTS command to workers with correct data', async () => {
    const mockAccounts = [{
      account: {
        userId: 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: 'http://proxy',
        workerId: null,
        channelId: null,
        settings: null
      },
      proxy: null,
      subscription: {
        userId: 1,
        planType: 'basic',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }];

    mocks.mockWhere.mockResolvedValueOnce(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('dec_token');

    const mockChild = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild.send = vi.fn();
    mockChild.kill = vi.fn();
    mockFork.mockReturnValue(mockChild);

    await master.rebalance();

    const expectedSettings = FarmingSubscriptionService.sanitizeFarmingSettings(
      {
        ...DEFAULT_FARMING_SETTINGS,
        active: true,
        commands: {
          ...DEFAULT_FARMING_SETTINGS.commands,
          pray: {
            enabled: false,
            targetId: null,
          }
        }
      },
      'basic'
    );

    expect(mockChild.send).toHaveBeenCalledWith({
      type: 'START_BOTS',
      payload: [{
        id: '1',
        token: 'dec_token',
        proxy: 'http://proxy',
        workerId: null,
        channelId: null,
        settings: expectedSettings
      }]
    });
  });

  it('forces premium features to true for premium users even if settings in DB are basic/disabled', async () => {
    const mockAccounts = [{
      account: {
        userId: 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: 'http://proxy',
        workerId: null,
        channelId: null,
        settings: {
          ...DEFAULT_FARMING_SETTINGS,
          commands: {
            ...DEFAULT_FARMING_SETTINGS.commands,
            pray: { enabled: false, targetId: null }
          },
          autoGem: {
            ...DEFAULT_FARMING_SETTINGS.autoGem,
            enabled: false
          },
          antiBan: {
            socialChatter: false,
            periodicSleep: false
          },
          economy: {
            ...DEFAULT_FARMING_SETTINGS.economy,
            autoUpgradeHuntbot: false
          }
        }
      },
      proxy: null,
      subscription: {
        userId: 1,
        planType: 'premium',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }];

    mocks.mockWhere.mockResolvedValueOnce(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('dec_token');

    const mockChild = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild.send = vi.fn();
    mockChild.kill = vi.fn();
    mockFork.mockReturnValue(mockChild);

    await master.rebalance();

    expect(mockChild.send).toHaveBeenCalledWith({
      type: 'START_BOTS',
      payload: [{
        id: '1',
        token: 'dec_token',
        proxy: 'http://proxy',
        workerId: null,
        channelId: null,
        settings: expect.objectContaining({
          active: true,
          commands: expect.objectContaining({
            pray: expect.objectContaining({ enabled: true })
          }),
          autoGem: expect.objectContaining({ enabled: true }),
          antiBan: expect.objectContaining({
            socialChatter: true,
            periodicSleep: true
          }),
          economy: expect.objectContaining({
            autoUpgradeHuntbot: true
          })
        })
      }]
    });
  });

  it('restarts a worker if it crashes unexpectedly', async () => {
    const mockAccounts = [{
      account: {
        userId: 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: null,
        workerId: null,
        channelId: null,
        settings: null
      },
      proxy: null,
      subscription: {
        userId: 1,
        planType: 'basic',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }];

    mocks.mockWhere.mockResolvedValue(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('dec_token');

    const mockChild1 = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild1.send = vi.fn();
    mockChild1.kill = vi.fn();

    const mockChild2 = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild2.send = vi.fn();
    mockChild2.kill = vi.fn();

    mockFork
      .mockReturnValueOnce(mockChild1)
      .mockReturnValueOnce(mockChild2);

    await master.rebalance();

    expect(master.getWorkerCount()).toBe(1);

    // Simulate crash
    mockChild1.emit('exit', 1);

    // Rebalance is called automatically after crash, which spawns a new worker
    // because we need 1 worker to handle the active bots.
    // Allow promises to resolve
    await new Promise(process.nextTick);

    expect(mockFork).toHaveBeenCalledTimes(2);
    expect(master.getWorkerCount()).toBe(1);
  });

  it('automatically creates a channel when channelId is missing', async () => {
    const mockAccounts = [{
      account: {
        userId: 1,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1',
        proxyUrl: null,
        workerId: null,
        channelId: null,
        settings: null
      },
      proxy: null,
      subscription: {
        userId: 1,
        planType: 'basic',
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    }];

    mocks.mockWhere.mockResolvedValueOnce(mockAccounts);
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('dec_token');
    mockCreateFarmingChannelFromManager.mockResolvedValueOnce('new-channel-123');

    const mockChild = new EventEmitter() as unknown as child_process.ChildProcess;
    mockChild.send = vi.fn();
    mockChild.kill = vi.fn();
    mockFork.mockReturnValue(mockChild);

    // Mock ShardingManager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockManager = {} as any;
    await master.start(mockManager, 999999);

    expect(mockCreateFarmingChannelFromManager).toHaveBeenCalledWith(mockManager, '1', '123456789');
    expect(mocks.mockUpdate).toHaveBeenCalled();
    expect(mocks.mockSet).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'new-channel-123' }));

    const expectedSettings = FarmingSubscriptionService.sanitizeFarmingSettings(
      {
        ...DEFAULT_FARMING_SETTINGS,
        active: true,
        commands: {
          ...DEFAULT_FARMING_SETTINGS.commands,
          pray: {
            enabled: false,
            targetId: null,
          }
        }
      },
      'basic'
    );

    expect(mockChild.send).toHaveBeenCalledWith({
      type: 'START_BOTS',
      payload: [{
        id: '1',
        token: 'dec_token',
        proxy: undefined,
        workerId: null,
        channelId: 'new-channel-123',
        settings: expectedSettings
      }]
    });
  });
});
