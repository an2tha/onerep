import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const reminder = { enabled: true, hour: 8, minute: 0 };
const presetBody = {
  name: "Protected preset",
  items: [],
  exerciseData: {},
};
const mealPresetBody = {
  name: "Protected meal preset",
  meal: "breakfast",
  signature: "protected-meal",
  entries: [],
};
const recipeIngredient = {
  id: "ingredient-1",
  name: "Chicken breast",
  grams: 100,
  caloriesPer100: 165,
  proteinPer100: 31,
  carbsPer100: 0,
  fatPer100: 3.6,
};
const healthProfile = {
  sex: "male",
  age: 30,
  weightKg: 80,
  heightCm: 180,
  activityLevel: "moderately_active",
  goal: "maintain",
} as const;
const workoutExercise = {
  id: "squat",
  name: "Squat",
  sets: [{ type: "normal", reps: 5, weight: 100, completed: true }],
};
const fakeId = "jd7f4z1y2s3d4t5v6w7x8" as any;

type PublicWriteCase = {
  name: string;
  kind: "mutation" | "action";
  fn: any;
  args: Record<string, unknown>;
};

const unauthenticatedWriteCases: PublicWriteCase[] = [
  {
    name: "bodyProgress.generateUploadUrl",
    kind: "mutation",
    fn: api.bodyProgress.generateUploadUrl,
    args: {},
  },
  {
    name: "bodyProgress.save",
    kind: "mutation",
    fn: api.bodyProgress.save,
    args: { clientId: "body-1", loggedAt: "2026-06-25" },
  },
  {
    name: "bodyProgress.remove",
    kind: "mutation",
    fn: api.bodyProgress.remove,
    args: { clientId: "body-1" },
  },
  {
    name: "users.checkIn.setDailyCheckIn",
    kind: "mutation",
    fn: api.users.checkIn.setDailyCheckIn,
    args: {},
  },
  {
    name: "users.users.setBodyReminder",
    kind: "mutation",
    fn: api.users.users.setBodyReminder,
    args: reminder,
  },
  {
    name: "users.users.setCustomMealCategories",
    kind: "mutation",
    fn: api.users.users.setCustomMealCategories,
    args: { categories: [] },
  },
  {
    name: "users.users.setDashboardSettings",
    kind: "mutation",
    fn: api.users.users.setDashboardSettings,
    args: { workoutFocus: "strength" },
  },
  {
    name: "users.users.setWeightUnit",
    kind: "mutation",
    fn: api.users.users.setWeightUnit,
    args: { unit: "kg" },
  },
  {
    name: "users.users.setWaterGoal",
    kind: "mutation",
    fn: api.users.users.setWaterGoal,
    args: { goalMl: 2000 },
  },
  {
    name: "users.users.setWidgetLayout",
    kind: "mutation",
    fn: api.users.users.setWidgetLayout,
    args: { layout: [] },
  },
  {
    name: "users.users.setCustomGoals",
    kind: "mutation",
    fn: api.users.users.setCustomGoals,
    args: { calories: 2000 },
  },
  {
    name: "users.users.setMacroCycling",
    kind: "mutation",
    fn: api.users.users.setMacroCycling,
    args: { enabled: false },
  },
  {
    name: "users.users.setWorkoutAdjustment",
    kind: "mutation",
    fn: api.users.users.setWorkoutAdjustment,
    args: { enabled: true },
  },
  {
    name: "users.users.setPushReminders",
    kind: "mutation",
    fn: api.users.users.setPushReminders,
    args: {
      reminders: {
        water: reminder,
        meal: reminder,
        workout: reminder,
        body: reminder,
      },
    },
  },
  {
    name: "users.users.setPrivacySettings",
    kind: "mutation",
    fn: api.users.users.setPrivacySettings,
    args: {
      analyticsEnabled: false,
      personalizedInsightsEnabled: false,
    },
  },
  {
    name: "users.users.deleteMyDataBatch",
    kind: "mutation",
    fn: api.users.users.deleteMyDataBatch,
    args: {},
  },
  {
    name: "users.onboarding.save",
    kind: "mutation",
    fn: api.users.onboarding.save,
    args: { age: 30, heightCm: 180, goal: "health" },
  },
  {
    name: "users.onboarding.clear",
    kind: "mutation",
    fn: api.users.onboarding.clear,
    args: {},
  },
  {
    name: "users.schedules.set",
    kind: "mutation",
    fn: api.users.schedules.set,
    args: { routine: {}, presetOrder: [] },
  },
  {
    name: "logs.foodLogs.setDay",
    kind: "mutation",
    fn: api.logs.foodLogs.setDay,
    args: { date: "2026-06-25", entries: [] },
  },
  {
    name: "logs.water.setDay",
    kind: "mutation",
    fn: api.logs.water.setDay,
    args: { date: "2026-06-25", entries: [] },
  },
  {
    name: "logs.water.addEntry",
    kind: "mutation",
    fn: api.logs.water.addEntry,
    args: {
      date: "2026-06-25",
      entry: {
        id: "water-1",
        amountMl: 250,
        loggedAt: "2026-06-25T08:00:00.000Z",
      },
    },
  },
  {
    name: "logs.water.removeEntry",
    kind: "mutation",
    fn: api.logs.water.removeEntry,
    args: { date: "2026-06-25", id: "water-1" },
  },
  {
    name: "logs.supplements.setDay",
    kind: "mutation",
    fn: api.logs.supplements.setDay,
    args: { date: "2026-06-25", entries: [] },
  },
  {
    name: "logs.supplements.addEntry",
    kind: "mutation",
    fn: api.logs.supplements.addEntry,
    args: {
      date: "2026-06-25",
      entry: {
        id: "creatine-1",
        kind: "creatine",
        amount: 5,
        unit: "g",
        loggedAt: "2026-06-25T08:00:00.000Z",
      },
    },
  },
  {
    name: "logs.supplements.removeEntry",
    kind: "mutation",
    fn: api.logs.supplements.removeEntry,
    args: { date: "2026-06-25", id: "creatine-1" },
  },
  {
    name: "logs.supplements.saveItem",
    kind: "mutation",
    fn: api.logs.supplements.saveItem,
    args: {
      name: "Protected supplement",
      category: "creatine",
      form: "powder",
      servingLabel: "5 g",
      defaultServingQuantity: 5,
      active: true,
      schedule: { type: "daily" },
      nutrientsPerServing: { creatine: 5 },
      source: "manual",
    },
  },
  {
    name: "logs.supplements.setItemActive",
    kind: "mutation",
    fn: api.logs.supplements.setItemActive,
    args: { id: fakeId, active: false },
  },
  {
    name: "logs.supplements.logTaken",
    kind: "mutation",
    fn: api.logs.supplements.logTaken,
    args: {
      supplementId: fakeId,
      date: "2026-06-25",
      servingMultiplier: 1,
    },
  },
  {
    name: "logs.supplements.markSkipped",
    kind: "mutation",
    fn: api.logs.supplements.markSkipped,
    args: { supplementId: fakeId, date: "2026-06-25" },
  },
  {
    name: "logs.supplements.removeLog",
    kind: "mutation",
    fn: api.logs.supplements.removeLog,
    args: { logId: fakeId },
  },
  {
    name: "logs.presets.create",
    kind: "mutation",
    fn: api.logs.presets.create,
    args: presetBody,
  },
  {
    name: "logs.presets.update",
    kind: "mutation",
    fn: api.logs.presets.update,
    args: { id: fakeId, ...presetBody },
  },
  {
    name: "logs.presets.remove",
    kind: "mutation",
    fn: api.logs.presets.remove,
    args: { id: fakeId },
  },
  {
    name: "logs.mealPresets.create",
    kind: "mutation",
    fn: api.logs.mealPresets.create,
    args: mealPresetBody,
  },
  {
    name: "logs.mealPresets.remove",
    kind: "mutation",
    fn: api.logs.mealPresets.remove,
    args: { id: fakeId },
  },
  {
    name: "logs.recipes.save",
    kind: "mutation",
    fn: api.logs.recipes.save,
    args: { name: "Protected recipe", ingredients: [recipeIngredient] },
  },
  {
    name: "logs.recipes.remove",
    kind: "mutation",
    fn: api.logs.recipes.remove,
    args: { id: fakeId },
  },
  {
    name: "logs.activeWorkout.createActive",
    kind: "mutation",
    fn: api.logs.activeWorkout.createActive,
    args: { slot: 1, items: [], exerciseData: {} },
  },
  {
    name: "logs.activeWorkout.updateActive",
    kind: "mutation",
    fn: api.logs.activeWorkout.updateActive,
    args: { slot: 1, items: [], exerciseData: {}, elapsedSeconds: 1 },
  },
  {
    name: "logs.activeWorkout.abortActive",
    kind: "mutation",
    fn: api.logs.activeWorkout.abortActive,
    args: { slot: 1 },
  },
  {
    name: "logs.activeWorkout.finishActive",
    kind: "mutation",
    fn: api.logs.activeWorkout.finishActive,
    args: { slot: 1, exercises: [workoutExercise], durationSeconds: 60 },
  },
  {
    name: "logs.calories.setProfile",
    kind: "mutation",
    fn: api.logs.calories.setProfile,
    args: healthProfile,
  },
  {
    name: "logs.workouts.completion",
    kind: "mutation",
    fn: api.logs.workouts.completion,
    args: {
      date: "2026-06-25",
      exercises: [workoutExercise],
      durationSeconds: 60,
    },
  },
  {
    name: "logs.workouts.remove",
    kind: "mutation",
    fn: api.logs.workouts.remove,
    args: { id: fakeId },
  },
  {
    name: "logs.workouts.removeBySlot",
    kind: "mutation",
    fn: api.logs.workouts.removeBySlot,
    args: { date: "2026-06-25", slot: 1 },
  },
  {
    name: "food.openFoodFacts.proxy",
    kind: "action",
    fn: api.food.openFoodFacts.proxy,
    args: { path: "/cgi/search.pl", params: [] },
  },
  {
    name: "ai.metricGeneration.generateMetricSet",
    kind: "action",
    fn: api.ai.metricGeneration.generateMetricSet,
    args: {
      subapp: "progress",
      prompt: "strength progress",
      metrics: [],
    },
  },
  {
    name: "logs.presetAgent.createFromText",
    kind: "action",
    fn: api.logs.presetAgent.createFromText,
    args: { text: "Bench Press 3x5" },
  },
  {
    name: "logs.snap.snap",
    kind: "action",
    fn: api.logs.snap.snap,
    args: { base64Image: "", mimeType: "image/jpeg" },
  },
];

describe("Convex public write authorization", () => {
  for (const testCase of unauthenticatedWriteCases) {
    test(`${testCase.name} rejects unauthenticated callers`, async () => {
      const t = convexTest(schema, modules);

      if (testCase.kind === "mutation") {
        await expect(t.mutation(testCase.fn, testCase.args)).rejects.toThrow();
      } else {
        await expect(t.action(testCase.fn, testCase.args)).rejects.toThrow();
      }
    });
  }
});
