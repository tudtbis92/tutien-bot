CREATE TYPE "public"."proxy_status" AS ENUM('active', 'dead', 'maintenance');--> statement-breakpoint
CREATE TABLE "proxies" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"location" text,
	"provider" text,
	"status" "proxy_status" DEFAULT 'active' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farming_accounts" ADD COLUMN "proxy_id" integer;--> statement-breakpoint
ALTER TABLE "farming_accounts" ADD CONSTRAINT "farming_accounts_proxy_id_proxies_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."proxies"("id") ON DELETE no action ON UPDATE no action;