import { eq, and, or, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { mapEdges } from '../../db/schema/mapEdges.js';
import { redis } from '../../cache/redis.js';

/**
 * Pull-based travel check-in engine (TQC-07, D-22/D-24/D-25/D-28).
 *
 * No cron, no REST DM (D-22/D-23) — the journey resolves when the user invokes
 * /sanguo travel: checkInTravel computes the elapsed time since updatedAt,
 * rolls 1× per counted minute (D-24), decrements the pause-aware remaining
 * clock (D-07), and stops at the first encounter hit.
 *
 * Single-writer rule (Pitfall 5): THIS transaction is the only writer of
 * travel_seconds_remaining/updatedAt for traveling rows. startTravel (09-01)
 * and the ack handler (Task 2) are the only other writers and both set
 * updatedAt deliberately.
 *
 * The per-minute roll is an INJECTED callback (deps.rollMinute) this wave —
 * plan 09-04 lands encounterService and replaces the default no-hit roll with
 * the cap-first / position-blended / boss-sub-roll implementation. The loop
 * skeleton, arrival branch, and ack pause are order-independent of 09-04.
 */
export type CheckInMode = 'start' | 'encounter' | 'encounterPending' | 'arrived' | 'status';

/** The encounter payload — shape-compatible with 09-04's EncounterRollResult. */
export interface CheckInEncounter {
  heroId: number | null;
  zone: string;
  boss: boolean;
}

export interface CheckInResult {
  mode: CheckInMode;
  /** Remaining seconds after the check-in (status/encounter/encounterPending). */
  remaining?: number;
  totalSeconds?: number;
  /** Populated for 'encounter' (fresh hit) AND 'encounterPending' (re-fetched row — F2). */
  encounter?: CheckInEncounter;
  /** Arrival target — the command resolves the per-locale name from the row. */
  nodeName?: string;
}

/** Context handed to the per-minute roll callback. */
export interface RollMinuteContext {
  /** Remaining seconds after decrementing this counted minute. */
  remainingAfter: number;
  /** Total hop seconds from map_edges (0 when the edge is missing). */
  totalSeconds: number;
  fromNodeId: number | null;
  toNodeId: number | null;
  /** D-13 cap predicate — 09-04's rollMinute calls it BEFORE rolling. */
  capCheck: () => Promise<boolean>;
}

export interface RollMinuteResult {
  hit: boolean;
  heroId?: number | null;
  zone?: string;
  boss?: boolean;
}

export type RollMinuteFn = (ctx: RollMinuteContext) => Promise<RollMinuteResult>;

/**
 * Default roll — no hits. 09-04 replaces this with the encounterService-backed
 * implementation (cap-first ZSET, position blend, boss sub-roll, encounter_runs
 * record). With the default, a check-in resolves arrival/status only.
 */
const defaultRollMinute: RollMinuteFn = async () => ({ hit: false });

/** Add whole minutes to a base date (hit-minute pin, D-25). */
function addMinutes(base: Date, mins: number): Date {
  return new Date(base.getTime() + mins * 60_000);
}

/**
 * Resolve the check-in for :userId's active journey inside one FOR UPDATE
 * transaction (single writer per user — no SKIP LOCKED needed).
 */
export async function checkInTravel(
  userId: number,
  deps: { rollMinute?: RollMinuteFn } = {},
): Promise<CheckInResult> {
  const rollMinute = deps.rollMinute ?? defaultRollMinute;

  return db.transaction(async (tx) => {
    // Locked row read — the second concurrent check-in waits, then reads the
    // already-advanced updatedAt → elapsed ≈ 0 → no double-count (T-09-06).
    const [row] = await tx
      .select()
      .from(playerTravelState)
      .where(eq(playerTravelState.userId, userId))
      .for('update');

    // No journey, or already arrived → the command renders the destination menu.
    if (!row || row.status === 'arrived') return { mode: 'start' } as const;

    // D-25 ack pause: while an encounter is pending the clock counts NO time.
    // F2: return the latest pending encounter_runs row (indexed by the 09-01
    // encounter_runs_user_status_idx); only the ack handler clears the flag.
    if (row.encounterActive) {
      const [pending] = await tx
        .select()
        .from(encounterRuns)
        .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
        .orderBy(desc(encounterRuns.id))
        .limit(1);
      if (pending) {
        return {
          mode: 'encounterPending',
          encounter: {
            heroId: pending.heroId,
            zone: pending.zone,
            boss: pending.encounterType === 'boss',
          },
          remaining: row.travelSecondsRemaining,
        };
      }
      // Flag set but record missing (edge) — surface status without touching the row.
      return { mode: 'status', remaining: row.travelSecondsRemaining };
    }

    const now = new Date();
    // D-05 self-heal is structural: elapsed is computed here; an overdue journey
    // simply arrives in this call — no failed status, no stuck journeys.
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / 1000));
    const countedMinutes = Math.floor(elapsedSec / 60);

    // Total hop seconds for the roll's position fraction (D-15) — OR-match both
    // edge orientations; a missing edge yields totalSeconds 0 (09-04 skips it).
    let totalSeconds = 0;
    if (countedMinutes > 0) {
      const [edge] = await tx
        .select()
        .from(mapEdges)
        .where(
          or(
            and(eq(mapEdges.nodeAId, row.fromNodeId!), eq(mapEdges.nodeBId, row.toNodeId!)),
            and(eq(mapEdges.nodeAId, row.toNodeId!), eq(mapEdges.nodeBId, row.fromNodeId!)),
          ),
        )
        .limit(1);
      totalSeconds = edge?.travelSeconds ?? 0;
    }

    const capKey = `sanguo:enc:win:${userId}`;
    const capCheck = async (): Promise<boolean> => {
      const count = await redis.zcard(capKey);
      return count < 20; // D-13 ~20/hr sliding window
    };

    // Per-counted-minute roll loop — STOP at the first hit (D-24). The hit
    // minute IS counted (F4, D-28 amended): remaining decrements through it and
    // updatedAt pins to that minute (ack-pin model).
    for (let k = 1; k <= countedMinutes; k++) {
      // Arrival boundary — no roll past the arrival minute (D-28).
      if (row.travelSecondsRemaining - k * 60 <= 0) break;

      const roll = await rollMinute({
        remainingAfter: row.travelSecondsRemaining - k * 60,
        totalSeconds,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        capCheck,
      });

      if (roll.hit) {
        const remaining = Math.max(0, row.travelSecondsRemaining - k * 60);
        await tx
          .update(playerTravelState)
          .set({
            travelSecondsRemaining: remaining,
            encounterActive: true,
            updatedAt: addMinutes(row.updatedAt, k), // pin to the hit minute (D-25)
          })
          .where(eq(playerTravelState.userId, userId));
        return {
          mode: 'encounter',
          remaining,
          encounter: {
            heroId: roll.heroId ?? null,
            zone: roll.zone ?? '',
            boss: roll.boss ?? false,
          },
        };
      }
    }

    const remaining = Math.max(0, row.travelSecondsRemaining - elapsedSec);

    if (remaining <= 0) {
      // D-05/D-28: arrival resolves inside the check-in; overdue self-heals here.
      await tx
        .update(playerTravelState)
        .set({ status: 'arrived', travelSecondsRemaining: 0, updatedAt: now })
        .where(eq(playerTravelState.userId, userId));
      return { mode: 'arrived' };
    }

    await tx
      .update(playerTravelState)
      .set({ travelSecondsRemaining: remaining, updatedAt: now })
      .where(eq(playerTravelState.userId, userId));
    return { mode: 'status', remaining };
  });
}
