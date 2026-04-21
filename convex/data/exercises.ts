import { v } from "convex/values";
import { action, mutation, internalQuery, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { authComponent } from "../auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseCategory = "strength" | "cardio" | "mobility" | "core";

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_API_URL = process.env.DATA_API_URL;
const DATA_API_KEY = process.env.DATA_API_KEY;

function apiHeaders(): HeadersInit {
  return DATA_API_KEY ? { "x-api-key": DATA_API_KEY } : {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryColor(category: ExerciseCategory): string {
  switch (category) {
    case "strength": return "#57534e";
    case "cardio":   return "#ea580c";
    case "mobility": return "#0d9488";
    case "core":     return "#0284c7";
  }
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function buildMuscleLabel(primaryMuscles: string[], secondaryMuscles: string[]): string {
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
  const first = instructions.slice(0, 2).map((s) => s.trim()).filter(Boolean);
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

function mapHitToExercise(hit: any) {
  const src = hit._source ?? hit;
  const id = String(src.id ?? hit._id ?? "");
  const category = normalizeCategory(src.category ?? "strength");
  const primaryMuscles: string[] = src.primaryMuscles ?? [];
  const secondaryMuscles: string[] = src.secondaryMuscles ?? [];
  const instructions: string[] = src.instructions ?? [];
  const level = src.level ?? "intermediate";
  const mechanic = src.mechanic ?? null;
  const equipment = src.equipment ?? null;
  return {
    id,
    name: src.name || "Unknown",
    category,
    muscle: buildMuscleLabel(primaryMuscles, secondaryMuscles),
    description: buildDescription(instructions, equipment, mechanic, level),
    sets: buildSuggestedSets(category, mechanic, level),
    color: categoryColor(category),
    level,
    mechanic,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    instructions,
  };
}

function mapDocToExercise(doc: any) {
  const category = normalizeCategory(doc.category ?? "strength");
  return {
    id: doc.exerciseId,
    name: doc.name,
    category,
    muscle: doc.muscle || buildMuscleLabel(doc.primaryMuscles ?? [], doc.secondaryMuscles ?? []),
    description: doc.description || buildDescription(doc.instructions ?? [], doc.equipment, doc.mechanic, doc.level ?? "intermediate"),
    sets: buildSuggestedSets(category, doc.mechanic, doc.level ?? "intermediate"),
    color: categoryColor(category),
    level: doc.level ?? "intermediate",
    mechanic: doc.mechanic ?? null,
    equipment: doc.equipment ?? null,
    primaryMuscles: doc.primaryMuscles ?? [],
    secondaryMuscles: doc.secondaryMuscles ?? [],
    instructions: doc.instructions ?? [],
  };
}

// ─── Internal queries ─────────────────────────────────────────────────────────

export const getUserExercises = internalQuery({
// existing internal query

  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("exercises")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// ─── create ───────────────────────────────────────────────────────────────────

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

// ─── search ───────────────────────────────────────────────────────────────────

export const search = action({
  args: {
    query: v.string(),
    categories: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    const limit = Math.min(args.limit ?? 25, 50);

    if (!DATA_API_URL) return [];

    // Fetch from data-api Elasticsearch (empty query → browse/match_all)
    let apiResults: ReturnType<typeof mapHitToExercise>[] = [];
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q.length >= 2) params.set("q", q);
      const url = `${DATA_API_URL}/api/v1/exercises/search?${params}`;
      const response = await fetch(url, { headers: apiHeaders() });
      if (response.ok) {
        const hits = await response.json();
        apiResults = (Array.isArray(hits) ? hits : []).map(mapHitToExercise);
      }
    } catch {}

    // Apply category filter
    const filtered =
      args.categories && args.categories.length > 0
        ? apiResults.filter((ex) => (args.categories as string[]).includes(ex.category))
        : apiResults;

    // Include matching user custom exercises
    const user = await authComponent.getAuthUser(ctx);
    if (user) {
      const userDocs: any[] = await ctx.runQuery(internal.data.exercises.getUserExercises, {
        userId: String(user._id),
      });
      const qLower = q.toLowerCase();
      const userMapped = userDocs
        .filter((doc) => q.length === 0 || doc.name.toLowerCase().includes(qLower))
        .filter((doc) => {
          if (!args.categories || args.categories.length === 0) return true;
          return (args.categories as string[]).includes(normalizeCategory(doc.category));
        })
        .map(mapDocToExercise);

      return [...userMapped, ...filtered].slice(0, limit);
    }

    return filtered.slice(0, limit);
  },
});

// ─── resolveIds ───────────────────────────────────────────────────────────────

export const resolveIds = action({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.ids.length === 0) return {};

    const result: Record<string, ReturnType<typeof mapHitToExercise>> = {};

    const customIds = args.ids.filter((id) => id.startsWith("u_"));
    const apiIds = args.ids.filter((id) => !id.startsWith("u_"));

    // Resolve user custom exercises
    if (customIds.length > 0) {
      const user = await authComponent.getAuthUser(ctx);
      if (user) {
        const userDocs: any[] = await ctx.runQuery(internal.data.exercises.getUserExercises, {
          userId: String(user._id),
        });
        for (const doc of userDocs) {
          if (customIds.includes(doc.exerciseId)) {
            result[doc.exerciseId] = mapDocToExercise(doc);
          }
        }
      }
    }

    // Resolve data-api exercises via ES lookup
    if (apiIds.length > 0 && DATA_API_URL) {
      try {
        const idsParam = apiIds.map(encodeURIComponent).join(",");
        const url = `${DATA_API_URL}/api/v1/exercises/lookup?ids=${idsParam}`;
        const response = await fetch(url, { headers: apiHeaders() });
        if (response.ok) {
          const hits = await response.json();
          for (const hit of Array.isArray(hits) ? hits : []) {
            const ex = mapHitToExercise(hit);
            if (ex.id) result[ex.id] = ex;
          }
        }
      } catch {}
    }

    return result;
  },
});
