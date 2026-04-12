import { Events, type VoiceState } from 'discord.js';
import { boss } from '../workers/pgBoss.js';

export const name = Events.VoiceStateUpdate;

export async function execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
  // VoiceState.id = user's snowflake (not channel ID)
  const userId = newState.id;
  const guildId = newState.guild.id;

  const wasInChannel = oldState.channelId !== null;
  const isInChannel = newState.channelId !== null;

  // JOIN: user was not in a channel, now is in a channel
  if (!wasInChannel && isInChannel) {
    void boss!.send(
      'activity-queue',
      {
        type: 'voice_join',
        userId,
        guildId,
        channelId: newState.channelId!,
        timestamp: Date.now(),
      },
      { expireInSeconds: 120 },
    );
  }

  // LEAVE: user was in a channel, now is not
  if (wasInChannel && !isInChannel) {
    void boss!.send(
      'activity-queue',
      {
        type: 'voice_leave',
        userId,
        guildId,
        channelId: oldState.channelId!,
        selfMute: newState.selfMute ?? false,
        selfDeaf: newState.selfDeaf ?? false,
        timestamp: Date.now(),
      },
      { expireInSeconds: 120 },
    );
  }

  // Mute/deafen state changes (not join/leave): no job needed — handled at award time by VoiceMinuteWorker
}
