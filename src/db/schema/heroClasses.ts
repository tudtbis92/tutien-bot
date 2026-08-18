import { pgTable, serial, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { heroes, heroClassEnum } from './heroes.js';

/**
 * hero_classes — the MULTI-CLASS assignment table (Phase 11 multi-class, 2026-08-18).
 *
 * A hero can fill MULTIPLE legion slots (the user's redesign): its PRIMARY
 * combat class stays on `heroes.class` (drives the battle engine's attack type
 * via getAttackType + the class-keyed skill pool + spawn), while this join
 * table holds the set of formation classes the hero may be assigned to.
 *
 * Legion slot matching (legionService strict-match, legion.ts
 * fetchClassMatchedHeroes) checks MEMBERSHIP in hero_classes instead of
 * comparing against heroes.class — a hero is eligible for a slot iff
 * (hero_id, slot.class) exists here.
 *
 * Each hero always carries its primary class in this table too (so the two
 * stay consistent); `classes` can be a superset.
 */
export const heroClasses = pgTable(
  'hero_classes',
  {
    id: serial('id').primaryKey(),
    heroId: integer('hero_id')
      .notNull()
      .references(() => heroes.id, { onDelete: 'cascade' }),
    class: heroClassEnum('class').notNull(),
  },
  (table) => [uniqueIndex('hero_classes_hero_class_unique').on(table.heroId, table.class)],
);
