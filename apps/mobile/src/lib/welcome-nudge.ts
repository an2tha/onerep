import { safeLocalStorageRemove } from "@/lib/utils"

/** localStorage key holding the last day the welcome nudge was dismissed. */
export const WELCOME_NUDGE_SEEN_KEY = "onerep:welcome-nudge-day"

/** Forget today's dismissal so the nudge shows on the next dashboard visit. */
export function resetWelcomeNudge() {
  safeLocalStorageRemove(WELCOME_NUDGE_SEEN_KEY)
}
