import { hapticMedium, hapticSelection } from "./haptics"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"
import { celebrateAchievement } from "./workout-celebration"

export type CelebrationKind =
  | "water-goal"
  | "calorie-goal"
  | "fast-complete"
  | "streak-milestone"
  | "workout"

type Spec = {
  confetti?: "target" | "workout"
  /** `html[data-*]` attribute driving a full-screen CSS takeover. */
  attribute?: string
}

const SPECS: Record<CelebrationKind, Spec> = {
  "water-goal": { attribute: "waterGoalCelebration" },
  "calorie-goal": { attribute: "calorieGoalCelebration" },
  "fast-complete": { confetti: "target", attribute: "fastGoalCelebration" },
  "streak-milestone": { confetti: "target" },
  workout: { confetti: "workout" },
}

/**
 * A goal is only worth celebrating the first time you hit it. `dedupeKey`
 * scopes that — a date for day-scoped goals, a session id for a fast.
 */
export function celebrateOnce(kind: CelebrationKind, dedupeKey: string) {
  const storageKey = `onerep:celebrated:${kind}:${dedupeKey}`
  if (safeLocalStorageGet(storageKey)) return false
  safeLocalStorageSet(storageKey, "seen")
  celebrate(kind)
  return true
}

/** The three-beat haptic pattern the water goal established. */
export function celebrate(kind: CelebrationKind) {
  const spec = SPECS[kind]
  if (spec.confetti) celebrateAchievement(spec.confetti)

  hapticMedium()
  const second = window.setTimeout(hapticSelection, 140)
  const third = window.setTimeout(hapticMedium, 300)

  let clear: number | undefined
  if (spec.attribute && typeof document !== "undefined") {
    document.documentElement.dataset[spec.attribute] = "true"
    clear = window.setTimeout(() => {
      delete document.documentElement.dataset[spec.attribute as string]
    }, 2600)
  }

  return () => {
    window.clearTimeout(second)
    window.clearTimeout(third)
    if (clear !== undefined) window.clearTimeout(clear)
  }
}
