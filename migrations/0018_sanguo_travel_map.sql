CREATE TABLE "map_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"sort_order" smallint NOT NULL,
	"encounter_rate" numeric DEFAULT '0.35' NOT NULL,
	"boss_rate" numeric DEFAULT '0.07' NOT NULL,
	CONSTRAINT "map_zones_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "map_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_a_id" integer NOT NULL,
	"node_b_id" integer NOT NULL,
	"travel_seconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_zone_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"hero_id" integer NOT NULL,
	"zone" varchar(50) NOT NULL,
	"rate" numeric(4, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_travel_state" ADD COLUMN "travel_seconds_remaining" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_travel_state" ADD COLUMN "encounter_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD COLUMN "encounter_type" varchar(20) DEFAULT 'hero' NOT NULL;--> statement-breakpoint
ALTER TABLE "hero_zone_rates" ADD CONSTRAINT "hero_zone_rates_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_edges_pair_unique" ON "map_edges" USING btree ("node_a_id","node_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hero_zone_rates_hero_zone_unique" ON "hero_zone_rates" USING btree ("hero_id","zone");--> statement-breakpoint
CREATE INDEX "encounter_runs_user_status_idx" ON "encounter_runs" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "player_travel_state" DROP COLUMN "arrive_at";--> statement-breakpoint
ALTER TABLE "player_travel_state" DROP COLUMN "cost";