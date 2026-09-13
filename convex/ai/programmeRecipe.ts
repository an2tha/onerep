import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import { requestOpenAiJson } from "./provider";
import { consumeAiUsageOrThrow } from "./usage";

type GeneratedIngredient = {
  name: string;
  grams: number;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

export const generateForProgramme = action({
  args: { date: v.string() },
  handler: async (ctx, args): Promise<{ recipeId: string; name: string }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Sign in to generate a recipe.");
    const programme = await ctx.runQuery(api.nutritionProgrammes.getCurrent, {});
    if (!programme || programme.requiresCare)
      throw new Error("Start an eligible nutrition programme first.");
    const quota = await consumeAiUsageOrThrow(ctx, user._id, "recipe_generation");
    const recommendations = await ctx.runQuery(
      api.logs.recipes.recommendedForProgramme,
      { date: args.date, limit: 3 },
    );
    const output = JSON.parse(await requestOpenAiJson({
      apiKey: quota.apiKey,
      label: "programme_recipe",
      maxTokens: 2200,
      temperature: 0.35,
      system:
        "Create one practical, detailed recipe as strict JSON. Never include allergens named by the user. Nutrition values must be realistic per 100 g. Return name, description, servings, prepMinutes, cookMinutes, category, tags, notes, steps, ingredients. Each ingredient needs name, grams, caloriesPer100, proteinPer100, carbsPer100, fatPer100.",
      user: JSON.stringify({
        date: args.date,
        programme: {
          goal: programme.goal,
          baselineCalories: programme.baselineCalories,
          protein: programme.protein,
          fat: programme.fat,
          fastingHours: programme.fastingHours,
        },
        preferences: programme.recipeProfile,
        avoidRepeating: recommendations.map((recipe) => recipe.name),
      }),
    })) as Record<string, unknown>;
    const ingredients = Array.isArray(output.ingredients)
      ? (output.ingredients as GeneratedIngredient[]).filter(
          (item) =>
            item &&
            typeof item.name === "string" &&
            [item.grams, item.caloriesPer100, item.proteinPer100, item.carbsPer100, item.fatPer100].every(
              (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
            ),
        )
      : [];
    if (typeof output.name !== "string" || ingredients.length < 2)
      throw new Error("The recipe was incomplete. Try again.");
    const name = output.name.trim().slice(0, 100);
    const recipeId = await ctx.runMutation(api.logs.recipes.save, {
      name,
      recipeType: "detailed",
      description: typeof output.description === "string" ? output.description.slice(0, 500) : undefined,
      servings: typeof output.servings === "number" ? Math.max(1, Math.min(20, Math.round(output.servings))) : 2,
      prepMinutes: typeof output.prepMinutes === "number" ? Math.max(0, Math.round(output.prepMinutes)) : undefined,
      cookMinutes: typeof output.cookMinutes === "number" ? Math.max(0, Math.round(output.cookMinutes)) : undefined,
      category: typeof output.category === "string" ? output.category.slice(0, 60) : "Programme meal",
      tags: Array.isArray(output.tags) ? output.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8) : ["programme"],
      notes: typeof output.notes === "string" ? output.notes.slice(0, 800) : "Generated for your active nutrition programme.",
      steps: Array.isArray(output.steps) ? output.steps.filter((step): step is string => typeof step === "string").slice(0, 16) : [],
      ingredients: ingredients.slice(0, 24).map((item, index) => ({ ...item, id: `ai-${index + 1}` })),
    });
    return { recipeId: String(recipeId), name };
  },
});
