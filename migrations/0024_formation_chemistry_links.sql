CREATE TABLE "formation_chemistry_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"formation_id" integer NOT NULL,
	"slot_a" integer NOT NULL,
	"slot_b" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "formation_chemistry_links" ADD CONSTRAINT "formation_chemistry_links_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "formation_chemistry_links_pair_unique" ON "formation_chemistry_links" USING btree ("formation_id","slot_a","slot_b");