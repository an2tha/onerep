import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

/**
 * Movements with framing advice of their own.
 *
 * The analysis itself is not keyed off this list — the measurement tools and the
 * prompt are exercise-agnostic, and reps are detected from whichever body
 * distance actually moved — so an exercise missing from here is still coached,
 * just with the generic setup hint. Entries exist only where the default advice
 * would send the lifter to the wrong side of the rack.
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
  {
    slug: "deadlift",
    label: "Deadlift",
    keywords: ["deadlift", "rdl", "good morning"],
    setup:
      "Film from the side with the bar and your whole body in frame. 2–3 reps is enough.",
  },
  {
    slug: "bench",
    label: "Bench press",
    keywords: ["bench", "chest press", "floor press"],
    setup:
      "Film from the side of the bench, level with your chest. 2–3 reps is enough.",
  },
  {
    slug: "press",
    label: "Overhead press",
    keywords: ["overhead press", "shoulder press", "military press", "ohp"],
    setup:
      "Film from the front, far enough back that lockout stays in frame. 2–3 reps is enough.",
  },
  {
    slug: "row",
    label: "Row",
    keywords: ["row", "pulldown", "pull-up", "pull up", "chin-up", "chin up"],
    setup:
      "Film from the side with your whole torso and both arms in frame. 2–3 reps is enough.",
  },
] as const;

/**
 * What every other exercise gets. Its keywords are deliberately empty: matching
 * is by fallback rather than by name, so nothing is ever unsupported.
 */
export const FORM_COACH_FALLBACK = {
  slug: "general",
  label: "Form check",
  keywords: [] as readonly string[],
  setup:
    "Film from the side with your whole body in frame. 2–3 reps is enough.",
} as const;

export type FormCoachExercise =
  (typeof FORM_COACH_EXERCISES)[number] | typeof FORM_COACH_FALLBACK;
export type FormCoachSlug = FormCoachExercise["slug"];

/**
 * Resolves an exercise name to the movement the coach should analyse.
 *
 * Never null: any lift can be filmed and measured, so an unrecognised name gets
 * the generic entry rather than being turned away.
 */
export function matchFormCoachExercise(
  exerciseName: string,
): FormCoachExercise {
  const name = exerciseName.toLowerCase();
  return (
    FORM_COACH_EXERCISES.find((exercise) =>
      exercise.keywords.some((keyword) => name.includes(keyword)),
    ) ?? FORM_COACH_FALLBACK
  );
}

/**
 * The catalog clients match exercise names against. Returned as one static list
 * so a workout with many exercises still costs a single subscription.
 *
 * The fallback entry is last and carries `fallback: true`. Clients built before
 * the coach covered every lift look only at `keywords`, so they never match it
 * and keep their old, narrower behaviour instead of breaking on a shape they do
 * not recognise.
 */
export const listSupported = query({
  args: {},
  handler: async () =>
    [...FORM_COACH_EXERCISES, FORM_COACH_FALLBACK].map((exercise) => ({
      slug: exercise.slug,
      label: exercise.label,
      keywords: [...exercise.keywords],
      setup: exercise.setup,
      fallback: exercise.slug === FORM_COACH_FALLBACK.slug,
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
