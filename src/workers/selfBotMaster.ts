import { fork, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ShardingManager } from 'discord.js';
import { DEFAULT_FARMING_SETTINGS, type FarmingSettings } from '../types/farming.js';
import { db } from '../db/client.js';
import { farmingAccounts, proxies, farmingSubscriptions } from '../db/schema/farming.js';
import { eq } from 'drizzle-orm';
import { EncryptionService } from '../services/encryptionService.js';
import { logger } from '../utils/logger.js';
import { FarmingSubscriptionService } from '../services/farming/subscriptionService.js';
import { createFarmingChannelFromManager, getUserIdFromToken } from '../services/farming/channelService.js';

interface WorkerAssignment {
  worker: ChildProcess;
  botIds: Set<string>;
}

export class SelfBotMaster {
  private static instance: SelfBotMaster;
  private workers: Map<number, WorkerAssignment> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private nextWorkerId = 1;
  private readonly BATCH_SIZE = 100;
  private manager: ShardingManager | null = null;

  private constructor() {}

  public static getInstance(): SelfBotMaster {
    if (!SelfBotMaster.instance) {
      SelfBotMaster.instance = new SelfBotMaster();
    }
    return SelfBotMaster.instance;
  }

  public async start(manager: ShardingManager, pollIntervalMs = 5 * 60 * 1000) {
    this.manager = manager;
    logger.info('SelfBotMaster', 'Starting SelfBotMaster');
    await this.rebalance();

    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => {
        this.rebalance().catch(err => logger.error('SelfBotMaster', 'Error during rebalance', err));
      }, pollIntervalMs);
    }
  }

  public stop() {
    logger.info('SelfBotMaster', 'Stopping SelfBotMaster');
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    for (const [_id, assignment] of this.workers.entries()) {
      assignment.worker.kill('SIGTERM');
    }
    this.workers.clear();
  }

  public async loadOrUpdateAccount(_userId: string) {
    // We can call rebalance immediately or fetch just that account
    await this.rebalance();
  }

  public getWorkerCount() {
    return this.workers.size;
  }

  public getActiveBotCount() {
    let count = 0;
    for (const assignment of this.workers.values()) {
      count += assignment.botIds.size;
    }
    return count;
  }

  public async rebalance() {
    try {
      const activeAccounts = await db
        .select({
          account: farmingAccounts,
          proxy: proxies,
          subscription: farmingSubscriptions,
        })
        .from(farmingAccounts)
        .leftJoin(proxies, eq(farmingAccounts.proxyId, proxies.id))
        .leftJoin(farmingSubscriptions, eq(farmingAccounts.userId, farmingSubscriptions.userId))
        .where(eq(farmingAccounts.status, 'active'));
      
      const botsToStart: { id: string; token: string; proxy: string | undefined; workerId: number | null; channelId: string | null; settings: FarmingSettings | null }[] = [];

      for (const { account, proxy, subscription } of activeAccounts) {
        try {
          if (!subscription || subscription.planType === 'free') {
            continue;
          }

          if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) {
            continue;
          }

          const decryptedToken = EncryptionService.decrypt(
            account.encryptedToken,
            account.iv,
            account.tag,
            account.keyVersion
          );

          let userChannelId = account.channelId;
          if (!userChannelId && this.manager) {
            logger.info('SelfBotMaster', `Farming account for user ${account.userId} is missing channelId. Attempting to create channel...`);
            const selfBotId = getUserIdFromToken(decryptedToken);
            userChannelId = await createFarmingChannelFromManager(this.manager, String(account.userId), selfBotId);
            if (userChannelId) {
              logger.info('SelfBotMaster', `Successfully created farming channel ${userChannelId} for user ${account.userId}`);
              await db.update(farmingAccounts)
                .set({ channelId: userChannelId, updatedAt: new Date() })
                .where(eq(farmingAccounts.userId, account.userId));
            } else {
              logger.error('SelfBotMaster', `Failed to recreate farming channel for user ${account.userId}`);
            }
          }

          let finalSettings = account.settings as FarmingSettings | null;
          if (!finalSettings) {
            finalSettings = {
              ...DEFAULT_FARMING_SETTINGS,
              active: true,
              commands: {
                ...DEFAULT_FARMING_SETTINGS.commands,
                pray: {
                  enabled: subscription.planType === 'premium',
                  targetId: null,
                }
              }
            };
          } else {
            finalSettings.active = true;
          }

          if (subscription.planType !== 'premium') {
            finalSettings = FarmingSubscriptionService.sanitizeFarmingSettings(finalSettings, subscription.planType);
          }

          botsToStart.push({
            id: String(account.userId),
            token: decryptedToken,
            proxy: proxy?.url || account.proxyUrl || undefined,
            workerId: account.workerId,
            channelId: userChannelId,
            settings: finalSettings,
          });
        } catch (error) {
          logger.error('SelfBotMaster', `Failed to process bot for user ${account.userId}`, error);
        }
      }

      // In a more robust system, we would assign smartly.
      // For now, distribute bots into batches of BATCH_SIZE.
      const batches: { id: string, token: string, proxy: string | undefined, workerId: number | null, channelId: string | null, settings: FarmingSettings | null }[][] = [];
      for (let i = 0; i < botsToStart.length; i += this.BATCH_SIZE) {
        batches.push(botsToStart.slice(i, i + this.BATCH_SIZE));
      }

      // Ensure we have enough workers
      while (this.workers.size < batches.length) {
        this.spawnWorker();
      }

      // We might have more workers than needed, but for simplicity we keep them or kill them.
      // Let's re-assign cleanly: send STOP_BOTS to all workers for bots they shouldn't have?
      // Better: send START_BOTS with exactly the bots they should run.
      // The selfBotWorker starts bots that are in the array and ignores already running ones.
      
      let workerIdx = 0;
      const workerIds = Array.from(this.workers.keys());

      for (const batch of batches) {
        const workerId = workerIds[workerIdx];
        const assignment = this.workers.get(workerId)!;
        
        // Find bots that were in this worker but are no longer in the batch
        const newBotIds = new Set(batch.map(b => b.id));
        const botsToStop = Array.from(assignment.botIds).filter(id => !newBotIds.has(id));
        
        if (botsToStop.length > 0) {
          assignment.worker.send({
            type: 'STOP_BOTS',
            payload: botsToStop
          });
        }
        
        // Update assignment
        assignment.botIds = newBotIds;
        
        assignment.worker.send({
          type: 'START_BOTS',
          payload: batch
        });

        workerIdx++;
      }

      // For any extra workers, we can stop them or just let them be idle.
      for (let i = workerIdx; i < workerIds.length; i++) {
        const workerId = workerIds[i];
        const assignment = this.workers.get(workerId)!;
        assignment.worker.kill('SIGTERM');
        this.workers.delete(workerId);
      }

      logger.info('SelfBotMaster', `Rebalance complete. ${this.workers.size} workers running ${botsToStart.length} bots.`);
    } catch (err) {
      logger.error('SelfBotMaster', 'Failed to fetch active accounts', err);
    }
  }

  private spawnWorker() {
    const isTS = import.meta.url.endsWith('.ts');
    // eslint-disable-next-line i18next/no-literal-string
    const workerFile = isTS ? './selfBotWorker.ts' : './selfBotWorker.js';
    const workerPath = fileURLToPath(new URL(workerFile, import.meta.url));
    
    // We need to use tsx if running in TS mode
    // eslint-disable-next-line i18next/no-literal-string
    const execArgv = isTS ? ['--import', 'tsx'] : [];
    
    const worker = fork(workerPath, [], { execArgv });
    const workerId = this.nextWorkerId++;

    this.workers.set(workerId, {
      worker,
      botIds: new Set()
    });

    worker.on('message', async (message: { type: string, botId: string, discordId?: string, status: string, error?: string }) => {
      if (message && message.type === 'STATUS') {
        await this.handleWorkerStatus(message);
      }
    });

    worker.on('exit', (code) => {
      logger.warn('SelfBotMaster', `Worker ${workerId} exited with code ${code}`);
      this.workers.delete(workerId);
      
      // If we still have bots assigned to this worker, they will be picked up on next rebalance.
      // Trigger a rebalance to redistribute.
      this.rebalance().catch(err => logger.error('SelfBotMaster', 'Error redistributing bots after crash', err));
    });

    return worker;
  }

  private async handleWorkerStatus(message: { botId: string, discordId?: string, status: string, error?: string }) {
    const { botId, discordId, status, error } = message;
    
    if (status === 'CAPTCHA_DETECTED') {
      logger.warn('SelfBotMaster', `Bot ${botId} (Discord ID: ${discordId}) detected CAPTCHA!`);
      try {
        await db.update(farmingAccounts)
          .set({ status: 'captcha_waiting' })
          .where(eq(farmingAccounts.userId, parseInt(botId, 10)));
          
        if (this.manager && discordId) {
          this.manager.broadcast({ type: 'NOTIFY_CAPTCHA', userId: discordId });
        }
      } catch (dbErr) {
        logger.error('SelfBotMaster', `Failed to update bot ${botId} status to captcha_waiting`, dbErr);
      }
    } else if (status === 'ERROR' || status === 'DISCONNECTED') {
      logger.warn('SelfBotMaster', `Bot ${botId} status: ${status}. Error: ${error}`);
      try {
        await db.update(farmingAccounts)
          .set({ status: 'stopped' })
          .where(eq(farmingAccounts.userId, parseInt(botId, 10)));
      } catch (dbErr) {
        logger.error('SelfBotMaster', `Failed to update bot ${botId} status in DB`, dbErr);
      }
    }
  }
}
