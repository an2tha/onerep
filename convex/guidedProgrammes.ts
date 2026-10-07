import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type {
  ProgrammePlan,
  ProgrammeSession,
} from "../packages/models/src/guided-programme";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import {
  programmePlan,
  programmeSettings,
  programmeTrack,
} from "./lib/guidedProgrammeValidators";
import {
  validateProgrammePlan,
  validateProgrammeSettings,
} from "./lib/guidedProgramme";
import { customExerciseDocId, isCustomExerciseId } from "./lib/exerciseShape";
import {
  localProgrammeTime,
  programmeDay,
  programmeNeedsCare,
  validDate,
} from "./lib/nutritionProgramme";
import { getLatestOnboardingProfile } from "./lib/onboardingProfiles";
import type { AiUsageQuota } from "./ai/usage";

type Programme = Doc<"guidedProgrammes">;
async function owned(ctx: QueryCtx | MutationCtx, id: Id<"guidedProgrammes">) {
  const user = await getAuthUser(ctx);
  const row = await ctx.db.get("guidedProgrammes", id);
  if (!row || row.userId !== user._id) throw new Error("Programme not found.");
  return row;
}
function effectiveProgramme(row: Programme): Programme {
  if (
    row.status === "active" &&
    row.startDate &&
    (Date.parse(localProgrammeTime(row.settings.timezone).date) -
      Date.parse(row.startDate)) /
      86400000 >=
      row.settings.weeks * 7
  )
    return { ...row, status: "ended" };
  return row;
}
async function requireExercise(
  ctx: MutationCtx,
  userId: string,
  exerciseId: string,
) {
  if (isCustomExerciseId(exerciseId)) {
    const id = ctx.db.normalizeId(
      "customExercises",
      customExerciseDocId(exerciseId),
    );
    const row = id ? await ctx.db.get("customExercises", id) : null;
    if (!row || row.userId !== userId)
      throw new Error("Choose an exercise from your exercise library.");
    return row.name;
  }
  for (const owner of ["__global__", userId]) {
    const row = await ctx.db
      .query("exercises")
      .withIndex("by_userId_and_exerciseId", (q) =>
        q.eq("userId", owner).eq("exerciseId", exerciseId),
      )
      .first();
    if (row) return row.name;
  }
  throw new Error(
    "An exercise is unavailable. Choose another from your library.",
  );
}
async function validateLinks(
  ctx: MutationCtx,
  row: Programme,
  plan: ProgrammePlan,
) {
  for (const recipe of plan.nutrition?.recipes ?? []) {
    if (!recipe.recipeId) continue;
    const id = ctx.db.normalizeId("recipes", recipe.recipeId);
    const saved = id ? await ctx.db.get("recipes", id) : null;
    if (!saved || saved.userId !== row.userId)
      throw new Error("A saved recipe is unavailable.");
  }
  for (const session of plan.training?.sessions ?? []) {
    if (session.presetId) {
      const id = ctx.db.normalizeId("presets", session.presetId);
      const preset = id ? await ctx.db.get("presets", id) : null;
      if (
        !preset ||
        preset.userId !== row.userId ||
        preset.guidedProgrammeId !== row._id
      )
        throw new Error("A workout preset does not belong to this programme.");
    }
    for (const exercise of session.exercises) {
      exercise.name = await requireExercise(
        ctx,
        row.userId,
        exercise.exerciseId,
      );
      for (const alternative of exercise.alternatives)
        await requireExercise(ctx, row.userId, alternative);
    }
  }
}
function presetBody(row: Programme, session: ProgrammeSession) {
  return {
    userId: row.userId,
    name: session.name,
    guidedProgrammeId: row._id,
    guidedSessionId: session.id,
    items: session.exercises.map((exercise) => ({
      kind: "solo",
      exerciseId: exercise.exerciseId,
    })),
    exerciseData: Object.fromEntries(
      session.exercises.map((exercise) => [
        exercise.exerciseId,
        {
          trackRpe: true,
          trackUnilateral: false,
          sets: Array.from({ length: exercise.sets }, (_, index) => ({
            id: `${session.id}-${exercise.id}-${index}`,
            type: "working",
            weight: "",
            reps: exercise.reps,
            leftReps: "",
            rightReps: "",
            rpe: "",
            restSeconds: exercise.restSeconds,
          })),
        },
      ]),
    ),
    focus: "strength",
    duration: String(row.settings.sessionMinutes),
    steps: session.exercises
      .map((exercise) => `${exercise.name}: ${exercise.notes}`)
      .filter(Boolean),
    updatedAt: Date.now(),
  };
}
/** Materialise existing recipe/preset stores within the same activation transaction. */
async function materialise(
  ctx: MutationCtx,
  row: Programme,
  plan: ProgrammePlan,
) {
  for (const recipe of plan.nutrition?.recipes ?? []) {
    if (recipe.recipeId) {
      const savedId = ctx.db.normalizeId("recipes", recipe.recipeId)!;
      const saved = await ctx.db.get("recipes", savedId);
      const contents = (value: {
        name: string;
        servings?: number;
        prepMinutes?: number;
        cookMinutes?: number;
        category?: string;
        steps?: string[];
        ingredients: {
          name: string;
          grams: number;
          caloriesPer100: number;
          proteinPer100: number;
          carbsPer100: number;
          fatPer100: number;
        }[];
      }) =>
        JSON.stringify({
          name: value.name,
          servings: value.servings ?? 1,
          prepMinutes: value.prepMinutes ?? 0,
          cookMinutes: value.cookMinutes ?? 0,
          category: value.category ?? "",
          steps: value.steps ?? [],
          ingredients: value.ingredients.map((item) => ({
            name: item.name,
            grams: item.grams,
            caloriesPer100: item.caloriesPer100,
            proteinPer100: item.proteinPer100,
            carbsPer100: item.carbsPer100,
            fatPer100: item.fatPer100,
          })),
        });
      if (saved && contents(saved) === contents(recipe)) continue;
      // Copy on edit keeps imported recipes and previously logged recipe links intact.
    }
    recipe.recipeId = await ctx.db.insert("recipes", {
      userId: row.userId,
      name: recipe.name,
      recipeType: "detailed",
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      category: recipe.category,
      tags: ["programme"],
      steps: recipe.steps,
      ingredients: recipe.ingredients.map((item, index) => ({
        ...item,
        id: `${recipe.id}-${index}`,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  for (const session of plan.training?.sessions ?? []) {
    const body = presetBody(row, session);
    if (session.presetId) {
      const presetId = ctx.db.normalizeId("presets", session.presetId)!;
      // Update only sessions whose prescription changed, preserving unrelated preset edits.
      const previous = row.plan?.training?.sessions.find(
        (item) => item.id === session.id,
      );
      if (JSON.stringify(previous) !== JSON.stringify(session)) {
        const preset = await ctx.db.get("presets", presetId);
        for (const exercise of session.exercises) {
          const before = previous?.exercises.find(
            (item) => item.exerciseId === exercise.exerciseId,
          );
          const savedData = preset?.exerciseData?.[exercise.exerciseId];
          if (!before || !savedData || !Array.isArray(savedData.sets)) continue;
          if (JSON.stringify(before) === JSON.stringify(exercise)) {
            body.exerciseData[exercise.exerciseId] = savedData;
          } else {
            body.exerciseData[exercise.exerciseId].sets = body.exerciseData[
              exercise.exerciseId
            ].sets.map((set, index) => ({
              ...set,
              ...(savedData.sets[index] ?? {}),
              reps: exercise.reps,
              restSeconds: exercise.restSeconds,
            }));
          }
        }
        await ctx.db.patch("presets", presetId, body);
      }
    } else {
      session.presetId = await ctx.db.insert("presets", {
        ...body,
        createdAt: Date.now(),
      });
    }
  }
  return plan;
}
async function endNutrition(ctx: MutationCtx, row: Programme) {
  if (row.nutritionProgrammeId)
    await ctx.runMutation(api.nutritionProgrammes.end, {
      id: row.nutritionProgrammeId,
    });
}
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("guidedProgrammes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return rows.map(effectiveProgramme);
  },
});
export const get = query({
  args: { id: v.id("guidedProgrammes") },
  handler: async (ctx, { id }) => {
    const row = await owned(ctx, id);
    const checkIns = await ctx.db
      .query("guidedProgrammeCheckIns")
      .withIndex("by_programmeId", (q) => q.eq("programmeId", id))
      .order("desc")
      .take(24);
    return { ...effectiveProgramme(row), checkIns };
  },
});
export const saveDraft = mutation({
  args: {
    id: v.optional(v.id("guidedProgrammes")),
    track: programmeTrack,
    settings: programmeSettings,
    plan: v.optional(programmePlan),
  },
  handler: async (ctx, args): Promise<Id<"guidedProgrammes">> => {
    const user = await getAuthUser(ctx);
    validateProgrammeSettings(args.settings, args.track);
    if (args.plan) validateProgrammePlan(args.track, args.plan, args.settings);
    if (args.id) {
      const row = await owned(ctx, args.id);
      if (
        row.status !== "draft" ||
        row.generationStatus === "running" ||
        row.track !== args.track
      )
        throw new Error(
          "This programme cannot be edited as a draft right now.",
        );
      if (args.plan) await validateLinks(ctx, row, args.plan);
      await ctx.db.patch("guidedProgrammes", row._id, {
        settings: args.settings,
        ...(args.plan ? { plan: args.plan } : {}),
        updatedAt: Math.max(Date.now(), row.updatedAt + 1),
      });
      return row._id;
    }
    const id = await ctx.db.insert("guidedProgrammes", {
      userId: user._id,
      track: args.track,
      status: "draft",
      settings: args.settings,
      plan: args.plan,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (args.plan)
      await validateLinks(
        ctx,
        (await ctx.db.get("guidedProgrammes", id))!,
        args.plan,
      );
    return id;
  },
});
export const updatePlan = mutation({
  args: {
    id: v.id("guidedProgrammes"),
    plan: programmePlan,
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, plan, expectedUpdatedAt }) => {
    const row = await owned(ctx, id);
    if (
      effectiveProgramme(row).status === "ended" ||
      row.generationStatus === "running"
    )
      throw new Error("This programme is not available for changes.");
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== row.updatedAt)
      throw new Error(
        "Your programme changed on another screen. Refresh it before saving these edits.",
      );
    validateProgrammePlan(
      row.track,
      plan,
      row.settings,
      false,
      row.status !== "draft",
    );
    await validateLinks(ctx, row, plan);
    const saved =
      row.status === "draft" ? plan : await materialise(ctx, row, plan);
    const updatedAt = Math.max(Date.now(), row.updatedAt + 1);
    await ctx.db.patch("guidedProgrammes", id, { plan: saved, updatedAt });
    return { id, updatedAt };
  },
});
export const activate = mutation({
  args: {
    id: v.id("guidedProgrammes"),
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { id, replaceExisting },
  ): Promise<Id<"guidedProgrammes">> => {
    const row = await owned(ctx, id);
    if (row.status === "active") return id;
    if (
      row.status !== "draft" ||
      !row.plan ||
      row.generationStatus === "running"
    )
      throw new Error("Finish your programme preview first.");
    validateProgrammeSettings(row.settings, row.track);
    validateProgrammePlan(row.track, row.plan, row.settings, false, true);
    await validateLinks(ctx, row, row.plan);
    for (const status of ["active", "paused"] as const) {
      const existing = await ctx.db
        .query("guidedProgrammes")
        .withIndex("by_userId_and_track_and_status", (q) =>
          q
            .eq("userId", row.userId)
            .eq("track", row.track)
            .eq("status", status),
        )
        .take(10);
      for (const previous of existing) {
        if (effectiveProgramme(previous).status !== "ended" && !replaceExisting)
          throw new Error(
            "End or replace your current programme in this track first.",
          );
        await endNutrition(ctx, previous);
        await ctx.db.patch("guidedProgrammes", previous._id, {
          status: "ended",
          updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
        });
      }
    }
    let nutritionProgrammeId: Id<"nutritionProgrammes"> | undefined;
    const startDate = localProgrammeTime(row.settings.timezone).date;
    if (row.track === "nutrition") {
      const previous = await ctx.db
        .query("nutritionProgrammes")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId))
        .order("desc")
        .first();
      if (
        previous &&
        programmeDay(previous, localProgrammeTime(previous.timezone).date)
          .active
      ) {
        if (!replaceExisting)
          throw new Error(
            "You already have a nutrition programme. Confirm replacement first.",
          );
        await ctx.runMutation(api.nutritionProgrammes.end, {
          id: previous._id,
        });
      }
      nutritionProgrammeId = await ctx.runMutation(
        api.nutritionProgrammes.start,
        {
          goal: row.settings.nutritionGoal,
          weeks: row.settings.weeks,
          baselineCalories: row.settings.baselineCalories,
          changePercent: row.settings.changePercent,
          protein: row.settings.protein,
          fat: row.settings.fat,
          fastingHours: 0,
          eatingStart: "08:00",
          timezone: row.settings.timezone,
          screeningConfirmed: row.settings.screeningConfirmed,
        },
      );
    }
    const plan = await materialise(ctx, row, row.plan);
    await ctx.db.patch("guidedProgrammes", id, {
      status: "active",
      startDate,
      nutritionProgrammeId,
      plan,
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    return id;
  },
});
export const setStatus = mutation({
  args: {
    id: v.id("guidedProgrammes"),
    status: v.union(
      v.literal("paused"),
      v.literal("active"),
      v.literal("ended"),
    ),
  },
  handler: async (ctx, { id, status }) => {
    const row = await owned(ctx, id);
    if (row.status === status) return id;
    if (effectiveProgramme(row).status === "ended" || row.status === "draft")
      throw new Error(
        "Only a running programme can be paused, resumed, or ended.",
      );
    const today = localProgrammeTime(row.settings.timezone).date;
    const nutrition = row.nutritionProgrammeId
      ? await ctx.db.get("nutritionProgrammes", row.nutritionProgrammeId)
      : null;
    let startDate = row.startDate;
    if (status === "ended") await endNutrition(ctx, row);
    if (status === "paused" && nutrition) {
      const pauses = [...(nutrition.pauses ?? [])];
      if (pauses.length >= 100)
        throw new Error(
          "This programme has reached its pause limit. End it and create a new plan.",
        );
      pauses.push({ startDate: today });
      await ctx.db.patch("nutritionProgrammes", nutrition._id, { pauses });
    }
    if (status === "active") {
      if (row.status !== "paused")
        throw new Error("Only a paused programme can be resumed.");
      if (nutrition) {
        const latest = await ctx.db
          .query("nutritionProgrammes")
          .withIndex("by_userId", (q) => q.eq("userId", row.userId))
          .order("desc")
          .first();
        if (latest?._id !== nutrition._id || nutrition.endedDate)
          throw new Error(
            "Your nutrition plan has changed. Create a new programme to continue.",
          );
        await ctx.db.patch("nutritionProgrammes", nutrition._id, {
          pauses: (nutrition.pauses ?? []).map((pause) =>
            pause.endDate ? pause : { ...pause, endDate: today },
          ),
        });
      }
      const pausedDate = localProgrammeTime(
        row.settings.timezone,
        new Date(row.pausedAt ?? Date.now()),
      ).date;
      const days = Math.max(
        0,
        (Date.parse(today) - Date.parse(pausedDate)) / 86400000,
      );
      if (startDate)
        startDate = new Date(Date.parse(startDate) + days * 86400000)
          .toISOString()
          .slice(0, 10);
    }
    await ctx.db.patch("guidedProgrammes", id, {
      status,
      startDate,
      pausedAt: status === "paused" ? Date.now() : undefined,
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    return id;
  },
});
export const checkIn = mutation({
  args: {
    id: v.id("guidedProgrammes"),
    adherence: v.number(),
    difficulty: v.number(),
    enjoyment: v.number(),
    scheduleFits: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await owned(ctx, args.id);
    if (!["active", "paused"].includes(effectiveProgramme(row).status))
      throw new Error("Start a programme before checking in.");
    for (const value of [args.adherence, args.difficulty, args.enjoyment])
      if (!Number.isInteger(value) || value < 1 || value > 5)
        throw new Error("Choose a rating from 1 to 5.");
    if ((args.notes?.length ?? 0) > 2000)
      throw new Error("Keep your check-in notes under 2,000 characters.");
    const suggestion = !args.scheduleFits
      ? {
          kind: "reschedule" as const,
          title: "Move the weekly schedule one day later",
          reason:
            "You said the current schedule does not fit. Shift planned meals or sessions one day forward, keeping completed logs unchanged.",
        }
      : row.track === "training" && args.difficulty >= 4
        ? {
            kind: "lighter" as const,
            title: "Remove one working set per exercise",
            reason:
              "You rated the sessions difficult. Reduce each exercise by one set, keeping at least one, in current and upcoming blocks.",
          }
        : row.track === "nutrition" &&
            (args.adherence <= 2 || args.enjoyment <= 2)
          ? {
              kind: "simpler_meals" as const,
              title: "Repeat the quickest meal in each meal slot",
              reason:
                "Use the quickest recipe already in each meal slot across the week to reduce cooking effort. Portions stay editable and targets stay unchanged.",
            }
          : {
              kind: "keep" as const,
              title: "Keep your current plan",
              reason:
                "Your answers do not call for an automatic adjustment. You can still edit meals, sessions, or exercise choices.",
            };
    return await ctx.db.insert("guidedProgrammeCheckIns", {
      userId: row.userId,
      programmeId: row._id,
      adherence: args.adherence,
      difficulty: args.difficulty,
      enjoyment: args.enjoyment,
      scheduleFits: args.scheduleFits,
      notes: args.notes ?? "",
      suggestion,
      status: "pending",
      planUpdatedAt: row.updatedAt,
      createdAt: Date.now(),
    });
  },
});
export const reviewCheckIn = mutation({
  args: { checkInId: v.id("guidedProgrammeCheckIns"), accept: v.boolean() },
  handler: async (ctx, { checkInId, accept }) => {
    const check = await ctx.db.get("guidedProgrammeCheckIns", checkInId);
    if (!check) throw new Error("Check-in not found.");
    const row = await owned(ctx, check.programmeId);
    if (check.status !== "pending")
      return {
        id: row._id,
        updatedAt: check.appliedUpdatedAt ?? check.planUpdatedAt,
      };
    let updatedAt = row.updatedAt;
    if (accept) {
      if (
        effectiveProgramme(row).status === "ended" ||
        row.updatedAt !== check.planUpdatedAt
      )
        throw new Error(
          "Your plan changed since this check-in. Submit a fresh check-in before applying changes.",
        );
      const plan = row.plan!;
      if (check.suggestion.kind === "reschedule") {
        plan.nutrition?.meals.forEach((meal) => {
          meal.day = (meal.day + 1) % 7;
        });
        plan.training?.sessions.forEach((session) => {
          session.dayOfWeek = (session.dayOfWeek + 1) % 7;
        });
      }
      if (check.suggestion.kind === "lighter") {
        const week = row.startDate
          ? Math.floor(
              (Date.parse(localProgrammeTime(row.settings.timezone).date) -
                Date.parse(row.startDate)) /
                604800000,
            ) + 1
          : 1;
        plan.training?.sessions
          .filter(
            (session) =>
              !session.blockId ||
              (plan.training!.mesocycles.find(
                (block) => block.id === session.blockId,
              )?.endWeek ?? 0) >= week,
          )
          .forEach((session) =>
            session.exercises.forEach((exercise) => {
              exercise.sets = Math.max(1, exercise.sets - 1);
            }),
          );
      }
      if (check.suggestion.kind === "simpler_meals" && plan.nutrition) {
        for (const meal of plan.nutrition.meals) {
          const options = plan.nutrition.meals
            .filter((item) => item.slot === meal.slot)
            .map((item) =>
              plan.nutrition!.recipes.find(
                (recipe) => recipe.id === item.recipeId,
              )!,
            )
            .sort(
              (a, b) =>
                a.prepMinutes + a.cookMinutes - b.prepMinutes - b.cookMinutes,
            );
          if (options[0]) meal.recipeId = options[0].id;
        }
      }
      // Keep the original plan for materialise's changed-session comparison.
      const original = await ctx.db.get("guidedProgrammes", row._id);
      await materialise(ctx, original!, plan);
      updatedAt = Math.max(Date.now(), row.updatedAt + 1);
      await ctx.db.patch("guidedProgrammes", row._id, { plan, updatedAt });
    }
    await ctx.db.patch("guidedProgrammeCheckIns", checkInId, {
      status: accept ? "accepted" : "dismissed",
      appliedUpdatedAt: updatedAt,
    });
    return { id: row._id, updatedAt };
  },
});
export const logMeal = mutation({
  args: { id: v.id("guidedProgrammes"), mealId: v.string(), date: v.string() },
  handler: async (ctx, { id, mealId, date }): Promise<{ ok: boolean }> => {
    const row = await owned(ctx, id);
    if (!validDate(date) || row.status === "draft")
      throw new Error("Choose a valid date and start the programme first.");
    const meal = row.plan?.nutrition?.meals.find((item) => item.id === mealId);
    const recipe = row.plan?.nutrition?.recipes.find(
      (item) => item.id === meal?.recipeId,
    );
    if (!meal || !recipe) throw new Error("Meal not found.");
    const entryId = `programme-${id}-${mealId}-${date}`;
    const existingLog = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", row.userId).eq("date", date),
      )
      .unique();
    if (existingLog?.entries.some((entry) => entry.id === entryId))
      return { ok: true };
    const factor = meal.servings / recipe.servings;
    const sum = (
      key: "caloriesPer100" | "proteinPer100" | "carbsPer100" | "fatPer100",
    ) =>
      Math.round(
        recipe.ingredients.reduce(
          (total, item) => total + (item.grams * item[key]) / 100,
          0,
        ) *
          factor *
          10,
      ) / 10;
    return await ctx.runMutation(api.logs.foodLogs.addEntry, {
      date,
      entry: {
        id: entryId,
        name: recipe.name,
        meal: meal.slot,
        loggedAt: new Date().toISOString(),
        calories: sum("caloriesPer100"),
        protein: sum("proteinPer100"),
        carbs: sum("carbsPer100"),
        fat: sum("fatPer100"),
        recipeId: recipe.recipeId,
        quantityGrams:
          recipe.ingredients.reduce((total, item) => total + item.grams, 0) *
          factor,
        servingLabel: `${meal.servings} servings`,
      },
    });
  },
});
export const swapTrainingExercise = mutation({
  args: {
    programmeId: v.id("guidedProgrammes"),
    oldExerciseId: v.string(),
    newExerciseId: v.string(),
    newExerciseName: v.string(),
    sets: v.optional(v.number()),
    reps: v.optional(v.string()),
    restSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await owned(ctx, args.programmeId);
    if (effectiveProgramme(row).status !== "active" || !row.plan?.training)
      throw new Error("Start or resume this workout programme first.");
    const name = await requireExercise(ctx, row.userId, args.newExerciseId);
    const week = row.startDate
      ? Math.floor(
          (Date.parse(localProgrammeTime(row.settings.timezone).date) -
            Date.parse(row.startDate)) /
            604800000,
        ) + 1
      : 1;
    const block = row.plan.training.mesocycles.find(
      (item) => item.startWeek <= week && item.endWeek >= week,
    );
    const plan = structuredClone(row.plan);
    let updatedSessions = 0;
    for (const session of plan.training!.sessions.filter(
      (item) => !item.blockId || item.blockId === block?.id,
    )) {
      if (
        !session.exercises.some(
          (exercise) => exercise.exerciseId === args.oldExerciseId,
        )
      )
        continue;
      if (
        session.exercises.some(
          (exercise) => exercise.exerciseId === args.newExerciseId,
        )
      )
        throw new Error(
          "That exercise is already in one of the affected sessions.",
        );
      session.exercises = session.exercises.map((exercise) =>
        exercise.exerciseId !== args.oldExerciseId
          ? exercise
          : {
              ...exercise,
              exerciseId: args.newExerciseId,
              name,
              sets: args.sets ?? exercise.sets,
              reps: args.reps ?? exercise.reps,
              restSeconds: args.restSeconds ?? exercise.restSeconds,
              notes:
                "Choose a suitable starting load for this exercise. Previous exercise weights do not carry over.",
              alternatives: [],
            },
      );
      updatedSessions++;
    }
    if (!updatedSessions)
      throw new Error("That exercise is not in your current training block.");
    validateProgrammePlan(row.track, plan, row.settings, false, true);
    await materialise(ctx, row, plan);
    await ctx.db.patch("guidedProgrammes", row._id, {
      plan,
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    return { updatedSessions };
  },
});

/** Reservation and completion are atomic mutations, including quota accounting. */
export const reserveGeneration = internalMutation({
  args: { id: v.id("guidedProgrammes"), requestId: v.string() },
  handler: async (
    ctx,
    { id, requestId },
  ): Promise<{
    complete: boolean;
    generationId?: Id<"guidedProgrammeGenerations">;
    attempt?: number;
    apiKey?: string | null;
    programme: Programme;
  }> => {
    const row = await owned(ctx, id);
    if (!requestId.trim() || requestId.length > 120)
      throw new Error("Invalid generation request.");
    const previous = await ctx.db
      .query("guidedProgrammeGenerations")
      .withIndex("by_userId_and_requestId", (q) =>
        q.eq("userId", row.userId).eq("requestId", requestId),
      )
      .unique();
    if (previous && previous.programmeId !== id)
      throw new Error("Use a new request identifier for this programme.");
    if (
      previous &&
      previous.settingsFingerprint !== JSON.stringify(row.settings)
    )
      throw new Error("Your settings changed. Start a new generation request.");
    if (previous?.status === "complete")
      return { complete: true, programme: row };
    if (previous?.status === "running" || row.generationStatus === "running")
      throw new Error(
        "This programme is already being generated. Your draft will update when it is ready.",
      );
    if (row.status !== "draft")
      throw new Error("Generate a preview before starting the programme.");
    validateProgrammeSettings(row.settings, row.track);
    if (
      row.track === "nutrition" &&
      programmeNeedsCare(await getLatestOnboardingProfile(ctx, row.userId))
    )
      throw new ConvexError(
        "Your nutrition profile requires an individual plan with a qualified professional. You can review your nutrition profile here if any answers are out of date.",
      );
    const quota: AiUsageQuota & { apiKey: string | null } =
      await ctx.runMutation(internal.ai.usage.consumeMonthlyQuota, {
        userId: row.userId,
        source: "guided_programme",
      });
    if (!quota.allowed)
      throw new Error(
        `This programme costs 5 AI tokens. You have ${quota.remaining} remaining.`,
      );
    const attempt = (previous?.attempt ?? 0) + 1;
    const body = {
      userId: row.userId,
      programmeId: id,
      requestId,
      status: "running" as const,
      month: quota.month,
      settingsFingerprint: JSON.stringify(row.settings),
      attempt,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const generationId =
      previous?._id ??
      (await ctx.db.insert("guidedProgrammeGenerations", body));
    if (previous)
      await ctx.db.patch("guidedProgrammeGenerations", previous._id, body);
    await ctx.db.patch("guidedProgrammes", id, {
      generationStatus: "running",
      generationError: undefined,
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.guidedProgrammes.failGeneration,
      {
        generationId,
        attempt,
        error:
          "Generation timed out. Your 5 AI tokens were returned. You can retry.",
      },
    );
    return {
      complete: false,
      generationId,
      attempt,
      apiKey: quota.apiKey,
      programme: row,
    };
  },
});
export const completeGeneration = internalMutation({
  args: {
    generationId: v.id("guidedProgrammeGenerations"),
    attempt: v.number(),
    plan: programmePlan,
  },
  handler: async (
    ctx,
    { generationId, attempt, plan },
  ): Promise<Id<"guidedProgrammes">> => {
    const generation = await ctx.db.get(
      "guidedProgrammeGenerations",
      generationId,
    );
    if (
      !generation ||
      generation.attempt !== attempt ||
      generation.status !== "running"
    )
      throw new Error(
        "This generation is no longer active. Please retry from your saved draft.",
      );
    const row = (await ctx.db.get("guidedProgrammes", generation.programmeId))!;
    validateProgrammePlan(row.track, plan, row.settings, true, true);
    // Generated output cannot attach another saved recipe or preset by identifier.
    if (
      plan.nutrition?.recipes.some((recipe) => recipe.recipeId) ||
      plan.training?.sessions.some((session) => session.presetId)
    )
      throw new Error(
        "Generated plans must not reference saved library identifiers.",
      );
    await validateLinks(ctx, row, plan);
    await ctx.db.patch("guidedProgrammes", row._id, {
      plan,
      generationStatus: "complete",
      generationError: undefined,
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    await ctx.db.patch("guidedProgrammeGenerations", generationId, {
      status: "complete",
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    return row._id;
  },
});
export const failGeneration = internalMutation({
  args: {
    generationId: v.id("guidedProgrammeGenerations"),
    attempt: v.number(),
    error: v.string(),
  },
  handler: async (ctx, { generationId, attempt, error }) => {
    const generation = await ctx.db.get(
      "guidedProgrammeGenerations",
      generationId,
    );
    if (
      !generation ||
      generation.status !== "running" ||
      generation.attempt !== attempt
    )
      return null;
    await ctx.runMutation(internal.ai.usage.refundMonthlyQuota, {
      userId: generation.userId,
      month: generation.month,
      source: "guided_programme",
    });
    await ctx.db.patch("guidedProgrammeGenerations", generationId, {
      status: "failed",
      updatedAt: Date.now(),
    });
    const row = await ctx.db.get("guidedProgrammes", generation.programmeId);
    if (row)
      await ctx.db.patch("guidedProgrammes", row._id, {
        generationStatus: "failed",
        generationError: error.slice(0, 500),
        updatedAt: Math.max(Date.now(), row.updatedAt + 1),
      });
    return null;
  },
});
