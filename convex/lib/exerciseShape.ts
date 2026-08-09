import { v } from "convex/values";

export const CUSTOM_EXERCISE_ID_PREFIX = "custom:";

export const exerciseCategoryValidator = v.union(
  v.literal("strength"),
  v.literal("cardio"),
  v.literal("mobility"),
  v.literal("core"),
);

export type ExerciseCategory = "strength" | "cardio" | "mobility" | "core";

/** The subset of fields the client shape is derived from. */
export type ExerciseSource = {
  name: string;
  category: string;
  level?: string;
  mechanic?: string;
  equipment?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

/**
 * The exercise browser loads the whole global catalog at once so search and
 * filtering can happen locally. `instructions` is ~83% of the catalog's bytes
 * and nothing in a list row needs it, so this shape drops it; the detail view
 * fetches the full row for the one exercise the user actually opened.
 */
export type CatalogExercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  force?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  custom?: boolean;
};

export type ClientExercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscle: string;
  description: string;
  sets: string;
  color: string;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  force?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  custom?: boolean;
};

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function categoryOf(source: { category: string }): ExerciseCategory {
  if (
    source.category === "strength" ||
    source.category === "cardio" ||
    source.category === "mobility" ||
    source.category === "core"
  ) {
    return source.category;
  }
  return "strength";
}

function muscleLabel(source: ExerciseSource) {
  const muscles = [...source.primaryMuscles, ...source.secondaryMuscles]
    .slice(0, 4)
    .map(titleCase);
  return muscles.length > 0 ? muscles.join(" · ") : "Full Body";
}

function descriptionOf(source: ExerciseSource) {
  return (
    source.instructions[0] ??
    `${source.name} exercise using ${source.equipment ?? "bodyweight or available equipment"}.`
  );
}

function defaultSets(category: ExerciseCategory) {
  switch (category) {
    case "cardio":
      return "20–40 min";
    case "mobility":
      return "2–3 × 60 s";
    case "core":
      return "3 × 12 reps";
    default:
      return "3 × 8–12 reps";
  }
}

function categoryColor(category: ExerciseCategory) {
  switch (category) {
    case "cardio":
      return "#f97316";
    case "mobility":
      return "#10b981";
    case "core":
      return "#3b82f6";
    default:
      return "#78716c";
  }
}

export function toClientExercise(
  id: string,
  source: ExerciseSource & { force?: string },
  options: { custom?: boolean } = {},
): ClientExercise {
  const category = categoryOf(source);
  return {
    id,
    name: source.name,
    category,
    muscle: muscleLabel(source),
    description: descriptionOf(source),
    sets: defaultSets(category),
    color: categoryColor(category),
    level: source.level,
    mechanic: source.mechanic ?? null,
    equipment: source.equipment ?? null,
    force: source.force ?? null,
    primaryMuscles: source.primaryMuscles,
    secondaryMuscles: source.secondaryMuscles,
    instructions: source.instructions,
    ...(options.custom ? { custom: true } : {}),
  };
}

export function toCatalogExercise(
  id: string,
  source: ExerciseSource & { force?: string },
  options: { custom?: boolean } = {},
): CatalogExercise {
  return {
    id,
    name: source.name,
    category: categoryOf(source),
    level: source.level,
    mechanic: source.mechanic ?? null,
    equipment: source.equipment ?? null,
    force: source.force ?? null,
    primaryMuscles: source.primaryMuscles,
    secondaryMuscles: source.secondaryMuscles,
    ...(options.custom ? { custom: true } : {}),
  };
}

export function isCustomExerciseId(id: string) {
  return id.startsWith(CUSTOM_EXERCISE_ID_PREFIX);
}

export function customExerciseDocId(id: string) {
  return id.slice(CUSTOM_EXERCISE_ID_PREFIX.length);
}

export function customExerciseClientId(docId: string) {
  return `${CUSTOM_EXERCISE_ID_PREFIX}${docId}`;
}
