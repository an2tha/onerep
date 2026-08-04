import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  type ClientExercise,
  customExerciseClientId,
  exerciseCategoryValidator,
  toClientExercise,
} from "../lib/exerciseShape";

const MAX_CUSTOM_EXERCISES = 300;
const MAX_NAME_LENGTH = 80;
const MAX_INSTRUCTIONS = 12;
const MAX_INSTRUCTION_LENGTH = 500;
const MAX_MUSCLES = 8;

function cleanString(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanList(
  values: string[] | undefined,
  max: number,
  maxLength: number,
) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim().slice(0, maxLength);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx): Promise<ClientExercise[]> => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("customExercises")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_CUSTOM_EXERCISES);

    return docs
      .sort(
        (a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt),
      )
      .map((doc) =>
        toClientExercise(customExerciseClientId(doc._id), doc, {
          custom: true,
        }),
      );
  },
});

// ── save (create or update) ───────────────────────────────────────────────────

export const save = mutation({
  args: {
    id: v.optional(v.id("customExercises")),
    name: v.string(),
    category: exerciseCategoryValidator,
    equipment: v.optional(v.string()),
    primaryMuscles: v.optional(v.array(v.string())),
    secondaryMuscles: v.optional(v.array(v.string())),
    instructions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const name = cleanString(args.name)?.slice(0, MAX_NAME_LENGTH);
    if (!name) throw new Error("Exercise name is required");

    const now = Date.now();
    const body = {
      name,
      category: args.category,
      equipment: cleanString(args.equipment),
      primaryMuscles: cleanList(args.primaryMuscles, MAX_MUSCLES, 40),
      secondaryMuscles: cleanList(args.secondaryMuscles, MAX_MUSCLES, 40),
      instructions: cleanList(
        args.instructions,
        MAX_INSTRUCTIONS,
        MAX_INSTRUCTION_LENGTH,
      ),
      updatedAt: now,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Custom exercise not found or access denied");
      }
      await ctx.db.patch(args.id, body);
      return toClientExercise(customExerciseClientId(args.id), body, {
        custom: true,
      });
    }

    const existing = await ctx.db
      .query("customExercises")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_CUSTOM_EXERCISES);

    const duplicate = existing.find(
      (doc) => doc.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`You already have an exercise named "${name}"`);
    }

    if (existing.length >= MAX_CUSTOM_EXERCISES) {
      throw new Error(
        `Custom exercise limit reached (${MAX_CUSTOM_EXERCISES}). Delete some first.`,
      );
    }

    const docId = await ctx.db.insert("customExercises", {
      userId: user._id,
      ...body,
      createdAt: now,
    });

    return toClientExercise(customExerciseClientId(docId), body, {
      custom: true,
    });
  },
});

// ── markUsed ──────────────────────────────────────────────────────────────────

export const markUsed = mutation({
  args: { id: v.id("customExercises") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) return;
    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("customExercises") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Custom exercise not found or access denied");
    }
    await ctx.db.delete(args.id);
  },
});
