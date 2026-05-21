import type { Job } from 'pg-boss';
import { eq, isNull, and, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { footballMatches } from '../db/schema/footballMatches.js';
import { DraftKingsCrawler } from '../services/football/draftKingsCrawler.js';
import { logger } from '../utils/logger.js';

/**
 * Job to crawl Correct Score odds from DraftKings using Playwright.
 * This is an expensive job, so it runs daily or 12h before kickoff.
 */
export async function runFootballCrawlOdds(job: Job): Promise<void> {
  logger.info('FootballCrawlOdds', `Job started: ${job.id}`);
  
  const now = new Date();

  // Find matches with dkEventId but no exactScoreOdds that start in the next 24h
  const matchesToCrawl = await db
    .select()
    .from(footballMatches)
    .where(
      and(
        isNull(footballMatches.exactScoreOdds),
        gt(footballMatches.kickoffAt, now),
        // Filter matches starting within next 24h or that have a dkEventId
        eq(footballMatches.status, 'NS')
      )
    );

  const validMatches = matchesToCrawl.filter((m) => !!m.dkEventId);

  if (validMatches.length === 0) {
    logger.info('FootballCrawlOdds', 'No matches require odds crawling at this time.');
    logger.info('FootballCrawlOdds', `Job completed: ${job.id}`);
    return;
  }

  logger.info('FootballCrawlOdds', `Crawling odds for ${validMatches.length} matches...`);
  
  const crawler = new DraftKingsCrawler();
  let crawledCount = 0;

  try {
    await crawler.init();

    for (const match of validMatches) {
      if (!match.dkEventId) continue;
      
      try {
        const scoreOdds = await crawler.crawlCorrectScore(match.dkEventId);
        
        if (Object.keys(scoreOdds).length > 0) {
          await db
            .update(footballMatches)
            .set({
              exactScoreOdds: scoreOdds,
              updatedAt: new Date(),
            })
            .where(eq(footballMatches.id, match.id));
          
          crawledCount++;
        }
      } catch (err) {
        logger.error('FootballCrawlOdds', `Failed to crawl match ${match.id} (DK: ${match.dkEventId})`, err);
      }
    }
  } catch (err) {
    logger.error('FootballCrawlOdds', 'Crawler initialization failed', err);
  } finally {
    await crawler.close();
  }

  logger.info('FootballCrawlOdds', `Job completed: ${job.id}. Crawled ${crawledCount}/${validMatches.length} matches.`);
}
