import { pgTable, serial, integer, smallint, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const footballMatches = pgTable(
  'football_matches',
  {
    id: serial('id').primaryKey(),
    fixtureId: varchar('fixture_id', { length: 50 }).notNull().unique(),
    leagueId: varchar('league_id', { length: 20 }).notNull(),
    leagueName: varchar('league_name', { length: 100 }).notNull(),
    season: integer('season').notNull(),
    homeTeamId: varchar('home_team_id', { length: 20 }).notNull(),
    homeTeamName: varchar('home_team_name', { length: 200 }).notNull(),
    awayTeamId: varchar('away_team_id', { length: 20 }).notNull(),
    awayTeamName: varchar('away_team_name', { length: 200 }).notNull(),
    kickoffAt: timestamp('kickoff_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull(), // NS, 1H, HT, 2H, FT, etc.
    homeScore: smallint('home_score'),
    awayScore: smallint('away_score'),
    homeOdds: varchar('home_odds', { length: 20 }),
    drawOdds: varchar('draw_odds', { length: 20 }),
    awayOdds: varchar('away_odds', { length: 20 }),
    exactScoreOdds: jsonb('exact_score_odds'), // stores Correct Score odds map
    dkEventId: varchar('dk_event_id', { length: 20 }), // DraftKings event identifier for crawling
    announcementChannelId: varchar('announcement_channel_id', { length: 20 }),
    announcementMessageId: varchar('announcement_message_id', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('football_matches_kickoff_at_idx').on(table.kickoffAt),
    index('football_matches_status_idx').on(table.status),
  ]
);

export type FootballMatch = typeof footballMatches.$inferSelect;
export type NewFootballMatch = typeof footballMatches.$inferInsert;
