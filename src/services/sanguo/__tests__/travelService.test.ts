/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { asc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { mapNodes } from '../../../db/schema/mapNodes.js';
import { mapEdges } from '../../../db/schema/mapEdges.js';
import { playerTravelState } from '../../../db/schema/playerTravelState.js';
import {
  START_NODE,
  getCurrentPosition,
  getAdjacentNodes,
  startTravel,
} from '../travelService.js';

vi.mock('../../../db/client.js', () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

/** db.select().from(table).where(cond) — resolves rows per table (no orderBy/limit). */
function mockSimpleSelect(rowsByTable: Map<unknown, unknown[]>) {
  const where = vi.fn();
  const from = vi.fn((table: unknown) => {
    where.mockResolvedValue(rowsByTable.get(table) ?? []);
    return { where };
  });
  (db.select as any).mockReturnValue({ from });
  return { where, from };
}

/** db.select().from(table).innerJoin(...).where(...).orderBy(...).limit(n). */
function mockJoinSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  (db.select as any).mockReturnValue({ from });
  return { innerJoin, where, orderBy, limit };
}

/** db.transaction(tx) — tx.select().from(table).where(...) / tx.insert / tx.update. */
function mockTx(opts: {
  destNode?: Record<string, unknown>;
  startNode?: Record<string, unknown>;
  travelRow?: Record<string, unknown>;
  edge?: Record<string, unknown>;
}) {
  const forUpdate = vi.fn().mockResolvedValue(opts.travelRow ? [opts.travelRow] : []);
  // The destination lookup runs first; the START_NODE lookup only runs on the
  // first journey (no travel row), so use a once-chain when a start node exists.
  const nodeWhere = opts.startNode
    ? vi
        .fn()
        .mockResolvedValueOnce(opts.destNode ? [opts.destNode] : [])
        .mockResolvedValueOnce([opts.startNode])
    : vi.fn().mockResolvedValue(opts.destNode ? [opts.destNode] : []);
  const edgeWhere = vi.fn().mockResolvedValue(opts.edge ? [opts.edge] : []);
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const txFrom = vi.fn((table: unknown) => {
    if (table === playerTravelState) return { where: vi.fn(() => ({ for: forUpdate })) };
    if (table === mapNodes) return { where: nodeWhere };
    return { where: edgeWhere }; // mapEdges
  });
  const tx = {
    select: vi.fn(() => ({ from: txFrom })),
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet })),
  };
  (db.transaction as any).mockImplementation(
    async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  );
  return { tx, forUpdate, insertValues, updateSet, updateWhere };
}

describe('travelService (journey-start domain, users.id)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('START_NODE', () => {
    it('defaults the first-ever journey origin to luoyang (A6)', () => {
      expect(START_NODE).toBe('luoyang');
    });
  });

  describe('getCurrentPosition', () => {
    it('returns START_NODE when no travel row exists (first-ever journey)', async () => {
      mockSimpleSelect(
        new Map<unknown, unknown[]>([
          [playerTravelState, []],
          [mapNodes, [{ id: 5, code: 'luoyang' }]],
        ]),
      );

      await expect(getCurrentPosition(42)).resolves.toEqual({
        nodeId: 5,
        nodeCode: 'luoyang',
      });
    });

    it('returns toNodeId when the row status is arrived', async () => {
      mockSimpleSelect(
        new Map<unknown, unknown[]>([
          [
            playerTravelState,
            [{ id: 1, userId: 42, fromNodeId: 5, toNodeId: 7, status: 'arrived' }],
          ],
          [mapNodes, [{ id: 7, code: 'xuchang' }]],
        ]),
      );

      await expect(getCurrentPosition(42)).resolves.toEqual({
        nodeId: 7,
        nodeCode: 'xuchang',
      });
    });

    it('returns fromNodeId when the row status is traveling (in-flight position)', async () => {
      mockSimpleSelect(
        new Map<unknown, unknown[]>([
          [
            playerTravelState,
            [{ id: 1, userId: 42, fromNodeId: 5, toNodeId: 7, status: 'traveling' }],
          ],
          [mapNodes, [{ id: 5, code: 'luoyang' }]],
        ]),
      );

      await expect(getCurrentPosition(42)).resolves.toEqual({
        nodeId: 5,
        nodeCode: 'luoyang',
      });
    });
  });

  describe('getAdjacentNodes', () => {
    it('returns edges joined to node data ordered by travelSeconds ASC, capped at 25', async () => {
      const rows = [
        {
          nodeId: 9,
          code: 'yecheng',
          nameVi: 'Nghiệp Thành',
          nameEn: 'Yecheng',
          nameZh: '邺城',
          zone: 'ky_chau',
          travelSeconds: 900,
          representativeHeroId: 'yuan_shao',
        },
        {
          nodeId: 11,
          code: 'julu',
          nameVi: 'Cự Lộc',
          nameEn: 'Julu',
          nameZh: '巨鹿',
          zone: 'ky_chau',
          travelSeconds: 1800,
          representativeHeroId: 'truong_giac',
        },
      ];
      const m = mockJoinSelect(rows);

      await expect(getAdjacentNodes(7)).resolves.toEqual(rows);
      expect(m.orderBy).toHaveBeenCalledWith(asc(mapEdges.travelSeconds));
      expect(m.limit).toHaveBeenCalledWith(25);
    });
  });

  describe('startTravel', () => {
    it('INSERTs on the first journey (START_NODE origin) and returns the ETA', async () => {
      const m = mockTx({
        destNode: { id: 9, code: 'yecheng' },
        startNode: { id: 5, code: 'luoyang' },
        edge: { id: 1, nodeAId: 5, nodeBId: 9, travelSeconds: 900 },
      });

      await expect(startTravel(42, 'yecheng')).resolves.toEqual({ etaSeconds: 900 });

      expect(m.tx.insert).toHaveBeenCalledWith(playerTravelState);
      expect(m.insertValues).toHaveBeenCalledWith({
        userId: 42,
        fromNodeId: 5,
        toNodeId: 9,
        departAt: expect.any(Date),
        travelSecondsRemaining: 900,
        encounterActive: false,
        status: 'traveling',
      });
      expect(m.tx.update).not.toHaveBeenCalled();
    });

    it('UPDATEs the existing row in place on a subsequent journey (userId.unique() = one row forever)', async () => {
      const m = mockTx({
        destNode: { id: 11, code: 'julu' },
        travelRow: { id: 1, userId: 42, fromNodeId: 7, toNodeId: 9, status: 'arrived' },
        edge: { id: 2, nodeAId: 9, nodeBId: 11, travelSeconds: 1200 },
      });

      await expect(startTravel(42, 'julu')).resolves.toEqual({ etaSeconds: 1200 });

      expect(m.tx.insert).not.toHaveBeenCalled();
      expect(m.tx.update).toHaveBeenCalledWith(playerTravelState);
      expect(m.updateSet).toHaveBeenCalledWith({
        fromNodeId: 9,
        toNodeId: 11,
        departAt: expect.any(Date),
        travelSecondsRemaining: 1200,
        encounterActive: false,
        status: 'traveling',
        updatedAt: expect.any(Date),
      });
      expect(m.updateWhere).toHaveBeenCalled();
    });

    it('throws ALREADY_TRAVELING when the row status is traveling (D-09)', async () => {
      mockTx({
        destNode: { id: 9, code: 'yecheng' },
        travelRow: { id: 1, userId: 42, fromNodeId: 5, toNodeId: 7, status: 'traveling' },
      });

      await expect(startTravel(42, 'yecheng')).rejects.toThrow('ALREADY_TRAVELING');
    });

    it('reads the current row with .for(\'update\') — the double-start race is closed by the lock (F3)', async () => {
      const m = mockTx({
        destNode: { id: 9, code: 'yecheng' },
        travelRow: { id: 1, userId: 42, fromNodeId: 5, toNodeId: 7, status: 'arrived' },
        edge: { id: 1, nodeAId: 5, nodeBId: 9, travelSeconds: 900 },
      });

      await startTravel(42, 'yecheng');

      expect(m.forUpdate).toHaveBeenCalled();
    });

    it('throws NO_ROUTE when the destination is not adjacent (Pitfall 4 — select value is advisory)', async () => {
      mockTx({
        destNode: { id: 11, code: 'julu' },
        travelRow: { id: 1, userId: 42, fromNodeId: 5, toNodeId: 7, status: 'arrived' },
        // no edge → NO_ROUTE before any write
      });

      await expect(startTravel(42, 'julu')).rejects.toThrow('NO_ROUTE');
    });

    it('throws NO_ROUTE when the destination code is unknown', async () => {
      mockTx({
        // no destNode → unknown code
      });

      await expect(startTravel(42, 'not_a_node')).rejects.toThrow('NO_ROUTE');
    });
  });
});
