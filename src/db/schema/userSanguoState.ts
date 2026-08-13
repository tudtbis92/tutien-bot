import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { userHeroes } from './userHeroes.js';

/**
 * user_sanguo_state — one row per user for the sanguo sub-game's active
 * companion + starter-set rotation (Phase 10 A4/D-14). Mirrors
 * player_travel_state's one-row-per-user pattern (userId unique).
 * activeHeroId is NULL until the starter pick; starterViews increments per
 * /sanguo heroes invocation while the collection is empty (4th call+ →
 * starter set 2). Single-writer: 10-05/10-07 lock this row FOR UPDATE.
 */
export const userSanguoState = pgTable('user_sanguo_state', {
  id: serial('id').primaryKey(),
  // One row per user (A4)
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  // The active companion — NULL before the starter pick (D-14)
  activeHeroId: integer('active_hero_id').references(() => userHeroes.id),
  // D-14 rotation counter — incremented per /sanguo heroes invocation while
  // the collection is empty; 4th call+ → starter set 2
  starterViews: integer('starter_views').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserSanguoState = typeof userSanguoState.$inferSelect;
export type NewUserSanguoState = typeof userSanguoState.$inferInsert;
