import { pgTable, serial, integer, smallint, timestamp, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { formations } from './formations.js';
import { userHeroes } from './userHeroes.js';

/**
 * user_legions — active legion state (Phase 11, A9).
 * ONE row per user (unique userId): a player has exactly one active legion.
 */
export const userLegions = pgTable(
  'user_legions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    formationId: integer('formation_id')
      .notNull()
      .references(() => formations.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One active legion per user (A9) — the 11-07 saveLegion upsert target
    uniqueIndex('user_legions_unique_user').on(table.userId),
  ],
);

/**
 * user_legion_slots — the 12 formation slots (0-11) of the active legion.
 * userHeroId NULL = empty slot (D-20 bonus-only: incomplete assembly allowed).
 */
export const userLegionSlots = pgTable(
  'user_legion_slots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    slotOrder: smallint('slot_order').notNull(),
    userHeroId: integer('user_hero_id').references(() => userHeroes.id),
  },
  (table) => [
    check('legion_slot_order_range', sql`${table.slotOrder} >= 0 AND ${table.slotOrder} <= 11`),
    // Unique per (user, slotOrder) — one hero per slot per legion
    uniqueIndex('user_legion_slots_unique_user_slot').on(table.userId, table.slotOrder),
  ],
);

export type UserLegion = typeof userLegions.$inferSelect;
export type NewUserLegion = typeof userLegions.$inferInsert;
export type UserLegionSlot = typeof userLegionSlots.$inferSelect;
export type NewUserLegionSlot = typeof userLegionSlots.$inferInsert;
