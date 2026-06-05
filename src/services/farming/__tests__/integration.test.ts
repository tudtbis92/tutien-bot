/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfBotMaster } from '../../../../src/workers/selfBotMaster.js';
import { FarmingSubscriptionService } from '../subscriptionService.js';
import { DEFAULT_FARMING_SETTINGS, FarmingSettings } from '../../../types/farming.js';
import { EncryptionService } from '../../../services/encryptionService.js';
import { ChildProcess } from 'node:child_process';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// --- MOCK THE DB ---

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockLeftJoin = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
  const mockFrom = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockSet = vi.fn(() => ({ where: mockWhere, returning: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: vi.fn() }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockTransaction = vi.fn();
  
  return { mockWhere, mockFrom, mockSelect, mockSet, mockUpdate, mockLeftJoin, mockInsert, mockValues, mockTransaction };
});

vi.mock('../../../db/client.js', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    insert: mocks.mockInsert,
    transaction: mocks.mockTransaction
  }
}));

vi.mock('../../../db/schema/users.js', () => ({
  users: { id: 'id', balance: 'balance' }
}));

vi.mock('../../../db/schema/farming.js', () => ({
  farmingAccounts: { userId: 'userId', proxyId: 'proxyId', status: 'status' },
  proxies: { id: 'id' },
  farmingSubscriptions: { userId: 'userId' }
}));

describe('Monetization Integration Tests', () => {
  let master: SelfBotMaster;
  let mockWorker: ChildProcess;
  let mockSend: ReturnType<typeof vi.fn>;

  const TEST_USER_ID = 99991;
  const TEST_USER_ID_FREE = 99992;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup Drizzle mocks
    mocks.mockSelect.mockImplementation(() => ({ from: mocks.mockFrom }));
    mocks.mockFrom.mockImplementation(() => ({ leftJoin: mocks.mockLeftJoin, where: mocks.mockWhere }));
    mocks.mockLeftJoin.mockImplementation(() => ({ leftJoin: mocks.mockLeftJoin, where: mocks.mockWhere }));
    
    mockSend = vi.fn();
    mockWorker = {
      send: mockSend,
      kill: vi.fn(),
      on: vi.fn(),
    } as unknown as ChildProcess;

    // @ts-expect-error -- accessing private static for test reset
    SelfBotMaster.instance = undefined;
    master = SelfBotMaster.getInstance();
    
    // Inject mock worker
    // @ts-expect-error -- replacing private method for testing
    master.spawnWorker = vi.fn().mockReturnValue(mockWorker);
    // @ts-expect-error -- accessing private map for test setup
    master.workers.set(1, { worker: mockWorker, botIds: new Set() });
    // @ts-expect-error -- accessing private field for test setup
    master.nextWorkerId = 2;
    
    vi.spyOn(EncryptionService, 'decrypt').mockReturnValue('mock-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    master.stop();
  });

  it('Flow 1: User buys Basic -> Master starts bot with sanitized settings', async () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_FARMING_SETTINGS)) as FarmingSettings;
    settings.commands.pray.enabled = true; // Premium feature, should be disabled by sanitizer
    
    // Mock the DB state that would be returned during rebalance after buying basic
    mocks.mockWhere.mockResolvedValueOnce([{
      account: {
        userId: TEST_USER_ID,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1,
        status: 'active',
        settings
      },
      proxy: null,
      subscription: {
        userId: TEST_USER_ID,
        planType: 'basic',
        expiresAt: dayjs().add(30, 'day').toDate()
      }
    }]);

    await master.rebalance();

    const callArgs = mockSend.mock.calls.find(call => call[0].type === 'START_BOTS');
    expect(callArgs).toBeDefined();
    
    const bot = callArgs![0].payload.find((b: any) => b.id === String(TEST_USER_ID));
    expect(bot).toBeDefined();
    // Sanitized
    expect(bot.settings.commands.pray.enabled).toBe(false);
  });

  it('Flow 2: User upgrades to VIP -> Master restarts bot with unsanitized settings', async () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_FARMING_SETTINGS)) as FarmingSettings;
    settings.commands.pray.enabled = true; // Premium feature

    // Upgrade sets it to premium
    mocks.mockWhere.mockResolvedValueOnce([{
      account: {
        userId: TEST_USER_ID,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1,
        status: 'active',
        settings
      },
      proxy: null,
      subscription: {
        userId: TEST_USER_ID,
        planType: 'premium',
        expiresAt: dayjs().add(30, 'day').toDate()
      }
    }]);

    await master.rebalance();

    const callArgs = mockSend.mock.calls.find(call => call[0].type === 'START_BOTS');
    expect(callArgs).toBeDefined();
    const bot = callArgs![0].payload.find((b: any) => b.id === String(TEST_USER_ID));
    
    // Not sanitized
    expect(bot.settings.commands.pray.enabled).toBe(true);
  });

  it('Flow 3: Subscription expires -> Master stops bot on next rebalance', async () => {
    // Previous state had bot running
    // @ts-expect-error -- accessing private map for test setup
    master.workers.get(1)!.botIds.add(String(TEST_USER_ID));

    // Now expired
    mocks.mockWhere.mockResolvedValueOnce([{
      account: {
        userId: TEST_USER_ID,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1,
        status: 'active',
        settings: DEFAULT_FARMING_SETTINGS
      },
      proxy: null,
      subscription: {
        userId: TEST_USER_ID,
        planType: 'basic',
        expiresAt: dayjs().subtract(1, 'day').toDate() // Expired!
      }
    }]);

    await master.rebalance();

    // The master could either send STOP_BOTS if the worker is kept alive, 
    // or kill the worker if it's no longer needed (e.g. 0 bots total).
    const stopCall = mockSend.mock.calls.find(call => call[0].type === 'STOP_BOTS');
    if (stopCall) {
      expect(stopCall[0].payload).toContain(String(TEST_USER_ID));
    } else {
      expect(mockWorker.kill).toHaveBeenCalledWith('SIGTERM');
    }
  });

  it('Flow 4: Free plan user -> Master does NOT start bot', async () => {
    mocks.mockWhere.mockResolvedValueOnce([{
      account: {
        userId: TEST_USER_ID_FREE,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1,
        status: 'active',
        settings: DEFAULT_FARMING_SETTINGS
      },
      proxy: null,
      subscription: {
        userId: TEST_USER_ID_FREE,
        planType: 'free',
        expiresAt: dayjs().add(30, 'day').toDate()
      }
    }]);

    await master.rebalance();

    const callArgs = mockSend.mock.calls.find(call => call[0].type === 'START_BOTS');
    // It shouldn't send START_BOTS with this bot. It should send empty array or not send.
    if (callArgs) {
      const bot = callArgs[0].payload.find((b: any) => b.id === String(TEST_USER_ID_FREE));
      expect(bot).toBeUndefined();
    }
  });

  it('Flow 5: User overwrites existing plan -> old plan replaced', async () => {
    // This flow is more about the service level overriding the plan.
    // We can simulate it by showing the rebalance pulling the new plan type.
    mocks.mockWhere.mockResolvedValueOnce([{
      account: {
        userId: TEST_USER_ID,
        encryptedToken: 'enc',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 1,
        status: 'active',
        settings: { ...DEFAULT_FARMING_SETTINGS, commands: { ...DEFAULT_FARMING_SETTINGS.commands, pray: { enabled: true } } }
      },
      proxy: null,
      subscription: {
        userId: TEST_USER_ID,
        planType: 'premium',
        expiresAt: dayjs().add(30, 'day').toDate()
      }
    }]);

    await master.rebalance();
    
    const callArgs = mockSend.mock.calls.find(call => call[0].type === 'START_BOTS');
    const bot = callArgs![0].payload.find((b: any) => b.id === String(TEST_USER_ID));
    // Since plan is premium now, pray should be enabled
    expect(bot.settings.commands.pray.enabled).toBe(true);
  });

  it('Flow 6: Concurrent purchase -> only one deduction succeeds', async () => {
    // This flow specifically tests the service, not the master. 
    // We mock the db.transaction to simulate this.
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]), // First succeeds, second fails
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue({}),
    };
    
    mocks.mockTransaction.mockImplementation(async (cb) => {
      return await cb(mockTx as any);
    });

    // First purchase
    await expect(FarmingSubscriptionService.purchasePlan(1, 'basic', 30)).resolves.toBeInstanceOf(Date);
    
    // Concurrent second purchase fails because `returning` returns empty (balance depleted)
    await expect(FarmingSubscriptionService.purchasePlan(1, 'basic', 30)).rejects.toThrow('INSUFFICIENT_BALANCE');
  });
});
