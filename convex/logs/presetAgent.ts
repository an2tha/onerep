import { v } from "convex/values";
import { action } from "../_generated/server";
import { hasOpenAiApiKey, requestOpenAiJson } from "../ai/provider";
import { renderSystemPrompt } from "../ai/prompts.generated";
import { consumeAiUsageOrThrow } from "../ai/usage";
import { getAuthUser } from "../lib/auth";

const MAX_INPUT_CHARS = 8_000;
const MAX_EXERCISES = 18;
const MAX_SETS_PER_EXERCISE = 8;

const SET_TYPES = ["working", "warmup", "failure", "myoreps", "drop"] as const;
type SetType = (typeof SET_TYPES)[number];

type AgentSetDraft = {
  type?: SetType;
  weight?: string;
  reps?: string;
  restSeconds?: number;
};

type AgentExerciseDraft = {
  name: string;
  sets?: AgentSetDraft[];
};

type AgentPresetDraft = {
  name: string;
  exercises: AgentExerciseDraft[];
  notes?: string;
};

type PlanContext = {
  experienceLevel?: string;
  safetyMode?: string;
  safetyFlags?: string[];
};

function clampText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeSetType(value: unknown): SetType {
  return SET_TYPES.includes(value as SetType) ? (value as SetType) : "working";
}

function normalizeSet(value: unknown): AgentSetDraft {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    type: normalizeSetType(input.type),
    weight: clampText(input.weight, 16),
    reps: clampText(input.reps, 18),
    restSeconds: clampNumber(input.restSeconds, 0, 600, 120),
  };
}

function normalizeExercise(value: unknown): AgentExerciseDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = clampText(input.name, 80);
  if (name.length < 2) return null;
  const sets = Array.isArray(input.sets)
    ? input.sets.slice(0, MAX_SETS_PER_EXERCISE).map(normalizeSet)
    : [];
  return {
    name,
    sets,
  };
}

function normalizeDraft(
  value: unknown,
  fallbackName: string,
): AgentPresetDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const exercises = Array.isArray(input.exercises)
    ? input.exercises
        .slice(0, MAX_EXERCISES)
        .map(normalizeExercise)
        .filter((exercise): exercise is AgentExerciseDraft => Boolean(exercise))
    : [];

  if (exercises.length === 0) return null;

  return {
    name: clampText(input.name, 40) || fallbackName,
    exercises,
    notes: clampText(input.notes, 240) || undefined,
  };
}

function parseWeightKg(raw: string) {
  const match = raw.match(
    /(?:@|with|using)?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/i,
  );
  if (!match) return "";
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return "";
  const unit = match[2].toLowerCase();
  if (unit.startsWith("lb") || unit.startsWith("pound")) {
    return String(+(amount / 2.20462).toFixed(2));
  }
  return String(+amount.toFixed(2));
}

function parseRestSeconds(raw: string) {
  const minMatch = raw.match(
    /(?:rest\s*)?(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i,
  );
  if (minMatch) return clampNumber(Number(minMatch[1]) * 60, 0, 600, 120);

  const secMatch = raw.match(
    /(?:rest\s*)?(\d+)\s*(?:s|sec|secs|second|seconds)\b/i,
  );
  if (secMatch) return clampNumber(secMatch[1], 0, 600, 120);

  return 120;
}

function parseSetCountAndReps(raw: string) {
  const compact = raw.match(
    /(\d+)\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?|max|amrap|failure)/i,
  );
  if (compact) {
    return {
      count: clampNumber(compact[1], 1, MAX_SETS_PER_EXERCISE, 3),
      reps: compact[2].replace(/\s+/g, ""),
    };
  }

  const verbose = raw.match(
    /(\d+)\s*sets?\s*(?:of|x|×)?\s*(\d+(?:\s*[-–]\s*\d+)?|max|amrap|failure)?/i,
  );
  if (verbose) {
    return {
      count: clampNumber(verbose[1], 1, MAX_SETS_PER_EXERCISE, 3),
      reps: verbose[2]?.replace(/\s+/g, "") ?? "",
    };
  }

  const duration = raw.match(
    /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i,
  );
  if (duration) return { count: 1, reps: `${duration[1]} min` };

  return { count: 3, reps: "" };
}

function inferSetType(raw: string): SetType {
  if (/warm\s*-?up/i.test(raw)) return "warmup";
  if (/drop/i.test(raw)) return "drop";
  if (/myo/i.test(raw)) return "myoreps";
  if (/failure|amrap/i.test(raw)) return "failure";
  return "working";
}

function cleanExerciseName(raw: string) {
  return raw
    .replace(/^\s*(?:[-*•]|\d+[.)]|[A-Z]\d?[.)])\s*/i, "")
    .replace(
      /^\s*(?:add|swap(?:\s+for)?|replace(?:\s+(?:with|for))?|change(?:\s+to)?|sub(?:stitute)?(?:\s+(?:with|for))?)\s+/i,
      "",
    )
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+\s*(?:sets?|rounds?)\b.*$/i, " ")
    .replace(
      /\b\d+\s*[x×]\s*(?:\d+(?:\s*[-–]\s*\d+)?|max|amrap|failure)\b.*$/i,
      " ",
    )
    .replace(
      /(?:@|with|using)?\s*\d+(?:\.\d+)?\s*(?:kg|kgs|kilograms?|lb|lbs|pounds?)\b/gi,
      " ",
    )
    .replace(/\brest\b.*$/i, " ")
    .replace(/[—–:]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackDraftFromText(text: string): AgentPresetDraft {
  const lines = text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const firstLine = lines[0] ?? "";
  const firstLineLooksLikeTitle =
    firstLine.length >= 3 &&
    firstLine.length <= 40 &&
    !/\d+\s*(?:x|×|sets?|reps?|min|sec|kg|lb)\b/i.test(firstLine);

  const name = firstLineLooksLikeTitle ? firstLine : "Imported Workout";
  const sourceLines = firstLineLooksLikeTitle ? lines.slice(1) : lines;
  const exercises: AgentExerciseDraft[] = [];

  for (const line of sourceLines) {
    if (/^(warm\s*-?up|cool\s*-?down|notes?|rest|day\s+\d+)\b/i.test(line))
      continue;
    if (!/[a-z]/i.test(line)) continue;

    const exerciseName = cleanExerciseName(line);
    if (exerciseName.length < 3 || exerciseName.length > 80) continue;

    const { count, reps } = parseSetCountAndReps(line);
    const setType = inferSetType(line);
    const weight = parseWeightKg(line);
    const restSeconds = parseRestSeconds(line);
    const sets = Array.from({ length: count }, () => ({
      type: setType,
      weight,
      reps,
      restSeconds,
    }));

    exercises.push({
      name: exerciseName,
      sets,
    });

    if (exercises.length >= MAX_EXERCISES) break;
  }

  return {
    name,
    exercises,
    notes:
      exercises.length === 0
        ? "No structured exercises were found in the pasted text."
        : undefined,
  };
}

async function draftWithOpenAi(
  text: string,
  fallbackName: string,
  context: PlanContext,
) {
  if (!hasOpenAiApiKey()) return null;
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("workout_preset", {
      max_exercises: MAX_EXERCISES,
      max_sets_per_exercise: MAX_SETS_PER_EXERCISE,
    }),
    user: `User context: ${JSON.stringify(context)}\n\nCreate a workout preset from this text. Return this exact JSON shape: {"name":"short preset name <= 40 chars","exercises":[{"name":"exercise search name","sets":[{"type":"working","weight":"kg string or empty","reps":"reps or duration","restSeconds":120}]}],"notes":"optional"}.\n\n${text}`,
    temperature: 0.2,
    maxTokens: 1_200,
  });
  return normalizeDraft(JSON.parse(content), fallbackName);
}

export const createFromText = action({
  args: {
    text: v.string(),
    experienceLevel: v.optional(v.string()),
    safetyMode: v.optional(v.string()),
    safetyFlags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<AgentPresetDraft> => {
    const user = await getAuthUser(ctx);

    const text = args.text.trim().slice(0, MAX_INPUT_CHARS);
    if (text.length < 8) {
      throw new Error("Paste a workout plan with at least one exercise.");
    }

    await consumeAiUsageOrThrow(ctx, user._id, "workout_preset");

    const fallback = fallbackDraftFromText(text);

    try {
      const aiDraft = await draftWithOpenAi(text, fallback.name, {
        experienceLevel: clampText(args.experienceLevel, 24) || undefined,
        safetyMode: clampText(args.safetyMode, 24) || undefined,
        safetyFlags: (args.safetyFlags ?? [])
          .slice(0, 16)
          .map((flag) => clampText(flag, 64))
          .filter(Boolean),
      });
      if (aiDraft) return aiDraft;
    } catch (error) {
      console.warn("Falling back to local workout text parser", error);
    }

    return fallback;
  },
});
