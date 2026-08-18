import { pgTable, serial, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { formations } from './formations.js';

/**
 * formation_chemistry_links — the PER-FORMATION chemistry link graph
 * (CR-11-09, 2026-08-18).
 *
 * Each row is an UNDIRECTED edge between two slots of a formation:
 * (slot_a, slot_b). A position links to 1-3 OTHER positions (degree capped at
 * 3 by seed). Chemistry between two heroes activates ONLY when:
 *   1. they occupy two slots that form a link edge (the position gate), AND
 *   2. the two heroes share a relationship (family/spouse/faction/role — the
 *      EA FC-style relationship scoring, unchanged from Phase 11).
 *
 * slot_a < slot_b is enforced at insert time (undirected canonical edge) so a
 * pair is never duplicated. The per-formation topology is what makes each
 * formation play differently (can_ban sparse, thien_co dense, vu_sat
 * mains-heavy).
 */
export const formationChemistryLinks = pgTable(
  'formation_chemistry_links',
  {
    id: serial('id').primaryKey(),
    formationId: integer('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    slotA: integer('slot_a').notNull(),
    slotB: integer('slot_b').notNull(),
  },
  (table) => [
    uniqueIndex('formation_chemistry_links_pair_unique').on(
      table.formationId,
      table.slotA,
      table.slotB,
    ),
  ],
);
