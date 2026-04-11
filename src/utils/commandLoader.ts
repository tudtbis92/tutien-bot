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
 * Returns absolute paths to all compiled command files under commandsPath.
 * Traverses one level of category subdirectories and collects *.js files.
 */
export function collectCommandFilePaths(commandsPath: string): string[] {
  const folders = readdirSync(commandsPath).filter((item) =>
    statSync(join(commandsPath, item)).isDirectory(),
  );
  return folders.flatMap((folder) => {
    const folderPath = join(commandsPath, folder);
    return readdirSync(folderPath)
      .filter((f) => f.endsWith('.js'))
      .map((f) => join(folderPath, f));
  });
}

/**
 * Load all command modules into client.commands Collection for runtime dispatch.
 * This does NOT register commands with Discord — see registerCommands.ts for that.
 * Called in each shard process on startup.
 */
export async function loadCommands(client: Client): Promise<void> {
  client.commands = new Collection();
  const commandsPath = join(__dirname, '../commands');

  for (const filePath of collectCommandFilePaths(commandsPath)) {
    const command = (await import(filePath)) as Command;
    const relPath = filePath.replace(commandsPath + '/', '');

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.debug('CommandLoader', `Loaded: ${relPath}`);
    } else {
      logger.warn('CommandLoader', `Skipping ${relPath} — missing data or execute export`);
    }
  }

  logger.info('CommandLoader', `Loaded ${client.commands.size} commands`);
}
