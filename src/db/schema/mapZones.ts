import { pgTable, serial, varchar, smallint, numeric } from 'drizzle-orm/pg-core';

/**
 * map_zones — zone reference table (TQC-09, D-19).
 * 18 researched zones (13 Đông Hán châu + 5 outlying: Giao Châu, Triều Tiên,
 * Ô Hoàn, Tiên Ti, Hung Nô). Content-in-DB per-locale names (NOT i18n keys).
 * `code` is the join key with map_nodes.zone (varchar) and hero_zone_rates.zone
 * — the encounter-pool blend math keys per-zone rates on the same code.
 * encounter_rate / boss_rate are zone-configurable DATA (A7) — defaults 0.35 /
 * 0.07, tunable without redeploy.
 */
export const mapZones = pgTable('map_zones', {
  id: serial('id').primaryKey(),
  // Natural key for the idempotent seed upsert (drizzle-kit unique index)
  code: varchar('code', { length: 50 }).notNull().unique(),
  nameVi: varchar('name_vi', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // Nullable — clobber-safe seed spread writes it only when a value exists
  nameZh: varchar('name_zh', { length: 100 }),
  sortOrder: smallint('sort_order').notNull(),
  // Zone-configurable encounter probability per counted travel minute (D-10/A7)
  encounterRate: numeric('encounter_rate').notNull().default('0.35'),
  // Boss sub-roll probability replacing a successful normal roll (D-14/A7)
  bossRate: numeric('boss_rate').notNull().default('0.07'),
});

export type MapZone = typeof mapZones.$inferSelect;
export type NewMapZone = typeof mapZones.$inferInsert;
