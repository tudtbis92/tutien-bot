import { pgTable, serial, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const apiCache = pgTable(
  'api_cache',
  {
    id: serial('id').primaryKey(),
    cacheKey: varchar('cache_key', { length: 500 }).notNull().unique(),
    endpoint: varchar('endpoint', { length: 200 }).notNull(),
    responseData: jsonb('response_data').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_cache_expires_at_idx').on(table.expiresAt),
  ]
);

export type ApiCache = typeof apiCache.$inferSelect;
export type NewApiCache = typeof apiCache.$inferInsert;
