/**
 * Remote push registration.
 *
 * Distinct from `reminders.ts`, which schedules local notifications from a
 * clock the user set. This is the channel the server uses to start a
 * conversation, and it exists only because a coach who waits to be opened is
 * not a coach.
 *
 * Everything here degrades to a no-op: on web, without the plugin, without
 * permission, or when the token never arrives. A build with no push
 * configuration should behave like a build with no push, and the weekly review
 * still surfaces as a moment on next open regardless.
 */

import { Capacitor } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { ensureNotificationChannels } from "./notification-channels"

export type PushRegistrationOutcome =
  | "registered"
  | "denied"
  | "unsupported"
  | "failed"

/** Where a tapped notification should land, by the link the server sent. */
export const PUSH_LINK_ROUTES: Record<string, string> = {
  "onerep://coach/review": "/coach?review=1",
  "onerep://coach": "/coach",
  "onerep://workouts": "/workouts",
  "onerep://log": "/",
}

export function routeForPushLink(link: unknown): string | null {
  return typeof link === "string" ? (PUSH_LINK_ROUTES[link] ?? null) : null
}

/**
 * Read inside the function rather than into a module-scope const: the platform
 * is not knowable at import time in tests, and a frozen answer there is how a
 * mocked plugin ends up ignored.
 */
function pushSupported() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications")
}

/** Set once listeners are attached, so a re-render does not double-subscribe. */
let listenersAttached = false

/**
 * The token this install last registered, kept so sign-out can revoke it.
 * A token left behind is a phone that keeps getting coached for an account
 * somebody walked away from.
 */
let lastRegisteredToken: string | null = null

export function registeredPushToken() {
  return lastRegisteredToken
}

/**
 * Ask for permission, register with the platform, and hand the token over.
 *
 * The token arrives asynchronously on the `registration` event rather than
 * from `register()`, so the caller supplies what to do with it and this
 * resolves as soon as registration has been *requested* successfully.
 */
export async function registerForCoachPush({
  onToken,
  onTapped,
}: {
  onToken: (token: string, platform: "ios" | "android") => void | Promise<void>
  onTapped?: (link: string | null) => void
}): Promise<PushRegistrationOutcome> {
  if (!pushSupported()) return "unsupported"

  try {
    await ensureNotificationChannels()

    // Listeners first, permission second. A tap on a notification that cold
    // started the app can fire before requestPermissions resolves, and an
    // unattached listener at that moment is a lost navigation.
    if (!listenersAttached) {
      listenersAttached = true
      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android"

      await PushNotifications.addListener("registration", (token) => {
        lastRegisteredToken = token.value
        void onToken(token.value, platform)
      })

      await PushNotifications.addListener("registrationError", (error) => {
        // Nothing to retry against — APNs/FCM will re-issue on next launch.
        console.warn("Push registration failed", error)
      })

      if (onTapped) {
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const link = action.notification.data?.link
            onTapped(routeForPushLink(link))
          }
        )
      }
    }

    const existing = await PushNotifications.checkPermissions()
    const permission =
      existing.receive === "prompt" || existing.receive === "prompt-with-rationale"
        ? await PushNotifications.requestPermissions()
        : existing
    if (permission.receive !== "granted") return "denied"

    await PushNotifications.register()
    return "registered"
  } catch (error) {
    console.warn("Push registration unavailable", error)
    return "failed"
  }
}

/** Best-effort teardown on sign-out. A stale token is somebody else's coach. */
export async function unregisterForCoachPush() {
  if (!pushSupported()) return
  try {
    await PushNotifications.removeAllListeners()
    listenersAttached = false
    lastRegisteredToken = null
  } catch (error) {
    console.warn("Push teardown failed", error)
  }
}
