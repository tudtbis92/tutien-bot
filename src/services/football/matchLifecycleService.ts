import { eq, and, sql } from 'drizzle-orm';
import { REST, Routes } from 'discord.js';
import { db } from '../../db/client.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { users } from '../../db/schema/users.js';
import { footballMatches, type FootballMatch } from '../../db/schema/footballMatches.js';
import { footballBets } from '../../db/schema/footballBets.js';
import { predictionChannels } from '../../db/schema/predictionChannels.js';
import { buildPredictionEmbed, buildLiveScoreUpdate } from '../../ui/embeds/buildPredictionEmbed.js';

const rest = new REST().setToken(config.DISCORD_TOKEN);

/**
 * Announcement / Embed helpers
 */

export async function postPredictionEmbed(match: FootballMatch): Promise<void> {
  // Query globally enabled channels (league_id = 0, enabled = true)
  const globalChannels = await db
    .select()
    .from(predictionChannels)
    .where(
      and(
        eq(predictionChannels.leagueId, 0),
        eq(predictionChannels.enabled, true)
      )
    );

  const channelsToPost = new Set<string>();

  for (const ch of globalChannels) {
    // Check if there is an explicit disable record for this channel and this league
    const explicitRows = await db
      .select()
      .from(predictionChannels)
      .where(
        and(
          eq(predictionChannels.channelId, ch.channelId),
          eq(predictionChannels.leagueId, match.leagueId)
        )
      )
      .limit(1);

    if (explicitRows.length > 0 && explicitRows[0].enabled === false) {
      // Explicitly disabled for this league in this channel
      continue;
    }
    channelsToPost.add(ch.channelId);
  }

  // Also query explicitly enabled channels for this specific league
  const explicitEnabled = await db
    .select()
    .from(predictionChannels)
    .where(
      and(
        eq(predictionChannels.leagueId, match.leagueId),
        eq(predictionChannels.enabled, true)
      )
    );

  for (const ch of explicitEnabled) {
    channelsToPost.add(ch.channelId);
  }

  if (channelsToPost.size === 0) {
    logger.info('MatchLifecycleService', `No active prediction channels configured for match ${match.id} (League: ${match.leagueName})`);
    return;
  }

  const result = buildPredictionEmbed(match);

  for (const channelId of channelsToPost) {
    try {
      const response: Record<string, unknown> = (await rest.post(Routes.channelMessages(channelId), {
        body: {
          embeds: result.embeds.map((e) => e.toJSON()),
          components: result.components.map((c) => c.toJSON()),
        },
      })) as Record<string, unknown>;

      const messageId = response?.id as string | undefined;
      if (messageId) {
        // Save the last successful announcement message details to the match
        await db
          .update(footballMatches)
          .set({
            announcementChannelId: channelId,
            announcementMessageId: messageId,
          })
          .where(eq(footballMatches.id, match.id));
      }
    } catch (err: unknown) {
      logger.warn('MatchLifecycleService', `Failed to post prediction embed in channel ${channelId}`, err);
    }
  }
}

export async function updateLiveScoreEmbed(match: FootballMatch): Promise<void> {
  if (!match.announcementChannelId || !match.announcementMessageId) {
    return;
  }

  const embed = buildLiveScoreUpdate(match);

  try {
    // For live/finished matches, clear the prediction dropdown and buttons
    const isLiveOrFinished = match.status !== 'NS';
    await rest.patch(Routes.channelMessage(match.announcementChannelId, match.announcementMessageId), {
      body: {
        embeds: [embed.toJSON()],
        components: isLiveOrFinished ? [] : undefined,
      },
    });
  } catch (err: unknown) {
    logger.warn(
      'MatchLifecycleService',
      `Failed to update score embed for match ${match.id} (Channel: ${match.announcementChannelId}, Msg: ${match.announcementMessageId})`,
      err
    );
  }
}

/**
 * Bets resolution core transaction
 */
export async function resolveMatchBets(match: FootballMatch, txDb: typeof db = db): Promise<void> {
  await txDb.transaction(async (tx) => {
    // Lock pending bets for this match to prevent race conditions
    const pendingBets = await tx
      .select()
      .from(footballBets)
      .where(
        and(
          eq(footballBets.fixtureId, match.id),
          eq(footballBets.status, 'pending')
        )
      )
      .for('update', { skipLocked: true });

    if (pendingBets.length === 0) {
      return;
    }

    const isVoid = ['PST', 'CANC', 'ABD', 'INT', 'SUSP'].includes(match.status);

    for (const bet of pendingBets) {
      try {
        if (isVoid) {
          // Refund the wager amount back to user's wallet
          await tx
            .update(users)
            .set({ balance: sql`${users.balance} + ${bet.wagerAmount}` })
            .where(eq(users.id, bet.userId));

          await tx
            .update(footballBets)
            .set({
              status: 'void',
              resolvedAt: new Date(),
            })
            .where(eq(footballBets.id, bet.id));

          logger.info('MatchLifecycleService', `Voided bet ${bet.id} for user ${bet.userId} (Match void status: ${match.status})`);
        } else {
          const homeScore = match.homeScore ?? 0;
          const awayScore = match.awayScore ?? 0;
          const actualResult = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
          const actualScore = `${homeScore}-${awayScore}`;

          let won = false;
          if (bet.betType === 'result' && bet.prediction === actualResult) {
            won = true;
          } else if (bet.betType === 'score' && bet.prediction === actualScore) {
            won = true;
          }

          if (won) {
            const payout = bet.potentialPayout ?? 0n;
            await tx
              .update(users)
              .set({ balance: sql`${users.balance} + ${payout}` })
              .where(eq(users.id, bet.userId));

            await tx
              .update(footballBets)
              .set({
                status: 'won',
                resolvedAt: new Date(),
              })
              .where(eq(footballBets.id, bet.id));

            logger.info('MatchLifecycleService', `Resolved bet ${bet.id} as WON for user ${bet.userId}. Paid out ${payout} linh thạch.`);
          } else {
            await tx
              .update(footballBets)
              .set({
                status: 'lost',
                resolvedAt: new Date(),
              })
              .where(eq(footballBets.id, bet.id));

            logger.info('MatchLifecycleService', `Resolved bet ${bet.id} as LOST for user ${bet.userId}.`);
          }
        }
      } catch (betErr) {
        logger.error('MatchLifecycleService', `Error resolving bet ${bet.id}`, betErr);
      }
    }
  });
}
