import { Events, type MessageReaction, type User, type PartialMessageReaction, type PartialUser } from 'discord.js';
import { tryAcquireCooldown } from '../cache/cooldown.js';
import { boss } from '../workers/pgBoss.js';
import { GAME_CONFIG } from '../constants/game.js';

export const name = Events.MessageReactionAdd;

export async function execute(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  // Fetch partial reaction to get full data (including message author)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      // Failed to fetch — skip silently (message may have been deleted)
      return;
    }
  }

  // Filter: bot reactions ignored (don't award tu vi to bots)
  if (user.bot) return;

  // Filter: reactions on bot's own messages (prevents self-reaction farming loop)
  if (reaction.message.author?.id === reaction.client.user?.id) return;

  // Filter: DMs / no guild context
  const guildId = reaction.message.guildId;
  if (!guildId) return;

  // Filter: partial user — need user ID for cooldown key
  const userId = user.id;
  const channelId = reaction.message.channelId;

  // L1: Redis NX fast-path cooldown
  const allowed = await tryAcquireCooldown(userId, channelId, GAME_CONFIG.REACTION_COOLDOWN_MS);
  if (!allowed) return;

  // Fire-and-forget: no await
  void boss!.send(
    'activity-queue',
    {
      type: 'reaction',
      userId,
      guildId,
      channelId,
      timestamp: Date.now(),
    },
    { expireInSeconds: 120 },
  );
}
