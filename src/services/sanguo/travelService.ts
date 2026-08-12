import { eq, or, and, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { playerTravelState } from '../../db/schema/playerTravelState.js';
import { mapNodes } from '../../db/schema/mapNodes.js';
import { mapEdges } from '../../db/schema/mapEdges.js';

/**
 * travelService — pure time/state travel domain service (TQC-06, D-01).
 *
 * D-01: travel costs only TIME — this module imports NO wallet/balance
 * deduction API and structurally cannot charge the player. D-03: no cancel —
 * status is 'traveling'|'arrived' only. All rows key on userId = users.id
 * (playerTravelState.userId references users.id, NEVER char.id).
 *
 * The travel row doubles as the "last arrived position" and the "active
 * journey" record (userId.unique() = one row per user forever): subsequent
 * journeys UPDATE the existing row in place, never delete+insert.
 */
export const START_NODE = 'luoyang';

export interface AdjacentNode {
  nodeId: number;
  code: string;
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
  zone: string;
  travelSeconds: number;
  representativeHeroId: string | null;
}

export interface CurrentPosition {
  nodeId: number;
  nodeCode: string;
}

/**
 * Current position of the user on the map:
 *  - no row (first-ever journey)      → START_NODE (A6: Lạc Dương)
 *  - status='arrived'                 → toNodeId (last arrived node)
 *  - status='traveling'               → fromNodeId (in-flight position, D-09)
 */
export async function getCurrentPosition(userId: number): Promise<CurrentPosition> {
  const [row] = await db
    .select()
    .from(playerTravelState)
    .where(eq(playerTravelState.userId, userId));

  const nodeId = !row
    ? await resolveNodeIdByCode(START_NODE)
    : row.status === 'arrived'
      ? row.toNodeId
      : row.fromNodeId;

  if (nodeId === null || nodeId === undefined) {
    throw new Error('POSITION_NOT_FOUND');
  }

  const [node] = await db.select().from(mapNodes).where(eq(mapNodes.id, nodeId));
  if (!node) throw new Error('NODE_NOT_FOUND');
  return { nodeId: node.id, nodeCode: node.code };
}

/**
 * Adjacent (one-hop reachable) nodes from :nodeId — the D-26 destination
 * picker source. Query map_edges where node_a_id = :nodeId OR node_b_id =
 * :nodeId, join map_nodes for the neighbor's per-locale names + zone +
 * representative hero, ordered by travelSeconds ASC, capped at 25 (Discord
 * StringSelectMenu hard cap).
 */
export async function getAdjacentNodes(nodeId: number): Promise<AdjacentNode[]> {
  return db
    .select({
      nodeId: mapNodes.id,
      code: mapNodes.code,
      nameVi: mapNodes.nameVi,
      nameEn: mapNodes.nameEn,
      nameZh: mapNodes.nameZh,
      zone: mapNodes.zone,
      travelSeconds: mapEdges.travelSeconds,
      representativeHeroId: mapNodes.representativeHeroId,
    })
    .from(mapEdges)
    .innerJoin(
      mapNodes,
      or(
        and(eq(mapEdges.nodeAId, nodeId), eq(mapNodes.id, mapEdges.nodeBId)),
        and(eq(mapEdges.nodeBId, nodeId), eq(mapNodes.id, mapEdges.nodeAId)),
      ),
    )
    .where(or(eq(mapEdges.nodeAId, nodeId), eq(mapEdges.nodeBId, nodeId)))
    .orderBy(asc(mapEdges.travelSeconds))
    .limit(25);
}

/**
 * Start a one-hop journey from the current position to :toNodeCode.
 * Runs in ONE transaction:
 *   (a) resolve toNodeCode → node id via map_nodes.code (D-20-resilient:
 *       codes are stable across reseeds, ids are not);
 *   (b) locked read of the current row with .for('update') (F3 — the row lock
 *       closes the concurrent double-start race: two Start presses both reading
 *       'arrived' under READ COMMITTED would UPDATE last-wins; the lock
 *       serializes them and the second writer sees 'traveling' →
 *       ALREADY_TRAVELING, D-09);
 *   (c) re-validate the edge from the current position to the resolved
 *       destination against map_edges (both orientations) — missing edge →
 *       NO_ROUTE (Pitfall 4 / T-09-01: the select-menu value is advisory,
 *       never authoritative; forged or stale codes are safe);
 *   (d) INSERT on the first journey / in-place UPDATE on subsequent journeys
 *       (userId.unique() = one row per user forever) with the D-07
 *       remaining-seconds fields;
 *   (e) NO deduction call anywhere (D-01).
 *
 * @returns the edge travel time for the reply embed's ETA.
 */
export async function startTravel(
  userId: number,
  toNodeCode: string,
): Promise<{ etaSeconds: number }> {
  return db.transaction(async (tx) => {
    // (a) code → node id
    const [destNode] = await tx
      .select()
      .from(mapNodes)
      .where(eq(mapNodes.code, toNodeCode));
    if (!destNode) throw new Error('NO_ROUTE');

    // (b) locked row read — closes the double-start race (F3)
    const [row] = await tx
      .select()
      .from(playerTravelState)
      .where(eq(playerTravelState.userId, userId))
      .for('update');

    if (row?.status === 'traveling') throw new Error('ALREADY_TRAVELING'); // D-09

    let currentNodeId: number;
    if (!row) {
      const [startNode] = await tx
        .select()
        .from(mapNodes)
        .where(eq(mapNodes.code, START_NODE));
      if (!startNode) throw new Error('START_NODE_NOT_FOUND');
      currentNodeId = startNode.id;
    } else {
      currentNodeId = row.toNodeId!; // arrived → last arrived node
    }

    // (c) server-side adjacency re-validation (both orientations)
    const [edge] = await tx
      .select()
      .from(mapEdges)
      .where(
        or(
          and(eq(mapEdges.nodeAId, currentNodeId), eq(mapEdges.nodeBId, destNode.id)),
          and(eq(mapEdges.nodeAId, destNode.id), eq(mapEdges.nodeBId, currentNodeId)),
        ),
      );
    if (!edge) throw new Error('NO_ROUTE');

    // (d) INSERT first journey / in-place UPDATE subsequent
    const now = new Date();
    const values = {
      fromNodeId: currentNodeId,
      toNodeId: destNode.id,
      departAt: now,
      travelSecondsRemaining: edge.travelSeconds,
      encounterActive: false,
      status: 'traveling' as const,
    };

    if (!row) {
      await tx.insert(playerTravelState).values({ userId, ...values });
    } else {
      await tx
        .update(playerTravelState)
        .set({ ...values, updatedAt: now })
        .where(eq(playerTravelState.userId, userId));
    }

    return { etaSeconds: edge.travelSeconds };
  });
}

async function resolveNodeIdByCode(code: string): Promise<number> {
  const [node] = await db.select().from(mapNodes).where(eq(mapNodes.code, code));
  if (!node) throw new Error(`NODE_NOT_FOUND:${code}`);
  return node.id;
}
