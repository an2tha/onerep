import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

/**
 * Movements the form coach knows how to analyse.
 *
 * Squats are the only supported exercise while the coach is being built out —
 * every other exercise falls back to no coaching rather than a generic answer.
 * Add an entry here (plus its analysis prompt) to support another lift.
 */
export const FORM_COACH_EXERCISES = [
  {
    slug: "squat",
    label: "Squat",
    // Matched case-insensitively against the exercise name, so this covers
    // "Barbell Squat", "Goblet Squat", "Front Squat", and friends.
    keywords: ["squat"],
    /** Framing instructions shown on the recording screen. */
    setup:
      "Film from the side with your whole body in frame. 2–3 reps is enough.",
  },
] as const;

export type FormCoachExercise = (typeof FORM_COACH_EXERCISES)[number];
export type FormCoachSlug = FormCoachExercise["slug"];

/** Resolves an exercise name to the movement the coach should analyse. */
export function matchFormCoachExercise(
  exerciseName: string,
): FormCoachExercise | null {
  const name = exerciseName.toLowerCase();
  return (
    FORM_COACH_EXERCISES.find((exercise) =>
      exercise.keywords.some((keyword) => name.includes(keyword)),
    ) ?? null
  );
}

/**
 * The catalog clients match exercise names against. Returned as one static list
 * so a workout with many exercises still costs a single subscription.
 */
export const listSupported = query({
  args: {},
  handler: async () =>
    FORM_COACH_EXERCISES.map((exercise) => ({
      slug: exercise.slug,
      label: exercise.label,
      keywords: [...exercise.keywords],
      setup: exercise.setup,
    })),
});

export const addEntry = internalMutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, args) => {
    await ctx.db.insert("supportedExercises", {
      exerciseId: args.exerciseId,
      createdAt: Date.now(),
    });
  },
});
