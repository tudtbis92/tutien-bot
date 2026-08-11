CREATE TABLE "hero_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_zh" varchar(100),
	CONSTRAINT "hero_families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "family_id" integer;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_family_id_hero_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."hero_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" DROP COLUMN "family";