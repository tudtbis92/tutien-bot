import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  placeBet,
  MatchNotFoundError,
  MatchAlreadyStartedError,
  InvalidWagerAmountError,
  OddsNotFoundError,
  InsufficientBalanceError,
} from '../predictionService.js';
import { footballBets } from '../../../db/schema/footballBets.js';

// Mock DB client BEFORE importing to prevent config.ts env validation
vi.mock('../../db/client.js', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

describe('predictionService - placeBet', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMatch: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExistingBets: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdatedOrInsertedRow: any;
  let fromIndex = 0;
  let action = '';
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockTx: any = {
    select: vi.fn().mockImplementation(() => {
      action = 'select';
      return mockTx;
    }),
    from: vi.fn().mockImplementation(() => {
      fromIndex++;
      return mockTx;
    }),
    where: vi.fn().mockImplementation(() => mockTx),
    limit: vi.fn().mockImplementation(() => mockTx),
    for: vi.fn().mockImplementation(() => mockTx),
    update: vi.fn().mockImplementation(() => {
      action = 'update';
      return mockTx;
    }),
    set: vi.fn().mockImplementation(() => mockTx),
    insert: vi.fn().mockImplementation(() => {
      action = 'insert';
      return mockTx;
    }),
    values: vi.fn().mockImplementation(() => mockTx),
    returning: vi.fn().mockImplementation(() => mockTx),
    then: vi.fn().mockImplementation((resolve) => {
      if (action === 'select') {
        if (fromIndex === 1) {
          resolve(mockMatch ? [mockMatch] : []);
        } else if (fromIndex === 2) {
          resolve(mockUser ? [mockUser] : []);
        } else if (fromIndex === 3) {
          resolve(mockExistingBets);
        } else {
          resolve([]);
        }
      } else {
        // update or insert returning row
        resolve([mockUpdatedOrInsertedRow]);
      }
    }),
  };

  const mockDb = {
    transaction: vi.fn().mockImplementation(async (callback) => {
      return await callback(mockTx);
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fromIndex = 0;
    action = '';
    
    mockMatch = {
      id: 42,
      homeTeamName: 'Arsenal',
      awayTeamName: 'Chelsea',
      kickoffAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour in future
      status: 'NS',
      homeOdds: '1.80',
      drawOdds: '3.40',
      awayOdds: '4.50',
      exactScoreOdds: {
        '1-0': '6.00',
        '2-0': '8.00',
      },
    };

    mockUser = {
      id: 100,
      balance: 1000n,
    };

    mockExistingBets = [];
    
    mockUpdatedOrInsertedRow = {
      id: 999,
      userId: 100,
      fixtureId: 42,
      betType: 'result',
      prediction: 'home',
      wagerAmount: 100n,
      potentialPayout: 180n,
      oddsUsed: '1.80',
      status: 'pending',
    };
  });

  it('should place a new result bet successfully', async () => {
    const result = await placeBet(mockDb, 100, 42, 'result', 'home', 100n);
    
    expect(result.bet.id).toBe(999);
    expect(result.payout).toBe(180n);
    expect(result.isEdit).toBe(false);
    
    expect(mockTx.insert).toHaveBeenCalledWith(footballBets);
  });

  it('should place a new correct score bet successfully', async () => {
    mockUpdatedOrInsertedRow.betType = 'score';
    mockUpdatedOrInsertedRow.prediction = '1-0';
    mockUpdatedOrInsertedRow.potentialPayout = 600n;
    mockUpdatedOrInsertedRow.oddsUsed = '6.00';

    const result = await placeBet(mockDb, 100, 42, 'score', '1-0', 100n);
    
    expect(result.bet.id).toBe(999);
    expect(result.payout).toBe(600n);
    expect(result.isEdit).toBe(false);
    
    expect(mockTx.insert).toHaveBeenCalledWith(footballBets);
  });

  it('should reject wagers outside config bounds', async () => {
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 5n)).rejects.toThrow(InvalidWagerAmountError);
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 10_000_000n)).rejects.toThrow(InvalidWagerAmountError);
  });

  it('should throw MatchNotFoundError when match does not exist', async () => {
    mockMatch = null;
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 100n)).rejects.toThrow(MatchNotFoundError);
  });

  it('should throw MatchAlreadyStartedError when match has kicked off', async () => {
    mockMatch.kickoffAt = new Date(Date.now() - 600 * 1000).toISOString(); // 10 minutes ago
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 100n)).rejects.toThrow(MatchAlreadyStartedError);
  });

  it('should throw MatchAlreadyStartedError when match status is not NS', async () => {
    mockMatch.status = '1H';
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 100n)).rejects.toThrow(MatchAlreadyStartedError);
  });

  it('should throw OddsNotFoundError when requested selection has no odds', async () => {
    mockMatch.homeOdds = null;
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 100n)).rejects.toThrow(OddsNotFoundError);
  });

  it('should throw InsufficientBalanceError when balance is less than wager', async () => {
    mockUser.balance = 50n;
    await expect(placeBet(mockDb, 100, 42, 'result', 'home', 100n)).rejects.toThrow(InsufficientBalanceError);
  });

  it('should handle edit bet successfully by refunding and updating', async () => {
    mockExistingBets = [{
      id: 555,
      userId: 100,
      fixtureId: 42,
      betType: 'result',
      prediction: 'away',
      wagerAmount: 500n, // old wager
      potentialPayout: 2250n,
      oddsUsed: '4.50',
      status: 'pending',
    }];
    
    mockUpdatedOrInsertedRow = {
      id: 555,
      userId: 100,
      fixtureId: 42,
      betType: 'result',
      prediction: 'home',
      wagerAmount: 600n, // new wager
      potentialPayout: 1080n,
      oddsUsed: '1.80',
      status: 'pending',
    };

    // User balance is 200n, but refund of 500n gives 700n which is sufficient for 600n new wager
    mockUser.balance = 200n;

    const result = await placeBet(mockDb, 100, 42, 'result', 'home', 600n);
    
    expect(result.bet.id).toBe(555);
    expect(result.payout).toBe(1080n);
    expect(result.isEdit).toBe(true);
    
    expect(mockTx.update).toHaveBeenCalledWith(footballBets);
  });
});
