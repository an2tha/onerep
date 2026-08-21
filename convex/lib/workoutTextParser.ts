/**
 * Pure text→structure parsing shared by the two workout text agents.
 *
 * `logs/presetAgent.ts` turns a pasted plan into a *preset* (string weights,
 * rest targets, nothing performed yet). `logs/logAgent.ts` turns a spoken or
 * typed recap into a *completed log* (numeric kilograms, numeric reps, every
 * set already done). The regex layer is identical; only the assembly differs.
 *
 * Nothing here touches a Convex context, so both actions can use it and it can
 * be unit-tested directly.
 */

export const MAX_INPUT_CHARS = 8_000;
export const MAX_EXERCISES = 18;
export const MAX_SETS_PER_EXERCISE = 8;

export const SET_TYPES = [
  "working",
  "warmup",
  "failure",
  "myoreps",
  "drop",
] as const;
export type SetType = (typeof SET_TYPES)[number];

/** Matches the `userPreferences.weightUnit` vocabulary. */
export type WeightUnit = "kg" | "lbs";

const LB_PER_KG = 2.20462;

export function clampText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function normalizeSetType(value: unknown): SetType {
  return SET_TYPES.includes(value as SetType) ? (value as SetType) : "working";
}

/** Preset flavour: a display string, empty when no explicit unit was given. */
export function parseWeightKg(raw: string) {
  const match = raw.match(
    /(?:@|with|using)?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/i,
  );
  if (!match) return "";
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return "";
  const unit = match[2].toLowerCase();
  if (unit.startsWith("lb") || unit.startsWith("pound")) {
    return String(+(amount / LB_PER_KG).toFixed(2));
  }
  return String(+amount.toFixed(2));
}

/**
 * Log flavour: always a number of kilograms.
 *
 * People dictating a recap rarely say the unit — "bench 3x8 at 185" — so an
 * unqualified number is read in the user's display unit rather than dropped.
 */
export function parseWeightValueKg(
  raw: string,
  unit: WeightUnit,
): number | null {
  const explicit = raw.match(
    /(?:@|at|with|using)?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/i,
  );
  if (explicit) {
    const amount = Number(explicit[1]);
    if (!Number.isFinite(amount)) return null;
    const explicitUnit = explicit[2].toLowerCase();
    const kg =
      explicitUnit.startsWith("lb") || explicitUnit.startsWith("pound")
        ? amount / LB_PER_KG
        : amount;
    return +kg.toFixed(2);
  }

  // Only an `@`/`at`/`with` marker makes a bare number a weight; otherwise
  // "3x8" and "rows 60" would both be misread.
  const implied = raw.match(
    /(?:@|\bat\b|\bwith\b|\busing\b)\s*(\d+(?:\.\d+)?)/i,
  );
  if (!implied) return null;
  const amount = Number(implied[1]);
  if (!Number.isFinite(amount)) return null;
  const kg = unit === "lbs" ? amount / LB_PER_KG : amount;
  return +kg.toFixed(2);
}

export function parseRestSeconds(raw: string) {
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

export function parseSetCountAndReps(raw: string) {
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

/**
 * A rep string as a number.
 *
 * A range takes its low end — the conservative reading of "8 to 10". An
 * open-ended set has no honest number, so it returns 0 and the review sheet
 * shows an empty field for the user to fill in.
 */
export function parseRepsCount(reps: string): number {
  const trimmed = reps.trim();
  if (!trimmed) return 0;
  if (/^(?:max|amrap|failure)$/i.test(trimmed)) return 0;
  const range = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return clampNumber(range[1], 0, 999, 0);
  const single = trimmed.match(/^(\d+)/);
  if (single) return clampNumber(single[1], 0, 999, 0);
  return 0;
}

export function inferSetType(raw: string): SetType {
  if (/warm\s*-?up/i.test(raw)) return "warmup";
  if (/drop/i.test(raw)) return "drop";
  if (/myo/i.test(raw)) return "myoreps";
  if (/failure|amrap/i.test(raw)) return "failure";
  return "working";
}

export function cleanExerciseName(raw: string) {
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

/** Strips a trailing bare weight marker the preset cleaner leaves behind. */
function cleanLoggedExerciseName(raw: string) {
  return cleanExerciseName(raw)
    .replace(/\s*(?:@|\bat\b|\bwith\b|\busing\b)\s*\d+(?:\.\d+)?\s*$/i, "")
    .replace(/^\s*(?:then|and then|and|next|followed by)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a recap into one segment per exercise.
 *
 * A typed recap arrives as lines; a dictated one arrives as a single run-on
 * sentence, so commas and connectives split too. "3x8" is protected because
 * "8-10" and decimals must survive.
 */
export function splitLogSegments(text: string): string[] {
  return text
    .split(/\n+|[,;]+|\bthen\b|\bafter that\b|\bfollowed by\b/gi)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** "about an hour", "45 minutes", "1h 10m" → minutes. */
export function parseDurationMinutes(text: string): number | undefined {
  const hoursAndMinutes = text.match(
    /(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(?:and\s*)?(\d+)?\s*(?:m|min|mins|minute|minutes)?/i,
  );
  if (hoursAndMinutes) {
    const hours = Number(hoursAndMinutes[1]);
    const minutes = Number(hoursAndMinutes[2] ?? 0);
    if (Number.isFinite(hours)) {
      return clampNumber(
        hours * 60 + (Number.isFinite(minutes) ? minutes : 0),
        1,
        360,
        60,
      );
    }
  }
  if (/\b(?:about\s+)?an?\s+hour\b/i.test(text)) return 60;

  const minutesOnly = text.match(
    /(\d+)\s*(?:m|min|mins|minute|minutes)\b(?!\s*(?:rest|break))/i,
  );
  if (minutesOnly) return clampNumber(minutesOnly[1], 1, 360, 60);

  return undefined;
}

export type LogSetDraft = {
  type: SetType;
  weightKg: number;
  reps: number;
  completed: true;
  rpe?: number;
};

export type LogExerciseDraft = {
  name: string;
  sets: LogSetDraft[];
};

export type LogDraft = {
  exercises: LogExerciseDraft[];
  durationMinutes?: number;
  notes?: string;
};

const SKIP_SEGMENT =
  /^(?:warm\s*-?up|cool\s*-?down|notes?|rest|day\s+\d+|today|yesterday|i\s+did|did)\b\s*$/i;

/**
 * Deterministic recap parser.
 *
 * Runs when no model is configured and whenever the model call fails, so the
 * feature degrades to "slightly worse exercise names" rather than an error.
 */
export function fallbackLogDraftFromText(
  text: string,
  unit: WeightUnit = "kg",
): LogDraft {
  const segments = splitLogSegments(text);
  const exercises: LogExerciseDraft[] = [];

  for (const segment of segments) {
    if (SKIP_SEGMENT.test(segment)) continue;
    if (!/[a-z]/i.test(segment)) continue;

    const name = cleanLoggedExerciseName(segment);
    if (name.length < 3 || name.length > 80) continue;

    const { count, reps } = parseSetCountAndReps(segment);
    const type = inferSetType(segment);
    const weightKg = parseWeightValueKg(segment, unit) ?? 0;
    const repCount = parseRepsCount(reps);

    exercises.push({
      name,
      sets: Array.from({ length: count }, () => ({
        type,
        weightKg,
        reps: repCount,
        completed: true as const,
      })),
    });

    if (exercises.length >= MAX_EXERCISES) break;
  }

  return {
    exercises,
    durationMinutes: parseDurationMinutes(text),
    notes:
      exercises.length === 0
        ? "No exercises were recognised in that description."
        : undefined,
  };
}
