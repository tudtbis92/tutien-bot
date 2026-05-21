import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { footballMatches } from './footballMatches.js';

export const footballAnnouncements = pgTable(
  'football_announcements',
  {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .notNull()
      .references(() => footballMatches.id, { onDelete: 'cascade' }),
    guildId: varchar('guild_id', { length: 20 }),
    channelId: varchar('channel_id', { length: 20 }).notNull(),
    messageId: varchar('message_id', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('football_announcements_match_channel_unique_idx').on(table.matchId, table.channelId),
    index('football_announcements_match_idx').on(table.matchId),
  ]
);

export type FootballAnnouncement = typeof footballAnnouncements.$inferSelect;
export type NewFootballAnnouncement = typeof footballAnnouncements.$inferInsert;
