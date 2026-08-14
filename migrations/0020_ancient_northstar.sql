CREATE TABLE "sanguo_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"class" varchar(20) NOT NULL,
	"slot" varchar(10) NOT NULL,
	"rarity" varchar(10) NOT NULL,
	"mp_cost" smallint DEFAULT 0 NOT NULL,
	"mp_gain" smallint DEFAULT 0 NOT NULL,
	"effect_type" varchar(20) NOT NULL,
	"effect_value" smallint DEFAULT 0 NOT NULL,
	"emoji" varchar(100),
	CONSTRAINT "sanguo_skills_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_hero_soulgems" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hero_id" integer NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soulgem_amount_non_negative" CHECK ("user_hero_soulgems"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_legion_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"slot_order" smallint NOT NULL,
	"user_hero_id" integer,
	CONSTRAINT "legion_slot_order_range" CHECK ("user_legion_slots"."slot_order" >= 0 AND "user_legion_slots"."slot_order" <= 11)
);
--> statement-breakpoint
CREATE TABLE "user_legions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"formation_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soulgem_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hero_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "tier" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "skill_normal_id" integer;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD COLUMN "skill_special_id" integer;--> statement-breakpoint
ALTER TABLE "sanguo_items" ADD COLUMN "price_linh" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sanguo_items" ADD COLUMN "price_event" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sanguo_items" ADD COLUMN "sale_state" varchar(10) DEFAULT 'locked' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanguo_items" ADD COLUMN "drop_weight" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD COLUMN "level" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD COLUMN "skill_normal_id" integer;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD COLUMN "skill_special_id" integer;--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "emoji" varchar(100);--> statement-breakpoint
ALTER TABLE "user_hero_soulgems" ADD CONSTRAINT "user_hero_soulgems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hero_soulgems" ADD CONSTRAINT "user_hero_soulgems_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legion_slots" ADD CONSTRAINT "user_legion_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legion_slots" ADD CONSTRAINT "user_legion_slots_user_hero_id_user_heroes_id_fk" FOREIGN KEY ("user_hero_id") REFERENCES "public"."user_heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legions" ADD CONSTRAINT "user_legions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_legions" ADD CONSTRAINT "user_legions_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soulgem_transactions" ADD CONSTRAINT "soulgem_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soulgem_transactions" ADD CONSTRAINT "soulgem_transactions_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_hero_soulgems_unique_user_hero" ON "user_hero_soulgems" USING btree ("user_id","hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_legion_slots_unique_user_slot" ON "user_legion_slots" USING btree ("user_id","slot_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_legions_unique_user" ON "user_legions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "soulgem_transactions_user_idx" ON "soulgem_transactions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_skill_normal_id_sanguo_skills_id_fk" FOREIGN KEY ("skill_normal_id") REFERENCES "public"."sanguo_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_skill_special_id_sanguo_skills_id_fk" FOREIGN KEY ("skill_special_id") REFERENCES "public"."sanguo_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD CONSTRAINT "encounter_runs_skill_normal_id_sanguo_skills_id_fk" FOREIGN KEY ("skill_normal_id") REFERENCES "public"."sanguo_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD CONSTRAINT "encounter_runs_skill_special_id_sanguo_skills_id_fk" FOREIGN KEY ("skill_special_id") REFERENCES "public"."sanguo_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_slots_formation_slot_unique" ON "formation_slots" USING btree ("formation_id","slot_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_formations_unique_user_formation" ON "user_formations" USING btree ("user_id","formation_id");--> statement-breakpoint
ALTER TABLE "sanguo_items" DROP COLUMN "base_price";--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_tier_range" CHECK ("user_heroes"."tier" >= 0 AND "user_heroes"."tier" <= 3);