import { api } from "../../../../convex/_generated/api"
import { convexClient } from "./convex"
import { hapticMedium, hapticSelection } from "./haptics"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"
import { celebrateAchievement } from "./workout-celebration"

export type CelebrationKind = "fast-complete" | "workout"

type Spec = {
  confetti?: "target" | "workout"
  /** `html[data-*]` attribute driving a full-screen CSS takeover. */
  attribute?: string
}

const SPECS: Record<CelebrationKind, Spec> = {
  "fast-complete": { confetti: "target", attribute: "fastGoalCelebration" },
  workout: { confetti: "workout" },
}

/**
 * A goal is only worth celebrating the first time you hit it. `dedupeKey`
 * scopes that — a date for day-scoped goals, a session id for a fast.
 *
 * The record lives on the server, because the flag that used to hold it lived
 * in localStorage and so meant "once per device": finish a fast on the phone,
 * open the iPad, sit through the confetti a second time. So the server is
 * asked first and its answer decides.
 *
 * The local flag is kept as a fast negative — a device that already knows the
 * answer is no does not need a round trip to be told again — and as the
 * fallback when the round trip fails. Awaiting the claim costs the latency of
 * one mutation, which every caller already spends writing the achievement
 * itself.
 */
export async function celebrateOnce(kind: CelebrationKind, dedupeKey: string) {
  const storageKey = `onerep:celebrated:${kind}:${dedupeKey}`
  if (safeLocalStorageGet(storageKey)) return false

  let claimed = true
  try {
    const result = await convexClient.mutation(api.users.celebrations.claim, {
      kind,
      dedupeKey,
    })
    claimed = result?.claimed !== false
  } catch {
    // Offline, or the server is unreachable. Celebrate: the achievement is
    // real either way, and swallowing it to protect against a replay that may
    // never happen is the worse trade.
    claimed = true
  }

  // Written even when the answer was no, so the next attempt on this device
  // takes the fast path instead of asking again.
  safeLocalStorageSet(storageKey, "seen")
  if (!claimed) return false

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
