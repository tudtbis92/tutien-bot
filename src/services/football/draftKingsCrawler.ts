/* eslint-disable i18next/no-literal-string -- technical strings and selectors */
import { chromium, type Browser } from 'playwright';
import { logger } from '../../utils/logger.js';
import { convertAmericanToDecimal } from './oddsCalculator.js';

export interface CorrectScoreOdds {
  [score: string]: string; // e.g., "1-0": "7.50"
}

export class DraftKingsCrawler {
  private browser: Browser | null = null;

  /**
   * Launch a browser instance (reusable for efficiency within a session)
   */
  public async init(): Promise<void> {
    if (this.browser) return;
    try {
      this.browser = await chromium.launch({
        headless: true,
      });
    } catch (err) {
      logger.error('DraftKingsCrawler', 'Failed to launch browser', err);
      throw err;
    }
  }

  /**
   * Close the browser instance
   */
  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Crawl correct score odds for a specific event
   */
  public async crawlCorrectScore(dkEventId: string): Promise<CorrectScoreOdds> {
    if (!this.browser) await this.init();
    if (!this.browser) throw new Error('Browser not initialized');

    const url = `https://sportsbook.draftkings.com/event/${dkEventId}`;
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const result: CorrectScoreOdds = {};

    try {
      logger.info('DraftKingsCrawler', `Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Click on "Game Props" or "Score" tab if needed, but often "Correct Score" is visible or on a specific sub-url.
      // Let's look for "Correct Score" text in the page.
      
      // Try to find the section containing "Correct Score"
      const correctScoreHeader = page.getByText('Correct Score', { exact: true });
      if (await correctScoreHeader.count() === 0) {
        // Sometimes it's under a tab. Let's try clicking tabs if not found.
        const gamePropsTab = page.getByRole('button', { name: 'Game Props' });
        if (await gamePropsTab.count() > 0) {
          await gamePropsTab.click();
          await page.waitForTimeout(1000);
        }
      }

      // DraftKings outcomes are usually in buttons with labels and odds.
      // We look for elements that look like "1-0", "2-1" etc.
      // A common pattern is outcome-label and outcome-odds.
      
      // Expand all accordion sections to ensure Correct Score is visible
      const accordions = await page.locator('.sportsbook-event-accordion__title-wrapper').all();
      for (const acc of accordions) {
        const text = await acc.textContent();
        if (text?.includes('Correct Score')) {
          await acc.click(); // Ensure it's expanded
          break;
        }
      }

      const rows = await page.locator('.sportsbook-outcome-cell').all();
      for (const row of rows) {
        const label = await row.locator('.sportsbook-outcome-cell__label').textContent();
        const odds = await row.locator('.sportsbook-odds').textContent();
        
        if (label && odds) {
          // Normalize label: "1 - 0" -> "1-0"
          const normalizedLabel = label.trim().replace(/\s+/g, '').replace(':', '-');
          // Check if it's a score (contains a hyphen or looks like a score)
          if (/^\d+-\d+$/.test(normalizedLabel)) {
            result[normalizedLabel] = convertAmericanToDecimal(odds.trim());
          }
        }
      }

      logger.info('DraftKingsCrawler', `Successfully crawled ${Object.keys(result).length} scores for event ${dkEventId}`);
    } catch (err) {
      logger.error('DraftKingsCrawler', `Failed to crawl odds for event ${dkEventId}`, err);
    } finally {
      await page.close();
      await context.close();
    }

    return result;
  }
}

/**
 * Convenience function for one-off crawling
 */
export async function crawlDkOdds(dkEventId: string): Promise<CorrectScoreOdds> {
  const crawler = new DraftKingsCrawler();
  try {
    await crawler.init();
    return await crawler.crawlCorrectScore(dkEventId);
  } finally {
    await crawler.close();
  }
}
