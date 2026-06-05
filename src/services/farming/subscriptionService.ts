import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { farmingSubscriptions } from '../../db/schema/farming.js';
import { eq, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { FarmingSettings } from '../../types/farming.js';

dayjs.extend(utc);

export class FarmingSubscriptionService {
  /**
   * Calculate upgrade fee based on remaining days.
   * Basic to Premium upgrade fee is 10k per remaining day (approximated here as 1000 per day for diff).
   * Wait, the plan says: "Returns `BigInt(daysLeft * 1000)` where `daysLeft` is `Math.ceil(diff in days)`."
   * So we use `BigInt(daysLeft * 1000)`.
   */
  static calculateUpgradeFee(expiresAt: Date | null | undefined): bigint {
    if (!expiresAt) return 0n;
    
    const now = dayjs.utc();
    const expiry = dayjs.utc(expiresAt);
    const diffMs = expiry.diff(now);
    
    if (diffMs <= 0) {
      throw new Error('PLAN_EXPIRED');
    }
    
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return BigInt(daysLeft * 1000);
  }

  /**
   * Purchase a subscription plan.
   * Price: 7D=10k, 30D Basic=35k, 30D VIP=50k.
   */
  static async purchasePlan(userId: number, planType: 'free' | 'basic' | 'premium', durationDays: number): Promise<Date> {
    let price = 0n;
    
    if (planType === 'basic') {
      if (durationDays === 7) price = 10000n;
      else if (durationDays === 30) price = 35000n;
      else throw new Error('INVALID_DURATION');
    } else if (planType === 'premium') {
      if (durationDays === 30) price = 50000n;
      else throw new Error('INVALID_DURATION'); // Note: Plan says 30D VIP=50k. Assuming 7D VIP doesn't exist or has different price, but let's stick to spec.
    }

    const expiresAt = dayjs.utc().add(durationDays, 'day').toDate();

    return await db.transaction(async (tx) => {
      if (price > 0n) {
        const updateResult = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} - ${price}`
          })
          .where(sql`${users.id} = ${userId} AND ${users.balance} >= ${price}`)
          .returning({ id: users.id });

        if (updateResult.length === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
      }

      await tx
        .insert(farmingSubscriptions)
        .values({
          userId,
          planType,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [farmingSubscriptions.userId],
          set: {
            planType,
            expiresAt,
            updatedAt: new Date()
          }
        });

      return expiresAt;
    });
  }

  /**
   * Upgrade an active basic plan to VIP (premium).
   */
  static async upgradePlan(userId: number): Promise<Date> {
    return await db.transaction(async (tx) => {
      const [currentSub] = await tx
        .select()
        .from(farmingSubscriptions)
        .where(eq(farmingSubscriptions.userId, userId))
        .for('update');
        
      if (!currentSub || currentSub.planType !== 'basic' || !currentSub.expiresAt) {
        throw new Error('INVALID_UPGRADE_STATE');
      }

      const fee = this.calculateUpgradeFee(currentSub.expiresAt);

      if (fee > 0n) {
        const updateResult = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} - ${fee}`
          })
          .where(sql`${users.id} = ${userId} AND ${users.balance} >= ${fee}`)
          .returning({ id: users.id });

        if (updateResult.length === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
      }

      await tx
        .update(farmingSubscriptions)
        .set({
          planType: 'premium',
          updatedAt: new Date()
        })
        .where(eq(farmingSubscriptions.userId, userId));

      return currentSub.expiresAt;
    });
  }

  /**
   * Sanitize settings based on plan type.
   */
  static sanitizeFarmingSettings(settings: FarmingSettings, planType: 'free' | 'basic' | 'premium'): FarmingSettings {
    // Deep clone to avoid mutating the original object
    const sanitized = JSON.parse(JSON.stringify(settings)) as FarmingSettings;
    
    if (planType !== 'premium') {
      sanitized.commands.pray.enabled = false;
      sanitized.commands.curse.enabled = false;
      sanitized.commands.gamble.enabled = false;
      sanitized.economy.autoUpgradeHuntbot = false;
      sanitized.autoGem.enabled = false;
      sanitized.antiBan.socialChatter = false;
      sanitized.antiBan.periodicSleep = false;
      sanitized.moneyTransfer.enabled = false;
    }
    
    return sanitized;
  }
}
