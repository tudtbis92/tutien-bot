CREATE TABLE "football_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"guild_id" varchar(20),
	"channel_id" varchar(20) NOT NULL,
	"message_id" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "over_under_line" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "over_odds" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "under_odds" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "home_spread_line" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "home_spread_odds" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "away_spread_line" varchar(20);--> statement-breakpoint
ALTER TABLE "football_matches" ADD COLUMN "away_spread_odds" varchar(20);--> statement-breakpoint
ALTER TABLE "football_announcements" ADD CONSTRAINT "football_announcements_match_id_football_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."football_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "football_announcements_match_channel_unique_idx" ON "football_announcements" USING btree ("match_id","channel_id");--> statement-breakpoint
CREATE INDEX "football_announcements_match_idx" ON "football_announcements" USING btree ("match_id");--> statement-breakpoint
ALTER TABLE "football_matches" DROP COLUMN "exact_score_odds";--> statement-breakpoint
ALTER TABLE "football_matches" DROP COLUMN "dk_event_id";--> statement-breakpoint
ALTER TABLE "football_matches" DROP COLUMN "announcement_channel_id";--> statement-breakpoint
ALTER TABLE "football_matches" DROP COLUMN "announcement_message_id";