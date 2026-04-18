import { v } from "convex/values";
import { query } from "../_generated/server";
import { authComponent } from "../auth";

type ExerciseCategory = "strength" | "cardio" | "mobility" | "core";

function categoryColor(category: ExerciseCategory): string {
  switch (category) {
    case "strength":
      return "#57534e";
    case "cardio":
      return "#ea580c";
    case "mobility":
      return "#0d9488";
    case "core":
      return "#0284c7";
  }
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function buildMuscleLabel(
  primaryMuscles: string[],
  secondaryMuscles: string[],
): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of [...primaryMuscles, ...secondaryMuscles]) {
    const key = m.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(titleCase(m.trim()));
  }
  return result.length > 0 ? result.join(" · ") : "Full body";
}

function buildDescription(
  instructions: string[],
  equipment: string | undefined,
  mechanic: string | undefined,
  level: string,
): string {
  const first = instructions
    .slice(0, 2)
    .map((s) => s.trim())
    .filter(Boolean);
  if (first.length > 0) {
    const summary = first.join(" ");
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  }
  const parts = [
    equipment ? titleCase(equipment) : null,
    mechanic ? titleCase(mechanic) : null,
    titleCase(level),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Exercise details available";
}

function buildSuggestedSets(
  category: string,
  mechanic: string | undefined,
  level: string,
): string {
  if (category === "mobility") return "2 × 30 s / side";
  if (category === "cardio") return "20–30 min";
  if (mechanic === "isolation") return "3 × 12 reps";
  if (level === "beginner") return "3 × 10 reps";
  if (level === "intermediate") return "4 × 8 reps";
  return "5 × 5 reps";
}

function normalizeCategory(raw: string): ExerciseCategory {
  if (raw === "stretching") return "mobility";
  if (raw === "cardio") return "cardio";
  return "strength";
}

import { mutation, query } from "../_generated/server";

// ... previous helpers (categoryColor, titleCase, buildMuscleLabel, buildDescription, buildSuggestedSets, normalizeCategory) remain the same

// ── create ────────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    muscle: v.optional(v.string()),
    description: v.optional(v.string()),
    equipment: v.optional(v.string()),
    mechanic: v.optional(v.string()),
    level: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const exerciseId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    await ctx.db.insert("exercises", {
      userId: user._id,
      exerciseId,
      name: args.name,
      category: args.category,
      muscle: args.muscle || "Custom",
      description: args.description || "User-defined exercise",
      level: args.level || "intermediate",
      mechanic: args.mechanic,
      equipment: args.equipment,
      primaryMuscles: args.muscle ? [args.muscle] : [],
      secondaryMuscles: [],
      instructions: args.description ? [args.description] : [],
    });

    return exerciseId;
  },
});

// ── search ────────────────────────────────────────────────────────────────────

export const search = query({
  args: {
    query: v.string(),
    categories: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const q = args.query.trim();
    const limit = Math.min(args.limit ?? 25, 50);

    // 1. Search global catalog
    const globalDocs = await ctx.db
      .query("exercises")
      .withSearchIndex("search_name", (s) => 
        s.search("name", q).eq("userId", undefined)
      )
      .take(limit);

    // 2. Search user's custom exercises
    const userDocs = await ctx.db
      .query("exercises")
      .withSearchIndex("search_name", (s) => 
        s.search("name", q).eq("userId", user._id)
      )
      .take(limit);

    const results = [...globalDocs, ...userDocs]
      .map((doc) => {
        const category = normalizeCategory(doc.category);
        return {
          id: doc.exerciseId,
          name: doc.name,
          category,
          muscle: doc.userId ? (doc.muscle || "Custom") : buildMuscleLabel(doc.primaryMuscles, doc.secondaryMuscles),
          description: doc.userId ? doc.description : buildDescription(
            doc.instructions,
            doc.equipment,
            doc.mechanic,
            doc.level,
          ),
          sets: buildSuggestedSets(doc.category, doc.mechanic, doc.level),
          color: categoryColor(category),
          level: doc.level,
          mechanic: doc.mechanic ?? null,
          equipment: doc.equipment ?? null,
          primaryMuscles: doc.primaryMuscles,
          secondaryMuscles: doc.secondaryMuscles,
          instructions: doc.instructions,
        };
      })
      .filter((e) => {
        if (!args.categories || args.categories.length === 0) return true;
        return args.categories.includes(e.category);
      });

    return results.slice(0, limit);
  },
});
