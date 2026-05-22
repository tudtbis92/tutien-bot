import type { Job } from 'pg-boss';
import { eq, and, lt, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { postPredictionEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

/**
 * Job to announce matches that are starting within the next 24 hours.
 * Calls the lifecycle service which handles channel filtering and persistence.
 */
export async function runFootballAnnounceMatches(job: Job): Promise<void> {
  logger.info('FootballAnnounceMatches', `Job started: ${job.id}`);

  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find matches starting within 24h that are still NS and haven't started yet
  // Note: postPredictionEmbed internally checks for announced channels to avoid duplicates
  const matchesToAnnounce = await db
    .select()
    .from(footballMatches)
    .where(
      and(
        eq(footballMatches.status, 'NS'),
        lt(footballMatches.kickoffAt, twentyFourHoursFromNow),
        gt(footballMatches.kickoffAt, now)
      )
    );

  if (matchesToAnnounce.length === 0) {
    logger.info('FootballAnnounceMatches', 'No matches in the 24h window.');
    return;
  }

  logger.info('FootballAnnounceMatches', `Checking announcements for ${matchesToAnnounce.length} matches...`);

  let processedCount = 0;
  for (const match of matchesToAnnounce) {
    try {
      await postPredictionEmbed(match);
      processedCount++;
    } catch (err) {
      logger.error('FootballAnnounceMatches', `Error processing match ${match.id}`, err);
    }
  }

  logger.info('FootballAnnounceMatches', `Job completed: ${job.id}. Processed ${processedCount} matches.`);
}
