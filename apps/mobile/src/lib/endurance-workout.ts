import { safeLocalStorageGet } from "@/lib/utils"

export type EnduranceSport = "run" | "ride" | "swim"
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
    return sport === "run" || sport === "ride" || sport === "swim"
      ? sport
      : null
  } catch {
    return null
  }
}
