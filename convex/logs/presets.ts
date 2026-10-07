import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { syncGuidedPresetEdit } from "../exerciseSwaps";

const presetBodyArgs = {
  name: v.string(),
  items: v.array(v.any()),
  exerciseData: v.any(),
  focus: v.optional(v.string()),
  duration: v.optional(v.string()),
  steps: v.optional(v.array(v.string())),
};

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("presets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => ({ ...d, id: d._id }));
  },
});

// ── create ────────────────────────────────────────────────────────────────────

export const create = mutation({
  args: presetBodyArgs,
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const now = Date.now();
    const id = await ctx.db.insert("presets", {
      userId: user._id,
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

// ── update ────────────────────────────────────────────────────────────────────

export const update = mutation({
  args: {
    id: v.id("presets"),
    expectedUpdatedAt: v.optional(v.number()),
    ...presetBodyArgs,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const { id, expectedUpdatedAt, ...body } = args;
    const preset = await ctx.db.get(id);
    if (!preset || preset.userId !== user._id) {
      throw new Error("Preset not found or access denied");
    }
    if (
      expectedUpdatedAt !== undefined &&
      preset.updatedAt !== expectedUpdatedAt
    ) {
      throw new Error(
        "This preset changed while you were editing. Reopen it to review the latest version before saving.",
      );
    }

    await syncGuidedPresetEdit(ctx, preset, body);
    await ctx.db.patch(id, {
      ...body,
      updatedAt: Math.max(Date.now(), preset.updatedAt + 1),
    });
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("presets") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const preset = await ctx.db.get(args.id);
    if (!preset || preset.userId !== user._id) return; // silently ignore

    await ctx.db.delete(args.id);
  },
});
