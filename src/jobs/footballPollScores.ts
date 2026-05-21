import type { Job } from 'pg-boss';
import { eq, and, or, lt, gt, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { FootballApiClient } from '../services/football/apiClient.js';
import { updateLiveScoreEmbed, resolveMatchBets } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

export async function runFootballPollScores(job: Job): Promise<void> {
  logger.info('FootballPollScores', `Job started: ${job.id}`);
  
  const apiClient = new FootballApiClient();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Poll active matches + matches marked 'NS' that should have started
  const matchesToPoll = await db
    .select()
    .from(footballMatches)
    .where(
      or(
        and(
          inArray(footballMatches.status, ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']),
          gt(footballMatches.kickoffAt, twoHoursAgo)
        ),
        and(
          eq(footballMatches.status, 'NS'),
          lt(footballMatches.kickoffAt, now)
        )
      )
    );

  if (matchesToPoll.length === 0) {
    logger.info('FootballPollScores', 'No active or starting matches require live score polling at this time.');
    logger.info('FootballPollScores', `Job completed: ${job.id}`);
    return;
  }

  const fixtureIds = matchesToPoll.map((m) => m.fixtureId);
  logger.info('FootballPollScores', `Polling scores for ${fixtureIds.length} matches (Fixture IDs: ${fixtureIds.join(', ')})...`);

  try {
    // getFixtureScores automatically handles batching of max 20 per call
    const liveFixtures = await apiClient.getFixtureScores(fixtureIds, 0); // Bypass cache for live scores

    let updatedCount = 0;

    for (const fixture of liveFixtures) {
      try {
        const fixtureId = fixture.fixture.id;
        const newStatus = fixture.fixture.status.short || 'FT';
        const homeScore = fixture.goals.home;
        const awayScore = fixture.goals.away;

        const dbMatch = matchesToPoll.find((m) => m.fixtureId === fixtureId);
        if (!dbMatch) continue;

        // Skip updating if scores and status are identical to avoid unnecessary DB writes and Discord rate limits
        if (
          dbMatch.status === newStatus &&
          dbMatch.homeScore === homeScore &&
          dbMatch.awayScore === awayScore
        ) {
          continue;
        }

        // Update database match row
        const updatedRows = await db
          .update(footballMatches)
          .set({
            status: newStatus,
            homeScore: homeScore !== null ? Number(homeScore) : null,
            awayScore: awayScore !== null ? Number(awayScore) : null,
            updatedAt: new Date(),
          })
          .where(eq(footballMatches.fixtureId, fixtureId))
          .returning();

        if (updatedRows.length > 0) {
          updatedCount++;
          const updatedMatch = updatedRows[0];

          // Update the announcement embed with score line and live status
          await updateLiveScoreEmbed(updatedMatch);

          // If the match transitioned to finished, immediately resolve the wagers
          const finishedStatuses = ['FT', 'AET', 'PEN'];
          if (finishedStatuses.includes(newStatus)) {
            logger.info('FootballPollScores', `Match ${updatedMatch.id} (Fixture: ${fixtureId}) finished with status: ${newStatus}. Triggering wagers resolution...`);
            await resolveMatchBets(updatedMatch);
          }
        }
      } catch (fixtureErr: unknown) {
        const fixtureErrMsg = fixtureErr instanceof Error ? fixtureErr.message : String(fixtureErr);
        logger.error('FootballPollScores', `Failed to process polling update for fixture ${fixture.fixture?.id}: ${fixtureErrMsg}`);
      }
    }

    logger.info('FootballPollScores', `Job completed: ${job.id}. Polled ${fixtureIds.length} matches, updated ${updatedCount} score lines.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('FootballPollScores', `Failed to poll active matches: ${errMsg}`);
  }
}
