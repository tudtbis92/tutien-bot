import type { Job } from 'pg-boss';
import { eq, and, lt, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { postPredictionEmbed } from '../services/football/matchLifecycleService.js';
import { logger } from '../utils/logger.js';

/**
 * Detects placeholder team names from ESPN that indicate a team slot
 * has not yet been filled (e.g. knockout brackets before qualifiers finish).
 * Returns true if the name matches known placeholder patterns.
 */
function hasPlaceholderTeamName(name: string): boolean {
  return /^(Group\s+[A-H]|Winner\s+(of|Group)|Runner[\s-]?up|TBD)\b/i.test(name);
}

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

  // Filter out matches with placeholder team names (e.g. "Group A 2nd Place", "Winner of...")
  // Keep them in the DB so the fetch-fixtures upsert can update them when real names arrive.
  const validMatches = matchesToAnnounce.filter(
    (m) => !hasPlaceholderTeamName(m.homeTeamName) && !hasPlaceholderTeamName(m.awayTeamName)
  );

  const skippedCount = matchesToAnnounce.length - validMatches.length;
  if (skippedCount > 0) {
    logger.info('FootballAnnounceMatches', `Skipped ${skippedCount} match(es) with placeholder team names (waiting for real names).`);
  }

  if (validMatches.length === 0) {
    logger.info('FootballAnnounceMatches', 'No valid matches in the 24h window.');
    return;
  }

  logger.info('FootballAnnounceMatches', `Checking announcements for ${validMatches.length} matches...`);

  let processedCount = 0;
  for (const match of validMatches) {
    try {
      await postPredictionEmbed(match);
      processedCount++;
    } catch (err) {
      logger.error('FootballAnnounceMatches', `Error processing match ${match.id}`, err);
    }
  }

  logger.info('FootballAnnounceMatches', `Job completed: ${job.id}. Processed ${processedCount} matches.`);
}
