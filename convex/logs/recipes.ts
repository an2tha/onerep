import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  APP_UPDATE_REQUIRED,
  attachUpload,
  deleteOwnedUpload,
  getUploadUrl,
  requireReadyUpload,
} from "../lib/uploads";
import {
  AUTO_REMOVED_REASON,
  AUTO_REMOVE_REPORT_THRESHOLD,
  findBlockedTerm,
} from "../lib/communityModeration";

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
      recipes.map(async ({ photoStorageIds, ...recipe }) => {
        const urls = recipe.photoUploadIds?.length
          ? await Promise.all(
              recipe.photoUploadIds.map((uploadId) =>
                getUploadUrl(ctx, uploadId, user._id),
              ),
            )
          : await Promise.all(
              (photoStorageIds ?? []).map((storageId) =>
                ctx.storage.getUrl(storageId),
              ),
            );
        return { ...recipe, photoUrls: urls.filter((url) => url !== null) };
      }),
    );
  },
});

const SUGGESTION_STOP_WORDS = new Set([
  "and",
  "with",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "fresh",
  "cooked",
  "grilled",
  "roasted",
  "large",
  "small",
  "medium",
  "organic",
]);

function ingredientTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SUGGESTION_STOP_WORDS.has(token));
}

const OFFICIAL_DASHBOARD_MEALS = [
  {
    id: "chicken-bowl",
    name: "Weeknight chicken bowl",
    description: "Roasted chicken, rice, cucumber, herbs, and lemon yogurt.",
    prepMinutes: 25,
    calories: 520,
    protein: 38,
    imageUrl:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Chicken breast", "Rice", "Cucumber", "Greek yogurt"],
  },
  {
    id: "lentil-skillet",
    name: "Herby lentil skillet",
    description: "Green lentils, tomatoes, spinach, lemon, and feta.",
    prepMinutes: 30,
    calories: 460,
    protein: 24,
    imageUrl:
      "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Green lentils", "Tomatoes", "Spinach", "Feta"],
  },
  {
    id: "berry-oats",
    name: "Overnight berry oats",
    description: "Creamy oats with Greek yogurt, berries, chia, and almonds.",
    prepMinutes: 5,
    calories: 410,
    protein: 26,
    imageUrl:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Oats", "Greek yogurt", "Berries", "Chia seeds"],
  },
  {
    id: "salmon-greens",
    name: "Salmon and greens",
    description:
      "Pan-seared salmon, potatoes, green beans, and mustard dressing.",
    prepMinutes: 35,
    calories: 610,
    protein: 42,
    imageUrl:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Salmon", "Potatoes", "Green beans", "Mustard"],
  },
  {
    id: "turkey-wrap",
    name: "Crunchy turkey wrap",
    description: "Turkey, avocado, cabbage, and lime yogurt in a soft wrap.",
    prepMinutes: 15,
    calories: 445,
    protein: 35,
    imageUrl:
      "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Turkey", "Tortilla", "Avocado", "Cabbage"],
  },
  {
    id: "tofu-rice",
    name: "Ginger tofu rice bowl",
    description: "Crisp tofu, edamame, rice, carrots, and sesame ginger sauce.",
    prepMinutes: 30,
    calories: 540,
    protein: 27,
    imageUrl:
      "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=82",
    ingredients: ["Tofu", "Rice", "Edamame", "Carrots"],
  },
] as const;

export const suggestedForDashboard = query({
  args: { beforeOrOn: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const recentLogs = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).lte("date", args.beforeOrOn),
      )
      .order("desc")
      .take(14);

    const tokenFrequency = new Map<string, number>();
    for (const log of recentLogs) {
      for (const entry of log.entries as Array<Record<string, unknown>>) {
        const names = [typeof entry.name === "string" ? entry.name : ""];
        const draft = entry.recipeDraft as
          { ingredients?: Array<{ name?: unknown }> } | undefined;
        for (const ingredient of draft?.ingredients ?? []) {
          if (typeof ingredient.name === "string") names.push(ingredient.name);
        }
        for (const token of names.flatMap(ingredientTokens)) {
          tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
        }
      }
    }

    return OFFICIAL_DASHBOARD_MEALS.map((recipe, index) => {
      const matched = recipe.ingredients.filter((ingredient) =>
        ingredientTokens(ingredient).some((token) => tokenFrequency.has(token)),
      );
      const score = matched.reduce(
        (total, ingredient) =>
          total +
          Math.max(
            ...ingredientTokens(ingredient).map(
              (token) => tokenFrequency.get(token) ?? 0,
            ),
          ),
        0,
      );
      return { recipe, score, index, matched };
    })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, Math.max(1, Math.min(args.limit ?? 6, 6)))
      .map(({ recipe, score, matched }) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: 0,
        calories: recipe.calories,
        protein: recipe.protein,
        ingredientCount: recipe.ingredients.length,
        matchedIngredients: matched.slice(0, 3),
        matchScore: score,
        photoUrl: recipe.imageUrl,
      }));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

export const listCommunity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const limit = Math.max(1, Math.min(args.limit ?? 60, 100));

    const blocked = new Set(
      (
        await ctx.db
          .query("communityBlocks")
          .withIndex("by_blockerId", (q) => q.eq("blockerId", user._id))
          .collect()
      ).map((block) => block.blockedUserId),
    );

    // Over-fetch when there is anything to hide, so blocking one prolific
    // author does not quietly shorten the feed for everybody they annoyed.
    const recipes = (
      await ctx.db
        .query("recipes")
        .withIndex("by_communityShared", (q) => q.eq("isCommunityShared", true))
        .order("desc")
        .take(blocked.size > 0 ? Math.min(limit * 2, 200) : limit)
    )
      .filter((recipe) => !blocked.has(recipe.userId))
      .slice(0, limit);

    return await Promise.all(
      recipes.map(
        async ({ userId, photoStorageIds, photoUploadIds, ...recipe }) => {
          const urls = photoUploadIds?.length
            ? await Promise.all(
                photoUploadIds.map((uploadId) => getUploadUrl(ctx, uploadId)),
              )
            : await Promise.all(
                (photoStorageIds ?? []).map((storageId) =>
                  ctx.storage.getUrl(storageId),
                ),
              );
          return {
            ...recipe,
            isOwnedByViewer: userId === user._id,
            photoUrls: urls.filter((url) => url !== null),
          };
        },
      ),
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

    if (args.shared) {
      // A recipe pulled by reports does not go back up by toggling the switch
      // again. There is no appeal queue to route this through, and an author
      // who can undo a takedown makes the takedown decorative.
      if (recipe.communityRemovedAt) {
        throw new Error(
          "This recipe was removed from the community after being reported and cannot be shared again.",
        );
      }
      // Screened before publication rather than after a complaint: Apple asks
      // for a filtering method, and a filter that runs once somebody has
      // already seen the thing is not one.
      const blocked = findBlockedTerm([
        recipe.name,
        recipe.description,
        recipe.notes,
        recipe.category,
        ...(recipe.tags ?? []),
        ...(recipe.steps ?? []),
        ...recipe.ingredients.map((ingredient) => ingredient.name),
      ]);
      if (blocked) {
        // The term is not named. Saying which word tripped the filter is a
        // lesson in how to get past it.
        throw new Error(
          "This recipe can't be shared: the text contains language that isn't allowed in the community feed.",
        );
      }
    }

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
    const reportId = await ctx.db.insert("recipeReports", {
      reporterId: user._id,
      recipeId: args.recipeId,
      ...(args.reason?.trim()
        ? { reason: args.reason.trim().slice(0, 300) }
        : {}),
      status: "pending",
      createdAt: Date.now(),
    });

    // Guideline 1.2 asks for a mechanism that acts on reports within 24 hours.
    // There is nobody to act, so the count acts: once enough separate accounts
    // have said the same thing, the recipe leaves the feed immediately and the
    // reports are marked handled. Wrong sometimes, and wrong within seconds
    // rather than never, which is the trade being made here on purpose.
    const reports = await ctx.db
      .query("recipeReports")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.recipeId))
      .take(AUTO_REMOVE_REPORT_THRESHOLD);

    if (reports.length >= AUTO_REMOVE_REPORT_THRESHOLD) {
      await ctx.db.patch(args.recipeId, {
        isCommunityShared: false,
        communityRemovedAt: Date.now(),
        communityRemovedReason: AUTO_REMOVED_REASON,
        updatedAt: Date.now(),
      });
      for (const report of reports) {
        if (report.status === "pending") {
          await ctx.db.patch(report._id, { status: "reviewed" });
        }
      }
    }

    return reportId;
  },
});

/**
 * Hide everything an author has shared, and everything they share next.
 *
 * Blocking is one-way and silent. The blocked account is not told and loses
 * nothing; the blocker simply stops seeing them. Guideline 1.2 requires this
 * alongside reporting, and the two are not substitutes: reporting is a request
 * that somebody else act, blocking is the thing you can do yourself.
 */
export const blockCommunityAuthor = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe?.isCommunityShared) {
      throw new Error("Community recipe not found");
    }
    if (recipe.userId === user._id) {
      throw new Error("You can't block yourself");
    }

    const existing = await ctx.db
      .query("communityBlocks")
      .withIndex("by_blockerId_blockedUserId", (q) =>
        q.eq("blockerId", user._id).eq("blockedUserId", recipe.userId),
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("communityBlocks", {
      blockerId: user._id,
      blockedUserId: recipe.userId,
      createdAt: Date.now(),
    });
  },
});

/** Everyone this account has blocked, so the list can be undone in Settings. */
export const listBlockedAuthors = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const blocks = await ctx.db
      .query("communityBlocks")
      .withIndex("by_blockerId", (q) => q.eq("blockerId", user._id))
      .collect();

    return await Promise.all(
      blocks.map(async (block) => {
        // The display name lives on the shared recipes, not on the block, so
        // that unblocking someone who has since deleted everything still shows
        // a row worth tapping rather than a blank one.
        const [recipe] = await ctx.db
          .query("recipes")
          .withIndex("by_communityShared", (q) =>
            q.eq("isCommunityShared", true),
          )
          .filter((q) => q.eq(q.field("userId"), block.blockedUserId))
          .take(1);
        return {
          id: block._id,
          blockedUserId: block.blockedUserId,
          name: recipe?.communityAnonymous
            ? "Anonymous"
            : (recipe?.communityAuthorName ?? "A OneRep member"),
          createdAt: block.createdAt,
        };
      }),
    );
  },
});

export const unblockCommunityAuthor = mutation({
  args: { blockId: v.id("communityBlocks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const block = await ctx.db.get(args.blockId);
    if (!block || block.blockerId !== user._id) {
      throw new Error("Block not found");
    }
    await ctx.db.delete(args.blockId);
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
    photoUploadIds: v.optional(v.array(v.id("fileUploads"))),
    originCountry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    steps: v.optional(v.array(v.string())),
    ingredients: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    if (args.photoStorageIds !== undefined) {
      throw new Error(APP_UPDATE_REQUIRED);
    }
    const photoUploadIds = args.photoUploadIds;
    if (photoUploadIds) {
      if (
        photoUploadIds.length > 5 ||
        new Set(photoUploadIds).size !== photoUploadIds.length
      ) {
        throw new Error("A recipe can have at most 5 unique photos");
      }
      for (const uploadId of photoUploadIds) {
        await requireReadyUpload(ctx, {
          uploadId,
          userId: user._id,
          purpose: "recipe_photo",
          ...(args.id
            ? {
                attachment: {
                  table: "recipes" as const,
                  documentId: String(args.id),
                },
              }
            : {}),
        });
      }
    }

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
        ...(photoUploadIds !== undefined ? { photoUploadIds } : {}),
        ...(args.originCountry !== undefined
          ? { originCountry: args.originCountry }
          : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ingredients: args.ingredients,
        updatedAt: now,
      });
      for (const uploadId of photoUploadIds ?? []) {
        await attachUpload(
          ctx,
          uploadId,
          user._id,
          "recipe_photo",
          "recipes",
          String(args.id),
        );
      }
      if (photoUploadIds !== undefined) {
        const keep = new Set(photoUploadIds);
        for (const uploadId of existing.photoUploadIds ?? []) {
          if (!keep.has(uploadId)) {
            await deleteOwnedUpload(ctx, uploadId, user._id, {
              table: "recipes",
              documentId: String(args.id),
            });
          }
        }
      }
      return args.id;
    } else {
      // Insert new recipe
      const recipeId = await ctx.db.insert("recipes", {
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
        ...(photoUploadIds !== undefined ? { photoUploadIds } : {}),
        ...(args.originCountry !== undefined
          ? { originCountry: args.originCountry }
          : {}),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ingredients: args.ingredients,
        createdAt: now,
        updatedAt: now,
      });
      for (const uploadId of photoUploadIds ?? []) {
        await attachUpload(
          ctx,
          uploadId,
          user._id,
          "recipe_photo",
          "recipes",
          String(recipeId),
        );
      }
      return recipeId;
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
    for (const uploadId of existing.photoUploadIds ?? []) {
      await deleteOwnedUpload(ctx, uploadId, user._id, {
        table: "recipes",
        documentId: String(existing._id),
      });
    }
    await ctx.db.delete(args.id);
  },
});
