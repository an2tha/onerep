import type { MuscleRecoveryStatus } from "@/lib/muscle-volume"

export type ReadinessCheckIn = {
  energy: number
  sleepQuality: number
  soreness: number
}

export type ReadinessComponent = {
  id: "checkIn" | "fuel" | "muscles"
  label: string
  /** 0–100, or null when this signal has no data yet. */
  score: number | null
  /** Effective share of the final score, renormalized over available signals. */
  weight: number
  /** One-line, plain-language explanation of the inputs behind the score. */
  detail: string
}

export type ReadinessLabel = "Ready" | "Steady" | "Recover"

export type ReadinessResult = {
  score: number
  label: ReadinessLabel
  advice: string
  components: ReadinessComponent[]
}

const BASE_WEIGHTS = { checkIn: 0.45, fuel: 0.3, muscles: 0.25 } as const

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function computeReadiness({
  checkIn,
  proteinProgress,
  waterProgress,
  muscleGroups,
}: {
  checkIn?: ReadinessCheckIn | null
  proteinProgress: number
  waterProgress: number
  muscleGroups: Array<{ status: MuscleRecoveryStatus }>
}): ReadinessResult {
  const fuelScore = clamp((clamp(proteinProgress) + clamp(waterProgress)) / 2)

  const checkInScore = checkIn
    ? clamp(
        ((checkIn.energy + checkIn.sleepQuality + (6 - checkIn.soreness)) /
          15) *
          100
      )
    : null

  const recoveringCount = muscleGroups.filter(
    (muscle) => muscle.status === "trained" || muscle.status === "recovering"
  ).length
  const muscleScore =
    muscleGroups.length > 0
      ? clamp(100 - (recoveringCount / muscleGroups.length) * 80)
      : null

  const components: ReadinessComponent[] = [
    {
      id: "checkIn",
      label: "Check-in",
      score: checkInScore,
      weight: BASE_WEIGHTS.checkIn,
      detail: checkIn
        ? `Sleep ${checkIn.sleepQuality}/5 · energy ${checkIn.energy}/5 · soreness ${checkIn.soreness}/5`
        : "No recent check-in — ask Coach for one",
    },
    {
      id: "fuel",
      label: "Fuel",
      score: fuelScore,
      weight: BASE_WEIGHTS.fuel,
      detail: `Protein ${Math.round(clamp(proteinProgress))}% · water ${Math.round(clamp(waterProgress))}% of target`,
    },
    {
      id: "muscles",
      label: "Muscles",
      score: muscleScore,
      weight: BASE_WEIGHTS.muscles,
      detail:
        muscleGroups.length === 0
          ? "No training history yet"
          : recoveringCount === 0
            ? "All muscle groups recovered"
            : `${recoveringCount} of ${muscleGroups.length} groups still recovering`,
    },
  ]

  // Renormalize weights over the signals that actually have data, so a
  // missing check-in stops skewing the score instead of being silently
  // replaced by another signal.
  const available = components.filter(
    (component) => component.score !== null
  )
  const totalWeight = available.reduce(
    (sum, component) => sum + component.weight,
    0
  )
  for (const component of components) {
    component.weight =
      component.score === null || totalWeight === 0
        ? 0
        : component.weight / totalWeight
  }

  const score = Math.round(
    components.reduce(
      (sum, component) => sum + (component.score ?? 0) * component.weight,
      0
    )
  )

  const label: ReadinessLabel =
    score >= 75 ? "Ready" : score >= 45 ? "Steady" : "Recover"
  const advice =
    label === "Ready"
      ? "Training as planned is supported."
      : label === "Steady"
        ? "Keep one or two reps in reserve."
        : "Reduce volume and prioritize recovery."

  return { score, label, advice, components }
}
