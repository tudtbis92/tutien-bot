import { eq, and } from 'drizzle-orm';
import { users } from '../../db/schema/users.js';
import { footballMatches } from '../../db/schema/footballMatches.js';
import { footballBets, type FootballBet } from '../../db/schema/footballBets.js';
import { calculatePayout, validateBetAmount } from './oddsCalculator.js';
import { deductBalance, creditBalance } from '../wallet.js';

// Custom Errors
export class MatchNotFoundError extends Error {
  constructor() {
    super('Match not found');
    this.name = 'MatchNotFoundError';
  }
}

export class MatchAlreadyStartedError extends Error {
  constructor() {
    super('Match has already started or is not open for predictions');
    this.name = 'MatchAlreadyStartedError';
  }
}

export class InvalidWagerAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWagerAmountError';
  }
}

export class OddsNotFoundError extends Error {
  constructor() {
    super('Odds for this selection are not available');
    this.name = 'OddsNotFoundError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor() {
    super('Insufficient balance to place wager');
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Places a result or score bet for a user on a specific match.
 * Handles edits by atomically refunding the old wager and deducting the new one in a single transaction.
 */
export async function placeBet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: number,
  matchId: number,
  betType: 'result' | 'score' | 'over_under' | 'spread',
  prediction: string,
  wagerAmount: bigint
): Promise<{ bet: FootballBet; payout: bigint; isEdit: boolean }> {
  // 1. Validate wager amount limits
  const wagerValidation = validateBetAmount(wagerAmount);
  if (!wagerValidation.valid) {
    throw new InvalidWagerAmountError(wagerValidation.error || 'Invalid wager amount');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await db.transaction(async (tx: any) => {
    // 2. Fetch match and check kickoff / status
    const matchRows = await tx
      .select()
      .from(footballMatches)
      .where(eq(footballMatches.id, matchId))
      .limit(1);

    if (matchRows.length === 0) {
      throw new MatchNotFoundError();
    }

    const match = matchRows[0];
    const now = new Date();
    
    // Check if match status is NS (Not Started) and kickoff time is in the future
    if (match.status !== 'NS' || new Date(match.kickoffAt) <= now) {
      throw new MatchAlreadyStartedError();
    }

    // 3. Resolve the specific odds for the prediction
    let oddsUsed = '';
    if (betType === 'result') {
      if (prediction === 'home') {
        oddsUsed = match.homeOdds || '';
      } else if (prediction === 'draw') {
        oddsUsed = match.drawOdds || '';
      } else if (prediction === 'away') {
        oddsUsed = match.awayOdds || '';
      }
    } else if (betType === 'over_under') {
      if (prediction === 'over') {
        oddsUsed = match.overOdds || '';
      } else if (prediction === 'under') {
        oddsUsed = match.underOdds || '';
      }
    } else if (betType === 'spread') {
      if (prediction === 'home_spread') {
        oddsUsed = match.homeSpreadOdds || '';
      } else if (prediction === 'away_spread') {
        oddsUsed = match.awaySpreadOdds || '';
      }
    }

    if (!oddsUsed) {
      throw new OddsNotFoundError();
    }

    // Calculate payout
    const potentialPayout = calculatePayout(wagerAmount, oddsUsed);

    // 4. Lock and fetch user row
    const userRows = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update'); // SELECT FOR UPDATE to prevent race conditions

    if (userRows.length === 0) {
      throw new Error('User not found');
    }

    let currentBalance = userRows[0].balance;

    // 5. Check if user already has a pending bet on this match for this bet type
    const existingBets = await tx
      .select()
      .from(footballBets)
      .where(
        and(
          eq(footballBets.userId, userId),
          eq(footballBets.fixtureId, matchId),
          eq(footballBets.betType, betType),
          eq(footballBets.status, 'pending')
        )
      )
      .limit(1);

    const isEdit = existingBets.length > 0;
    let oldWagerAmount = 0n;
    let betIdToUpdate: number | undefined;

    if (isEdit) {
      const oldBet = existingBets[0];
      oldWagerAmount = oldBet.wagerAmount;
      betIdToUpdate = oldBet.id;

      // Temporarily refund the old wager in our balance calculation
      currentBalance += oldWagerAmount;
    }

    // 6. Verify they have enough balance for the new wager
    if (currentBalance < wagerAmount) {
      throw new InsufficientBalanceError();
    }

    // 7. Refund old wager (edit) then deduct new wager through the wallet.
    // The ledger stays reconcilable on edits: one 'bet_refund' row + one
    // 'bet_wager' row. A thrown Error('INSUFFICIENT_BALANCE') from the wallet
    // is rethrown as InsufficientBalanceError (caller-facing class preserved).
    try {
      if (isEdit && oldWagerAmount > 0n) {
        await creditBalance(tx, userId, oldWagerAmount, {
          reason: 'bet_refund',
          metadata: { betId: betIdToUpdate, matchId, betType },
        });
      }
      await deductBalance(tx, userId, wagerAmount, {
        reason: 'bet_wager',
        metadata: { betId: isEdit ? betIdToUpdate : undefined, matchId, betType },
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        throw new InsufficientBalanceError();
      }
      throw err;
    }

    let resultBet: FootballBet;

    if (isEdit && betIdToUpdate !== undefined) {
      // 8a. Update the existing bet
      const updatedBets = await tx
        .update(footballBets)
        .set({
          prediction,
          wagerAmount,
          potentialPayout,
          oddsUsed,
          updatedAt: new Date()
        })
        .where(eq(footballBets.id, betIdToUpdate))
        .returning();

      resultBet = updatedBets[0];
    } else {
      // 8b. Insert new bet
      const insertedBets = await tx
        .insert(footballBets)
        .values({
          userId,
          fixtureId: matchId,
          betType,
          prediction,
          wagerAmount,
          potentialPayout,
          oddsUsed,
          status: 'pending',
        })
        .returning();

      resultBet = insertedBets[0];
    }

    return {
      bet: resultBet,
      payout: potentialPayout,
      isEdit
    };
  });
}

/**
 * Retrieves all bets for a specific user, optionally filtered by status.
 * Returns joined match details.
 */
export async function getUserBets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: number,
  status?: 'pending' | 'won' | 'lost' | 'void'
): Promise<Array<FootballBet & { match: unknown }>> {
  const queryConditions = [eq(footballBets.userId, userId)];
  if (status) {
    queryConditions.push(eq(footballBets.status, status));
  }

  const rows = await db
    .select({
      bet: footballBets,
      match: footballMatches,
    })
    .from(footballBets)
    .innerJoin(footballMatches, eq(footballBets.fixtureId, footballMatches.id))
    .where(and(...queryConditions));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    ...r.bet,
    match: r.match,
  }));
}
