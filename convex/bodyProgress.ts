import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const sorted = docs.sort((a, b) => {
      const byDate = a.loggedAt.localeCompare(b.loggedAt);
      return byDate !== 0 ? byDate : a.createdAt - b.createdAt;
    });

    return await Promise.all(
      sorted.map(async ({ userId: _userId, ...rest }) => ({
        ...rest,
        photoUrl: rest.photoStorageId
          ? await ctx.storage.getUrl(rest.photoStorageId)
          : undefined,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

// ── save ──────────────────────────────────────────────────────────────────────

export const save = mutation({
  args: {
    clientId: v.string(),
    loggedAt: v.string(),
    weightKg: v.optional(v.number()),
    bodyFatPct: v.optional(v.number()),
    waistCm: v.optional(v.number()),
    hipsCm: v.optional(v.number()),
    chestCm: v.optional(v.number()),
    armsCm: v.optional(v.number()),
    thighsCm: v.optional(v.number()),
    calvesCm: v.optional(v.number()),
    neckCm: v.optional(v.number()),
    notes: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    photoDataUrl: v.optional(v.string()),
    photoTakenAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_clientId", (q) =>
        q.eq("userId", user._id).eq("clientId", args.clientId),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      if (
        existing.photoStorageId &&
        args.photoStorageId &&
        existing.photoStorageId !== args.photoStorageId
      ) {
        await ctx.storage.delete(existing.photoStorageId);
      }
      await ctx.db.patch(existing._id, {
        loggedAt: args.loggedAt,
        weightKg: args.weightKg,
        bodyFatPct: args.bodyFatPct,
        waistCm: args.waistCm,
        hipsCm: args.hipsCm,
        chestCm: args.chestCm,
        armsCm: args.armsCm,
        thighsCm: args.thighsCm,
        calvesCm: args.calvesCm,
        neckCm: args.neckCm,
        notes: args.notes,
        photoStorageId: args.photoStorageId,
        photoDataUrl: args.photoDataUrl,
        photoTakenAt: args.photoTakenAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("bodyMeasurements", {
        userId: user._id,
        ...args,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_clientId", (q) =>
        q.eq("userId", user._id).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) {
      if (existing.photoStorageId) await ctx.storage.delete(existing.photoStorageId);
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});
