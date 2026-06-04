import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxyService } from '../proxyService.js';
import { db } from '../../../db/client.js';

vi.mock('../../../db/client.js', () => {
  return {
    db: {
      transaction: vi.fn(),
      query: {
        proxies: {
          findFirst: vi.fn(),
        },
        farmingAccounts: {
          findFirst: vi.fn(),
        }
      }
    }
  };
});

describe('ProxyService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('assignProxy', () => {
    it('should assign the proxy with lowest usage first', async () => {
      const mockTx = {
        query: {
          farmingAccounts: {
            findFirst: vi.fn().mockResolvedValue({ userId: 1, proxyId: null })
          },
          proxies: {
            findFirst: vi.fn()
          }
        },
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([
          { id: 10, url: 'http://proxy1', usageCount: 0 }
        ]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await ProxyService.assignProxy(1);
      
      expect(result).toBe('http://proxy1');
      expect(mockTx.for).toHaveBeenCalledWith('update', { skipLocked: true });
      expect(mockTx.update).toHaveBeenCalledTimes(2); // One for proxy, one for account
    });

    it('should not assign if proxy usage reaches 3', async () => {
      const mockTx = {
        query: {
          farmingAccounts: {
            findFirst: vi.fn().mockResolvedValue({ userId: 1, proxyId: null })
          }
        },
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        for: vi.fn().mockResolvedValue([]), // No available proxies
      };

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await ProxyService.assignProxy(1);
      expect(result).toBeNull();
    });
  });
});
