CREATE TYPE "public"."hero_relation_type" AS ENUM('spouse');--> statement-breakpoint
CREATE TABLE "hero_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"hero_a_id" integer NOT NULL,
	"hero_b_id" integer NOT NULL,
	"relation_type" "hero_relation_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hero_relations" ADD CONSTRAINT "hero_relations_hero_a_id_heroes_id_fk" FOREIGN KEY ("hero_a_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_relations" ADD CONSTRAINT "hero_relations_hero_b_id_heroes_id_fk" FOREIGN KEY ("hero_b_id") REFERENCES "public"."heroes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hero_relations_pair_unique" ON "hero_relations" USING btree ("hero_a_id","hero_b_id","relation_type");