import { pgTable, serial, integer, timestamp, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { heroes } from './heroes.js';

/**
 * user_hero_soulgems — per-hero hồn ngọc pool (Phase 11, D-02, A7).
 * One row per (userId, heroId species): the pool is shared across copies of
 * the same hero ("spendable on Tào Tháo copies" — D-02), so heroId points at
 * the heroes catalog species, NOT a specific userHeroes copy.
 * amount >= 0 enforced by check; the WHERE-guard deduction (deductHonNgoc,
 * 11-03) mirrors wallet.deductBalance's rowCount pattern.
 */
export const userHeroSoulgems = pgTable(
  'user_hero_soulgems',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    heroId: integer('hero_id')
      .notNull()
      .references(() => heroes.id),
    amount: integer('amount').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('soulgem_amount_non_negative', sql`${table.amount} >= 0`),
    // One pool row per (user, hero species) — ON CONFLICT upsert target
    uniqueIndex('user_hero_soulgems_unique_user_hero').on(table.userId, table.heroId),
  ],
);

export type UserHeroSoulgem = typeof userHeroSoulgems.$inferSelect;
export type NewUserHeroSoulgem = typeof userHeroSoulgems.$inferInsert;
