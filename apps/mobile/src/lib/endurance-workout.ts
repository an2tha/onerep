import { safeLocalStorageGet } from "@/lib/utils"

export type EnduranceSport =
  "run" | "ride" | "swim" | "hike" | "walk" | "trail_run" | "row"
export type EnduranceEnvironment = "outdoor" | "indoor"
export type EnduranceHeartRateSample = {
  elapsedSeconds: number
  bpm: number
}

export const ACTIVE_ENDURANCE_KEY = "onerep:active-endurance-workout:v1"

export function getActiveEnduranceSport(): EnduranceSport | null {
  const raw = safeLocalStorageGet(ACTIVE_ENDURANCE_KEY)
  if (!raw) return null
  try {
    const sport = (JSON.parse(raw) as { sport?: unknown }).sport
    return ["run", "ride", "swim", "hike", "walk", "trail_run", "row"].includes(
      String(sport)
    )
      ? (sport as EnduranceSport)
      : null
  } catch {
    return null
  }
}

export const SELECTED_TRAIL_KEY = "onerep:selected-hiking-trail:v1"
