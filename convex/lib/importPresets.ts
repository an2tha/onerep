import type { ImportPlan } from "./dataImport";

/** Exact, deterministic column maps. Flat JSON rows use the same maps as CSV.
 * Nested JSON keys are emitted by jsonRecords; never guess using filenames.
 * Strong and FitNotes normally export CSV; JSON means those same export rows.
 */
export const IMPORT_PRESETS: {
  id: string;
  label: string;
  required: string[];
  plan: ImportPlan;
}[] = [
  {
    id: "hevy-json",
    label: "Hevy JSON",
    required: [
      "start_time",
      "exercises.title",
      "exercises.sets.reps",
      "exercises.sets.weight_kg",
    ],
    plan: {
      kind: "workouts",
      weightUnit: "kg",
      columns: {
        date: "start_time",
        workoutName: "title",
        exerciseName: "exercises.title",
        weight: "exercises.sets.weight_kg",
        reps: "exercises.sets.reps",
        rpe: "exercises.sets.rpe",
        setType: "exercises.sets.type",
      },
    },
  },
  {
    id: "hevy-csv",
    label: "Hevy",
    required: ["start_time", "exercise_title", "weight_kg", "reps"],
    plan: {
      kind: "workouts",
      weightUnit: "kg",
      columns: {
        date: "start_time",
        workoutName: "title",
        exerciseName: "exercise_title",
        weight: "weight_kg",
        reps: "reps",
        rpe: "rpe",
        setType: "set_type",
      },
    },
  },
  {
    id: "strong",
    label: "Strong",
    required: ["Date", "Workout Name", "Exercise Name", "Reps", "Weight"],
    plan: {
      kind: "workouts",
      weightUnit: "kg",
      columns: {
        date: "Date",
        workoutName: "Workout Name",
        exerciseName: "Exercise Name",
        weight: "Weight",
        weightUnit: "Weight Unit",
        reps: "Reps",
        rpe: "RPE",
        setType: "Set Type",
      },
    },
  },
  {
    id: "fitnotes",
    label: "FitNotes",
    required: ["Date", "Exercise", "Reps"],
    plan: {
      kind: "workouts",
      weightUnit: "kg",
      columns: {
        date: "Date",
        exerciseName: "Exercise",
        weight: "Weight (kg)",
        reps: "Reps",
      },
    },
  },
  {
    id: "workout-json",
    label: "Workout JSON",
    required: [
      "date",
      "exercises.name",
      "exercises.sets.reps",
      "exercises.sets.weight_kg",
    ],
    plan: {
      kind: "workouts",
      weightUnit: "kg",
      columns: {
        date: "date",
        workoutName: "title",
        exerciseName: "exercises.name",
        weight: "exercises.sets.weight_kg",
        reps: "exercises.sets.reps",
        rpe: "exercises.sets.rpe",
        setType: "exercises.sets.type",
      },
    },
  },
];

export function presetImportPlan(
  headers: string[],
  defaultWeightUnit: "kg" | "lb" = "kg",
): ImportPlan | null {
  const preset = IMPORT_PRESETS.find(
    (item) =>
      item.required.every((key) => headers.includes(key)) &&
      (item.id !== "fitnotes" ||
        headers.includes("Weight (kg)") ||
        headers.includes("Weight (lbs)")),
  );
  if (!preset) return null;
  const plan: ImportPlan = {
    ...preset.plan,
    columns: { ...preset.plan.columns },
    note: `${preset.label} · built-in parser`,
  };
  if (preset.id === "strong") {
    plan.weightUnit = defaultWeightUnit;
    plan.note += ` · unlabelled weights use ${defaultWeightUnit}`;
  }
  if (
    preset.id === "fitnotes" &&
    !headers.includes("Weight (kg)") &&
    headers.includes("Weight (lbs)")
  ) {
    plan.weightUnit = "lb";
    plan.columns.weight = "Weight (lbs)";
  }
  // Only emit columns actually present in this file.
  plan.columns = Object.fromEntries(
    Object.entries(plan.columns).filter(([, key]) => headers.includes(key!)),
  );
  return plan;
}
