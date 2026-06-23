const SOURCE_URL =
  process.env.FREE_EXERCISE_DB_URL ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const OUT_PATH =
  process.env.EXERCISE_DB_OUT ??
  ".cache/exercises/free-exercise-db.compact.json";

const GLOBAL_USER_ID = "__global__";

type SourceExercise = {
  id?: unknown;
  name?: unknown;
  force?: unknown;
  level?: unknown;
  mechanic?: unknown;
  equipment?: unknown;
  primaryMuscles?: unknown;
  secondaryMuscles?: unknown;
  instructions?: unknown;
  category?: unknown;
};

type CompactExercise = {
  userId: string;
  exerciseId: string;
  name: string;
  category: "strength" | "cardio" | "mobility" | "core";
  level: string;
  mechanic?: string;
  equipment?: string;
  force?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

function compactString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = compactString(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizedWords(values: string[]): string {
  return values.map(normalized).join(" ");
}

function categoryFor(
  rawCategory: string | undefined,
  primaryMuscles: string[],
  name: string,
): CompactExercise["category"] {
  const raw = normalized(rawCategory);
  if (raw === "cardio") return "cardio";
  if (raw === "stretching") return "mobility";

  const muscleText = normalizedWords(primaryMuscles);
  const nameText = normalized(name);
  if (
    muscleText.includes("abdominals") ||
    /\b(abs?|abdominal|crunch|plank|sit[ -]?up|leg raise|russian twist)\b/.test(
      nameText,
    )
  ) {
    return "core";
  }

  return "strength";
}

function compactExercise(source: SourceExercise): CompactExercise | null {
  const exerciseId = compactString(source.id);
  const name = compactString(source.name);
  if (!exerciseId || !name) return null;

  const primaryMuscles = stringArray(source.primaryMuscles);
  const secondaryMuscles = stringArray(source.secondaryMuscles);
  const instructions = stringArray(source.instructions);
  const level = compactString(source.level) ?? "beginner";
  const mechanic = compactString(source.mechanic);
  const equipment = compactString(source.equipment);
  const force = compactString(source.force);

  return {
    userId: GLOBAL_USER_ID,
    exerciseId,
    name,
    category: categoryFor(compactString(source.category), primaryMuscles, name),
    level,
    ...(mechanic ? { mechanic } : {}),
    ...(equipment ? { equipment } : {}),
    ...(force ? { force } : {}),
    primaryMuscles,
    secondaryMuscles,
    instructions,
  };
}

const response = await fetch(SOURCE_URL, {
  headers: { Accept: "application/json" },
});
if (!response.ok) {
  throw new Error(`Failed to download free-exercise-db: ${response.status}`);
}

const raw = await response.json();
if (!Array.isArray(raw)) {
  throw new Error("Expected free-exercise-db to be a JSON array");
}

const seen = new Set<string>();
const exercises: CompactExercise[] = [];
let skipped = 0;

for (const item of raw as SourceExercise[]) {
  const exercise = compactExercise(item);
  if (!exercise) {
    skipped += 1;
    continue;
  }
  if (seen.has(exercise.exerciseId)) continue;
  seen.add(exercise.exerciseId);
  exercises.push(exercise);
}

exercises.sort((a, b) => a.name.localeCompare(b.name));

await Bun.write(OUT_PATH, JSON.stringify(exercises));

const bytes = (await Bun.file(OUT_PATH).arrayBuffer()).byteLength;
const categoryCounts = exercises.reduce<Record<string, number>>(
  (acc, exercise) => {
    acc[exercise.category] = (acc[exercise.category] ?? 0) + 1;
    return acc;
  },
  {},
);

console.log(
  JSON.stringify(
    {
      source: SOURCE_URL,
      output: OUT_PATH,
      exercises: exercises.length,
      skipped,
      bytes,
      categoryCounts,
      compression: "metadata only: image paths/binaries omitted",
    },
    null,
    2,
  ),
);
