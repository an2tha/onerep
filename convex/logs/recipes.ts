import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

async function requireUser(ctx: MutationCtx | QueryCtx) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

const recipeIngredientValidator = v.object({
  id: v.string(),
  name: v.string(),
  grams: v.number(),
  displayAmount: v.optional(v.number()),
  displayUnit: v.optional(v.string()),
  servingLabel: v.optional(v.string()),
  caloriesPer100: v.number(),
  proteinPer100: v.number(),
  carbsPer100: v.number(),
  fatPer100: v.number(),
  fiberPer100: v.optional(v.number()),
  sugarPer100: v.optional(v.number()),
  saturatedFatPer100: v.optional(v.number()),
  transFatPer100: v.optional(v.number()),
  cholesterolPer100: v.optional(v.number()),
  sodiumPer100: v.optional(v.number()),
  potassiumPer100: v.optional(v.number()),
  calciumPer100: v.optional(v.number()),
  ironPer100: v.optional(v.number()),
  magnesiumPer100: v.optional(v.number()),
  phosphorusPer100: v.optional(v.number()),
  zincPer100: v.optional(v.number()),
  vitaminCPer100: v.optional(v.number()),
  vitaminAPer100: v.optional(v.number()),
  vitaminDPer100: v.optional(v.number()),
  vitaminB12Per100: v.optional(v.number()),
  caffeinePer100: v.optional(v.number()),
  alcoholPer100: v.optional(v.number()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return await Promise.all(
      recipes.map(async (recipe) => ({
        ...recipe,
        photoUrls: recipe.photoStorageIds
          ? await Promise.all(
              recipe.photoStorageIds.map((storageId) =>
                ctx.storage.getUrl(storageId),
              ),
            )
          : [],
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listCommunity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_communityShared", (q) => q.eq("isCommunityShared", true))
      .order("desc")
      .take(Math.max(1, Math.min(args.limit ?? 60, 100)));
    return await Promise.all(
      recipes.map(async ({ userId, ...recipe }) => ({
        ...recipe,
        isOwnedByViewer: userId === user._id,
        photoUrls: recipe.photoStorageIds
          ? await Promise.all(
              recipe.photoStorageIds.map((storageId) =>
                ctx.storage.getUrl(storageId),
              ),
            )
          : [],
      })),
    );
  },
});

export const setCommunitySharing = mutation({
  args: {
    id: v.id("recipes"),
    shared: v.boolean(),
    originCountry: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.userId !== user._id) {
      throw new Error("Recipe not found or access denied");
    }
    const originCountry = args.originCountry?.trim().slice(0, 56);
    if (args.shared && !recipe.isCommunityShared) {
      const startOfUtcDay = new Date();
      startOfUtcDay.setUTCHours(0, 0, 0, 0);
      const sharesToday = await ctx.db
        .query("recipeCommunityShareEvents")
        .withIndex("by_userId_sharedAt", (q) =>
          q.eq("userId", user._id).gte("sharedAt", startOfUtcDay.getTime()),
        )
        .take(10);
      if (sharesToday.length >= 10) {
        throw new Error("Daily community sharing limit reached (10 recipes)");
      }
      await ctx.db.insert("recipeCommunityShareEvents", {
        userId: user._id,
        recipeId: recipe._id,
        sharedAt: Date.now(),
      });
    }
    await ctx.db.patch(args.id, {
      isCommunityShared: args.shared,
      ...(originCountry ? { originCountry } : {}),
      ...(args.shared
        ? {
            communityAuthorName: args.anonymous
              ? "Anonymous"
              : (user.name ?? "OneRep member").split("@")[0].slice(0, 40),
            communityAnonymous: args.anonymous === true,
            sharedAt: Date.now(),
          }
        : {}),
      updatedAt: Date.now(),
    });
  },
});

export const reportCommunityRecipe = mutation({
  args: {
    recipeId: v.id("recipes"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe?.isCommunityShared)
      throw new Error("Community recipe not found");
    const existing = await ctx.db
      .query("recipeReports")
      .withIndex("by_reporterId_recipeId", (q) =>
        q.eq("reporterId", user._id).eq("recipeId", args.recipeId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("recipeReports", {
      reporterId: user._id,
      recipeId: args.recipeId,
      ...(args.reason?.trim()
        ? { reason: args.reason.trim().slice(0, 300) }
        : {}),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const claimRatingPrompt = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe?.isCommunityShared || recipe.userId === user._id) return false;
    const existing = await ctx.db
      .query("recipeRatings")
      .withIndex("by_userId_recipeId", (q) =>
        q.eq("userId", user._id).eq("recipeId", args.recipeId),
      )
      .unique();
    if (existing) return false;
    await ctx.db.insert("recipeRatings", {
      userId: user._id,
      recipeId: args.recipeId,
      promptedAt: Date.now(),
    });
    return true;
  },
});

export const rateCommunityRecipe = mutation({
  args: { recipeId: v.id("recipes"), rating: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe?.isCommunityShared || recipe.userId === user._id) {
      throw new Error("Community recipe not found");
    }
    const existing = await ctx.db
      .query("recipeRatings")
      .withIndex("by_userId_recipeId", (q) =>
        q.eq("userId", user._id).eq("recipeId", args.recipeId),
      )
      .unique();
    const previousRating = existing?.rating;
    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        ratedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("recipeRatings", {
        userId: user._id,
        recipeId: args.recipeId,
        rating: args.rating,
        promptedAt: Date.now(),
        ratedAt: Date.now(),
      });
    }
    await ctx.db.patch(recipe._id, {
      ratingCount: Math.max(
        0,
        (recipe.ratingCount ?? 0) + (previousRating ? 0 : 1),
      ),
      ratingTotal:
        (recipe.ratingTotal ?? 0) - (previousRating ?? 0) + args.rating,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("recipes")),
    name: v.string(),
    recipeType: v.optional(v.union(v.literal("quick"), v.literal("detailed"))),
    description: v.optional(v.string()),
    servings: v.optional(v.number()),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    placeholderImage: v.optional(v.string()),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    originCountry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    steps: v.optional(v.array(v.string())),
    ingredients: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    if (args.id) {
      // Update existing recipe
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Recipe not found or access denied");
      }
      await ctx.db.patch(args.id, {
        name: args.name,
        ...(args.recipeType !== undefined
          ? { recipeType: args.recipeType }
          : {}),
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.servings !== undefined ? { servings: args.servings } : {}),
        ...(args.prepMinutes !== undefined
          ? { prepMinutes: args.prepMinutes }
          : {}),
        ...(args.cookMinutes !== undefined
          ? { cookMinutes: args.cookMinutes }
          : {}),
        ...(args.category !== undefined ? { category: args.category } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        ...(args.placeholderImage !== undefined
          ? { placeholderImage: args.placeholderImage }
          : {}),
        ...(args.photoStorageIds !== undefined
          ? { photoStorageIds: args.photoStorageIds }
          : {}),
        ...(args.originCountry !== undefined
          ? { originCountry: args.originCountry }
          : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ingredients: args.ingredients,
        updatedAt: now,
      });
      return args.id;
    } else {
      // Insert new recipe
      return await ctx.db.insert("recipes", {
        userId: user._id,
        name: args.name,
        ...(args.recipeType !== undefined
          ? { recipeType: args.recipeType }
          : {}),
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(args.servings !== undefined ? { servings: args.servings } : {}),
        ...(args.prepMinutes !== undefined
          ? { prepMinutes: args.prepMinutes }
          : {}),
        ...(args.cookMinutes !== undefined
          ? { cookMinutes: args.cookMinutes }
          : {}),
        ...(args.category !== undefined ? { category: args.category } : {}),
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        ...(args.placeholderImage !== undefined
          ? { placeholderImage: args.placeholderImage }
          : {}),
        ...(args.photoStorageIds !== undefined
          ? { photoStorageIds: args.photoStorageIds }
          : {}),
        ...(args.originCountry !== undefined
          ? { originCountry: args.originCountry }
          : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ingredients: args.ingredients,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Recipe not found or access denied");
    }
    await ctx.db.delete(args.id);
  },
});
