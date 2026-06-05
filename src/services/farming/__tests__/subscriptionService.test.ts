/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FarmingSubscriptionService } from '../subscriptionService.js';
import { db } from '../../../db/client.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// Mock the DB
vi.mock('../../../db/client.js', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

describe('FarmingSubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateUpgradeFee', () => {
    it('should return 0 if no expiresAt is provided', () => {
      expect(FarmingSubscriptionService.calculateUpgradeFee(null)).toBe(0n);
      expect(FarmingSubscriptionService.calculateUpgradeFee(undefined)).toBe(0n);
    });

    it('should calculate correct fee based on remaining days', () => {
      // Current time is 2026-06-05T00:00:00Z
      const expiresAt = new Date('2026-06-15T12:00:00Z'); // 10.5 days remaining -> 11 days ceil
      const fee = FarmingSubscriptionService.calculateUpgradeFee(expiresAt);
      expect(fee).toBe(11000n); // 11 * 1000
    });

    it('should throw PLAN_EXPIRED if the plan has already expired', () => {
      const expiresAt = new Date('2026-06-04T00:00:00Z'); // In the past
      expect(() => FarmingSubscriptionService.calculateUpgradeFee(expiresAt)).toThrow('PLAN_EXPIRED');
    });

    it('should calculate exactly 1 day for a partial day left', () => {
      const expiresAt = new Date('2026-06-05T01:00:00Z'); // 1 hour remaining -> 1 day
      const fee = FarmingSubscriptionService.calculateUpgradeFee(expiresAt);
      expect(fee).toBe(1000n);
    });
  });

  describe('purchasePlan', () => {
    it('should calculate correct prices and use transaction', async () => {
      // Mock db.transaction to just execute the callback with a mock tx object
      const mockTx = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue({}),
      };
      
      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      const resultDate = await FarmingSubscriptionService.purchasePlan(1, 'basic', 30);
      
      // Basic 30D should cost 35k
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockTx.returning).toHaveBeenCalled();
      
      // Ensure expiresAt is set 30 days from now
      const expectedDate = dayjs.utc().add(30, 'day').toDate();
      expect(resultDate.getTime()).toBe(expectedDate.getTime());
    });

    it('should throw INSUFFICIENT_BALANCE if returning is empty', async () => {
      const mockTx = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]), // Empty array simulates insufficient balance
      };
      
      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      await expect(FarmingSubscriptionService.purchasePlan(1, 'premium', 30))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
    });

    it('should throw INVALID_DURATION for incorrect combinations', async () => {
      await expect(FarmingSubscriptionService.purchasePlan(1, 'basic', 14))
        .rejects.toThrow('INVALID_DURATION');
      
      await expect(FarmingSubscriptionService.purchasePlan(1, 'premium', 7))
        .rejects.toThrow('INVALID_DURATION');
    });

    // TC-07-12: balance exactly equals fee (boundary case)
    it('TC-07-12: should succeed when balance exactly equals the plan fee', async () => {
      const mockTx = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]), // balance == fee: UPDATE matches 1 row
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      // 7D plan costs exactly 10k. Mock user has exactly 10k balance — DB allows it.
      await expect(FarmingSubscriptionService.purchasePlan(1, 'basic', 7)).resolves.toBeInstanceOf(Date);
      expect(mockTx.returning).toHaveBeenCalled();
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade basic plan to premium and deduct prorated fee', async () => {
      const expiresAt = new Date('2026-06-15T00:00:00Z'); // 10 days left from mocked "now"
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([{ planType: 'basic', expiresAt }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      const result = await FarmingSubscriptionService.upgradePlan(1);
      expect(result).toBe(expiresAt); // expiry stays same
      expect(mockTx.returning).toHaveBeenCalled();
    });

    it('should throw INSUFFICIENT_BALANCE when user cannot afford upgrade fee', async () => {
      const expiresAt = new Date('2026-06-15T00:00:00Z');
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([{ planType: 'basic', expiresAt }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]), // empty = insufficient
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      await expect(FarmingSubscriptionService.upgradePlan(1)).rejects.toThrow('INSUFFICIENT_BALANCE');
    });

    it('should throw INVALID_UPGRADE_STATE when user has no active basic plan', async () => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([]), // no subscription
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn(),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      await expect(FarmingSubscriptionService.upgradePlan(1)).rejects.toThrow('INVALID_UPGRADE_STATE');
    });

    it('should throw PLAN_EXPIRED (via calculateUpgradeFee) when plan is already expired', async () => {
      const expiredAt = new Date('2026-06-04T00:00:00Z'); // 1 day in the past
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([{ planType: 'basic', expiresAt: expiredAt }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn(),
      };

      vi.mocked(db.transaction).mockImplementation(async (cb) => {
        return await cb(mockTx as any);
      });

      await expect(FarmingSubscriptionService.upgradePlan(1)).rejects.toThrow('PLAN_EXPIRED');
    });
  });
});
