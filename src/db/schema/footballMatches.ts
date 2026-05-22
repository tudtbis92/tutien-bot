import { pgTable, serial, integer, smallint, varchar, timestamp, index } from 'drizzle-orm/pg-core';

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
    overUnderLine: varchar('over_under_line', { length: 20 }),
    overOdds: varchar('over_odds', { length: 20 }),
    underOdds: varchar('under_odds', { length: 20 }),
    homeSpreadLine: varchar('home_spread_line', { length: 20 }),
    homeSpreadOdds: varchar('home_spread_odds', { length: 20 }),
    awaySpreadLine: varchar('away_spread_line', { length: 20 }),
    awaySpreadOdds: varchar('away_spread_odds', { length: 20 }),
    homeTeamLogo: varchar('home_team_logo', { length: 500 }),
    awayTeamLogo: varchar('away_team_logo', { length: 500 }),
    homeTeamColor: varchar('home_team_color', { length: 20 }),
    awayTeamColor: varchar('away_team_color', { length: 20 }),
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
