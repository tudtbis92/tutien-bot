import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { initI18n } from './i18n/index.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { logger } from './utils/logger.js';
import { initPgBossForShard } from './workers/pgBoss.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // PRIVILEGED INTENT: MessageContent required to read message.content in messageCreate.
    // Must also be enabled in Discord Developer Portal → Bot → Privileged Gateway Intents.
    // Without this, message.content is always empty string and tu vi accumulation fails.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

async function main(): Promise<void> {
  // i18next init — must complete before any command runs
  // Each shard is a separate process with its own i18next instance
  await initI18n();

  // Initialize pg-boss in send-only mode BEFORE loading events.
  // Event handlers (messageCreate, voiceStateUpdate, etc.) import `boss` from pgBoss.ts
  // and call boss.send() fire-and-forget. Must be initialized before events fire.
  // Workers and cron schedules are registered ONLY in bot.ts (ShardingManager) — never here.
  await initPgBossForShard();

  // Load all commands from dist/commands/**/*.js into client.commands Collection
  // Registration with Discord API is NOT done here — bot.ts handles that once
  await loadCommands(client);

  // Load all event handlers from dist/events/*.js
  await loadEvents(client);

  await client.login(config.DISCORD_TOKEN);
}

main().catch((err) => {
  logger.error('Shard', 'Fatal error during startup', err);
  process.exit(1);
});
