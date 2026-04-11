import { Client } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EventHandler {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void>;
}

export async function loadEvents(client: Client): Promise<void> {
  const eventsPath = join(__dirname, '../events');
  const files = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const filePath = join(eventsPath, file);
    const event = (await import(filePath)) as EventHandler;

    if (event.once) {
      client.once(event.name, (...args) => {
        event.execute(...args).catch((err: unknown) =>
          logger.error('EventLoader', `Unhandled error in event "${event.name}"`, err)
        );
      });
    } else {
      client.on(event.name, (...args) => {
        event.execute(...args).catch((err: unknown) =>
          logger.error('EventLoader', `Unhandled error in event "${event.name}"`, err)
        );
      });
    }

    logger.debug('EventLoader', `Loaded: ${file} (${event.once ? 'once' : 'on'})`);
  }

  logger.info('EventLoader', `Loaded ${files.length} events`);
}
