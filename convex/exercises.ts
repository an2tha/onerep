import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const GLOBAL_EXERCISE_USER_ID = "__global__";
const MAX_LIMIT = 50;

const categoryValidator = v.union(
  v.literal("strength"),
  v.literal("cardio"),
  v.literal("mobility"),
  v.literal("core"),
);

type ExerciseCategory = "strength" | "cardio" | "mobility" | "core";
type ExerciseDoc = Doc<"exercises">;

type ClientExercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscle: string;
  description: string;
  sets: string;
  color: string;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
};

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? 0)) return 25;
  return Math.max(1, Math.min(Math.floor(limit ?? 25), MAX_LIMIT));
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryOf(doc: ExerciseDoc): ExerciseCategory {
  if (
    doc.category === "strength" ||
    doc.category === "cardio" ||
    doc.category === "mobility" ||
    doc.category === "core"
  ) {
    return doc.category;
  }
  return "strength";
}

function muscleLabel(doc: ExerciseDoc) {
  const muscles = [...doc.primaryMuscles, ...doc.secondaryMuscles]
    .slice(0, 4)
    .map(titleCase);
  return muscles.length > 0 ? muscles.join(" · ") : "Full Body";
}

function descriptionOf(doc: ExerciseDoc) {
  return (
    doc.instructions[0] ??
    `${doc.name} exercise using ${doc.equipment ?? "bodyweight or available equipment"}.`
  );
}

function defaultSets(category: ExerciseCategory) {
  switch (category) {
    case "cardio":
      return "20–40 min";
    case "mobility":
      return "2–3 × 60 s";
    case "core":
      return "3 × 12 reps";
    default:
      return "3 × 8–12 reps";
  }
}

function categoryColor(category: ExerciseCategory) {
  switch (category) {
    case "cardio":
      return "#f97316";
    case "mobility":
      return "#10b981";
    case "core":
      return "#3b82f6";
    default:
      return "#78716c";
  }
}

function toClientExercise(doc: ExerciseDoc): ClientExercise {
  const category = categoryOf(doc);
  return {
    id: doc.exerciseId,
    name: doc.name,
    category,
    muscle: muscleLabel(doc),
    description: descriptionOf(doc),
    sets: defaultSets(category),
    color: categoryColor(category),
    level: doc.level,
    mechanic: doc.mechanic ?? null,
    equipment: doc.equipment ?? null,
    primaryMuscles: doc.primaryMuscles,
    secondaryMuscles: doc.secondaryMuscles,
    instructions: doc.instructions,
  };
}

function uniqueCategories(categories: ExerciseCategory[] | undefined) {
  return [...new Set(categories ?? [])];
}

export const search = query({
  args: {
    query: v.optional(v.string()),
    categories: v.optional(v.array(categoryValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ClientExercise[]> => {
    const limit = clampLimit(args.limit);
    const searchText = (args.query ?? "").trim();
    const categories = uniqueCategories(args.categories);
    const takeEach = Math.min(Math.max(limit * 3, limit), 150);
    let docs: ExerciseDoc[] = [];

    if (searchText) {
      if (categories.length > 0) {
        for (const category of categories) {
          docs.push(
            ...(await ctx.db
              .query("exercises")
              .withSearchIndex("search_name", (q) =>
                q
                  .search("name", searchText)
                  .eq("userId", GLOBAL_EXERCISE_USER_ID)
                  .eq("category", category),
              )
              .take(takeEach)),
          );
        }
      } else {
        docs = await ctx.db
          .query("exercises")
          .withSearchIndex("search_name", (q) =>
            q.search("name", searchText).eq("userId", GLOBAL_EXERCISE_USER_ID),
          )
          .take(Math.min(limit * 4, 200));
      }
    } else if (categories.length > 0) {
      for (const category of categories) {
        docs.push(
          ...(await ctx.db
            .query("exercises")
            .withIndex("by_userId_and_category", (q) =>
              q.eq("userId", GLOBAL_EXERCISE_USER_ID).eq("category", category),
            )
            .take(takeEach)),
        );
      }
    } else {
      docs = await ctx.db
        .query("exercises")
        .withIndex("by_userId", (q) => q.eq("userId", GLOBAL_EXERCISE_USER_ID))
        .take(limit);
    }

    const seen = new Set<string>();
    const result: ClientExercise[] = [];
    for (const doc of docs) {
      if (seen.has(doc.exerciseId)) continue;
      seen.add(doc.exerciseId);
      result.push(toClientExercise(doc));
      if (result.length >= limit) break;
    }
    return result;
  },
});

export const resolve = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args): Promise<Record<string, ClientExercise>> => {
    const ids = [...new Set(args.ids.filter(Boolean))].slice(0, 100);
    const result: Record<string, ClientExercise> = {};

    for (const id of ids) {
      const doc = await ctx.db
        .query("exercises")
        .withIndex("by_userId_and_exerciseId", (q) =>
          q.eq("userId", GLOBAL_EXERCISE_USER_ID).eq("exerciseId", id),
        )
        .first();
      if (!doc) continue;
      result[id] = toClientExercise(doc);
    }

    return result;
  },
});
