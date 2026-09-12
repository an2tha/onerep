import { useEffect } from "react"
import { useQuery } from "convex/react"
import posthog from "posthog-js"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageRemove, safeLocalStorageSet } from "@/lib/utils"

/**
 * Mirrors the account's saved analytics consent into the boot-time cache.
 *
 * `main.tsx` decides PostHog's state before any query lands, from the
 * `onerep:analytics-enabled` local key. That key deliberately does *not*
 * survive a sign-out — consent belongs to the account, not the phone, and a
 * leftover `true` would capture whichever account signs in next — so every
 * session has to hand it back once the account's `privacySettings` arrive.
 * This mounts in the app shell rather than in Settings, because the choice has
 * to be restored on launch, not only when someone opens the privacy section.
 *
 * The loaded-but-unset case is the one that matters: an account that never
 * saved the Privacy section has no `privacySettings` at all, and that is not
 * consent. It clears whatever the previous account left behind instead of
 * trusting it.
 */
export function AnalyticsConsentSync() {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const loaded = preferences !== undefined
  const saved = preferences?.privacySettings?.analyticsEnabled

  useEffect(() => {
    if (!loaded) return
    if (saved === true) {
      safeLocalStorageSet("onerep:analytics-enabled", "true")
      posthog.opt_in_capturing()
      return
    }
    safeLocalStorageRemove("onerep:analytics-enabled")
    posthog.opt_out_capturing()
  }, [loaded, saved])

  return null
}
