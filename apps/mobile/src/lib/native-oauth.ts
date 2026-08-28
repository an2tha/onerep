/**
 * OAuth on the native shells.
 *
 * Google refuses to serve its consent screen inside an embedded WebView, which
 * is exactly what a Capacitor app is: the sign-in that works in a browser comes
 * back as `disallowed_useragent` on a phone. So the provider has to open in the
 * system browser (a Custom Tab on Android, SFSafariViewController on iOS) and
 * hand back through the `onerep://auth` scheme the shells already claim.
 *
 * The session then has to cross that gap. Better Auth's cross-domain plugin
 * appends a one-time token to the callback, and on the web
 * `ConvexBetterAuthProvider` reads it off `window.location` as it mounts. That
 * never fires here — the deep link arrives long after mount, in a URL the
 * WebView never navigates to — so `completeNativeOAuth` performs the same
 * exchange by hand.
 */

import { Browser } from "@capacitor/browser"
import { Capacitor } from "@capacitor/core"
import { authClient } from "@/lib/auth-client"
import { OAuthSession } from "@/lib/oauth-session-plugin"

/**
 * Logged at every level, not just in development. Sign-in failing on someone
 * else's phone is exactly the case that never reproduces here, and a
 * self-hosted install has no other way to tell us what happened.
 */
function log(message: string, detail?: unknown) {
  console.info(`[oauth] ${message}`, detail ?? "")
}

/** Matches `getNativeAppOrigin` in `auth-redirects.ts`. */
const AUTH_HOST = "auth"
const DEFAULT_SCHEME = "onerep"

/** The scheme half of the same callback URL, without the `://auth`. */
function callbackScheme() {
  const configured = import.meta.env.VITE_CAPACITOR_URL_SCHEME as
    | string
    | undefined
  return (configured || DEFAULT_SCHEME).replace(/:\/*$/, "")
}

type CrossDomainClient = {
  crossDomain: {
    oneTimeToken: {
      verify(options: { token: string }): Promise<{
        data?: { session?: { token: string } } | null
      }>
    }
  }
  updateSession(): void
}

export function isNativeOAuthPlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Opens the provider outside the WebView.
 *
 * iOS goes through `ASWebAuthenticationSession`, which is handed the callback
 * scheme up front and so can catch the `onerep://auth/...` redirect itself.
 * An `SFSafariViewController` — what `Browser.open` gives us — cannot: it has
 * no callback contract, refuses to follow a redirect out to a custom scheme,
 * and leaves the sheet parked on a dead page while the app waits for an
 * `appUrlOpen` that never comes. Apple's `response_mode=form_post` makes that
 * a blank white screen; Google just hangs.
 *
 * Android keeps the Custom Tab, which resolves `onerep://` through the
 * manifest's intent filter and delivers the deep link on its own.
 *
 * Resolves once the flow is done, not once the browser is up.
 */
export async function openNativeOAuth(url: string): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") {
    await Browser.open({ url, presentationStyle: "popover" })
    return
  }

  const result = await OAuthSession.start({
    url,
    callbackScheme: callbackScheme(),
  })
  if (result.cancelled) {
    log("sheet dismissed before the provider answered")
    return
  }
  if (!result.url) {
    log("session ended with no callback url")
    return
  }

  await finishNativeOAuth(result.url)
}

/**
 * Redeems the callback and lands on the screen it points at.
 *
 * A full load rather than `router.navigate`: the session now lives in
 * localStorage, and booting the app is what reliably picks it up. Nudging the
 * in-place session signal leaves Convex unauthenticated, because nothing in
 * this WebView ever navigated.
 */
export async function finishNativeOAuth(url: string): Promise<void> {
  const authPath = await completeNativeOAuth(url)
  if (authPath) window.location.replace(authPath)
}

/** True for the callbacks this module owns, so other deep links fall through. */
export function isAuthDeepLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "onerep:") return false
    const host = parsed.hostname || parsed.pathname.replace(/^\/+/, "")
    return host.split("/")[0] === AUTH_HOST
  } catch {
    return false
  }
}

/**
 * Finishes a native OAuth round trip and returns the in-app path to land on,
 * or null if the link was not ours.
 *
 * Redeeming the token before navigating matters: `/sso-callback` waits on the
 * session, so arriving there unauthenticated bounces the user back to login.
 */
export async function completeNativeOAuth(url: string): Promise<string | null> {
  if (!isAuthDeepLink(url)) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // The Custom Tab stays on screen over the app until it is told to go.
  void Browser.close().catch(() => undefined)

  const token = parsed.searchParams.get("ott")
  log("callback received", {
    host: parsed.hostname,
    path: parsed.pathname,
    params: [...parsed.searchParams.keys()],
    hasToken: Boolean(token),
  })
  if (token) {
    try {
      const client = authClient as unknown as CrossDomainClient
      const result = await client.crossDomain.oneTimeToken.verify({ token })
      const session = result.data?.session
      if (session) {
        // Seeds the cross-domain client's localStorage cookie from the
        // response headers, which is what every later request reads.
        await authClient.getSession({
          fetchOptions: {
            headers: { Authorization: `Bearer ${session.token}` },
          },
        })
        client.updateSession()
        log("session established")
      } else {
        log("token verified but carried no session", result)
      }
    } catch (error) {
      console.error("[oauth] token exchange failed", error)
    }
  }

  const host = parsed.hostname || parsed.pathname.replace(/^\/+/, "")
  const rest = parsed.hostname
    ? parsed.pathname
    : `/${host.split("/").slice(1).join("/")}`
  const path = rest.replace(/^\/+/, "")

  parsed.searchParams.delete("ott")
  const query = parsed.searchParams.toString()

  return `/${path}${query ? `?${query}` : ""}`
}
