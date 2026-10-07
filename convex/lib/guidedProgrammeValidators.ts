import { v } from "convex/values";
export const programmeTrack = v.union(
  v.literal("nutrition"),
  v.literal("training"),
);
export const programmeSettings = v.object({
  name: v.string(),
  goal: v.string(),
  weeks: v.number(),
  timezone: v.string(),
  mode: v.union(v.literal("guided"), v.literal("manual")),
  diet: v.string(),
  allergies: v.array(v.string()),
  dislikes: v.array(v.string()),
  cookingMinutes: v.number(),
  budget: v.string(),
  mealsPerDay: v.number(),
  daysPerWeek: v.number(),
  sessionMinutes: v.number(),
  experience: v.string(),
  equipment: v.array(v.string()),
  preferredExercises: v.array(v.string()),
  limitations: v.string(),
  baselineCalories: v.number(),
  protein: v.number(),
  fat: v.number(),
  changePercent: v.number(),
  nutritionGoal: v.union(
    v.literal("maintain"),
    v.literal("step_down"),
    v.literal("step_up"),
  ),
  screeningConfirmed: v.boolean(),
});
export const programmePlan = v.object({
  summary: v.string(),
  nutrition: v.optional(
    v.object({
      recipes: v.array(
        v.object({
          id: v.string(),
          recipeId: v.optional(v.string()),
          name: v.string(),
          category: v.string(),
          servings: v.number(),
          prepMinutes: v.number(),
          cookMinutes: v.number(),
          ingredients: v.array(
            v.object({
              name: v.string(),
              grams: v.number(),
              caloriesPer100: v.number(),
              proteinPer100: v.number(),
              carbsPer100: v.number(),
              fatPer100: v.number(),
            }),
          ),
          steps: v.array(v.string()),
        }),
      ),
      meals: v.array(
        v.object({
          id: v.string(),
          day: v.number(),
          slot: v.string(),
          recipeId: v.string(),
          servings: v.number(),
        }),
      ),
    }),
  ),
  training: v.optional(
    v.object({
      mesocycles: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          startWeek: v.number(),
          endWeek: v.number(),
          objective: v.string(),
          progression: v.string(),
          deload: v.boolean(),
        }),
      ),
      sessions: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          dayOfWeek: v.number(),
          blockId: v.optional(v.string()),
          presetId: v.optional(v.string()),
          exercises: v.array(
            v.object({
              id: v.string(),
              exerciseId: v.string(),
              name: v.string(),
              sets: v.number(),
              reps: v.string(),
              restSeconds: v.number(),
              notes: v.string(),
              alternatives: v.array(v.string()),
            }),
          ),
        }),
      ),
    }),
  ),
});
