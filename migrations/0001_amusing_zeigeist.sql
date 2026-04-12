CREATE TYPE "public"."spiritual_root" AS ENUM('kim', 'moc', 'thuy', 'hoa', 'tho');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('material', 'consumable', 'equipment', 'formation', 'stone', 'scroll', 'companion', 'food', 'artifact');--> statement-breakpoint
CREATE TYPE "public"."profession_type" AS ENUM('luyen_dan', 'luyen_khi_nc', 'tran_phap', 'linh_tru', 'luyen_co', 'duoc_su', 'thuan_thu', 'luyen_kim', 'khai_linh', 'thuat_su');--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"spiritual_root" "spiritual_root" NOT NULL,
	"realm_id" smallint DEFAULT 0 NOT NULL,
	"tu_vi" bigint DEFAULT 0 NOT NULL,
	"daily_tuvi" integer DEFAULT 0 NOT NULL,
	"daily_tuvi_reset_at" timestamp with time zone DEFAULT now(),
	"profession_points" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_reaction_at" timestamp with time zone,
	"voice_session_started_at" timestamp with time zone,
	"anomaly_flag" boolean DEFAULT false NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "realm_id_range" CHECK ("characters"."realm_id" >= 0 AND "characters"."realm_id" <= 41),
	CONSTRAINT "daily_tuvi_non_negative" CHECK ("characters"."daily_tuvi" >= 0),
	CONSTRAINT "tu_vi_non_negative" CHECK ("characters"."tu_vi" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_i18n_key" varchar(100) NOT NULL,
	"type" "item_type" NOT NULL,
	"base_price" bigint DEFAULT 0 NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"creator_character_id" integer,
	"custom_name" varchar(50),
	"custom_emoji" varchar(100),
	"attributes" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "character_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quantity_positive" CHECK ("character_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"result_item_id" integer NOT NULL,
	"profession_type" "profession_type" NOT NULL,
	"min_profession_level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_activity" (
	"character_id" integer NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_activity_character_id_guild_id_pk" PRIMARY KEY("character_id","guild_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_creator_character_id_characters_id_fk" FOREIGN KEY ("creator_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_result_item_id_items_id_fk" FOREIGN KEY ("result_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_activity" ADD CONSTRAINT "guild_activity_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_discord_id_idx" ON "characters" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "characters_tu_vi_idx" ON "characters" USING btree ("tu_vi");--> statement-breakpoint
CREATE INDEX "char_items_character_idx" ON "character_items" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "char_items_unique_char_item" ON "character_items" USING btree ("character_id","item_id");--> statement-breakpoint
CREATE INDEX "guild_activity_guild_id_idx" ON "guild_activity" USING btree ("guild_id");