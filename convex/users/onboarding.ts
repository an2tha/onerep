import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  getLatestOnboardingProfile,
  listOnboardingProfilesForUser,
} from "../lib/onboardingProfiles";
import { MINIMUM_AGE } from "../../packages/models/src/onboarding";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    return await getLatestOnboardingProfile(ctx, user._id);
  },
});

export const save = mutation({
  args: {
    age: v.number(),
    heightCm: v.number(),
    goal: v.union(
      v.literal("lose"),
      v.literal("build"),
      v.literal("health"),
      v.literal("performance"),
    ),
    experienceLevel: v.optional(
      v.union(
        v.literal("beginner"),
        v.literal("intermediate"),
        v.literal("advanced"),
      ),
    ),
    nutritionGoal: v.optional(
      v.union(
        v.literal("maintain"),
        v.literal("lose_fat"),
        v.literal("gain_muscle"),
        v.literal("performance"),
        v.literal("macros_only"),
        v.literal("medical"),
      ),
    ),
    consent: v.optional(
      v.object({
        dataUse: v.boolean(),
        weightData: v.boolean(),
        foodLogging: v.boolean(),
        wearableIntegrations: v.boolean(),
      }),
    ),
    safetyFlags: v.optional(v.array(v.string())),
    safetyMode: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("habit"),
        v.literal("clinician"),
        v.literal("recovery"),
      ),
    ),
    weightTrend: v.optional(
      v.union(
        v.literal("losing"),
        v.literal("stable"),
        v.literal("gaining"),
        v.literal("unknown"),
      ),
    ),
    occupationActivity: v.optional(
      v.union(
        v.literal("desk"),
        v.literal("mixed"),
        v.literal("on_feet"),
        v.literal("manual"),
      ),
    ),
    dietType: v.optional(v.string()),
    allergies: v.optional(v.array(v.string())),
    cookingSkill: v.optional(v.string()),
    budget: v.optional(v.string()),
    mealFrequency: v.optional(v.number()),
    trackingMode: v.optional(
      v.union(
        v.literal("full"),
        v.literal("protein_calories"),
        v.literal("photo_portion"),
        v.literal("habit"),
        v.literal("recovery"),
      ),
    ),
    loggingFeatures: v.optional(v.array(v.string())),
    firstNutritionAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // The stepper in the app already stops here, which is worth exactly
    // nothing: this mutation is reachable by anyone holding a session token.
    // The age drives calorie targets, and it decides whether Coach runs in the
    // gentler under-18 mode, so a number below the floor is either a mistake
    // or somebody working around the floor. Both get the same answer.
    if (!Number.isFinite(args.age) || args.age < MINIMUM_AGE) {
      throw new Error(`You must be at least ${MINIMUM_AGE} to use OneRep`);
    }

    const [existing, ...duplicates] = await listOnboardingProfilesForUser(
      ctx,
      user._id,
    );

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      for (const duplicate of duplicates) {
        await ctx.db.delete(duplicate._id);
      }
    } else {
      await ctx.db.insert("onboardingProfiles", {
        userId: user._id,
        ...args,
        updatedAt: now,
        shownTooltips: [],
      });
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const profiles = await listOnboardingProfilesForUser(ctx, user._id);
    for (const profile of profiles) {
      await ctx.db.delete(profile._id);
    }
  },
});

/**
 * Updates individual consent flags without replaying the whole intake form.
 *
 * `consent.wearableIntegrations` was collected at onboarding and read by
 * nothing; Health sync is the first feature that depends on it, and it needs a
 * way to be granted after the fact.
 */
export const setConsent = mutation({
  args: {
    dataUse: v.optional(v.boolean()),
    weightData: v.optional(v.boolean()),
    foodLogging: v.optional(v.boolean()),
    wearableIntegrations: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await getLatestOnboardingProfile(ctx, user._id);
    if (!profile) throw new Error("Complete onboarding first");

    const current = profile.consent ?? {
      dataUse: false,
      weightData: false,
      foodLogging: false,
      wearableIntegrations: false,
    };
    const consent = {
      dataUse: args.dataUse ?? current.dataUse,
      weightData: args.weightData ?? current.weightData,
      foodLogging: args.foodLogging ?? current.foodLogging,
      wearableIntegrations:
        args.wearableIntegrations ?? current.wearableIntegrations,
    };

    await ctx.db.patch(profile._id, { consent, updatedAt: Date.now() });
    return consent;
  },
});
