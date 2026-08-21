import { v } from "convex/values";
import * as z from "zod";
import { action } from "../_generated/server";
import { hasOpenAiApiKey, runOpenAiAgent } from "../ai/provider";
import { renderSystemPrompt } from "../ai/prompts.generated";
import { consumeAiUsageOrThrow } from "../ai/usage";
import { getAuthUser } from "../lib/auth";
import {
  MAX_EXERCISES,
  MAX_INPUT_CHARS,
  MAX_SETS_PER_EXERCISE,
  SET_TYPES,
  clampNumber,
  clampText,
  fallbackLogDraftFromText,
  normalizeSetType,
} from "../lib/workoutTextParser";
import type {
  LogDraft,
  LogExerciseDraft,
  WeightUnit,
} from "../lib/workoutTextParser";

// The named `z` export is undefined under the Bun runtime, so the namespace
// import above is deliberate — see convex/ai/formCoachAgent.ts.
const logSchema = z.object({
  exercises: z.array(
    z.object({
      name: z.string(),
      sets: z.array(
        z.object({
          type: z.enum(SET_TYPES),
          weightKg: z.number(),
          reps: z.number(),
          rpe: z.number().optional(),
        }),
      ),
    }),
  ),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * Clamps the model's answer into the shape the logger hydrates.
 *
 * `completed` is stamped here rather than asked for: every set in a recap of a
 * finished session was performed by definition, so letting the model decide
 * would only create a way for it to be wrong.
 */
function normalizeLogDraft(value: z.infer<typeof logSchema>): LogDraft | null {
  const exercises: LogExerciseDraft[] = [];

  for (const rawExercise of value.exercises.slice(0, MAX_EXERCISES)) {
    const name = clampText(rawExercise.name, 80);
    if (name.length < 2) continue;

    const sets = rawExercise.sets
      .slice(0, MAX_SETS_PER_EXERCISE)
      .map((set) => ({
        type: normalizeSetType(set.type),
        weightKg: Math.max(0, +Number(set.weightKg ?? 0).toFixed(2)) || 0,
        reps: clampNumber(set.reps, 0, 999, 0),
        completed: true as const,
        ...(set.rpe === undefined
          ? {}
          : { rpe: clampNumber(set.rpe, 1, 10, 8) }),
      }));

    exercises.push({ name, sets });
  }

  if (exercises.length === 0) return null;

  return {
    exercises,
    durationMinutes:
      value.durationMinutes === undefined
        ? undefined
        : clampNumber(value.durationMinutes, 1, 360, 60),
    notes: clampText(value.notes, 240) || undefined,
  };
}

async function draftWithOpenAi(
  text: string,
  unit: WeightUnit,
  apiKey: string | null,
): Promise<LogDraft | null> {
  if (!hasOpenAiApiKey(apiKey)) return null;
  const result = await runOpenAiAgent({
    apiKey,
    system: renderSystemPrompt("workout_log", {
      max_exercises: MAX_EXERCISES,
      max_sets_per_exercise: MAX_SETS_PER_EXERCISE,
    }),
    user: `The user's weight unit is ${unit}. Convert this recap of a workout they already completed into logged sets.\n\n${text}`,
    tools: {},
    schema: logSchema,
    maxSteps: 1,
    maxTokens: 1_200,
  });
  return normalizeLogDraft(result.output);
}

/**
 * Turns a recap of a finished workout into completed sets.
 *
 * A sibling to `presetAgent.createFromText` rather than an extension of it:
 * that action's contract is a *plan* (string weights, rest targets, nothing
 * performed), and this one's is a *record* (numeric kilograms, numeric reps,
 * every set done). Only the regex layer is shared.
 *
 * Returns exercise *names*, never catalog ids — the client resolves them
 * against the exercise catalog and shows each match before anything is saved,
 * so the model cannot invent an exercise that silently lands in the log.
 */
export const draftLogFromText = action({
  args: {
    text: v.string(),
    unit: v.optional(v.union(v.literal("kg"), v.literal("lbs"))),
  },
  handler: async (ctx, args): Promise<LogDraft> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const text = args.text.trim().slice(0, MAX_INPUT_CHARS);
    if (text.length < 4) {
      throw new Error("Describe at least one exercise you did.");
    }

    const unit: WeightUnit = args.unit ?? "kg";

    const quota = await consumeAiUsageOrThrow(ctx, user._id, "workout_log");

    const fallback = fallbackLogDraftFromText(text, unit);

    try {
      const aiDraft = await draftWithOpenAi(text, unit, quota.apiKey);
      if (aiDraft) return aiDraft;
    } catch (error) {
      console.warn("Falling back to local workout log parser", error);
    }

    return fallback;
  },
});
