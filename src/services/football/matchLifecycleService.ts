import { eq, and, sql } from 'drizzle-orm';
import { REST, Routes } from 'discord.js';
import { db } from '../../db/client.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { users } from '../../db/schema/users.js';
import { footballBets } from '../../db/schema/footballBets.js';
import { type FootballMatch } from '../../db/schema/footballMatches.js';
import { predictionChannels } from '../../db/schema/predictionChannels.js';
import { footballAnnouncements } from '../../db/schema/footballAnnouncements.js';
import { buildPredictionEmbed, buildLiveScoreUpdate } from '../../ui/embeds/buildPredictionEmbed.js';
import { getT, type SupportedLocale } from '../../i18n/index.js';
import { redis } from '../../cache/redis.js';
import { PredictionImageService } from './predictionImageService.js';

const rest = new REST().setToken(config.DISCORD_TOKEN);

/**
 * Fetch and cache Guild locale to avoid rate limits
 */
async function getGuildLocale(guildId: string, restClient: REST): Promise<SupportedLocale> {
  const cacheKey = `guild:locale:${guildId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached as SupportedLocale;
  } catch (cacheErr) {
    logger.warn('MatchLifecycleService', `Failed to read guild locale cache for ${guildId}`, cacheErr);
  }

  try {
    const guild = (await restClient.get(Routes.guild(guildId))) as { preferred_locale: string };
    const locale: SupportedLocale = guild.preferred_locale.startsWith('vi') ? 'vi' : 
                                    guild.preferred_locale.startsWith('zh') ? 'zh-cn' : 'en';

    try {
      await redis.set(cacheKey, locale, 'EX', 3600); // Cache 1 hour
    } catch (cacheErr) {
      logger.warn('MatchLifecycleService', `Failed to write guild locale cache for ${guildId}`, cacheErr);
    }

    return locale;
  } catch (err) {
    logger.warn('MatchLifecycleService', `Failed to fetch guild info for locale detection ${guildId}, falling back to 'vi'`, err);
    return 'vi';
  }
}

interface DiscordErrorLike {
  status?: number;
  code?: number;
  message?: string;
}

function isChannelNotFoundError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as DiscordErrorLike;
    // 404: Not Found, 403: Forbidden (missing access)
    // 10003: Unknown Channel, 50001: Missing Access
    return e.status === 404 || e.status === 403 || e.code === 10003 || e.code === 50001;
  }
  return false;
}

function isMessageNotFoundError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as DiscordErrorLike;
    // 404: Not Found
    // 10008: Unknown Message
    return e.status === 404 || e.code === 10008;
  }
  return false;
}

async function handleChannelFailure(channelId: string, err: unknown): Promise<void> {
  if (isChannelNotFoundError(err)) {
    const key = `prediction:failed:channel:${channelId}`;
    try {
      const count = await redis.incr(key);
      await redis.expire(key, 86400); // 1 day expiry
      logger.warn('MatchLifecycleService', `Recorded channel failure for ${channelId}. Count: ${count}/3. Error: ${err instanceof Error ? err.message : String(err)}`);

      if (count >= 3) {
        logger.error('MatchLifecycleService', `Channel ${channelId} not found or inaccessible 3 times. Deleting from predictionChannels.`);
        await db.delete(predictionChannels).where(eq(predictionChannels.channelId, channelId));
        await redis.del(key);
      }
    } catch (redisErr) {
      logger.error('MatchLifecycleService', `Failed to handle channel failure for ${channelId}`, redisErr);
    }
  }
}

async function handleMessageFailure(ann: { id: number; channelId: string; messageId: string }, err: unknown): Promise<void> {
  if (isChannelNotFoundError(err)) {
    await handleChannelFailure(ann.channelId, err);
  } else if (isMessageNotFoundError(err)) {
    const key = `prediction:failed:message:${ann.messageId}`;
    try {
      const count = await redis.incr(key);
      await redis.expire(key, 86400); // 1 day expiry
      logger.warn('MatchLifecycleService', `Recorded message failure for ${ann.messageId} in channel ${ann.channelId}. Count: ${count}/3. Error: ${err instanceof Error ? err.message : String(err)}`);

      if (count >= 3) {
        logger.error('MatchLifecycleService', `Message ${ann.messageId} not found 3 times. Deleting announcement ID ${ann.id} from database.`);
        await db.delete(footballAnnouncements).where(eq(footballAnnouncements.id, ann.id));
        await redis.del(key);
      }
    } catch (redisErr) {
      logger.error('MatchLifecycleService', `Failed to handle message failure for ${ann.messageId}`, redisErr);
    }
  }
}

/**
 * Announcement / Embed helpers
 */

export async function postPredictionEmbed(match: FootballMatch): Promise<void> {
  // 1. Get already announced channel IDs for this match
  const announced = await db
    .select({ channelId: footballAnnouncements.channelId })
    .from(footballAnnouncements)
    .where(eq(footballAnnouncements.matchId, match.id));
  
  const announcedChannelIds = new Set(announced.map(a => a.channelId));

  // 2. Query globally enabled channels (league_id = 0, enabled = true)
  const globalChannels = await db
    .select()
    .from(predictionChannels)
    .where(
      and(
        eq(predictionChannels.leagueId, '0'),
        eq(predictionChannels.enabled, true)
      )
    );

  // Prefetch explicitly disabled channels for this specific league to avoid N+1 queries
  const explicitDisabled = await db
    .select({ channelId: predictionChannels.channelId })
    .from(predictionChannels)
    .where(
      and(
        eq(predictionChannels.leagueId, match.leagueId),
        eq(predictionChannels.enabled, false)
      )
    );
  const disabledChannelIds = new Set(explicitDisabled.map(r => r.channelId));

  const channelsToPost = new Set<string>();

  for (const ch of globalChannels) {
    if (announcedChannelIds.has(ch.channelId)) continue;
    if (disabledChannelIds.has(ch.channelId)) continue;
    channelsToPost.add(ch.channelId);
  }

  // 3. Also query explicitly enabled channels for this specific league
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
    if (announcedChannelIds.has(ch.channelId)) continue;
    channelsToPost.add(ch.channelId);
  }

  if (channelsToPost.size === 0) {
    return;
  }

  // OPTIMIZATION: Render the Canvas clash card ONCE for all channels to post!
  let imageBuffer: Buffer | null = null;
  try {
    const imageService = PredictionImageService.getInstance();
    imageBuffer = await imageService.getClashCardBuffer(match);
  } catch (imgErr) {
    logger.error('MatchLifecycleService', `Failed to pre-render clash card for match ${match.id}`, imgErr);
  }

  for (const channelId of channelsToPost) {
    try {
      const channel = (await rest.get(Routes.channel(channelId))) as { guild_id?: string };
      let locale: SupportedLocale = 'vi';

      if (channel.guild_id) {
        locale = await getGuildLocale(channel.guild_id, rest);
      }

      const t = getT(locale);
      const result = buildPredictionEmbed(match, undefined, t);

      const response: Record<string, unknown> = (await rest.post(Routes.channelMessages(channelId), {
        body: {
          embeds: result.embeds.map((e) => e.toJSON()),
          components: result.components.map((c) => c.toJSON()),
        },
        files: imageBuffer ? [{
          name: 'prediction.png',
          data: imageBuffer,
        }] : undefined,
      })) as Record<string, unknown>;

      const messageId = response?.id as string | undefined;
      if (messageId) {
        await db
          .insert(footballAnnouncements)
          .values({
            matchId: match.id,
            guildId: channel.guild_id,
            channelId,
            messageId,
          })
          .onConflictDoUpdate({
            target: [footballAnnouncements.matchId, footballAnnouncements.channelId],
            set: { messageId, updatedAt: new Date() }
          });
      }
    } catch (err: unknown) {
      logger.warn('MatchLifecycleService', `Failed to post prediction embed in channel ${channelId}`, err);
      await handleChannelFailure(channelId, err);
    }
  }
}

export async function updateLiveScoreEmbed(match: FootballMatch): Promise<void> {
  const announcements = await db
    .select()
    .from(footballAnnouncements)
    .where(eq(footballAnnouncements.matchId, match.id));

  if (announcements.length === 0) return;

  const isLiveOrFinished = match.status !== 'NS';

  // OPTIMIZATION: Render the Canvas clash card ONCE for all channels to update!
  let imageBuffer: Buffer | null = null;
  try {
    const imageService = PredictionImageService.getInstance();
    imageBuffer = await imageService.getClashCardBuffer(match);
  } catch (imgErr) {
    logger.error('MatchLifecycleService', `Failed to render live score clash card for match ${match.id}`, imgErr);
  }

  await Promise.allSettled(announcements.map(async (ann) => {
    try {
      let locale: SupportedLocale = 'vi';
      if (ann.guildId) {
        locale = await getGuildLocale(ann.guildId, rest);
      }

      const t = getT(locale);
      const embed = buildLiveScoreUpdate(match, undefined, t);

      await rest.patch(Routes.channelMessage(ann.channelId, ann.messageId), {
        body: {
          embeds: [embed.toJSON()],
          components: isLiveOrFinished ? [] : undefined,
        },
        files: imageBuffer ? [{
          name: 'prediction.png',
          data: imageBuffer,
        }] : undefined,
      });
    } catch (err: unknown) {
      logger.warn(
        'MatchLifecycleService',
        `Failed to update score embed for match ${match.id} (Channel: ${ann.channelId}, Msg: ${ann.messageId})`,
        err
      );
      await handleMessageFailure(ann, err);
    }
  }));
}

export async function updatePredictionEmbeds(match: FootballMatch): Promise<void> {
  const announcements = await db
    .select()
    .from(footballAnnouncements)
    .where(eq(footballAnnouncements.matchId, match.id));

  if (announcements.length === 0) return;

  // OPTIMIZATION: Render the Canvas clash card ONCE for all channels to update!
  let imageBuffer: Buffer | null = null;
  try {
    const imageService = PredictionImageService.getInstance();
    imageBuffer = await imageService.getClashCardBuffer(match);
  } catch (imgErr) {
    logger.error('MatchLifecycleService', `Failed to render updated clash card for match ${match.id}`, imgErr);
  }

  await Promise.allSettled(announcements.map(async (ann) => {
    try {
      let locale: SupportedLocale = 'vi';
      if (ann.guildId) {
        locale = await getGuildLocale(ann.guildId, rest);
      }

      const t = getT(locale);
      const result = buildPredictionEmbed(match, undefined, t);

      await rest.patch(Routes.channelMessage(ann.channelId, ann.messageId), {
        body: {
          embeds: result.embeds.map((e) => e.toJSON()),
          components: result.components.map((c) => c.toJSON()),
        },
        files: imageBuffer ? [{
          name: 'prediction.png',
          data: imageBuffer,
        }] : undefined,
      });
    } catch (err: unknown) {
      logger.warn(
        'MatchLifecycleService',
        `Failed to update prediction embed for match ${match.id} (Channel: ${ann.channelId}, Msg: ${ann.messageId})`,
        err
      );
      await handleMessageFailure(ann, err);
    }
  }));
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
          const totalGoals = homeScore + awayScore;

          let won = false;
          let isPush = false;

          if (bet.betType === 'result') {
            const actualResult = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
            won = (bet.prediction === actualResult);
          } else if (bet.betType === 'over_under') {
            const line = parseFloat(match.overUnderLine || '0');
            if (totalGoals > line) {
              won = (bet.prediction === 'over');
            } else if (totalGoals < line) {
              won = (bet.prediction === 'under');
            } else {
              isPush = true; // Refund if score exactly matches line
            }
          } else if (bet.betType === 'spread') {
            if (bet.prediction === 'home_spread') {
              const homeLine = parseFloat(match.homeSpreadLine || '0');
              const adjustedHome = homeScore + homeLine;
              if (adjustedHome > awayScore) {
                won = true;
              } else if (adjustedHome < awayScore) {
                won = false;
              } else {
                isPush = true;
              }
            } else if (bet.prediction === 'away_spread') {
              const awayLine = parseFloat(match.awaySpreadLine || '0');
              const adjustedAway = awayScore + awayLine;
              if (adjustedAway > homeScore) {
                won = true;
              } else if (adjustedAway < homeScore) {
                won = false;
              } else {
                isPush = true;
              }
            }
          }

          if (isPush) {
            // Push (Draw on handicap/line) -> Refund wager
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

            logger.info('MatchLifecycleService', `Pushed bet ${bet.id} for user ${bet.userId} (Score matches line)`);
          } else if (won) {
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

  // Clear cache for this match after resolution completes successfully
  try {
    PredictionImageService.getInstance().clearMatchCache(match.id);
  } catch (cacheErr) {
    logger.error('MatchLifecycleService', `Failed to clear match cache after resolution for match ${match.id}`, cacheErr);
  }
}
