import { tr } from "@repo/ui/i18n"
import { EXERCISE_CATEGORY_COLORS } from "@repo/ui"

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
  /** True for exercises the signed-in user authored themselves. */
  custom?: boolean
}

export const EXERCISES: Exercise[] = [
  {
    id: "e1",
    name: tr("Barbell Squat"),
    category: "strength",
    muscle: tr("Quads · Glutes · Core"),
    description: tr(
      "The foundational lower-body compound movement. Builds quad, glute, and core strength simultaneously. Keep your chest tall and knees tracking over your toes."
    ),
    sets: tr("4 × 5 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e2",
    name: tr("Bench Press"),
    category: "strength",
    muscle: tr("Chest · Triceps · Front Deltoids"),
    description: tr(
      "The premier horizontal pressing movement. Develops chest thickness and pushing power. Lower the bar under control to mid-chest, drive up explosively."
    ),
    sets: tr("4 × 6 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e3",
    name: tr("Deadlift"),
    category: "strength",
    muscle: tr("Hamstrings · Back · Glutes"),
    description: tr(
      "The heaviest full-body lift. Trains the entire posterior chain. Hinge at the hips, keep a neutral spine, and drive through the floor."
    ),
    sets: tr("3 × 5 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e4",
    name: tr("Pull-up"),
    category: "strength",
    muscle: tr("Lats · Biceps · Rear Delts"),
    description: tr(
      "The upper-body benchmark. Builds vertical pulling strength and a wide back. Start from a dead hang, pull your chin over the bar, lower with control."
    ),
    sets: tr("4 × max reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e5",
    name: tr("Overhead Press"),
    category: "strength",
    muscle: tr("Shoulders · Triceps · Upper Chest"),
    description: tr(
      "Standing vertical pressing movement. Builds shoulder mass and pressing strength. Brace your core tightly to avoid lower-back extension."
    ),
    sets: tr("4 × 6 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e6",
    name: tr("Barbell Row"),
    category: "strength",
    muscle: tr("Lats · Rhomboids · Biceps"),
    description: tr(
      "Horizontal pulling movement that counters the bench press. Hinge to around 45°, row the bar into your lower chest, squeeze the shoulder blades."
    ),
    sets: tr("4 × 8 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e7",
    name: tr("Dumbbell Curl"),
    category: "strength",
    muscle: tr("Biceps · Forearms"),
    description: tr(
      "Classic bicep isolation. Supinate the wrist at the top for a full contraction. Avoid swinging the elbow forward."
    ),
    sets: tr("3 × 12 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e8",
    name: tr("Tricep Dip"),
    category: "strength",
    muscle: tr("Triceps · Chest · Front Delts"),
    description: tr(
      "Compound pushing movement that loads the triceps and chest through a long range of motion. Keep elbows close and lean slightly forward."
    ),
    sets: tr("3 × 10 reps"),
    color: EXERCISE_CATEGORY_COLORS.strength,
  },
  {
    id: "e9",
    name: tr("Zone 2 Run"),
    category: "cardio",
    muscle: tr("Full Body · Cardiovascular"),
    description: tr(
      "Sustained aerobic effort at 60–70% max heart rate. Builds mitochondrial density and fat-burning capacity. Should feel conversational."
    ),
    sets: tr("20–40 min"),
    color: EXERCISE_CATEGORY_COLORS.cardio,
  },
  {
    id: "e10",
    name: tr("Jump Rope"),
    category: "cardio",
    muscle: tr("Calves · Coordination · Cardiovascular"),
    description: tr(
      "High-skill conditioning tool. Improves footwork, timing, and anaerobic capacity. Start with 30-second intervals, rest 30 seconds."
    ),
    sets: tr("10 × 30 s"),
    color: EXERCISE_CATEGORY_COLORS.cardio,
  },
  {
    id: "e11",
    name: tr("Rowing Machine"),
    category: "cardio",
    muscle: tr("Full Body · Back · Legs"),
    description: tr(
      "Low-impact, full-body cardio. 60% legs, 20% core, 20% arms on each stroke. Drive with the legs first, then lean back, then pull the handle."
    ),
    sets: tr("2000 m"),
    color: EXERCISE_CATEGORY_COLORS.cardio,
  },
  {
    id: "e12",
    name: tr("Burpees"),
    category: "cardio",
    muscle: tr("Full Body · Explosive"),
    description: tr(
      "High-intensity movement combining a squat, plank, push-up, and jump. Excellent for conditioning in minimal space. Control the descent."
    ),
    sets: tr("5 × 10 reps"),
    color: EXERCISE_CATEGORY_COLORS.cardio,
  },
  {
    id: "e13",
    name: tr("Hip Flexor Stretch"),
    category: "mobility",
    muscle: tr("Hip Flexors · Quads"),
    description: tr(
      "Addresses tightness from prolonged sitting. Lunge low, tuck the pelvis, and reach the same-side arm overhead for a deeper stretch."
    ),
    sets: tr("3 × 60 s / side"),
    color: EXERCISE_CATEGORY_COLORS.mobility,
  },
  {
    id: "e14",
    name: tr("Thoracic Rotation"),
    category: "mobility",
    muscle: tr("Thoracic Spine · Shoulders"),
    description: tr(
      "Restores mid-back rotation that daily sitting limits. Side-lying with knees stacked, reach the top arm across the body and rotate open."
    ),
    sets: tr("2 × 10 reps / side"),
    color: EXERCISE_CATEGORY_COLORS.mobility,
  },
  {
    id: "e15",
    name: tr("Pigeon Pose"),
    category: "mobility",
    muscle: tr("Hips · Glutes · Piriformis"),
    description: tr(
      "Deep external hip rotation stretch that releases chronic tightness in the glutes and piriformis. Fold forward over the front shin for a deeper hold."
    ),
    sets: tr("2 × 90 s / side"),
    color: EXERCISE_CATEGORY_COLORS.mobility,
  },
  {
    id: "e16",
    name: tr("World's Greatest Stretch"),
    category: "mobility",
    muscle: tr("Hips · Thoracic Spine · Hamstrings"),
    description: tr(
      "The single best dynamic warm-up exercise. Combines a lunge, rotation, and hamstring stretch in one flowing sequence. Take it slow."
    ),
    sets: tr("2 × 5 reps / side"),
    color: EXERCISE_CATEGORY_COLORS.mobility,
  },
  {
    id: "e17",
    name: tr("Plank"),
    category: "core",
    muscle: tr("Core · Shoulders · Glutes"),
    description: tr(
      "The foundation of core training. Maintain a rigid body position from head to heels, with no sagging hips. Squeeze everything."
    ),
    sets: tr("3 × 60 s"),
    color: EXERCISE_CATEGORY_COLORS.core,
  },
  {
    id: "e18",
    name: tr("Russian Twist"),
    category: "core",
    muscle: tr("Obliques · Hip Flexors"),
    description: tr(
      "Rotational core exercise. Keep your feet off the ground and rotate through the thoracic spine, not just the arms. Add a weight plate for more challenge."
    ),
    sets: tr("3 × 20 reps"),
    color: EXERCISE_CATEGORY_COLORS.core,
  },
  {
    id: "e19",
    name: tr("Dead Bug"),
    category: "core",
    muscle: tr("Core · Hip Flexors · Stability"),
    description: tr(
      "Anti-extension core stability drill. Press your lower back into the floor throughout. Extend opposite arm and leg slowly, return without losing position."
    ),
    sets: tr("3 × 10 reps / side"),
    color: EXERCISE_CATEGORY_COLORS.core,
  },
  {
    id: "e20",
    name: tr("Hanging Leg Raise"),
    category: "core",
    muscle: tr("Lower Abs · Hip Flexors"),
    description: tr(
      "Hanging core exercise targeting the lower abdominals. Avoid swinging. Initiate by posteriorly tilting the pelvis, then raise the legs."
    ),
    sets: tr("3 × 12 reps"),
    color: EXERCISE_CATEGORY_COLORS.core,
  },
]

const POPULAR_EXERCISE_SEARCH_IDS = ["e1", "e2", "e3", "e4", "e9", "e17"]

export function getExerciseById(id: string) {
  return EXERCISES.find((e) => e.id === id) ?? null
}

export function visiblePopularExerciseSearches(
  addedIds: string[],
  exercises: Exercise[] = EXERCISES
) {
  const added = new Set(addedIds)
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))

  return POPULAR_EXERCISE_SEARCH_IDS.map((id) => byId.get(id)).filter(
    (exercise): exercise is Exercise =>
      Boolean(exercise && !added.has(exercise.id))
  )
}

function exerciseMatchesQuery(exercise: Exercise, query: string): boolean {
  if (!query) return true
  const haystack = [
    exercise.name,
    exercise.category,
    exercise.muscle,
    exercise.description,
    exercise.level,
    exercise.mechanic,
    exercise.equipment,
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.secondaryMuscles ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

async function remoteExerciseApi() {
  const [{ convexClient }, { api }] = await Promise.all([
    import("@/lib/convex"),
    import("../../../../convex/_generated/api"),
  ])
  return { convexClient, api }
}

function fallbackSearchExercises({
  query = "",
  categories,
  limit = 25,
}: {
  query?: string
  categories?: ExerciseCategory[]
  limit?: number
} = {}): Exercise[] {
  const q = query.trim().toLowerCase()
  const filtered = EXERCISES.filter((exercise) =>
    exerciseMatchesQuery(exercise, q)
  ).filter(
    (exercise) =>
      !categories ||
      categories.length === 0 ||
      categories.includes(exercise.category)
  )
  return filtered.slice(0, Math.min(limit, 50))
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
  const fallback = () => fallbackSearchExercises({ query, categories, limit })

  try {
    const { convexClient, api } = await remoteExerciseApi()
    const results = (await convexClient.query(api.exercises.search, {
      query,
      categories,
      limit,
    })) as Exercise[]

    if (results.length > 0) return results

    const fallbackResults = fallback()
    if (fallbackResults.length > 0) return fallbackResults

    if (query.trim().length > 0) return results
  } catch {
    // Fall back to the small bundled catalog when Convex is unavailable.
  }

  return fallback()
}

export async function resolveExerciseIds(
  ids: string[]
): Promise<Record<string, Exercise>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean)

  try {
    const { convexClient, api } = await remoteExerciseApi()
    const remote = (await convexClient.query(api.exercises.resolve, {
      ids: uniqueIds,
    })) as Record<string, Exercise>
    const missing = uniqueIds.filter((id) => !remote[id])
    if (missing.length === 0) return remote

    const fallback = fallbackResolveExerciseIds(missing)
    return { ...remote, ...fallback }
  } catch {
    return fallbackResolveExerciseIds(uniqueIds)
  }
}

function fallbackResolveExerciseIds(ids: string[]): Record<string, Exercise> {
  const result: Record<string, Exercise> = {}
  for (const id of ids) {
    const exercise = getExerciseById(id)
    if (exercise) result[id] = exercise
  }
  return result
}
