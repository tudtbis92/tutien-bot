import { Events, type Message } from 'discord.js';
import { tryAcquireCooldown } from '../cache/cooldown.js';
import { boss } from '../workers/pgBoss.js';
import { GAME_CONFIG } from '../constants/game.js';

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  // CORE-05: Immediate filters — no DB I/O, no async before these checks
  if (message.author.bot) return;
  if (!message.guildId) return; // DMs ignored — no guild context for activity tracking
  if (message.content.length < 10) return; // Content quality gate (see also Layer 3 in worker)

  // L1: Redis NX fast-path cooldown — atomic check-and-set in a single RTT
  // Returns true = allowed (lock acquired), false = on cooldown (silently drop)
  const allowed = await tryAcquireCooldown(
    message.author.id,
    message.channelId,
    GAME_CONFIG.MESSAGE_COOLDOWN_MS,
  );
  if (!allowed) return;

  // Fire-and-forget: NO await — boss.send() does a DB write (~5-20ms latency)
  // Awaiting here would block the gateway event loop at scale.
  // pg-boss queue absorbs load; stale jobs auto-expire after 120s.
  void boss!.send(
    'activity-queue',
    {
      type: 'message',
      userId: message.author.id,
      guildId: message.guildId,
      channelId: message.channelId,
      content: message.content,
      timestamp: Date.now(),
    },
    { expireInSeconds: 120 },
  );
}
