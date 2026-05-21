import { pgTable, serial, integer, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const predictionChannels = pgTable(
  'prediction_channels',
  {
    id: serial('id').primaryKey(),
    guildId: varchar('guild_id', { length: 20 }).notNull(),
    channelId: varchar('channel_id', { length: 20 }).notNull(),
    leagueId: integer('league_id').notNull(), // 0 = global toggle for the entire channel
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('prediction_channels_guild_channel_league_unique_idx').on(table.guildId, table.channelId, table.leagueId),
    index('prediction_channels_guild_channel_idx').on(table.guildId, table.channelId),
    index('prediction_channels_channel_league_idx').on(table.channelId, table.leagueId),
  ]
);

export type PredictionChannel = typeof predictionChannels.$inferSelect;
export type NewPredictionChannel = typeof predictionChannels.$inferInsert;
