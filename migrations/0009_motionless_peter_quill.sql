CREATE TYPE "public"."farming_plan" AS ENUM('free', 'basic', 'premium');--> statement-breakpoint
CREATE TYPE "public"."farming_status" AS ENUM('active', 'invalid', 'captcha_waiting', 'stopped');--> statement-breakpoint
CREATE TABLE "farming_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"encrypted_token" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" text NOT NULL,
	"proxy_url" text,
	"status" "farming_status" DEFAULT 'stopped' NOT NULL,
	"worker_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farming_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "farming_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"plan_type" "farming_plan" DEFAULT 'free' NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "farming_accounts" ADD CONSTRAINT "farming_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;