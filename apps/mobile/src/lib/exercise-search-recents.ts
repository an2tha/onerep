import { EXERCISE_CATEGORY_COLORS } from "@repo/ui"
import type { Exercise, ExerciseCategory } from "./exercise-catalog"
import { browserLocalStorage } from "./utils"

const RECENT_EXERCISE_SEARCHES_KEY = "onerep:recent-exercises:v1"
const MAX_RECENT_EXERCISE_SEARCHES = 8

const EXERCISE_CATEGORIES = new Set<ExerciseCategory>([
  "strength",
  "cardio",
  "mobility",
  "core",
])

export type RecentExerciseSearch = Pick<
  Exercise,
  "id" | "name" | "category" | "muscle" | "color"
>

function normalizeCategory(value: unknown): ExerciseCategory | null {
  return typeof value === "string" &&
    EXERCISE_CATEGORIES.has(value as ExerciseCategory)
    ? (value as ExerciseCategory)
    : null
}

export function compactRecentExerciseSearch(
  exercise: Exercise
): RecentExerciseSearch {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    muscle: exercise.muscle,
    color: exercise.color || EXERCISE_CATEGORY_COLORS[exercise.category],
  }
}

export function normalizeRecentExerciseSearches(
  values: unknown
): RecentExerciseSearch[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const normalized: RecentExerciseSearch[] = []

  for (const value of values) {
    if (!value || typeof value !== "object") continue

    const candidate = value as Partial<RecentExerciseSearch>
    const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
    const name =
      typeof candidate.name === "string" ? candidate.name.trim() : ""
    const category = normalizeCategory(candidate.category)
    if (!id || !name || !category || seen.has(id)) continue

    seen.add(id)
    normalized.push({
      id,
      name,
      category,
      muscle:
        typeof candidate.muscle === "string" ? candidate.muscle.trim() : "",
      color:
        typeof candidate.color === "string" && candidate.color.trim()
          ? candidate.color.trim()
          : EXERCISE_CATEGORY_COLORS[category],
    })

    if (normalized.length >= MAX_RECENT_EXERCISE_SEARCHES) break
  }

  return normalized
}

export function nextRecentExerciseSearches(
  current: RecentExerciseSearch[],
  exercise: Exercise
) {
  const compact = compactRecentExerciseSearch(exercise)
  return normalizeRecentExerciseSearches([
    compact,
    ...current.filter((item) => item.id !== compact.id),
  ])
}

export function visibleRecentExerciseSearches(
  addedIds: string[],
  recentExercises: RecentExerciseSearch[]
) {
  const added = new Set(addedIds)
  return normalizeRecentExerciseSearches(recentExercises).filter(
    (exercise) => !added.has(exercise.id)
  )
}

export function readRecentExerciseSearches(storage = browserLocalStorage()) {
  if (!storage) return []

  try {
    const raw = storage.getItem(RECENT_EXERCISE_SEARCHES_KEY)
    if (!raw) return []
    return normalizeRecentExerciseSearches(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeRecentExerciseSearches(
  exercises: RecentExerciseSearch[],
  storage = browserLocalStorage()
) {
  if (!storage) return

  const normalized = normalizeRecentExerciseSearches(exercises)
  try {
    if (normalized.length === 0) {
      storage.removeItem(RECENT_EXERCISE_SEARCHES_KEY)
      return
    }

    storage.setItem(RECENT_EXERCISE_SEARCHES_KEY, JSON.stringify(normalized))
  } catch {
    // Recent searches are convenience data only.
  }
}

export function rememberRecentExerciseSearch(
  exercise: Exercise,
  storage = browserLocalStorage()
) {
  const next = nextRecentExerciseSearches(
    readRecentExerciseSearches(storage),
    exercise
  )
  writeRecentExerciseSearches(next, storage)
  return next
}

export function clearRecentExerciseSearches(storage = browserLocalStorage()) {
  try {
    storage?.removeItem(RECENT_EXERCISE_SEARCHES_KEY)
  } catch {
    // Recent searches are convenience data only.
  }
}
