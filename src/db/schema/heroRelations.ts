import { pgTable, serial, integer, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { heroes } from './heroes.js';

/**
 * hero_relations — pairwise relationships between heroes (Phase 8 post-gate).
 * Only DIRECT spouse bonds are modeled (relation_type = 'spouse'); in-law
 * relations are excluded by design (bond target not present in roster).
 * Undirected: hero_a_id < hero_b_id enforced by the unique index + caller.
 * Chemistry (Phase 11): two heroes present in the same pair with type
 * 'spouse' receive the tier-1 bond (equal to family bloodline).
 */
export const heroRelationTypeEnum = pgEnum('hero_relation_type', ['spouse']);

export const heroRelations = pgTable(
  'hero_relations',
  {
    id: serial('id').primaryKey(),
    heroAId: integer('hero_a_id')
      .notNull()
      .references(() => heroes.id),
    heroBId: integer('hero_b_id')
      .notNull()
      .references(() => heroes.id),
    relationType: heroRelationTypeEnum('relation_type').notNull(),
  },
  (table) => [
    uniqueIndex('hero_relations_pair_unique').on(
      table.heroAId,
      table.heroBId,
      table.relationType,
    ),
  ],
);

export type HeroRelation = typeof heroRelations.$inferSelect;
export type NewHeroRelation = typeof heroRelations.$inferInsert;
