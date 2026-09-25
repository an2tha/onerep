import { tr } from "@repo/ui/i18n"
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
      label: tr("Check-in"),
      score: checkInScore,
      weight: BASE_WEIGHTS.checkIn,
      detail: checkIn
        ? tr(
            "Sleep {{value0}}/5 · energy {{value1}}/5 · soreness {{value2}}/5",
            {
              value0: checkIn.sleepQuality,
              value1: checkIn.energy,
              value2: checkIn.soreness,
            }
          )
        : tr("No recent check-in. Ask Coach for one"),
    },
    {
      id: "fuel",
      label: tr("Fuel"),
      score: fuelScore,
      weight: BASE_WEIGHTS.fuel,
      detail: tr("Protein {{value0}}% · water {{value1}}% of target", {
        value0: Math.round(clamp(proteinProgress)),
        value1: Math.round(clamp(waterProgress)),
      }),
    },
    {
      id: "muscles",
      label: tr("Muscles"),
      score: muscleScore,
      weight: BASE_WEIGHTS.muscles,
      detail:
        muscleGroups.length === 0
          ? tr("No training history yet")
          : recoveringCount === 0
            ? tr("All muscle groups recovered")
            : tr("{{value0}} of {{value1}} groups still recovering", {
                value0: recoveringCount,
                value1: muscleGroups.length,
              }),
    },
  ]

  // Renormalize weights over the signals that actually have data, so a
  // missing check-in stops skewing the score instead of being silently
  // replaced by another signal.
  const available = components.filter((component) => component.score !== null)
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
      ? tr("Training as planned is supported.")
      : label === "Steady"
        ? tr("Keep one or two reps in reserve.")
        : tr("Reduce volume and prioritize recovery.")

  return { score, label, advice, components }
}
