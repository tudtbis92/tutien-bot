CREATE TABLE "football_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"league_name" varchar(100) NOT NULL,
	"season" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"home_team_name" varchar(200) NOT NULL,
	"away_team_id" integer NOT NULL,
	"away_team_name" varchar(200) NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"status" varchar(10) NOT NULL,
	"home_score" smallint,
	"away_score" smallint,
	"home_odds" varchar(20),
	"draw_odds" varchar(20),
	"away_odds" varchar(20),
	"exact_score_odds" jsonb,
	"announcement_channel_id" varchar(20),
	"announcement_message_id" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "football_matches_fixture_id_unique" UNIQUE("fixture_id")
);
--> statement-breakpoint
CREATE TABLE "football_bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"bet_type" varchar(20) NOT NULL,
	"prediction" varchar(50) NOT NULL,
	"wager_amount" bigint NOT NULL,
	"potential_payout" bigint,
	"odds_used" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wager_amount_non_negative" CHECK ("football_bets"."wager_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_key" varchar(500) NOT NULL,
	"endpoint" varchar(200) NOT NULL,
	"response_data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "prediction_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"league_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "football_bets" ADD CONSTRAINT "football_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_bets" ADD CONSTRAINT "football_bets_fixture_id_football_matches_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."football_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "football_matches_kickoff_at_idx" ON "football_matches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "football_matches_status_idx" ON "football_matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "football_bets_user_fixture_bet_type_unique_idx" ON "football_bets" USING btree ("user_id","fixture_id","bet_type");--> statement-breakpoint
CREATE INDEX "football_bets_fixture_status_idx" ON "football_bets" USING btree ("fixture_id","status");--> statement-breakpoint
CREATE INDEX "football_bets_user_idx" ON "football_bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_cache_expires_at_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_channels_guild_channel_league_unique_idx" ON "prediction_channels" USING btree ("guild_id","channel_id","league_id");--> statement-breakpoint
CREATE INDEX "prediction_channels_guild_channel_idx" ON "prediction_channels" USING btree ("guild_id","channel_id");--> statement-breakpoint
CREATE INDEX "prediction_channels_channel_league_idx" ON "prediction_channels" USING btree ("channel_id","league_id");