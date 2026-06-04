import { eq, and, lt, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { proxies, farmingAccounts } from '../../db/schema/farming.js';
import { logger } from '../../utils/logger.js';

export class ProxyService {
  /**
   * Get an available proxy with usageCount < 3
   */
  static async getAvailableProxy() {
    return await db.query.proxies.findFirst({
      where: and(
        eq(proxies.status, 'active'),
        lt(proxies.usageCount, 3)
      ),
      orderBy: [asc(proxies.usageCount)]
    });
  }

  /**
   * Assign an available proxy to a user.
   * Returns the proxy URL or null if no proxy is available.
   */
  static async assignProxy(userId: number): Promise<string | null> {
    return await db.transaction(async (tx) => {
      const account = await tx.query.farmingAccounts.findFirst({
        where: eq(farmingAccounts.userId, userId),
      });

      if (!account) {
        throw new Error('Farming account not found');
      }

      if (account.proxyId) {
        const existingProxy = await tx.query.proxies.findFirst({
          where: eq(proxies.id, account.proxyId),
        });
        return existingProxy ? existingProxy.url : null;
      }

      const availableProxies = await tx
        .select()
        .from(proxies)
        .where(
          and(
            eq(proxies.status, 'active'),
            lt(proxies.usageCount, 3)
          )
        )
        .orderBy(asc(proxies.usageCount))
        .limit(1)
        .for('update', { skipLocked: true });

      if (availableProxies.length === 0) {
        return null;
      }

      const proxy = availableProxies[0];

      await tx.update(proxies)
        .set({ usageCount: proxy.usageCount + 1 })
        .where(eq(proxies.id, proxy.id));

      await tx.update(farmingAccounts)
        .set({ proxyId: proxy.id })
        .where(eq(farmingAccounts.userId, userId));

      return proxy.url;
    });
  }

  /**
   * Unassign proxy from a user.
   */
  static async unassignProxy(userId: number): Promise<void> {
    await db.transaction(async (tx) => {
      const account = await tx.query.farmingAccounts.findFirst({
        where: eq(farmingAccounts.userId, userId),
      });

      if (!account || !account.proxyId) {
        return;
      }

      const proxy = await tx.query.proxies.findFirst({
        where: eq(proxies.id, account.proxyId),
      });

      if (proxy) {
        await tx.update(proxies)
          .set({ usageCount: Math.max(0, proxy.usageCount - 1) })
          .where(eq(proxies.id, proxy.id));
      }

      await tx.update(farmingAccounts)
        .set({ proxyId: null })
        .where(eq(farmingAccounts.userId, userId));
    });
  }

  /**
   * Reassign all farming accounts on a given proxy to other available proxies.
   * Returns a list of user IDs that were reassigned (or lost their proxy).
   */
  static async reassignAccountsFromProxy(proxyId: number): Promise<number[]> {
    const affectedAccounts = await db.query.farmingAccounts.findMany({
      where: eq(farmingAccounts.proxyId, proxyId),
    });

    const affectedUserIds: number[] = [];

    for (const account of affectedAccounts) {
      // First unassign
      await this.unassignProxy(account.userId);
      // Then reassign
      const newProxy = await this.assignProxy(account.userId);
      if (!newProxy) {
        logger.warn('ProxyService', `Failed to reassign proxy for user ${account.userId}`);
      }
      affectedUserIds.push(account.userId);
    }

    return affectedUserIds;
  }
}
