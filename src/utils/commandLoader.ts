import { Client, Collection } from 'discord.js';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Command {
  data: { name: string; toJSON(): unknown };
  execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Load all command modules into client.commands Collection for runtime dispatch.
 * This does NOT register commands with Discord — see registerCommands.ts for that.
 * Called in each shard process on startup.
 */
export async function loadCommands(client: Client): Promise<void> {
  client.commands = new Collection();
  const commandsPath = join(__dirname, '../commands');

  // Recurse into category subdirectories (D-03)
  const folders = readdirSync(commandsPath).filter((item) =>
    statSync(join(commandsPath, item)).isDirectory(),
  );

  for (const folder of folders) {
    const folderPath = join(commandsPath, folder);
    const files = readdirSync(folderPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const filePath = join(folderPath, file);
      const command = (await import(filePath)) as Command;

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.debug('CommandLoader', `Loaded: ${folder}/${file}`);
      } else {
        logger.warn('CommandLoader', `Skipping ${folder}/${file} — missing data or execute export`);
      }
    }
  }

  logger.info('CommandLoader', `Loaded ${client.commands.size} commands`);
}
