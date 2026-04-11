import { pgTable, serial, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  // Only one active season at a time — DB-level invariant enforcement
  // Partial unique index: only applies when is_active = true, allows multiple false rows
  uniqueIndex('idx_seasons_one_active').on(table.isActive).where(sql`${table.isActive} = true`),
]);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
