import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import {
  trailPointValidator,
  validateTrailPoints,
  trailDistance,
} from "./lib/trailGeometry";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("hikingTrails")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return rows.map(({ userId, ...trail }) => trail);
  },
});
export const get = query({
  args: { id: v.id("hikingTrails") },
  handler: async (ctx, { id }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const trail = await ctx.db.get(id);
    if (trail?.userId !== user._id) return null;
    const route = await ctx.db
      .query("hikingTrailRoutes")
      .withIndex("by_trailId", (q) => q.eq("trailId", id))
      .unique();
    return route ? { ...trail, points: route.points } : null;
  },
});
export const shared = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[a-f0-9-]{36}$/.test(token)) return null;
    const trail = await ctx.db
      .query("hikingTrails")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
      .unique();
    if (!trail) return null;
    const route = await ctx.db
      .query("hikingTrailRoutes")
      .withIndex("by_trailId", (q) => q.eq("trailId", trail._id))
      .unique();
    if (!route) return null;
    return {
      name: trail.name,
      description: trail.description,
      points: route.points,
      distanceMeters: trail.distanceMeters,
    };
  },
});
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    points: v.array(trailPointValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Sign in to save a trail.");
    validateTrailPoints(args.points);
    const name = args.name.trim();
    if (!name || name.length > 120 || args.description.length > 2000)
      throw new Error(
        "Enter a trail name up to 120 characters and notes up to 2,000 characters.",
      );
    const id = await ctx.db.insert("hikingTrails", {
      description: args.description,
      name,
      userId: user._id,
      distanceMeters: trailDistance(args.points),
    });
    await ctx.db.insert("hikingTrailRoutes", {
      userId: user._id,
      trailId: id,
      points: args.points,
    });
    return id;
  },
});
export const setSharing = mutation({
  args: { id: v.id("hikingTrails"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    const user = await getAuthUser(ctx);
    const trail = await ctx.db.get(id);
    if (!user || trail?.userId !== user._id)
      throw new Error("Trail not found.");
    const shareToken = enabled
      ? (trail.shareToken ?? crypto.randomUUID())
      : undefined;
    await ctx.db.patch(id, { shareToken });
    return shareToken ?? null;
  },
});
export const remove = mutation({
  args: { id: v.id("hikingTrails") },
  handler: async (ctx, { id }) => {
    const user = await getAuthUser(ctx);
    const trail = await ctx.db.get(id);
    if (!user || trail?.userId !== user._id)
      throw new Error("Trail not found.");
    const route = await ctx.db
      .query("hikingTrailRoutes")
      .withIndex("by_trailId", (q) => q.eq("trailId", id))
      .unique();
    if (route) await ctx.db.delete(route._id);
    await ctx.db.delete(id);
  },
});
