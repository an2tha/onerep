import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUser } from "./lib/auth";
import { customExerciseDocId, isCustomExerciseId } from "./lib/exerciseShape";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { validateProgrammePlan } from "./lib/guidedProgramme";

async function visibleExercise(
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
    if (row?.userId === userId) return row;
  } else {
    for (const owner of ["__global__", userId]) {
      const row = await ctx.db
        .query("exercises")
        .withIndex("by_userId_and_exerciseId", (q) =>
          q.eq("userId", owner).eq("exerciseId", exerciseId),
        )
        .first();
      if (row) return row;
    }
  }
  throw new Error("Choose an exercise from your exercise library.");
}

/** Keep a programme's reviewed session in step with edits in the preset editor. */
export async function syncGuidedPresetEdit(
  ctx: MutationCtx,
  preset: Doc<"presets">,
  body: Pick<Doc<"presets">, "name" | "items" | "exerciseData">,
) {
  if (!preset.guidedProgrammeId) return;
  const programme = await ctx.db.get(
    "guidedProgrammes",
    preset.guidedProgrammeId,
  );
  if (
    !programme ||
    programme.userId !== preset.userId ||
    !programme.plan?.training
  )
    throw new Error(
      "This programme is unavailable. Reopen its preset to review your changes.",
    );
  if (body.items.some((item) => item.kind !== "solo"))
    throw new Error(
      "Programme presets currently support individual exercises. Ungroup the superset before saving, or duplicate this as a standalone preset.",
    );
  const plan = structuredClone(programme.plan);
  const session = plan.training!.sessions.find(
    (row) => row.id === preset.guidedSessionId && row.presetId === preset._id,
  );
  if (!session)
    throw new Error(
      "This session is no longer in the programme. Reopen the programme to continue.",
    );
  session.name = body.name;
  session.exercises = await Promise.all(
    body.items.map(async (item) => {
      const exercise = await visibleExercise(
        ctx,
        preset.userId,
        item.exerciseId,
      );
      const previous = session.exercises.find(
        (row) => row.exerciseId === item.exerciseId,
      );
      const sets = body.exerciseData[item.exerciseId]?.sets;
      if (!Array.isArray(sets) || !sets.length)
        throw new Error(
          "Each programme exercise needs a set and rep target before saving.",
        );
      const first = sets[0];
      // The programme describes one prescription per movement. Do not flatten
      // advanced, differing set targets into a misleading uniform prescription.
      if (
        sets.some(
          (set) =>
            set.reps !== first.reps ||
            set.restSeconds !== first.restSeconds ||
            set.type !== "working",
        )
      )
        throw new Error(
          "Programme exercises need matching working-set rep and rest targets. Use a standalone preset for mixed set prescriptions.",
        );
      return {
        id: previous?.id ?? `exercise-${item.exerciseId}`,
        exerciseId: item.exerciseId,
        name: exercise.name,
        sets: sets.length,
        reps: String(first.reps ?? ""),
        restSeconds: first.restSeconds ?? 90,
        notes:
          previous?.notes ?? "Choose a fresh starting load for this exercise.",
        alternatives: previous?.alternatives ?? [],
      };
    }),
  );
  validateProgrammePlan(programme.track, plan, programme.settings, false, true);
  await ctx.db.patch("guidedProgrammes", programme._id, {
    plan,
    updatedAt: Math.max(Date.now(), programme.updatedAt + 1),
  });
}

/** Preset changes affect future starts only. Active sessions and logs are separate. */
export const swapPreset = mutation({
  args: {
    presetId: v.id("presets"),
    oldExerciseId: v.string(),
    newExerciseId: v.string(),
    sets: v.number(),
    reps: v.string(),
    restSeconds: v.number(),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const preset = await ctx.db.get(args.presetId);
    if (!preset || preset.userId !== user._id)
      throw new Error("Preset not found.");
    if (preset.updatedAt !== args.expectedUpdatedAt)
      throw new Error(
        "This preset changed. Reopen the swap to review the latest version.",
      );
    if (
      !Number.isInteger(args.sets) ||
      args.sets < 1 ||
      args.sets > 12 ||
      !Number.isInteger(args.restSeconds) ||
      args.restSeconds < 0 ||
      args.restSeconds > 600 ||
      !args.reps.trim() ||
      args.reps.length > 30
    )
      throw new Error("Invalid exercise prescription.");
    if (
      args.oldExerciseId === args.newExerciseId ||
      !args.newExerciseId ||
      args.newExerciseId.length > 200
    )
      throw new Error("Choose a different exercise.");
    const replacement = await visibleExercise(
      ctx,
      user._id,
      args.newExerciseId,
    );
    const ids = preset.items.flatMap((item) =>
      item.kind === "solo" ? [item.exerciseId] : (item.exerciseIds ?? []),
    );
    if (!ids.includes(args.oldExerciseId))
      throw new Error("This exercise is no longer in the preset.");
    if (ids.includes(args.newExerciseId))
      throw new Error("That exercise is already in this preset.");
    const items = preset.items.map((item) =>
      item.kind === "solo"
        ? {
            ...item,
            exerciseId:
              item.exerciseId === args.oldExerciseId
                ? args.newExerciseId
                : item.exerciseId,
          }
        : {
            ...item,
            exerciseIds: item.exerciseIds.map((id: string) =>
              id === args.oldExerciseId ? args.newExerciseId : id,
            ),
          },
    );
    const exerciseData = { ...preset.exerciseData };
    delete exerciseData[args.oldExerciseId];
    exerciseData[args.newExerciseId] = {
      sets: Array.from({ length: args.sets }, (_, i) => ({
        id: `swap-${Date.now()}-${i}`,
        type: "working",
        reps: args.reps,
        weight: "",
        restSeconds: args.restSeconds,
      })),
      trackRpe: false,
      trackUnilateral: false,
      barWeight: "",
      barType: "custom",
    };
    // A linked preset is the same session shown in the programme preview.
    // Update that session atomically, without rewriting other sessions or logs.
    if (preset.guidedProgrammeId) {
      const programme = await ctx.db.get(
        "guidedProgrammes",
        preset.guidedProgrammeId,
      );
      if (
        !programme ||
        programme.userId !== user._id ||
        !programme.plan?.training
      )
        throw new Error(
          "This programme is unavailable. Reopen its preset to review your changes.",
        );
      const plan = structuredClone(programme.plan);
      const session = plan.training!.sessions.find(
        (row) =>
          row.id === preset.guidedSessionId && row.presetId === preset._id,
      );
      if (
        !session ||
        !session.exercises.some((row) => row.exerciseId === args.oldExerciseId)
      )
        throw new Error(
          "Your programme changed. Reopen the swap to review the latest version.",
        );
      if (
        session.exercises.some((row) => row.exerciseId === args.newExerciseId)
      )
        throw new Error("That exercise is already in this programme session.");
      session.exercises = session.exercises.map((row) =>
        row.exerciseId !== args.oldExerciseId
          ? row
          : {
              ...row,
              exerciseId: args.newExerciseId,
              name: replacement.name,
              sets: args.sets,
              reps: args.reps,
              restSeconds: args.restSeconds,
              alternatives: [],
              notes:
                "Choose a fresh starting load. Previous exercise weights do not carry over.",
            },
      );
      validateProgrammePlan(
        programme.track,
        plan,
        programme.settings,
        false,
        true,
      );
      await ctx.db.patch("guidedProgrammes", programme._id, {
        plan,
        updatedAt: Math.max(Date.now(), programme.updatedAt + 1),
      });
    }
    await ctx.db.patch(preset._id, {
      items,
      exerciseData,
      updatedAt: Math.max(Date.now(), preset.updatedAt + 1),
    });
    return null;
  },
});
