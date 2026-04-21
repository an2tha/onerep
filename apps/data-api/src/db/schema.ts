import { pgTable, text, integer, real, jsonb, varchar, index, serial } from "drizzle-orm/pg-core";

// Only fields that Convex actually uses (from convex/schema.ts)

export const foodfacts = pgTable("foodfacts", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  serving: text("serving").notNull().default("100 g"),
  calories: real("calories").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
  popularityKey: integer("popularity_key"),
  servingGrams: real("serving_grams"),
  nutriscoreGrade: varchar("nutriscore_grade", { length: 10 }),
  novaGroup: integer("nova_group"),
  nutrients: jsonb("nututrients").$type<{ name: string; value: string; unit: string }[]>(),
  extraNutrients: jsonb("extra_nutrients").$type<{ name: string; value: string; unit: string }[]>(),
}, (table) => ({
  codeIdx: index("foodfacts_code_idx").on(table.code),
  nameIdx: index("foodfacts_name_idx").on(table.name),
}));

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  exerciseId: varchar("exercise_id", { length: 255 }).notNull().unique(),
  userId: text("user_id"), // null for global catalog
  name: text("name").notNull(),
  category: text("category").notNull(), // "strength" | "cardio" | "mobility" | "core"
  level: text("level").notNull().default("beginner"), // "beginner" | "intermediate" | "expert"
  mechanic: text("mechanic"), // "isolation" | "compound"
  equipment: text("equipment"),
  force: text("force"), // "push" | "pull" | "static"
  primaryMuscles: jsonb("primary_muscles").$type<string[]>(),
  secondaryMuscles: jsonb("secondary_muscles").$type<string[]>(),
  instructions: jsonb("instructions").$type<string[]>(),
}, (table) => ({
  exerciseIdIdx: index("exercises_exercise_id_idx").on(table.exerciseId),
  nameIdx: index("exercises_name_idx").on(table.name),
}));
