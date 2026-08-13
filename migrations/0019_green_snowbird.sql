CREATE TABLE "capture_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"tier" smallint NOT NULL,
	"fee" bigint NOT NULL,
	"displayed_chance" double precision NOT NULL,
	"roll" double precision NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"pity_before" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sanguo_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"active_hero_id" integer,
	"starter_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sanguo_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "str" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "agi" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "int" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "mov" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "lea" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "cha" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "mp" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "rarity" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "tier" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "hp_current" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "captured_zone" varchar(50);--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD COLUMN "encounter_id" integer;--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD COLUMN "type" varchar(20) DEFAULT 'encounter' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD COLUMN "seed" bigint;--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD COLUMN "pity_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_attempts" ADD CONSTRAINT "capture_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_attempts" ADD CONSTRAINT "capture_attempts_encounter_id_encounter_runs_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanguo_state" ADD CONSTRAINT "user_sanguo_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanguo_state" ADD CONSTRAINT "user_sanguo_state_active_hero_id_user_heroes_id_fk" FOREIGN KEY ("active_hero_id") REFERENCES "public"."user_heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_attempts_user_created_idx" ON "capture_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD CONSTRAINT "sanguo_battles_encounter_id_encounter_runs_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "rarity_range" CHECK ("heroes"."rarity" >= 1 AND "heroes"."rarity" <= 5);--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "tier_range" CHECK ("heroes"."tier" >= 1 AND "heroes"."tier" <= 5);