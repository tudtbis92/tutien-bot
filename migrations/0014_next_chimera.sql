CREATE TYPE "public"."wallet_transaction_type" AS ENUM('deduct', 'credit');--> statement-breakpoint
CREATE TYPE "public"."hero_faction" AS ENUM('hoang_toc', 'thap_thuong_thi', 'trieu_dinh', 'dang_nhan', 'tuong_trieu', 'khan_vang', 'luong_chau', 'quan_hung', 'chau_muc', 'ngoai_toc');--> statement-breakpoint
CREATE TYPE "public"."hero_role" AS ENUM('royal', 'eunuch', 'military', 'civil', 'religious');--> statement-breakpoint
CREATE TABLE "map_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"zone" varchar(50) NOT NULL,
	"node_order" smallint NOT NULL,
	"representative_hero_id" varchar(50),
	CONSTRAINT "map_nodes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" "wallet_transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amount_non_negative" CHECK ("wallet_transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "heroes" (
	"id" serial PRIMARY KEY NOT NULL,
	"hero_id" varchar(50) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"faction" "hero_faction" NOT NULL,
	"role" "hero_role" NOT NULL,
	"gender" varchar(20),
	"people" varchar(50),
	"title_vi" varchar(200),
	"weapon" varchar(50),
	"detail_en" text,
	CONSTRAINT "heroes_hero_id_unique" UNIQUE("hero_id")
);
--> statement-breakpoint
CREATE TABLE "user_heroes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hero_id" integer NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"iv_hp" smallint NOT NULL,
	"iv_atk" smallint NOT NULL,
	"iv_def" smallint NOT NULL,
	"iv_spd" smallint NOT NULL,
	"iv_crit" smallint NOT NULL,
	"iv_luck" smallint NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iv_hp_range" CHECK ("user_heroes"."iv_hp" >= 0 AND "user_heroes"."iv_hp" <= 31),
	CONSTRAINT "iv_atk_range" CHECK ("user_heroes"."iv_atk" >= 0 AND "user_heroes"."iv_atk" <= 31),
	CONSTRAINT "iv_def_range" CHECK ("user_heroes"."iv_def" >= 0 AND "user_heroes"."iv_def" <= 31),
	CONSTRAINT "iv_spd_range" CHECK ("user_heroes"."iv_spd" >= 0 AND "user_heroes"."iv_spd" <= 31),
	CONSTRAINT "iv_crit_range" CHECK ("user_heroes"."iv_crit" >= 0 AND "user_heroes"."iv_crit" <= 31),
	CONSTRAINT "iv_luck_range" CHECK ("user_heroes"."iv_luck" >= 0 AND "user_heroes"."iv_luck" <= 31)
);
--> statement-breakpoint
CREATE TABLE "player_travel_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_node_id" integer,
	"to_node_id" integer,
	"depart_at" timestamp with time zone NOT NULL,
	"arrive_at" timestamp with time zone NOT NULL,
	"cost" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'traveling' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_travel_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sanguo_battles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"round_logs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sanguo_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	"item_type" varchar(30) DEFAULT 'support' NOT NULL,
	"rarity" smallint DEFAULT 1 NOT NULL,
	"base_price" bigint DEFAULT 0 NOT NULL,
	"description_vi" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanguo_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_sanguo_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quantity_positive" CHECK ("user_sanguo_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "encounter_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"travel_id" integer,
	"zone" varchar(50) NOT NULL,
	"hero_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_heroes" ADD CONSTRAINT "user_heroes_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_travel_state" ADD CONSTRAINT "player_travel_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanguo_battles" ADD CONSTRAINT "sanguo_battles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanguo_items" ADD CONSTRAINT "user_sanguo_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanguo_items" ADD CONSTRAINT "user_sanguo_items_item_id_sanguo_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."sanguo_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD CONSTRAINT "encounter_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD CONSTRAINT "encounter_runs_travel_id_player_travel_state_id_fk" FOREIGN KEY ("travel_id") REFERENCES "public"."player_travel_state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_runs" ADD CONSTRAINT "encounter_runs_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_created_idx" ON "wallet_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_heroes_user_idx" ON "user_heroes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sanguo_items_user_idx" ON "user_sanguo_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sanguo_items_unique_user_item" ON "user_sanguo_items" USING btree ("user_id","item_id");