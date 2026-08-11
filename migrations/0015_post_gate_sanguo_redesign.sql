CREATE TYPE "public"."hero_class" AS ENUM('vanguard', 'cavalry', 'archer', 'spellcaster', 'schemer', 'vu_co', 'thu_binh', 'cong_binh');--> statement-breakpoint
-- Phase 8 post-gate: heroes content is re-seeded idempotently after migrate
-- (scripts/seed-sanguo.ts upserts all 132 heroes). user_heroes + encounter_runs
-- are empty (Phase 9/10 consumers) — clearing the catalog makes the NOT NULL
-- faction_id/class additions and the hero_role enum-value change apply cleanly.
TRUNCATE TABLE "heroes" RESTART IDENTITY CASCADE;--> statement-breakpoint
CREATE TABLE "hero_factions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hero_factions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "formation_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"formation_id" integer NOT NULL,
	"slot_order" integer NOT NULL,
	"class" varchar(20) NOT NULL,
	"position" varchar(30),
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"slot_count" integer NOT NULL,
	"base_price" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "formations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_formations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"formation_id" integer NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_hp_range";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_atk_range";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_def_range";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_spd_range";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_crit_range";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP CONSTRAINT "iv_luck_range";--> statement-breakpoint
ALTER TABLE "heroes" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."hero_role";--> statement-breakpoint
CREATE TYPE "public"."hero_role" AS ENUM('ruler', 'general', 'strategist', 'civil', 'royal', 'eunuch', 'religious', 'tribal', 'scholar');--> statement-breakpoint
ALTER TABLE "heroes" ALTER COLUMN "role" SET DATA TYPE "public"."hero_role" USING "role"::"public"."hero_role";--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "faction_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "class" "hero_class" NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "family" varchar(30);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_str" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_agi" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_int" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_mov" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_lea" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "iv_cha" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "formation_slots" ADD CONSTRAINT "formation_slots_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_formations" ADD CONSTRAINT "user_formations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_formations" ADD CONSTRAINT "user_formations_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_faction_id_hero_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."hero_factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" DROP COLUMN "faction";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_hp";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_atk";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_def";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_spd";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_crit";--> statement-breakpoint
ALTER TABLE "user_heroes" DROP COLUMN "iv_luck";--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_str_range" CHECK ("user_heroes"."iv_str" >= 0 AND "user_heroes"."iv_str" <= 31);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_agi_range" CHECK ("user_heroes"."iv_agi" >= 0 AND "user_heroes"."iv_agi" <= 31);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_int_range" CHECK ("user_heroes"."iv_int" >= 0 AND "user_heroes"."iv_int" <= 31);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_mov_range" CHECK ("user_heroes"."iv_mov" >= 0 AND "user_heroes"."iv_mov" <= 31);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_lea_range" CHECK ("user_heroes"."iv_lea" >= 0 AND "user_heroes"."iv_lea" <= 31);--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "iv_cha_range" CHECK ("user_heroes"."iv_cha" >= 0 AND "user_heroes"."iv_cha" <= 31);--> statement-breakpoint
DROP TYPE "public"."hero_faction";