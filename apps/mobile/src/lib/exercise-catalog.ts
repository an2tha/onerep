import { dataApiFetch } from "./trpc"

export type ExerciseCategory = "strength" | "cardio" | "mobility" | "core"

export type Exercise = {
  id: string
  name: string
  category: ExerciseCategory
  muscle: string
  description: string
  sets: string
  color: string
  level?: string
  mechanic?: string | null
  equipment?: string | null
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
  instructions?: string[]
}

export const EXERCISES: Exercise[] = [
  {
    id: "e1",
    name: "Barbell Squat",
    category: "strength",
    muscle: "Quads · Glutes · Core",
    description:
      "The foundational lower-body compound movement. Builds quad, glute, and core strength simultaneously. Keep your chest tall and knees tracking over your toes.",
    sets: "4 × 5 reps",
    color: "#78716c",
  },
  {
    id: "e2",
    name: "Bench Press",
    category: "strength",
    muscle: "Chest · Triceps · Front Deltoids",
    description:
      "The premier horizontal pressing movement. Develops chest thickness and pushing power. Lower the bar under control to mid-chest, drive up explosively.",
    sets: "4 × 6 reps",
    color: "#57534e",
  },
  {
    id: "e3",
    name: "Deadlift",
    category: "strength",
    muscle: "Hamstrings · Back · Glutes",
    description:
      "The heaviest full-body lift. Trains the entire posterior chain. Hinge at the hips, keep a neutral spine, and drive through the floor.",
    sets: "3 × 5 reps",
    color: "#44403c",
  },
  {
    id: "e4",
    name: "Pull-up",
    category: "strength",
    muscle: "Lats · Biceps · Rear Delts",
    description:
      "The upper-body benchmark. Builds vertical pulling strength and a wide back. Start from a dead hang, pull your chin over the bar, lower with control.",
    sets: "4 × max reps",
    color: "#78716c",
  },
  {
    id: "e5",
    name: "Overhead Press",
    category: "strength",
    muscle: "Shoulders · Triceps · Upper Chest",
    description:
      "Standing vertical pressing movement. Builds shoulder mass and pressing strength. Brace your core tightly to avoid lower-back extension.",
    sets: "4 × 6 reps",
    color: "#57534e",
  },
  {
    id: "e6",
    name: "Barbell Row",
    category: "strength",
    muscle: "Lats · Rhomboids · Biceps",
    description:
      "Horizontal pulling movement that counters the bench press. Hinge to around 45°, row the bar into your lower chest, squeeze the shoulder blades.",
    sets: "4 × 8 reps",
    color: "#44403c",
  },
  {
    id: "e7",
    name: "Dumbbell Curl",
    category: "strength",
    muscle: "Biceps · Forearms",
    description:
      "Classic bicep isolation. Supinate the wrist at the top for a full contraction. Avoid swinging the elbow forward.",
    sets: "3 × 12 reps",
    color: "#78716c",
  },
  {
    id: "e8",
    name: "Tricep Dip",
    category: "strength",
    muscle: "Triceps · Chest · Front Delts",
    description:
      "Compound pushing movement that loads the triceps and chest through a long range of motion. Keep elbows close and lean slightly forward.",
    sets: "3 × 10 reps",
    color: "#57534e",
  },
  {
    id: "e9",
    name: "Zone 2 Run",
    category: "cardio",
    muscle: "Full Body · Cardiovascular",
    description:
      "Sustained aerobic effort at 60–70% max heart rate. Builds mitochondrial density and fat-burning capacity. Should feel conversational.",
    sets: "20–40 min",
    color: "#f97316",
  },
  {
    id: "e10",
    name: "Jump Rope",
    category: "cardio",
    muscle: "Calves · Coordination · Cardiovascular",
    description:
      "High-skill conditioning tool. Improves footwork, timing, and anaerobic capacity. Start with 30-second intervals, rest 30 seconds.",
    sets: "10 × 30 s",
    color: "#ef4444",
  },
  {
    id: "e11",
    name: "Rowing Machine",
    category: "cardio",
    muscle: "Full Body · Back · Legs",
    description:
      "Low-impact, full-body cardio. 60% legs, 20% core, 20% arms on each stroke. Drive with the legs first, then lean back, then pull the handle.",
    sets: "2000 m",
    color: "#f97316",
  },
  {
    id: "e12",
    name: "Burpees",
    category: "cardio",
    muscle: "Full Body · Explosive",
    description:
      "High-intensity movement combining a squat, plank, push-up, and jump. Excellent for conditioning in minimal space. Control the descent.",
    sets: "5 × 10 reps",
    color: "#dc2626",
  },
  {
    id: "e13",
    name: "Hip Flexor Stretch",
    category: "mobility",
    muscle: "Hip Flexors · Quads",
    description:
      "Addresses tightness from prolonged sitting. Lunge low, tuck the pelvis, and reach the same-side arm overhead for a deeper stretch.",
    sets: "3 × 60 s / side",
    color: "#10b981",
  },
  {
    id: "e14",
    name: "Thoracic Rotation",
    category: "mobility",
    muscle: "Thoracic Spine · Shoulders",
    description:
      "Restores mid-back rotation that daily sitting limits. Side-lying with knees stacked, reach the top arm across the body and rotate open.",
    sets: "2 × 10 reps / side",
    color: "#059669",
  },
  {
    id: "e15",
    name: "Pigeon Pose",
    category: "mobility",
    muscle: "Hips · Glutes · Piriformis",
    description:
      "Deep external hip rotation stretch that releases chronic tightness in the glutes and piriformis. Fold forward over the front shin for a deeper hold.",
    sets: "2 × 90 s / side",
    color: "#10b981",
  },
  {
    id: "e16",
    name: "World's Greatest Stretch",
    category: "mobility",
    muscle: "Hips · Thoracic Spine · Hamstrings",
    description:
      "The single best dynamic warm-up exercise. Combines a lunge, rotation, and hamstring stretch in one flowing sequence. Take it slow.",
    sets: "2 × 5 reps / side",
    color: "#34d399",
  },
  {
    id: "e17",
    name: "Plank",
    category: "core",
    muscle: "Core · Shoulders · Glutes",
    description:
      "The foundation of core training. Maintain a rigid body position from head to heels — no sagging hips. Squeeze everything.",
    sets: "3 × 60 s",
    color: "#3b82f6",
  },
  {
    id: "e18",
    name: "Russian Twist",
    category: "core",
    muscle: "Obliques · Hip Flexors",
    description:
      "Rotational core exercise. Keep your feet off the ground and rotate through the thoracic spine, not just the arms. Add a weight plate for more challenge.",
    sets: "3 × 20 reps",
    color: "#2563eb",
  },
  {
    id: "e19",
    name: "Dead Bug",
    category: "core",
    muscle: "Core · Hip Flexors · Stability",
    description:
      "Anti-extension core stability drill. Press your lower back into the floor throughout. Extend opposite arm and leg slowly, return without losing position.",
    sets: "3 × 10 reps / side",
    color: "#3b82f6",
  },
  {
    id: "e20",
    name: "Hanging Leg Raise",
    category: "core",
    muscle: "Lower Abs · Hip Flexors",
    description:
      "Hanging core exercise targeting the lower abdominals. Avoid swinging — initiate by posteriorly tilting the pelvis, then raise the legs.",
    sets: "3 × 12 reps",
    color: "#1d4ed8",
  },
]

export function getExerciseById(id: string) {
  return EXERCISES.find((e) => e.id === id) ?? null
}

function categoryColor(category: ExerciseCategory): string {
  switch (category) {
    case "strength": return "#57534e"
    case "cardio": return "#ea580c"
    case "mobility": return "#0d9488"
    case "core": return "#0284c7"
  }
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ")
}

function normalizeCategory(raw: unknown): ExerciseCategory {
  const value = String(raw ?? "strength").toLowerCase()
  if (value === "stretching" || value === "mobility") return "mobility"
  if (value === "cardio") return "cardio"
  if (value === "core" || value === "abdominals") return "core"
  return "strength"
}

function normalizeNames(value: unknown): string[] {
  if (!value) return []
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return normalizeNames(parsed)
    } catch {
      return [value].filter(Boolean)
    }
  }
  if (!Array.isArray(value)) return [String(value)].filter(Boolean)
  return value
    .map((item: any) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean)
    .map(String)
}

function equipmentLabel(value: unknown): string | undefined {
  const names = normalizeNames(value)
  return names.length > 0 ? names.join(" · ") : undefined
}

function buildMuscleLabel(primaryMuscles: string[], secondaryMuscles: string[]): string {
  const seen = new Set<string>()
  const result: string[] = []
  for (const muscle of [...primaryMuscles, ...secondaryMuscles]) {
    const key = muscle.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(titleCase(muscle.trim()))
  }
  return result.length > 0 ? result.join(" · ") : "Full body"
}

function buildDescription(
  instructions: string[],
  equipment: string | undefined,
  mechanic: string | undefined,
  level: string,
): string {
  const first = instructions.slice(0, 2).map((s) => s.trim()).filter(Boolean)
  if (first.length > 0) {
    const summary = first.join(" ")
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary
  }
  const parts = [
    equipment ? titleCase(equipment) : null,
    mechanic ? titleCase(mechanic) : null,
    titleCase(level),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "Exercise details available"
}

function buildSuggestedSets(
  category: ExerciseCategory,
  mechanic: string | undefined,
  level: string,
): string {
  if (category === "mobility") return "2 × 30 s / side"
  if (category === "cardio") return "20–30 min"
  if (mechanic === "isolation") return "3 × 12 reps"
  if (level === "beginner") return "3 × 10 reps"
  if (level === "intermediate") return "4 × 8 reps"
  return "5 × 5 reps"
}

function mapApiExercise(hit: any): Exercise {
  const src = hit?._source ?? hit ?? {}
  const id = String(src.id ?? src.exercise_id ?? src.exerciseId ?? hit?._id ?? "")
  const category = normalizeCategory(src.category)
  const primaryMuscles = normalizeNames(src.primaryMuscles ?? src.primary_muscles)
  const secondaryMuscles = normalizeNames(src.secondaryMuscles ?? src.secondary_muscles)
  const instructions = normalizeNames(src.instructions)
  const level = String(src.level ?? "intermediate")
  const mechanic = src.mechanic ?? src.force ?? undefined
  const equipment = equipmentLabel(src.equipment)
  const description = typeof src.description === "string" ? src.description : undefined

  return {
    id,
    name: String(src.name || "Unknown"),
    category,
    muscle: buildMuscleLabel(primaryMuscles, secondaryMuscles),
    description: description || buildDescription(instructions, equipment, mechanic, level),
    sets: buildSuggestedSets(category, mechanic, level),
    color: categoryColor(category),
    level,
    mechanic: mechanic ?? null,
    equipment: equipment ?? null,
    primaryMuscles,
    secondaryMuscles,
    instructions: instructions.length > 0 ? instructions : description ? [description] : [],
  }
}

export async function searchExercises({
  query = "",
  categories,
  limit = 25,
}: {
  query?: string
  categories?: ExerciseCategory[]
  limit?: number
} = {}): Promise<Exercise[]> {
  const q = query.trim()
  const params = new URLSearchParams({ limit: String(Math.min(limit, 50)) })
  if (q.length >= 2) params.set("q", q)
  const hits = await dataApiFetch<any[]>(`/exercises/search?${params}`)
  const mapped = (Array.isArray(hits) ? hits : [])
    .map(mapApiExercise)
    .filter((exercise) => exercise.id)
  const filtered = categories && categories.length > 0
    ? mapped.filter((exercise) => categories.includes(exercise.category))
    : mapped
  return filtered.slice(0, limit)
}

export async function resolveExerciseIds(ids: string[]): Promise<Record<string, Exercise>> {
  const result: Record<string, Exercise> = {}
  const uniqueIds = [...new Set(ids)].filter(Boolean)

  for (const id of uniqueIds) {
    const local = getExerciseById(id)
    if (local) result[id] = local
  }

  const apiIds = uniqueIds.filter((id) => !id.startsWith("u_"))
  if (apiIds.length === 0) return result

  try {
    const params = new URLSearchParams({ ids: apiIds.join(",") })
    const hits = await dataApiFetch<any[]>(`/exercises/lookup?${params}`)
    for (const hit of Array.isArray(hits) ? hits : []) {
      const exercise = mapApiExercise(hit)
      if (exercise.id) result[exercise.id] = exercise
    }
  } catch {
    // Keep local fallbacks if the data API is temporarily unavailable.
  }

  const missingIds = apiIds.filter((id) => !result[id])
  await Promise.all(missingIds.map(async (id) => {
    try {
      const exercise = mapApiExercise(await dataApiFetch<any>(`/exercises/${encodeURIComponent(id)}`))
      if (exercise.id) result[exercise.id] = exercise
    } catch {
      // Ignore missing individual catalog rows.
    }
  }))

  return result
}
