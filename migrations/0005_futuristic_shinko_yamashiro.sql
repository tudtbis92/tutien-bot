ALTER TABLE "football_matches" ALTER COLUMN "fixture_id" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "football_matches" ALTER COLUMN "league_id" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ALTER COLUMN "home_team_id" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ALTER COLUMN "away_team_id" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ALTER COLUMN "status" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "prediction_channels" ALTER COLUMN "league_id" SET DATA TYPE varchar(20);