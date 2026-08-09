import { useEffect, useRef } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { registerForCoachPush } from "@/lib/coach-push"
import { logDevWarn } from "@/lib/utils"

/**
 * Registers this device for Coach's outbound messages, once per session.
 *
 * Registration is deliberately downstream of the user's own switch: a person
 * who has turned outreach off is never asked for the notification permission,
 * because a permission prompt for a channel we have promised not to use is
 * both rude and a good way to get denied for the ones we do.
 *
 * Everything here is best-effort. No token, no permission, or no plugin means
 * the weekly review still exists server-side and still appears as a moment the
 * next time the app opens.
 */
export function CoachPushRegistration() {
  const { user } = useAppAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    user ? {} : "skip"
  )
  const registerToken = useMutation(api.push.tokens.register)
  const attemptedRef = useRef(false)

  // Absent preferences mean the server-side defaults, which have outreach on.
  const outreachEnabled = preferences?.coachOutreach?.enabled ?? true

  useEffect(() => {
    if (!user || !preferences || !outreachEnabled) return
    if (attemptedRef.current) return
    attemptedRef.current = true

    void registerForCoachPush({
      onToken: async (token, platform) => {
        try {
          await registerToken({ token, platform })
        } catch (error) {
          logDevWarn("Failed to store push token", error)
        }
      },
      onTapped: (route) => {
        // A full navigation rather than the router: the tap may have cold
        // started the app, in which case the router is not mounted yet.
        if (route) window.location.assign(route)
      },
    })
  }, [outreachEnabled, preferences, registerToken, user])

  return null
}
