import { plannedWorkoutStrain } from "../../../../convex/lib/nutritionProgramme"
import type { AgentWorkoutDraft, ExerciseState } from "./workout-logging"

export function dampenWorkout(
  data: Record<string, ExerciseState>,
  ceiling: number
) {
  const next = structuredClone(data)
  // Only remove future sets. Completed work and recorded cardio stay untouched.
  while ((plannedWorkoutStrain(next) ?? 0) > ceiling) {
    const candidate = Object.values(next)
      .filter((e) => e.sets.some((s) => !s.completed && s.type !== "warmup"))
      .sort(
        (a, b) =>
          b.sets.filter((s) => !s.completed).length -
          a.sets.filter((s) => !s.completed).length
      )[0]
    if (!candidate) return null
    let index = candidate.sets.length - 1
    while (
      index >= 0 &&
      (candidate.sets[index]!.completed ||
        candidate.sets[index]!.type === "warmup")
    )
      index--
    candidate.sets.splice(index, 1)
  }
  return next
}

/** AI may only reduce future work on the current exercises, never rewrite logged sets. */
export function boundedAiDampening(
  data: Record<string, ExerciseState>,
  names: Record<string, string>,
  draft: AgentWorkoutDraft,
  ceiling: number
) {
  const next = structuredClone(data)
  if (!draft.exercises?.length)
    throw new Error("The coach didn't return a workout adjustment.")
  const seen = new Set<string>()
  for (const exercise of draft.exercises) {
    const ids = Object.keys(data).filter(
      (id) =>
        names[id]?.trim().toLowerCase() === exercise.name.trim().toLowerCase()
    )
    if (ids.length !== 1 || seen.has(ids[0]!))
      throw new Error(
        "The coach must keep the current exercises. Try the quick adjustment."
      )
    const id = ids[0]!
    seen.add(id)
    const original = data[id]!
    const completed = original.sets.filter((s) => s.completed)
    const future = original.sets.filter((s) => !s.completed)
    if (!exercise.sets)
      throw new Error("The coach must include the remaining sets.")
    if (exercise.sets.length > future.length)
      throw new Error("This proposal adds work. Ask for a lighter version.")
    const sets = exercise.sets.map((proposal, i) => {
      const source = future[i]!
      const result = { ...source }
      for (const key of ["weight", "reps", "rpe"] as const) {
        if (proposal[key] === undefined || proposal[key] === "") continue
        const value = Number(proposal[key])
        const maximum = Number(source[key] || (key === "rpe" ? 6 : 0))
        if (!Number.isFinite(value) || value < 0 || value > maximum)
          throw new Error(
            "This proposal increases a target. Ask the coach to reduce it."
          )
        result[key] = String(value)
      }
      return result
    })
    next[id] = { ...original, sets: [...completed, ...sets] }
  }
  if ((plannedWorkoutStrain(next) ?? 0) > ceiling)
    throw new Error(
      "This version is still above the programme's strain ceiling. Try the quick adjustment."
    )
  return next
}
