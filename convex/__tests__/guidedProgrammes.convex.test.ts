/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { requestOpenAiJson } from "../ai/provider";
vi.mock("../ai/provider", () => ({
  requestOpenAiJson: vi.fn(),
  hasOpenAiApiKey: () => true,
}));
import {
  defaultProgrammeSettings,
  type ProgrammePlan,
} from "../../packages/models/src/guided-programme";
import { localProgrammeTime, programmeDay } from "../lib/nutritionProgramme";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
const modules = import.meta.glob("../**/*.ts");
const settings = {
  ...defaultProgrammeSettings(),
  name: "Steady meals",
  screeningConfirmed: true,
  weeks: 4,
};
const nutritionPlan: ProgrammePlan = {
  summary: "Practical meals for the week.",
  nutrition: {
    recipes: Array.from({ length: 12 }, (_, index) => ({
      id: `recipe-${index}`,
      name: `Meal ${index}`,
      category: "Lunch",
      servings: 2,
      prepMinutes: 10 + index,
      cookMinutes: 10,
      ingredients: [
        {
          name: "Rice",
          grams: 200,
          caloriesPer100: 130,
          proteinPer100: 3,
          carbsPer100: 28,
          fatPer100: 0.3,
        },
      ],
      steps: ["Cook the rice and serve."],
    })),
    meals: Array.from({ length: 21 }, (_, index) => ({
      id: `meal-${index}`,
      day: Math.floor(index / 3),
      slot: ["Breakfast", "Lunch", "Dinner"][index % 3]!,
      recipeId: `recipe-${index % 12}`,
      servings: 1,
    })),
  },
};
const trainingPlan: ProgrammePlan = {
  summary: "A consistent four-week block.",
  training: {
    mesocycles: [
      {
        id: "block",
        name: "Foundation",
        startWeek: 1,
        endWeek: 4,
        objective: "Practise consistently",
        progression: "Add reps when comfortable",
        deload: false,
      },
    ],
    sessions: [1, 3, 5].map((day) => ({
      id: `session-${day}`,
      name: `Session ${day}`,
      dayOfWeek: day,
      blockId: "block",
      exercises: [
        {
          id: "squat",
          exerciseId: "squat",
          name: "Squat",
          sets: 3,
          reps: "8",
          restSeconds: 90,
          notes: "Comfortable effort",
          alternatives: ["lunge"],
        },
      ],
    })),
  },
};
async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: "test|programmes-owner" });
  const other = t.withIdentity({ tokenIdentifier: "test|programmes-other" });
  await t.run(async (ctx) => {
    for (const exerciseId of ["squat", "lunge"])
      await ctx.db.insert("exercises", {
        userId: "__global__",
        exerciseId,
        name: exerciseId,
        category: "strength",
        level: "beginner",
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: [],
        instructions: [],
      });
  });
  return { t, owner, other };
}
afterEach(() => vi.useRealTimers());
test("manual tracks are isolated, materialise existing libraries once, and own nutrition targets", async () => {
  const { t, owner, other } = await setup();
  await owner.mutation(api.users.users.setNutritionTargets, { calories: 2000 });
  const nutrition = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
    plan: nutritionPlan,
  });
  const training = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings,
    plan: trainingPlan,
  });
  expect(await other.query(api.guidedProgrammes.list, {})).toEqual([]);
  await expect(
    other.mutation(api.guidedProgrammes.activate, { id: nutrition }),
  ).rejects.toThrow("not found");
  await owner.mutation(api.guidedProgrammes.activate, { id: nutrition });
  await owner.mutation(api.guidedProgrammes.activate, { id: training });
  await owner.mutation(api.guidedProgrammes.activate, { id: nutrition });
  expect(
    (await owner.query(api.guidedProgrammes.list, {})).filter(
      (row) => row.status === "active",
    ),
  ).toHaveLength(2);
  expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(
    12,
  );
  expect(await t.run((ctx) => ctx.db.query("presets").collect())).toHaveLength(
    3,
  );
  const date = localProgrammeTime("UTC").date;
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date }))?.effective
      .calories,
  ).toBe(2200);
  const replacement = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
    plan: nutritionPlan,
  });
  await expect(
    owner.mutation(api.guidedProgrammes.activate, { id: replacement }),
  ).rejects.toThrow("current programme");
  await owner.mutation(api.guidedProgrammes.setStatus, {
    id: nutrition,
    status: "ended",
  });
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date }))?.effective
      .calories,
  ).toBe(2000);
});
test("nutrition pause preserves historical targets and programme progression", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const { owner } = await setup();
  await owner.mutation(api.users.users.setNutritionTargets, { calories: 2000 });
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
    plan: nutritionPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  await owner.mutation(api.guidedProgrammes.setStatus, {
    id,
    status: "paused",
  });
  const paused = await owner.query(api.nutritionProgrammes.getCurrent, {});
  expect(programmeDay(paused!, "2026-10-07").active).toBe(true);
  expect(programmeDay(paused!, "2026-10-08").active).toBe(false);
  expect(
    (
      await owner.query(api.users.users.getEffectiveGoals, {
        date: "2026-10-07",
      })
    )?.effective.calories,
  ).toBe(2200);
  expect(
    (
      await owner.query(api.users.users.getEffectiveGoals, {
        date: "2026-10-08",
      })
    )?.effective.calories,
  ).toBe(2000);
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  await owner.mutation(api.guidedProgrammes.setStatus, {
    id,
    status: "active",
  });
  const resumed = await owner.query(api.nutritionProgrammes.getCurrent, {});
  expect(programmeDay(resumed!, "2026-10-15")).toMatchObject({
    active: true,
    week: 2,
  });
  expect(programmeDay(resumed!, "2026-10-11").active).toBe(false);
  expect((await owner.query(api.guidedProgrammes.get, { id })).startDate).toBe(
    "2026-10-08",
  );
});
test("recipe logging scales portions and transport retries do not duplicate meals", async () => {
  const { owner, t } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
    plan: nutritionPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  const input = { id, mealId: "meal-0", date: "2026-10-07" };
  await owner.mutation(api.guidedProgrammes.logMeal, input);
  await owner.mutation(api.guidedProgrammes.logMeal, input);
  const rows = await t.run((ctx) => ctx.db.query("foodLogs").collect());
  expect(rows[0]!.entries).toHaveLength(1);
  expect(rows[0]!.entries[0]).toMatchObject({
    calories: 130,
    protein: 3,
    carbs: 28,
    fat: 0.3,
  });
});
test("check-ins require review, reject stale proposals, and never change completed logs", async () => {
  const { owner, t } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings,
    plan: trainingPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  const checkInId = await owner.mutation(api.guidedProgrammes.checkIn, {
    id,
    adherence: 3,
    difficulty: 5,
    enjoyment: 4,
    scheduleFits: true,
  });
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).plan!.training!
      .sessions[0]!.exercises[0]!.sets,
  ).toBe(3);
  await owner.mutation(api.guidedProgrammes.reviewCheckIn, {
    checkInId,
    accept: true,
  });
  const row = await owner.query(api.guidedProgrammes.get, { id });
  expect(row.plan!.training!.sessions[0]!.exercises[0]!.sets).toBe(2);
  const presets = await t.run((ctx) => ctx.db.query("presets").collect());
  expect(presets[0]!.exerciseData.squat.sets).toHaveLength(2);
  const stale = await owner.mutation(api.guidedProgrammes.checkIn, {
    id,
    adherence: 3,
    difficulty: 5,
    enjoyment: 4,
    scheduleFits: true,
  });
  await t.run((ctx) =>
    ctx.db.patch("guidedProgrammes", id, { updatedAt: row.updatedAt + 10 }),
  );
  await expect(
    owner.mutation(api.guidedProgrammes.reviewCheckIn, {
      checkInId: stale,
      accept: true,
    }),
  ).rejects.toThrow("changed");
  expect(await t.run((ctx) => ctx.db.query("workoutLogs").collect())).toEqual(
    [],
  );
});
test("block swaps validate exercises and update prescriptions without carrying weights", async () => {
  const { owner, other, t } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings,
    plan: trainingPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  const args = {
    programmeId: id,
    oldExerciseId: "squat",
    newExerciseId: "lunge",
    newExerciseName: "Fake name",
    sets: 2,
    reps: "10",
    restSeconds: 60,
  };
  await expect(
    other.mutation(api.guidedProgrammes.swapTrainingExercise, args),
  ).rejects.toThrow();
  await owner.mutation(api.guidedProgrammes.swapTrainingExercise, args);
  const rows = await t.run((ctx) => ctx.db.query("presets").collect());
  expect(rows[0]!.exerciseData.lunge.sets).toHaveLength(2);
  expect(rows[0]!.exerciseData.lunge.sets[0]).toMatchObject({
    weight: "",
    reps: "10",
    restSeconds: 60,
  });
  expect(rows[0]!.exerciseData.squat).toBeUndefined();
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).plan!.training!
      .sessions[0]!.exercises[0]!.name,
  ).toBe("lunge");
});
test("AI reservations bill five once, persist success, reject conflicting keys, and refund failures once", async () => {
  const { owner, t } = await setup();
  await owner.mutation(api.ai.usage.setSharingConsent, {
    granted: true,
    version: AI_SHARING_VERSION,
  });
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
  });
  const args = { id, requestId: "request-1" };
  const reservation = await owner.mutation(
    internal.guidedProgrammes.reserveGeneration,
    args,
  );
  await expect(
    owner.mutation(internal.guidedProgrammes.reserveGeneration, args),
  ).rejects.toThrow("already");
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  await t.mutation(internal.guidedProgrammes.completeGeneration, {
    generationId: reservation.generationId!,
    attempt: reservation.attempt!,
    plan: nutritionPlan,
  });
  expect(
    (await owner.mutation(internal.guidedProgrammes.reserveGeneration, args))
      .complete,
  ).toBe(true);
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  const retry = await owner.mutation(
    internal.guidedProgrammes.reserveGeneration,
    { id, requestId: "request-2" },
  );
  const failure = {
    generationId: retry.generationId!,
    attempt: retry.attempt!,
    error: "Provider failed",
  };
  await t.mutation(internal.guidedProgrammes.failGeneration, failure);
  await t.mutation(internal.guidedProgrammes.failGeneration, failure);
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).plan!.nutrition!
      .recipes,
  ).toHaveLength(12);
  await owner.mutation(api.guidedProgrammes.saveDraft, {
    id,
    track: "nutrition",
    settings: { ...settings, goal: "New goal" },
  });
  await expect(
    owner.mutation(internal.guidedProgrammes.reserveGeneration, args),
  ).rejects.toThrow("settings changed");
});
test("AI reservation checks consent, quota, and complete output validation before commit", async () => {
  const { owner, t } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
  });
  await owner.mutation(api.ai.usage.setSharingConsent, {
    granted: false,
    version: AI_SHARING_VERSION,
  });
  await expect(
    owner.mutation(internal.guidedProgrammes.reserveGeneration, {
      id,
      requestId: "blocked",
    }),
  ).rejects.toThrow("sharing");
  await owner.mutation(api.ai.usage.setSharingConsent, {
    granted: true,
    version: AI_SHARING_VERSION,
  });
  const reservation = await owner.mutation(
    internal.guidedProgrammes.reserveGeneration,
    { id, requestId: "valid" },
  );
  const incomplete = structuredClone(nutritionPlan);
  incomplete.nutrition!.recipes.pop();
  await expect(
    t.mutation(internal.guidedProgrammes.completeGeneration, {
      generationId: reservation.generationId!,
      attempt: reservation.attempt!,
      plan: incomplete,
    }),
  ).rejects.toThrow("12 recipes");
  await t.mutation(internal.guidedProgrammes.failGeneration, {
    generationId: reservation.generationId!,
    attempt: reservation.attempt!,
    error: "Incomplete programme",
  });
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(0);
});
test("rejects allergy matches and invented exercise IDs; training ignores unrelated calorie targets", async () => {
  const { owner } = await setup();
  await expect(
    owner.mutation(api.guidedProgrammes.saveDraft, {
      track: "nutrition",
      settings: { ...settings, allergies: ["rice"] },
      plan: nutritionPlan,
    }),
  ).rejects.toThrow("allergy");
  const invented = structuredClone(trainingPlan);
  invented.training!.sessions[0]!.exercises[0]!.exerciseId = "made-up";
  await expect(
    owner.mutation(api.guidedProgrammes.saveDraft, {
      track: "training",
      settings,
      plan: invented,
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    owner.mutation(api.guidedProgrammes.saveDraft, {
      track: "training",
      settings: { ...settings, baselineCalories: 1200 },
      plan: trainingPlan,
    }),
  ).resolves.toBeTruthy();
});

test("recipe edits copy library versions and stale plan saves cannot undo them", async () => {
  const { owner, t } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
    plan: nutritionPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  const original = await owner.query(api.guidedProgrammes.get, { id });
  const plan = structuredClone(original.plan!);
  const previousRecipeId = plan.nutrition!.recipes[0]!.recipeId!;
  plan.nutrition!.recipes[0]!.ingredients[0]!.grams = 400;
  await owner.mutation(api.guidedProgrammes.updatePlan, {
    id,
    plan,
    expectedUpdatedAt: original.updatedAt,
  });
  const updated = await owner.query(api.guidedProgrammes.get, { id });
  expect(updated.plan!.nutrition!.recipes[0]!.recipeId).not.toBe(
    previousRecipeId,
  );
  expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(
    13,
  );
  await expect(
    owner.mutation(api.guidedProgrammes.updatePlan, {
      id,
      plan: original.plan!,
      expectedUpdatedAt: original.updatedAt,
    }),
  ).rejects.toThrow("changed");
  await owner.mutation(api.guidedProgrammes.updatePlan, {
    id,
    plan: updated.plan!,
    expectedUpdatedAt: updated.updatedAt,
  });
  expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(
    13,
  );
});
test("generation retries refund exactly their own attempt and stale watchdogs cannot refund a new run", async () => {
  const { owner, t } = await setup();
  await owner.mutation(api.ai.usage.setSharingConsent, {
    granted: true,
    version: AI_SHARING_VERSION,
  });
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
  });
  const starts = await Promise.allSettled([
    owner.mutation(internal.guidedProgrammes.reserveGeneration, {
      id,
      requestId: "concurrent-1",
    }),
    owner.mutation(internal.guidedProgrammes.reserveGeneration, {
      id,
      requestId: "concurrent-2",
    }),
  ]);
  expect(starts.filter((result) => result.status === "fulfilled")).toHaveLength(
    1,
  );
  const first = starts.find((result) => result.status === "fulfilled")!;
  if (first.status !== "fulfilled") throw new Error("No reservation");
  const stale = {
    generationId: first.value.generationId!,
    attempt: first.value.attempt!,
    error: "Timeout",
  };
  await t.mutation(internal.guidedProgrammes.failGeneration, stale);
  const requestId =
    starts[0]!.status === "fulfilled" ? "concurrent-1" : "concurrent-2";
  const retry = await owner.mutation(
    internal.guidedProgrammes.reserveGeneration,
    { id, requestId },
  );
  await t.mutation(internal.guidedProgrammes.failGeneration, stale);
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  await t.mutation(internal.guidedProgrammes.completeGeneration, {
    generationId: retry.generationId!,
    attempt: retry.attempt!,
    plan: nutritionPlan,
  });
  await t.mutation(internal.guidedProgrammes.failGeneration, {
    ...stale,
    attempt: retry.attempt!,
  });
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
});
test("finished programmes no longer appear active, and expired blocks cannot be swapped", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const { owner } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings,
    plan: trainingPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  expect((await owner.query(api.guidedProgrammes.list, {}))[0]!.status).toBe(
    "ended",
  );
  await expect(
    owner.mutation(api.guidedProgrammes.swapTrainingExercise, {
      programmeId: id,
      oldExerciseId: "squat",
      newExerciseId: "lunge",
      newExerciseName: "Lunge",
    }),
  ).rejects.toThrow("resume");
});

test("generation action refunds malformed output, retries successfully, and cached retries skip the provider", async () => {
  const { owner } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
  });
  vi.mocked(requestOpenAiJson)
    .mockReset()
    .mockResolvedValueOnce("invalid JSON");
  await expect(
    owner.action(api.ai.guidedProgramme.generate, {
      id,
      requestId: "action-attempt",
    }),
  ).rejects.toThrow("tokens were returned");
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(0);
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).generationStatus,
  ).toBe("failed");
  vi.mocked(requestOpenAiJson).mockResolvedValueOnce(
    JSON.stringify(nutritionPlan),
  );
  await owner.action(api.ai.guidedProgramme.generate, {
    id,
    requestId: "action-attempt",
  });
  await owner.action(api.ai.guidedProgramme.generate, {
    id,
    requestId: "action-attempt",
  });
  expect(vi.mocked(requestOpenAiJson)).toHaveBeenCalledTimes(2);
  expect((await owner.query(api.ai.usage.getMonthlyUsage, {})).count).toBe(5);
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).generationStatus,
  ).toBe("complete");
});
test("insufficient remaining quota prevents provider calls and leaves no stranded running draft", async () => {
  const { owner } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "nutrition",
    settings,
  });
  for (let index = 0; index < 6; index++)
    await owner.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId: "test|programmes-owner",
      source: "recipe_generation",
    });
  vi.mocked(requestOpenAiJson).mockClear();
  await expect(
    owner.action(api.ai.guidedProgramme.generate, {
      id,
      requestId: "over-quota",
    }),
  ).rejects.toThrow("4 remaining");
  expect(vi.mocked(requestOpenAiJson)).not.toHaveBeenCalled();
  expect(
    (await owner.query(api.guidedProgrammes.get, { id })).generationStatus,
  ).toBeUndefined();
});

test("committed versions make edit and check-in undo safe against intervening changes", async () => {
  const { owner } = await setup();
  const id = await owner.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings,
    plan: trainingPlan,
  });
  await owner.mutation(api.guidedProgrammes.activate, { id });
  const before = await owner.query(api.guidedProgrammes.get, { id });
  const changed = structuredClone(before.plan!);
  changed.summary = "An updated plan";
  const edit = await owner.mutation(api.guidedProgrammes.updatePlan, {
    id,
    plan: changed,
    expectedUpdatedAt: before.updatedAt,
  });
  expect(edit.id).toBe(id);
  expect(edit.updatedAt).toBeGreaterThan(before.updatedAt);
  const checkInId = await owner.mutation(api.guidedProgrammes.checkIn, {
    id,
    adherence: 3,
    difficulty: 5,
    enjoyment: 4,
    scheduleFits: true,
  });
  const accepted = await owner.mutation(api.guidedProgrammes.reviewCheckIn, {
    checkInId,
    accept: true,
  });
  expect(accepted.updatedAt).toBeGreaterThan(edit.updatedAt);
  await expect(
    owner.mutation(api.guidedProgrammes.updatePlan, {
      id,
      plan: before.plan!,
      expectedUpdatedAt: edit.updatedAt,
    }),
  ).rejects.toThrow("changed");
  const undo = await owner.mutation(api.guidedProgrammes.updatePlan, {
    id,
    plan: changed,
    expectedUpdatedAt: accepted.updatedAt,
  });
  expect(undo.updatedAt).toBeGreaterThan(accepted.updatedAt);
  const replay = await owner.mutation(api.guidedProgrammes.reviewCheckIn, {
    checkInId,
    accept: true,
  });
  expect(replay.updatedAt).toBe(accepted.updatedAt);
});
