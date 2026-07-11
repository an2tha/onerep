export type ProgressionSet = {
  completed?: boolean
  reps: number
  weight: number
}

export type DoubleProgressionSuggestion = {
  label: string
  targets: Array<{ reps: number; weight: number }>
}

/**
 * Builds a conservative, opt-in double-progression target: repeat the prior
 * working sets and add one rep to the strongest set. It intentionally never
 * raises load automatically.
 */
export function suggestDoubleProgression(
  lastSets: ProgressionSet[],
  targetSetCount: number
): DoubleProgressionSuggestion | null {
  const completed = lastSets.filter(
    (set) =>
      set.completed !== false &&
      Number.isFinite(set.weight) &&
      set.weight > 0 &&
      Number.isFinite(set.reps) &&
      set.reps > 0
  )
  if (completed.length === 0 || targetSetCount < 1) return null

  const targets = Array.from({ length: targetSetCount }, (_, index) => {
    const source = completed[Math.min(index, completed.length - 1)]
    return { weight: source.weight, reps: source.reps }
  })
  const strongestIndex = targets.reduce(
    (best, target, index) =>
      target.weight > targets[best].weight ||
      (target.weight === targets[best].weight &&
        target.reps > targets[best].reps)
        ? index
        : best,
    0
  )
  targets[strongestIndex] = {
    ...targets[strongestIndex],
    reps: targets[strongestIndex].reps + 1,
  }

  return {
    label: `+1 rep on set ${strongestIndex + 1}`,
    targets,
  }
}
