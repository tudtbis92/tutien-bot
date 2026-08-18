CREATE TABLE "hero_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"hero_id" integer NOT NULL,
	"class" "hero_class" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hero_classes" ADD CONSTRAINT "hero_classes_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hero_classes_hero_class_unique" ON "hero_classes" USING btree ("hero_id","class");