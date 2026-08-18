import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { mapEdges } from '../../db/schema/mapEdges.js';
import { mapNodes } from '../../db/schema/mapNodes.js';
import { mapZones } from '../../db/schema/mapZones.js';
import { heroZoneRates } from '../../db/schema/heroZoneRates.js';
import { heroes } from '../../db/schema/heroes.js';
import { redis } from '../../cache/redis.js';
import { logger } from '../../utils/logger.js';
import { rollWildLevel } from './encounterLevelService.js';
import { rollSkillsForSpawn } from './skillService.js';
import {
  capHit,
  pickEncounterHero,
  positionFraction,
  shouldRoll,
  shouldRollBoss,
  type ZoneRate,
} from './encounterService.js';

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
 * and the ack handler are the only other writers and both set updatedAt
 * deliberately. The per-minute roll (09-04) writes ONLY encounter_runs + the
 * Redis cap window — never player_travel_state.
 */
export type CheckInMode = 'start' | 'encounter' | 'encounterPending' | 'arrived' | 'status';

/** The encounter payload — shape-compatible with 09-04's EncounterRollResult. */
export interface CheckInEncounter {
  heroId: number | null;
  zone: string;
  boss: boolean;
  /** D-33: the spawn-rolled fight level (wild = rollWildLevel, boss = 50). */
  level?: number;
  /** D-31: the spawn-rolled skills — carried to battle + capture. */
  skillNormalId?: number | null;
  skillSpecialId?: number | null;
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
  /** D-13 cap predicate — the roll calls it BEFORE rolling (Pitfall 7). */
  capCheck: () => Promise<boolean>;
}

export interface RollMinuteResult {
  hit: boolean;
  heroId?: number | null;
  zone?: string;
  boss?: boolean;
  /** D-33: the spawn-rolled level (boss = 50, D-35). */
  level?: number;
  /** D-31: the spawn-rolled skill ids carried to battle + capture. */
  skillNormalId?: number | null;
  skillSpecialId?: number | null;
  /** True when the roll was silently skipped by the ~20/hr cap (D-13). */
  skipped?: boolean;
}

export type RollMinuteFn = (ctx: RollMinuteContext) => Promise<RollMinuteResult>;

/** Tx type of db.transaction's callback (drizzle 0.45.2 — established pattern). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Injectable rng sources for the default roll (D-24/D-30/D-33). Crypto-backed
 * defaults (player-facing rolls — ASVS V6); the injection exists ONLY so
 * deterministic tests can drive the pick/level/skill draws.
 */
export interface SpawnRollDeps {
  /** Position-blended zone-general pick rng (boss + wild hero pick, D-15/D-24). */
  pickRng?: () => number;
  /** Wild level band rng (D-33 — defaults to cryptoUniform). */
  levelRng?: () => number;
  /** Class-pool skill roll rng (D-30 — defaults to cryptoUniform). */
  skillRng?: () => number;
}

/**
 * The 09-04 real rollMinute — cap-first (D-13, Pitfall 7), position-blended
 * pick (D-15), boss sub-roll (D-14), spawn level + skills (D-31/D-33/D-35),
 * encounter_runs record (D-24). Runs INSIDE the check-in tx (single writer,
 * Pitfall 5) and writes ONLY encounter_runs + the Redis cap window.
 *
 * D-24 (boss redesign): a boss sub-roll now picks a REAL zone-general hero
 * from the zone pool (pickEncounterHero — hero_id NON-NULL) at FIXED level 50
 * (D-35) with rolled class-pool skills (D-30/D-31). Wild heroes spawn at a
 * rolled level (D-33) with rolled skills (D-30/D-31).
 */
export function makeDefaultRollMinute(
  tx: Tx,
  userId: number,
  travelId: number,
  deps: SpawnRollDeps = {},
): RollMinuteFn {
  const pickRng = deps.pickRng;
  const levelRng = deps.levelRng;
  const skillRng = deps.skillRng;

  return async (ctx: RollMinuteContext): Promise<RollMinuteResult> => {
    const now = Date.now();
    const capKey = `sanguo:enc:win:${userId}`;

    // 1. Cap check FIRST (D-13, Pitfall 7) — silent skip: no record, no inline
    // encounter, travel continues. F7: best-effort key TTL so an inactive user
    // does not leave the cap window persisting forever.
    // eslint-disable-next-line i18next/no-literal-string -- Redis ZSET bound, not user-facing
    await redis.zremrangebyscore(capKey, '-inf', `(${now - 3600_000}`);
    try {
      await redis.expire(capKey, 86_400);
    } catch {
      // best-effort only (F7) — a TTL failure never blocks the roll
    }
    const windowCount = await redis.zcard(capKey);
    if (capHit(windowCount)) return { hit: false, skipped: true };

    // 2. Position (D-15) — a missing edge skips the minute (no crash).
    if (ctx.totalSeconds <= 0) {
      logger.warn('EncounterRoll', `missing edge ${ctx.fromNodeId}->${ctx.toNodeId}, skipping minute`);
      return { hit: false };
    }
    const pos = positionFraction(ctx.remainingAfter, ctx.totalSeconds);

    // 3. Zone codes + per-zone rates. F8: hero_zone_rates.rate is numeric(4,2)
    // → Drizzle returns a STRING — explicit Number() before the blend math.
    const nodes = await tx
      .select({ id: mapNodes.id, zone: mapNodes.zone })
      .from(mapNodes)
      .where(inArray(mapNodes.id, [ctx.fromNodeId!, ctx.toNodeId!]))
      .limit(2);
    const fromZone = nodes.find((n) => n.id === ctx.fromNodeId)?.zone;
    const toZone = nodes.find((n) => n.id === ctx.toNodeId)?.zone;
    if (!fromZone || !toZone) {
      logger.warn('EncounterRoll', `missing zone for nodes ${ctx.fromNodeId}/${ctx.toNodeId}, skipping minute`);
      return { hit: false };
    }
    const dominantZone = pos < 0.5 ? fromZone : toZone;

    const rateRows = await tx
      .select()
      .from(heroZoneRates)
      .where(inArray(heroZoneRates.zone, [fromZone, toZone]))
      .limit(50);
    const poolFrom: ZoneRate[] = rateRows
      .filter((r) => r.zone === fromZone)
      .map((r) => ({ heroId: r.heroId, zone: r.zone, rate: Number(r.rate) }));
    const poolTo: ZoneRate[] = rateRows
      .filter((r) => r.zone === toZone)
      .map((r) => ({ heroId: r.heroId, zone: r.zone, rate: Number(r.rate) }));

    // 4. Hero roll (D-10/D-24) — zone-configurable encounter_rate (A7 default 0.35).
    const [zoneRow] = await tx
      .select()
      .from(mapZones)
      .where(eq(mapZones.code, dominantZone))
      .limit(1);
    const encounterRate = zoneRow ? Number(zoneRow.encounterRate) : 0.35;
    if (!shouldRoll(encounterRate)) return { hit: false };

    // 5. Boss sub-roll (D-14) — zone-configurable boss_rate (A7 default 0.07).
    const bossRate = zoneRow ? Number(zoneRow.bossRate) : 0.07;
    const isBoss = shouldRollBoss(bossRate);

    // 6. Pick + record. Stop-at-first-hit is the 09-03 loop's job (D-24).
    // Empty pools are a content error only when a roll lands — skip the minute.
    if (poolFrom.length === 0 && poolTo.length === 0) {
      logger.warn('EncounterRoll', `empty pool for zones ${fromZone}/${toZone}, skipping minute`);
      return { hit: false };
    }
    const pick = pickEncounterHero(poolFrom, poolTo, pos, pickRng);
    const heroId = pick.heroId;
    const zone = pick.zone;
    const encounterType: 'hero' | 'boss' = isBoss ? 'boss' : 'hero';

    // Spawn level + skills (D-31/D-33/D-35). The hero's class drives the
    // class-pool skill roll (D-30); the boss fights at FIXED level 50 (D-35).
    // Skills ride the SAME tx as the encounter_runs insert (Pitfall 5).
    const [heroRow] = await tx.select().from(heroes).where(eq(heroes.id, heroId)).limit(1);
    const level = isBoss ? 50 : rollWildLevel(levelRng);
    const skills = heroRow
      ? await rollSkillsForSpawn(heroRow.class, skillRng, tx)
      : { normalId: null, specialId: null };

    await tx.insert(encounterRuns).values({
      userId,
      travelId,
      zone,
      heroId,
      encounterType,
      status: 'pending',
      level,
      skillNormalId: skills.normalId,
      skillSpecialId: skills.specialId,
    });
    await redis.zadd(capKey, now, String(now)); // boss counts toward the cap (it IS an encounter)

    return { hit: true, heroId, zone, boss: isBoss, level, skillNormalId: skills.normalId, skillSpecialId: skills.specialId };
  };
}

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
  deps: { rollMinute?: RollMinuteFn; spawnRoll?: SpawnRollDeps } = {},
): Promise<CheckInResult> {
  const injectedRoll = deps.rollMinute;

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
    // edge orientations; a missing edge yields totalSeconds 0 (the roll skips it).
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

    // The real roll (09-04): cap-first ZSET, position blend, boss sub-roll,
    // encounter_runs record. Tests inject their own for deterministic paths;
    // spawnRoll carries deterministic rng sources for the real factory.
    const rollMinute = injectedRoll ?? makeDefaultRollMinute(tx, userId, row.id, deps.spawnRoll);

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
