import { Client, Options, ClientOptions } from 'discord.js-selfbot-v13';
import { ProxyAgent } from 'proxy-agent';

interface BotConfig {
  id: string;
  token: string;
  proxy?: string;
}

interface WorkerMessage {
  type: string;
  payload?: BotConfig[] | string[];
}

class WorkerManager {
  private clients: Map<string, Client> = new Map();

  constructor() {}

  async startBots(bots: BotConfig[]) {
    for (const bot of bots) {
      if (this.clients.has(bot.id)) continue;

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
          // ws.agent uses the ProxyAgent instance
          clientOptions.ws = { agent: proxyAgent };
          // http.agent uses the proxy URL string per instructions
          // @ts-expect-error -- discord.js-selfbot-v13 typing expects something else but ProxyAgent works
          clientOptions.http = { agent: proxyAgent };
        }

        const client = new Client(clientOptions);

        client.once('ready', () => {
          this.sendStatus(bot.id, 'READY');
        });

        client.on('error', (err: Error) => {
          this.sendStatus(bot.id, 'ERROR', err.message);
        });

        client.on('disconnect', () => {
          this.sendStatus(bot.id, 'DISCONNECTED');
        });

        this.clients.set(bot.id, client);
        
        await client.login(bot.token);
      } catch (err) {
        const error = err as Error;
        this.sendStatus(bot.id, 'ERROR', error.message);
      }
    }
  }

  stopBots(botIds: string[]) {
    for (const id of botIds) {
      const client = this.clients.get(id);
      if (client) {
        client.destroy();
        this.clients.delete(id);
        this.sendStatus(id, 'STOPPED');
      }
    }
  }

  stopAll() {
    const entries = Array.from(this.clients.entries());
    for (const [id, client] of entries) {
      client.destroy();
      this.sendStatus(id, 'STOPPED');
    }
    this.clients.clear();
  }

  private sendStatus(botId: string, status: string, error?: string) {
    if (process.send) {
      process.send({ type: 'STATUS', botId, status, error });
    }
  }
}

const manager = new WorkerManager();

process.on('message', async (message: WorkerMessage) => {
  if (!message || typeof message !== 'object') return;

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
    default:
      console.warn(`Unknown message type: ${message.type}`);
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
