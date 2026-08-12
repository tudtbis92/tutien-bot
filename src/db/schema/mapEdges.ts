import { pgTable, serial, integer, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * map_edges — the D-17 graph: undirected edges between map_nodes with a
 * travel time (seconds). The adjacency source for travelService.getAdjacentNodes
 * and startTravel's server-side NO_ROUTE validation (Pitfall 4).
 * Plain integers, NO references() — mirrors heroRelations' undirected
 * unique-pair pattern; callers store each pair once (node_a_id < node_b_id
 * canonical order). The index.ts re-export lands in plan 09-02.
 */
export const mapEdges = pgTable(
  'map_edges',
  {
    id: serial('id').primaryKey(),
    nodeAId: integer('node_a_id').notNull(),
    nodeBId: integer('node_b_id').notNull(),
    travelSeconds: integer('travel_seconds').notNull(),
  },
  (table) => [
    uniqueIndex('map_edges_pair_unique').on(table.nodeAId, table.nodeBId),
  ],
);

export type MapEdge = typeof mapEdges.$inferSelect;
export type NewMapEdge = typeof mapEdges.$inferInsert;
