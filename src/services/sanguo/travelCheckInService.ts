import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';

/**
 * Pull-based travel check-in (D-22) — the FULL engine (elapsed → per-counted-
 * minute encounter rolls → encounter/arrival/status, stop at first hit D-24,
 * ack pause D-25) ships in 09-03. This wave ships a thin stub so /sanguo
 * travel's check-in dispatch path is wired and testable end-to-end: it reads
 * the travel row and returns a status result with the remaining seconds.
 *
 * No cron, no REST DM (D-22/D-23) — results are computed on invocation only.
 */
export type CheckInResult =
  | { mode: 'start' }
  | { mode: 'status'; remaining: number }
  | { mode: 'encounterPending' }
  | { mode: 'encounter' }
  | { mode: 'arrived' };

export async function checkInTravel(userId: number): Promise<CheckInResult> {
  const [row] = await db
    .select()
    .from(playerTravelState)
    .where(eq(playerTravelState.userId, userId));

  if (!row) return { mode: 'start' };
  return { mode: 'status', remaining: row.travelSecondsRemaining };
}
