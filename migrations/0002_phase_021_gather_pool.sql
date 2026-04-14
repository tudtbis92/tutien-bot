-- Phase 02.1 Migration
-- 1. Rename profession_type enum value: khai_linh → phu_su
-- 2. Add tier column to items table
-- 3. Create gather_pool_items table
-- 4. Create partial unique index on items.name_i18n_key (for idempotent seed)
-- 5. Add unique constraint on recipes.result_item_id (for idempotent recipe upsert)
-- 6. Add unique constraint on gather_pool_items.item_id

-- Step 1: Rename enum value (PostgreSQL 10+ supports ALTER TYPE ... RENAME VALUE)
ALTER TYPE "public"."profession_type" RENAME VALUE 'khai_linh' TO 'phu_su';--> statement-breakpoint

-- Step 2: Add tier column to items
ALTER TABLE "items" ADD COLUMN "tier" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint

-- Step 3: Create gather_pool_items table
CREATE TABLE "gather_pool_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"min_major_realm_index" smallint DEFAULT 0 NOT NULL,
	"weight" smallint DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gather_pool_items" ADD CONSTRAINT "gather_pool_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Step 4: Partial unique index for idempotent seed upserts
-- Only enforces uniqueness on catalog (non-unique) items, allowing multiple unique items with same key
CREATE UNIQUE INDEX "items_catalog_name_unique" ON "items" USING btree ("name_i18n_key") WHERE "is_unique" = false;--> statement-breakpoint

-- Step 5: Unique constraint on recipes.result_item_id (one recipe per output item)
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_result_item_id_unique" UNIQUE ("result_item_id");--> statement-breakpoint

-- Step 6: Unique constraint on gather_pool_items.item_id (one pool entry per item)
ALTER TABLE "gather_pool_items" ADD CONSTRAINT "gather_pool_items_item_id_unique" UNIQUE ("item_id");--> statement-breakpoint

-- Index for efficient gather pool queries (filter by is_active, sort/join)
CREATE INDEX "gather_pool_active_realm_idx" ON "gather_pool_items" USING btree ("is_active", "min_major_realm_index");
