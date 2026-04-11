import { REST, Routes } from 'discord.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { logger } from './logger.js';
import { collectCommandFilePaths } from './commandLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Register all slash commands with Discord's global application commands API.
 * Called ONCE from bot.ts (ShardingManager process) on startup.
 *
 * Uses PUT /applications/{id}/commands which is fully idempotent:
 * - Creates new commands not yet registered
 * - Updates changed command definitions
 * - Removes commands no longer in the list
 *
 * Rate limit: Discord allows ~200 global registrations/day per application.
 * Running in manager (not shards) ensures this is called exactly once per restart.
 */
export async function registerCommands(): Promise<void> {
  const commandsPath = join(__dirname, '../commands');
  const commandData: unknown[] = [];

  for (const filePath of collectCommandFilePaths(commandsPath)) {
    const command = (await import(filePath)) as { data?: { toJSON(): unknown } };
    if (command.data) {
      commandData.push(command.data.toJSON());
    }
  }

  const rest = new REST().setToken(config.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body: commandData });
  logger.info('RegisterCommands', `Registered ${commandData.length} global slash commands`);
}
