import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { registerForCoachPush } from "@/lib/coach-push"
import { logDevWarn } from "@/lib/utils"

/**
 * Whether some surface has since decided the permission dialog is warranted,
 * and the hook the mounted component leaves behind so it can be told.
 *
 * A module-level pair rather than context because the callers are a page and a
 * settings toggle that have no business knowing this component exists, and
 * because the answer has to survive the component not being mounted yet on a
 * cold start into Coach.
 */
let promptRequested = false
let notifyPromptRequested: (() => void) | null = null

/**
 * Ask for the notification permission, now, from a surface that has earned it.
 *
 * Call this only where the user has just demonstrated they want the thing
 * notifications are for. Everywhere else, do nothing and let the launch path
 * register silently.
 */
export function promptForCoachPush() {
  promptRequested = true
  notifyPromptRequested?.()
}

/**
 * Registers this device for Coach's outbound messages, once per session.
 *
 * Registration is deliberately downstream of the user's own switch: a person
 * who has turned outreach off is never asked for the notification permission,
 * because a permission prompt for a channel we have promised not to use is
 * both rude and a good way to get denied for the ones we do.
 *
 * The same reasoning, taken one step further, is why this no longer prompts at
 * all. On a first launch it runs silently — attaching listeners and picking up
 * the token of anyone who already granted permission on another install — and
 * the dialog waits for `promptForCoachPush()`. There are two callers, and both
 * are moments where the user has just said what they want out loud: opening
 * Coach, and turning outreach on in Settings.
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
  const [prompt, setPrompt] = useState(promptRequested)
  /** The strongest attempt made so far, so the silent pass runs at most once. */
  const attemptedRef = useRef<"none" | "silent" | "prompt">("none")

  // Absent preferences mean the server-side defaults, which have outreach on.
  const outreachEnabled = preferences?.coachOutreach?.enabled ?? true

  useEffect(() => {
    notifyPromptRequested = () => setPrompt(true)
    return () => {
      notifyPromptRequested = null
    }
  }, [])

  useEffect(() => {
    if (!user || !preferences || !outreachEnabled) return

    const attempt = prompt ? "prompt" : "silent"
    // A silent pass already happened; only an escalation to the dialog is
    // worth a second run.
    if (attemptedRef.current === attempt || attemptedRef.current === "prompt") {
      return
    }
    attemptedRef.current = attempt

    void registerForCoachPush({
      prompt,
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
  }, [outreachEnabled, preferences, prompt, registerToken, user])

  return null
}
