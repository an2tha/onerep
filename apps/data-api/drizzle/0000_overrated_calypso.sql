CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" varchar(255) NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"mechanic" text,
	"equipment" text,
	"force" text,
	"primary_muscles" jsonb,
	"secondary_muscles" jsonb,
	"instructions" jsonb,
	CONSTRAINT "exercises_exercise_id_unique" UNIQUE("exercise_id")
);
--> statement-breakpoint
CREATE TABLE "foodfacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"serving" text DEFAULT '100 g' NOT NULL,
	"calories" real DEFAULT 0 NOT NULL,
	"protein" real DEFAULT 0 NOT NULL,
	"carbs" real DEFAULT 0 NOT NULL,
	"fat" real DEFAULT 0 NOT NULL,
	"popularity_key" integer,
	"serving_grams" real,
	"nutriscore_grade" varchar(1),
	"nova_group" integer,
	"nutrients" jsonb,
	"extra_nutrients" jsonb,
	CONSTRAINT "foodfacts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX "exercises_exercise_id_idx" ON "exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree ("name");--> statement-breakpoint
CREATE INDEX "foodfacts_code_idx" ON "foodfacts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "foodfacts_name_idx" ON "foodfacts" USING btree ("name");