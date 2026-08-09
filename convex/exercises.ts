import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { safeGetAuthUser } from "./lib/auth";
import {
  type CatalogExercise,
  type ClientExercise,
  type ExerciseCategory,
  categoryOf,
  customExerciseClientId,
  customExerciseDocId,
  exerciseCategoryValidator,
  isCustomExerciseId,
  toCatalogExercise,
  toClientExercise,
} from "./lib/exerciseShape";

const GLOBAL_EXERCISE_USER_ID = "__global__";
const MAX_LIMIT = 50;
const MAX_CUSTOM_MATCHES = 50;
/** The bundled catalog is ~900 rows. The ceiling is a guard, not a page size. */
const MAX_CATALOG = 3000;

type ExerciseDoc = Doc<"exercises">;
type CustomExerciseDoc = Doc<"customExercises">;

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? 0)) return 25;
  return Math.max(1, Math.min(Math.floor(limit ?? 25), MAX_LIMIT));
}

function uniqueCategories(categories: ExerciseCategory[] | undefined) {
  return [...new Set(categories ?? [])];
}

function filterByCategories<T extends { category: string }>(
  docs: T[],
  categories: ExerciseCategory[],
) {
  if (categories.length === 0) return docs;
  const categorySet = new Set(categories);
  return docs.filter((doc) => categorySet.has(categoryOf(doc)));
}

/** The caller's custom exercises matching the same query/category filters. */
async function searchCustomExercises(
  ctx: QueryCtx,
  args: { searchText: string; categories: ExerciseCategory[]; limit: number },
): Promise<CustomExerciseDoc[]> {
  const user = await safeGetAuthUser(ctx);
  if (!user) return [];

  const take = Math.min(Math.max(args.limit, 10), MAX_CUSTOM_MATCHES);

  if (args.searchText) {
    return filterByCategories(
      await ctx.db
        .query("customExercises")
        .withSearchIndex("search_name", (q) =>
          q.search("name", args.searchText).eq("userId", user._id),
        )
        .take(take),
      args.categories,
    );
  }

  return filterByCategories(
    await ctx.db
      .query("customExercises")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_CUSTOM_MATCHES),
    args.categories,
  ).sort(
    (a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt),
  );
}

export const search = query({
  args: {
    query: v.optional(v.string()),
    categories: v.optional(v.array(exerciseCategoryValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ClientExercise[]> => {
    const limit = clampLimit(args.limit);
    const searchText = (args.query ?? "").trim();
    const categories = uniqueCategories(args.categories);
    const takeMore = Math.min(Math.max(limit * 3, limit), 100);
    let docs: ExerciseDoc[] = [];

    if (searchText) {
      docs = filterByCategories(
        await ctx.db
          .query("exercises")
          .withSearchIndex("search_name", (q) =>
            q.search("name", searchText).eq("userId", GLOBAL_EXERCISE_USER_ID),
          )
          .take(categories.length > 0 ? takeMore : limit),
        categories,
      );
    } else if (categories.length > 0) {
      for (const category of categories) {
        docs.push(
          ...(await ctx.db
            .query("exercises")
            .withIndex("by_userId_and_category", (q) =>
              q.eq("userId", GLOBAL_EXERCISE_USER_ID).eq("category", category),
            )
            .take(takeMore)),
        );
      }
    } else {
      docs = await ctx.db
        .query("exercises")
        .withIndex("by_userId", (q) => q.eq("userId", GLOBAL_EXERCISE_USER_ID))
        .take(limit);
    }

    const custom = await searchCustomExercises(ctx, {
      searchText,
      categories,
      limit,
    });

    const seen = new Set<string>();
    const result: ClientExercise[] = [];

    // The caller's own exercises lead — they're the ones they went out of their
    // way to create, and there are never enough of them to crowd out the catalog.
    for (const doc of custom) {
      const id = customExerciseClientId(doc._id);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(toClientExercise(id, doc, { custom: true }));
      if (result.length >= limit) return result;
    }

    for (const doc of docs) {
      if (seen.has(doc.exerciseId)) continue;
      seen.add(doc.exerciseId);
      result.push(toClientExercise(doc.exerciseId, doc));
      if (result.length >= limit) break;
    }
    return result;
  },
});

/**
 * The whole global catalog, minus instructions, sorted by name.
 *
 * The browser filters and searches this client-side: the catalog is immutable
 * between imports, so paying for one ~140 KB read beats round-tripping a search
 * query on every keystroke. Custom exercises are deliberately excluded — they
 * change per user, and `logs.customExercises.list` already streams them.
 */
export const catalog = query({
  args: {},
  handler: async (ctx): Promise<CatalogExercise[]> => {
    const docs = await ctx.db
      .query("exercises")
      .withIndex("by_userId", (q) => q.eq("userId", GLOBAL_EXERCISE_USER_ID))
      .take(MAX_CATALOG);

    return docs
      .map((doc) => toCatalogExercise(doc.exerciseId, doc))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const resolve = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args): Promise<Record<string, ClientExercise>> => {
    const ids = [...new Set(args.ids.filter(Boolean))].slice(0, 100);
    const result: Record<string, ClientExercise> = {};

    const customIds = ids.filter(isCustomExerciseId);
    if (customIds.length > 0) {
      const user = await safeGetAuthUser(ctx);
      if (user) {
        for (const id of customIds) {
          const docId = ctx.db.normalizeId(
            "customExercises",
            customExerciseDocId(id),
          );
          if (!docId) continue;
          const doc = await ctx.db.get(docId);
          if (!doc || doc.userId !== user._id) continue;
          result[id] = toClientExercise(id, doc, { custom: true });
        }
      }
    }

    for (const id of ids) {
      if (isCustomExerciseId(id)) continue;
      const doc = await ctx.db
        .query("exercises")
        .withIndex("by_userId_and_exerciseId", (q) =>
          q.eq("userId", GLOBAL_EXERCISE_USER_ID).eq("exerciseId", id),
        )
        .first();
      if (!doc) continue;
      result[id] = toClientExercise(doc.exerciseId, doc);
    }

    return result;
  },
});
