import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import { getLatestOnboardingProfile } from "./lib/onboardingProfiles";
import {
  localProgrammeTime,
  programmeDay,
  programmeNeedsCare,
} from "./lib/nutritionProgramme";

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const programme = await ctx.db
      .query("nutritionProgrammes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (!programme) return null;
    const profile = await getLatestOnboardingProfile(ctx, user._id);
    return {
      ...programme,
      recipeProfile: {
        dietType: profile?.dietType,
        allergies: profile?.allergies ?? [],
        cookingSkill: profile?.cookingSkill,
        budget: profile?.budget,
      },
      requiresCare: programmeNeedsCare(profile),
    };
  },
});
export const getEligibility = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user)
      return { eligible: false, reason: "Sign in to start a programme." };
    const profile = await getLatestOnboardingProfile(ctx, user._id);
    return {
      eligible: !programmeNeedsCare(profile),
      reason: programmeNeedsCare(profile)
        ? "Your saved profile has a nutrition restriction or protected tracking mode. Review your profile settings if that is out of date; otherwise, use an individual plan with a qualified professional."
        : null,
    };
  },
});

export const start = mutation({
  args: {
    goal: v.union(
      v.literal("maintain"),
      v.literal("step_down"),
      v.literal("step_up"),
    ),
    weeks: v.number(),
    baselineCalories: v.number(),
    changePercent: v.number(),
    protein: v.number(),
    fat: v.number(),
    fastingHours: v.number(),
    eatingStart: v.string(),
    timezone: v.string(),
    screeningConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new ConvexError("Sign in to start a programme.");
    const profile = await getLatestOnboardingProfile(ctx, user._id);
    if (!args.screeningConfirmed || programmeNeedsCare(profile))
      throw new ConvexError(
        "Your nutrition needs require an individual plan with a qualified professional.",
      );
    for (const n of [
      args.weeks,
      args.baselineCalories,
      args.changePercent,
      args.protein,
      args.fat,
      args.fastingHours,
    ])
      if (!Number.isFinite(n))
        throw new ConvexError("Enter valid programme values.");
    if (
      ![4, 6, 8, 12].includes(args.weeks) ||
      args.baselineCalories < 1600 ||
      args.baselineCalories > 5000 ||
      args.changePercent < 0 ||
      args.changePercent > 15 ||
      args.protein < 40 ||
      args.protein > 300 ||
      args.fat < 40 ||
      args.fat > 150 ||
      ![0, 12, 14, 16].includes(args.fastingHours) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.eatingStart)
    )
      throw new ConvexError("Check the programme targets and eating window.");
    const date = localProgrammeTime(args.timezone).date;
    const { screeningConfirmed: _, ...body } = args;
    const candidate = { ...body, startDate: date };
    const finalCalories =
      args.baselineCalories *
      (1 - (args.goal === "step_down" ? args.changePercent / 100 : 0));
    if (
      finalCalories < 1600 ||
      args.protein * 4 + args.fat * 9 > finalCalories - 400
    )
      throw new ConvexError(
        "These targets leave too little energy for the programme. Increase baseline calories or reduce the step down.",
      );
    const previous = await ctx.db
      .query("nutritionProgrammes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (previous && programmeDay(previous, date).active)
      throw new ConvexError(
        "End your current programme before starting another.",
      );
    return await ctx.db.insert("nutritionProgrammes", {
      ...candidate,
      userId: user._id,
      createdAt: Date.now(),
    });
  },
});
export const end = mutation({
  args: { id: v.id("nutritionProgrammes") },
  handler: async (ctx, { id }) => {
    const user = await getAuthUser(ctx);
    const programme = await ctx.db.get(id);
    if (!user || !programme || programme.userId !== user._id)
      throw new Error("Programme not found.");
    if (!programme.endedDate)
      await ctx.db.patch(id, {
        endedDate: localProgrammeTime(programme.timezone).date,
      });
  },
});
