import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { initI18n } from './i18n/index.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { logger } from './utils/logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // NOTE: MessageContent is a privileged intent — NOT requested here.
    // Phase 1 uses only slash commands; no message content processing.
    // Phase 2 will add this intent when implementing tu vi accumulation from messages.
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

async function main(): Promise<void> {
  // i18next init — must complete before any command runs
  // Each shard is a separate process with its own i18next instance
  await initI18n();

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
