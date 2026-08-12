import { pgTable, serial, integer, varchar, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { heroes } from './heroes.js';

/**
 * hero_zone_rates — many-to-many hero → zone mapping with per-hero-per-zone
 * weights (TQC-09, D-16 / A3 per-zone granularity).
 * One row per (hero, zone) pair — a hero in multiple zones = multiple rows.
 * `rate` is a RELATIVE weight within the zone pool (1.0 primary residence,
 * 0.5 secondary association, 0.3 tertiary) — NOT a probability; weights are
 * normalized at roll time via the D-15 position blend.
 * `zone` is the map_zones.code varchar (same space as map_nodes.zone) — the
 * encounter roll (09-04) reads these at tick time.
 */
export const heroZoneRates = pgTable(
  'hero_zone_rates',
  {
    id: serial('id').primaryKey(),
    heroId: integer('hero_id')
      .notNull()
      .references(() => heroes.id),
    zone: varchar('zone', { length: 50 }).notNull(),
    rate: numeric('rate', { precision: 4, scale: 2 }).notNull(),
  },
  (table) => [
    // Idempotent upsert key — re-running the seed never duplicates rows
    uniqueIndex('hero_zone_rates_hero_zone_unique').on(table.heroId, table.zone),
  ],
);

export type HeroZoneRate = typeof heroZoneRates.$inferSelect;
export type NewHeroZoneRate = typeof heroZoneRates.$inferInsert;
