import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"

export const COACH_ONBOARDING_SEEN_KEY = "onerep:coach-onboarding-seen:v1"

export function hasSeenCoachOnboarding() {
  return safeLocalStorageGet(COACH_ONBOARDING_SEEN_KEY) === "1"
}

export function markCoachOnboardingSeen() {
  return safeLocalStorageSet(COACH_ONBOARDING_SEEN_KEY, "1")
}

export function resetCoachOnboarding() {
  return safeLocalStorageRemove(COACH_ONBOARDING_SEEN_KEY)
}
