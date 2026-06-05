/* eslint-disable i18next/no-literal-string, @typescript-eslint/no-explicit-any */
import { Client, Options, ClientOptions, TextChannel } from 'discord.js-selfbot-v13';
import { ProxyAgent } from 'proxy-agent';
import type { FarmingSettings } from '../types/farming.js';
import { DEFAULT_FARMING_SETTINGS, OWO_BOT_ID } from '../types/farming.js';
import { SOCIAL_CHATTER_PHRASES } from '../constants/chatter.js';

interface BotConfig {
  id: string;
  token: string;
  proxy?: string;
  channelId?: string | null;
  settings?: FarmingSettings | null;
}

interface WorkerMessage {
  type: string;
  payload?: BotConfig[] | string[];
}

export class FarmingLoop {
  private client: Client;
  private settings: FarmingSettings;
  private channelId: string | null;
  private isCommandInProgress: boolean = false;
  private isSleeping: boolean = false;
  private isStopped: boolean = false;
  
  private huntBattleTimer: NodeJS.Timeout | null = null;
  private prayCurseTimer: NodeJS.Timeout | null = null;
  private sleepTimer: NodeJS.Timeout | null = null;
  private chatterTimer: NodeJS.Timeout | null = null;
  private moneyTimer: NodeJS.Timeout | null = null;
  private teamRotateTimer: NodeJS.Timeout | null = null;
  private checklistTimer: NodeJS.Timeout | null = null;
  private economyTimer: NodeJS.Timeout | null = null;
  private inventoryTimer: NodeJS.Timeout | null = null;

  constructor(client: Client, settings: FarmingSettings | null, channelId: string | null) {
    this.client = client;
    this.settings = settings || DEFAULT_FARMING_SETTINGS;
    this.channelId = channelId;
    
    this.client.on('messageCreate', this.handleMessage.bind(this));
  }

  start() {
    this.isStopped = false;
    if (!this.settings.active || !this.channelId) {
      return; // Farming is disabled or channel not set
    }

    this.runHuntBattleLoop();
    
    if (this.settings.commands.pray?.enabled || this.settings.commands.curse?.enabled) {
      this.runPrayCurseLoop();
    }
    
    if (this.settings.antiBan?.periodicSleep) {
      this.scheduleSleep();
    }
    
    if (this.settings.antiBan?.socialChatter) {
      this.scheduleChatter();
      this.scheduleTeamRotate();
    }
    
    if (this.settings.moneyTransfer?.enabled) {
      this.scheduleMoneyTransfer();
    }
    
    this.scheduleChecklist();
    this.scheduleEconomy();
    this.scheduleInventory();
  }

  stop() {
    this.isStopped = true;
    if (this.huntBattleTimer) clearTimeout(this.huntBattleTimer);
    if (this.prayCurseTimer) clearTimeout(this.prayCurseTimer);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.chatterTimer) clearTimeout(this.chatterTimer);
    if (this.moneyTimer) clearTimeout(this.moneyTimer);
    if (this.teamRotateTimer) clearTimeout(this.teamRotateTimer);
    if (this.checklistTimer) clearTimeout(this.checklistTimer);
    if (this.economyTimer) clearTimeout(this.economyTimer);
    if (this.inventoryTimer) clearTimeout(this.inventoryTimer);
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  }

  private async executeCommand(command: string) {
    if (this.isStopped || this.isSleeping || this.isCommandInProgress || !this.channelId) return;
    
    this.isCommandInProgress = true;
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (channel && channel.isText()) {
        await (channel as TextChannel).send(command);
        console.log(`[${this.client.user?.id}] Executing: ${command}`);
      }
    } catch (err) {
      console.error(`[${this.client.user?.id}] Failed to execute ${command}`, err);
    } finally {
      this.isCommandInProgress = false;
    }
  }

  private async runHuntBattleLoop() {
    if (this.isStopped) return;
    
    if (!this.isSleeping && !this.isCommandInProgress) {
      if (this.settings.commands.hunt) {
        await this.executeCommand('owo hunt');
      }
      
      await new Promise(resolve => setTimeout(resolve, this.getRandomDelay(2, 5)));
      
      if (!this.isStopped && !this.isSleeping && this.settings.commands.battle) {
        await this.executeCommand('owo battle');
      }
    }
    
    const delay = this.getRandomDelay(this.settings.delays.minSeconds, this.settings.delays.maxSeconds);
    this.huntBattleTimer = setTimeout(() => this.runHuntBattleLoop(), delay);
  }

  private async runPrayCurseLoop() {
    if (this.isStopped) return;
    
    if (!this.isSleeping && !this.isCommandInProgress) {
      const prayEnabled = this.settings.commands.pray?.enabled;
      const target = this.settings.commands.pray?.targetId ? ` <@${this.settings.commands.pray.targetId}>` : '';
      
      if (prayEnabled) {
        await this.executeCommand(`owo pray${target}`);
      }
    }
    
    const delay = 5 * 60 * 1000 + this.getRandomDelay(10, 30);
    this.prayCurseTimer = setTimeout(() => this.runPrayCurseLoop(), delay);
  }
  
  private scheduleSleep() {
    if (this.isStopped) return;
    
    const nextSleepIn = this.getRandomDelay(60 * 60, 2 * 60 * 60);
    this.sleepTimer = setTimeout(() => {
      this.isSleeping = true;
      const sleepDuration = this.getRandomDelay(5 * 60, 15 * 60);
      console.log(`[${this.client.user?.id}] Entering periodic sleep for ${Math.round(sleepDuration/60000)}m`);
      
      setTimeout(() => {
        this.isSleeping = false;
        console.log(`[${this.client.user?.id}] Woke up from periodic sleep`);
        this.scheduleSleep();
      }, sleepDuration);
      
    }, nextSleepIn);
  }

  private scheduleChatter() {
    if (this.isStopped) return;
    
    const nextChatterIn = this.getRandomDelay(30 * 60, 90 * 60);
    this.chatterTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress) {
        const phrase = SOCIAL_CHATTER_PHRASES[Math.floor(Math.random() * SOCIAL_CHATTER_PHRASES.length)];
        await this.executeCommand(phrase);
      }
      this.scheduleChatter();
    }, nextChatterIn);
  }
  
  private scheduleTeamRotate() {
    if (this.isStopped) return;
    
    const nextRotateIn = this.getRandomDelay(30 * 60, 60 * 60);
    this.teamRotateTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress) {
        const team = Math.random() > 0.5 ? 1 : 2;
        await this.executeCommand(`owo setteam ${team}`);
      }
      this.scheduleTeamRotate();
    }, nextRotateIn);
  }

  private scheduleMoneyTransfer() {
    if (this.isStopped) return;
    
    const nextCheckIn = this.getRandomDelay(30 * 60, 60 * 60);
    this.moneyTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress && this.settings.moneyTransfer?.enabled) {
        await this.executeCommand(`owo cash`);
      }
      this.scheduleMoneyTransfer();
    }, nextCheckIn);
  }

  private scheduleChecklist() {
    if (this.isStopped) return;
    const nextCheckIn = 6 * 60 * 60 * 1000 + this.getRandomDelay(10, 60);
    this.checklistTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress) {
        await this.executeCommand('owo checklist');
      }
      this.scheduleChecklist();
    }, nextCheckIn);
  }

  private scheduleEconomy() {
    if (this.isStopped) return;
    const nextCheckIn = 2 * 60 * 60 * 1000 + this.getRandomDelay(10, 60);
    this.economyTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress) {
        // Sacrifice
        if (this.settings.economy?.sacrificeRanks) {
          for (const rank of this.settings.economy.sacrificeRanks) {
            await this.executeCommand(`owo sacrifice ${rank} all`);
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        
        // Huntbot
        if (this.settings.economy?.autoUpgradeHuntbot) {
          await this.executeCommand('owo hb buy');
          await new Promise(r => setTimeout(r, 2000));
          await this.executeCommand('owo hb collect');
          await new Promise(r => setTimeout(r, 2000));
          await this.executeCommand('owo hb refill');
          
          if (this.settings.economy.upgradePriority?.length > 0) {
            const trait = this.settings.economy.upgradePriority[0];
            await new Promise(r => setTimeout(r, 2000));
            await this.executeCommand(`owo upgrade hb ${trait}`);
          }
        }
      }
      this.scheduleEconomy();
    }, nextCheckIn);
  }

  private scheduleInventory() {
    if (this.isStopped) return;
    const nextCheckIn = 60 * 60 * 1000 + this.getRandomDelay(10, 60);
    this.inventoryTimer = setTimeout(async () => {
      if (!this.isSleeping && !this.isCommandInProgress && this.settings.autoGem?.enabled) {
        await this.executeCommand('owo inv');
      }
      this.scheduleInventory();
    }, nextCheckIn);
  }

  private async handleMessage(message: any) {
    if (this.isStopped || message.author.id !== OWO_BOT_ID) return;

    const content = message.content.toLowerCase();
    
    // CAPTCHA DETECTION
    let isCaptcha = false;
    if (content.includes('are you a human') || content.includes('solve the captcha') || content.includes('verify you are human') || content.includes('owobot.com/captcha')) {
      isCaptcha = true;
    }
    
    if (message.embeds.length > 0) {
      const title = message.embeds[0].title?.toLowerCase() || '';
      const desc = message.embeds[0].description?.toLowerCase() || '';
      const url = message.embeds[0].url?.toLowerCase() || '';
      
      if (title.includes('captcha') || desc.includes('captcha') || url.includes('owobot.com/captcha')) {
        isCaptcha = true;
      }
    }
    
    // Discord.js v13 attachments is a Collection
    if (message.attachments && message.attachments.size > 0) {
      // Check if attachment filename contains captcha or similar indicators
      const hasCaptchaAttachment = message.attachments.some((att: any) => 
        att.name?.toLowerCase().includes('captcha') || 
        (message.channel.type === 'DM' && att.contentType?.startsWith('image/'))
      );
      if (hasCaptchaAttachment) isCaptcha = true;
    }

    if (isCaptcha) {
      console.warn(`[${this.client.user?.id}] CAPTCHA DETECTED! Stopping loops.`);
      this.stop();
      if (process.send) {
        process.send({ type: 'STATUS', botId: this.client.user?.id, status: 'CAPTCHA_DETECTED' });
      }
      this.client.destroy();
      return;
    }

    // After captcha check, ignore if not in configured channel
    if (message.channel.id !== this.channelId) return;
    
    // Cowoncy balance parsing for money transfer
    const cashRegex = /you(?: currently)? have (?:__)?\*\*?([\d,]+)\*\*?(?:__)? cowoncy/i;
    const cashMatch = message.content.match(cashRegex);
    if (cashMatch) {
      const balance = parseInt(cashMatch[1].replace(/,/g, ''), 10);
      const mt = this.settings.moneyTransfer;
      if (mt?.enabled && mt.mainAccountId && balance >= mt.threshold) {
        const reserve = 1000;
        const amountToGive = balance - reserve;
        if (amountToGive >= 1000) {
          console.log(`[${this.client.user?.id}] Transferring ${amountToGive} cowoncy to main account ${mt.mainAccountId}`);
          await this.executeCommand(`owo give <@${mt.mainAccountId}> ${amountToGive}`);
        }
      }
    }

    if (content.includes('gem') && content.includes('broke')) {
      console.log(`[${this.client.user?.id}] Gem broken detected, checking inventory`);
      await this.executeCommand('owo inv');
    }

    if (message.embeds.length > 0) {
      const title = message.embeds[0].title?.toLowerCase() || '';
      const desc = message.embeds[0].description?.toLowerCase() || '';
      const author = message.embeds[0].author?.name?.toLowerCase() || '';
      
      if (author.includes('checklist') || title.includes('checklist')) {
        if (desc.includes('❌') && desc.includes('daily')) {
          await this.executeCommand('owo daily');
        }
      }
      
      if (author.includes('inventory') || title.includes('inventory')) {
        if (this.settings.autoGem?.enabled) {
          // Simple ID extraction: looking for common gem ids
          const gemRegex = /`(5[0-9]{1,2}|6[0-9]{1,2}|7[0-9]{1,2})`/g;
          const matches = [...desc.matchAll(gemRegex)];
          if (matches.length > 0) {
            const gemIds = matches.slice(0, 3).map(m => m[1]);
            await this.executeCommand(`owo use ${gemIds.join(' ')}`);
          }
        }
      }
    }
  }
}

export class WorkerManager {
  private clients: Map<string, Client> = new Map();
  private loops: Map<string, FarmingLoop> = new Map();
  private runningConfigs: Map<string, BotConfig> = new Map();

  constructor() {}

  async startBots(bots: BotConfig[]) {
    for (const bot of bots) {
      const existingConfig = this.runningConfigs.get(bot.id);
      
      if (existingConfig) {
        const isSameChannel = existingConfig.channelId === bot.channelId;
        const isSameProxy = existingConfig.proxy === bot.proxy;
        const isSameSettings = JSON.stringify(existingConfig.settings) === JSON.stringify(bot.settings);
        const isSameToken = existingConfig.token === bot.token;

        if (isSameChannel && isSameProxy && isSameSettings && isSameToken) {
          continue; // Nothing changed
        } else {
          console.log(`[Worker] Bot ${bot.id} config changed, restarting...`);
          this.stopBots([bot.id]);
        }
      }

      this.runningConfigs.set(bot.id, bot);

      try {
        const clientOptions: ClientOptions = {
          makeCache: Options.cacheWithLimits({
            MessageManager: 0,
            GuildMemberManager: 0,
            UserManager: 0,
            PresenceManager: 0,
            ReactionManager: 0,
            ReactionUserManager: 0,
            VoiceStateManager: 0,
            ThreadManager: 0,
            ThreadMemberManager: 0
          })
        };

        if (bot.proxy) {
          const proxyAgent = new ProxyAgent({ getProxyForUrl: () => bot.proxy! });
          clientOptions.ws = { agent: proxyAgent };
          // @ts-expect-error -- discord.js-selfbot-v13 typing expects something else but ProxyAgent works
          clientOptions.http = { agent: proxyAgent };
        }

        const client = new Client(clientOptions);

        client.once('ready', () => {
          this.sendStatus(bot.id, 'READY');
          
          const loop = new FarmingLoop(client, bot.settings || null, bot.channelId || null);
          this.loops.set(bot.id, loop);
          loop.start();
        });

        client.on('error', (err: Error) => {
          this.sendStatus(bot.id, 'ERROR', err.message);
        });

        client.on('disconnect', () => {
          this.sendStatus(bot.id, 'DISCONNECTED');
          this.stopLoop(bot.id);
        });

        this.clients.set(bot.id, client);
        
        await client.login(bot.token);
      } catch (err) {
        const error = err as Error;
        this.sendStatus(bot.id, 'ERROR', error.message);
      }
    }
  }

  private stopLoop(id: string) {
    const loop = this.loops.get(id);
    if (loop) {
      loop.stop();
      this.loops.delete(id);
    }
  }

  stopBots(botIds: string[]) {
    for (const id of botIds) {
      this.stopLoop(id);
      
      const client = this.clients.get(id);
      if (client) {
        client.destroy();
        this.clients.delete(id);
        this.runningConfigs.delete(id);
        this.sendStatus(id, 'STOPPED');
      }
    }
  }

  stopAll() {
    const entries = Array.from(this.clients.entries());
    for (const [id, client] of entries) {
      this.stopLoop(id);
      client.destroy();
      this.sendStatus(id, 'STOPPED');
    }
    this.clients.clear();
    this.runningConfigs.clear();
  }

  private sendStatus(botId: string, status: string, error?: string) {
    if (process.send) {
      process.send({ type: 'STATUS', botId, status, error });
    }
  }
}

const manager = new WorkerManager();

process.on('message', async (message: WorkerMessage) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return;

  switch (message.type) {
    case 'START_BOTS':
      if (Array.isArray(message.payload)) {
        await manager.startBots(message.payload as BotConfig[]);
      }
      break;
    case 'STOP_BOTS':
      if (Array.isArray(message.payload)) {
        manager.stopBots(message.payload as string[]);
      }
      break;
  }
});

process.on('SIGTERM', () => {
  manager.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  manager.stopAll();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  process.on('disconnect', () => {
    console.log('[Worker] IPC channel disconnected (parent process exited). Exiting worker process...');
    try {
      manager.stopAll();
    } catch {
      // Ignore error
    }
    process.exit(0);
  });
}
