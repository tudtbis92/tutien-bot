CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"locale" varchar(10) DEFAULT 'vi',
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "balance_non_negative" CHECK ("users"."balance" >= 0),
	CONSTRAINT "locale_valid" CHECK ("users"."locale" IN ('vi', 'en', 'zh-cn'))
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_seasons_one_active" ON "seasons" USING btree ("is_active") WHERE "seasons"."is_active" = true;