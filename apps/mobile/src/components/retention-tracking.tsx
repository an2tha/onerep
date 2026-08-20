import { useEffect } from "react"
import { useQuery } from "convex/react"
import { App as CapacitorApp } from "@capacitor/app"
import { api } from "../../../../convex/_generated/api"
import { trackAppOpen } from "@/lib/retention"

/**
 * Emits one `app_open` per local day, tagged with the age of the account.
 *
 * Mounted beside the other sync bridges rather than hung off the router,
 * because a resume from the background is an open too and no navigation
 * happens when it does. `trackAppOpen` owns the once-a-day rule, so calling it
 * on every resume costs a string comparison and nothing else.
 */
export function RetentionTracking() {
  const signupAt = useQuery(api.users.users.getSignupAt)

  useEffect(() => {
    // `undefined` is the query still in flight; `null` is a signed-out or
    // brand-new account with no preferences row yet. Neither is an open worth
    // counting, and guessing at one would pad the day-zero column.
    if (typeof signupAt !== "number") return

    trackAppOpen(signupAt)

    let dispose: (() => void) | undefined
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) trackAppOpen(signupAt)
    }).then((handle) => {
      dispose = () => void handle.remove()
    })

    // The web build has no Capacitor bridge; visibility is the same signal.
    function onVisible() {
      if (document.visibilityState === "visible") trackAppOpen(signupAt)
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      dispose?.()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [signupAt])

  return null
}
