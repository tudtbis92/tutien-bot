import { pgTable, integer, varchar, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { characters } from './characters.js';

// Tracks which characters have been active in which guilds.
// Enables guild-specific leaderboard queries without Discord API calls.
// Updated by ActivityWorker after each successful tu vi award.
export const guildActivity = pgTable(
  'guild_activity',
  {
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id),
    // Discord guild (server) snowflake ID
    guildId: varchar('guild_id', { length: 20 }).notNull(),
    // Timestamp of last activity in this guild — kept up-to-date on each activity
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    // Composite PK: (characterId, guildId) — uniqueness enforced, enables upsert
    // NOTE: PK is characterId-first → efficient for "all guilds for character" queries
    primaryKey({ columns: [table.characterId, table.guildId] }),
    // REQUIRED: Secondary index on guildId alone for guild leaderboard query
    // WHERE guildId = $x cannot use the composite PK (characterId-first scan order)
    index('guild_activity_guild_id_idx').on(table.guildId),
  ],
);

export type GuildActivity = typeof guildActivity.$inferSelect;
export type NewGuildActivity = typeof guildActivity.$inferInsert;
