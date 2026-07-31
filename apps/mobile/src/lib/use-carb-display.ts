import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { CarbDisplayMode } from "./carb-display"

/**
 * The user's carb display mode.
 *
 * Defaults to "total" while the preference is still loading. That direction is
 * deliberate: showing total carbs when the user wanted net is a cosmetic
 * surprise, whereas the reverse would briefly under-report their intake.
 */
export function useCarbDisplayMode(): CarbDisplayMode {
  const prefs = useQuery(api.users.users.getPreferences, {})
  return prefs?.netCarbsEnabled ? "net" : "total"
}
