import { Events, type Client } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  logger.info('Ready', `Logged in as ${client.user?.tag} (Shard ${client.shard?.ids.join(', ')})`);
}
