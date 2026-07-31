import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  normalizeNutrientProfile,
  nutrientProfileValidator,
} from "../lib/nutritionValues";

const MAX_CUSTOM_FOODS = 500;

function cleanString(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("customFoods")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_CUSTOM_FOODS);

    return docs
      .sort((a, b) => {
        if (Boolean(b.favorite) !== Boolean(a.favorite)) {
          return b.favorite ? 1 : -1;
        }
        return (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt);
      })
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

// ── get ───────────────────────────────────────────────────────────────────────

export const get = query({
  args: { id: v.id("customFoods") },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) return null;
    return { ...doc, id: doc._id };
  },
});

// ── save (create or update) ───────────────────────────────────────────────────

export const save = mutation({
  args: {
    id: v.optional(v.id("customFoods")),
    name: v.string(),
    brand: v.optional(v.string()),
    servingLabel: v.string(),
    servingGrams: v.optional(v.number()),
    barcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    nutrientsPerServing: nutrientProfileValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const name = cleanString(args.name);
    if (!name) throw new Error("Food name is required");

    const servingLabel = cleanString(args.servingLabel);
    if (!servingLabel) throw new Error("Serving label is required");

    const servingGrams =
      args.servingGrams !== undefined &&
      Number.isFinite(args.servingGrams) &&
      args.servingGrams > 0
        ? args.servingGrams
        : undefined;

    const now = Date.now();
    const body = {
      name,
      brand: cleanString(args.brand),
      servingLabel,
      servingGrams,
      barcode: cleanString(args.barcode),
      notes: cleanString(args.notes),
      favorite: args.favorite ?? false,
      nutrientsPerServing: normalizeNutrientProfile(args.nutrientsPerServing),
      updatedAt: now,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Custom food not found or access denied");
      }
      await ctx.db.patch(args.id, body);
      return { id: args.id };
    }

    const count = (
      await ctx.db
        .query("customFoods")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(MAX_CUSTOM_FOODS)
    ).length;
    if (count >= MAX_CUSTOM_FOODS) {
      throw new Error(
        `Custom food limit reached (${MAX_CUSTOM_FOODS}). Delete some first.`,
      );
    }

    const id = await ctx.db.insert("customFoods", {
      userId: user._id,
      ...body,
      createdAt: now,
    });

    return { id };
  },
});

// ── markUsed ──────────────────────────────────────────────────────────────────

export const markUsed = mutation({
  args: { id: v.id("customFoods") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) return;
    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("customFoods") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Custom food not found or access denied");
    }
    await ctx.db.delete(args.id);
  },
});
