import type { Job } from 'pg-boss';
import { logger } from '../utils/logger.js';

/**
 * VWAP recalculation job handler.
 * Phase 1: stub that logs and confirms scheduling works.
 * Phase 3: replace stub with actual VWAP recalculation logic.
 */
export async function runVwapRecalc(job: Job): Promise<void> {
  logger.info('VwapRecalc', `Job started: ${job.id}`);
  // TODO (Phase 3): Fetch last 1h transactions, compute VWAP, update market_prices
  logger.info('VwapRecalc', `Job completed: ${job.id} (stub)`);
}
