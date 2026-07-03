import { useEffect, useState } from "react"
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { createAuthClient } from "better-auth/react"

const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined
const AUTH_LOAD_TIMEOUT_MS = 6500

export const authServiceConfigured = Boolean(convexSiteUrl)

export const authClient = createAuthClient({
  baseURL:
    convexSiteUrl ??
    (typeof window !== "undefined" ? window.location.origin : undefined),
  plugins: [
    convexClient(),
    crossDomainClient({
      storagePrefix: "onerep-auth",
    }),
  ],
})
export const providerAuthClient = authClient as unknown as AuthClient

export function betterAuthErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: unknown
      statusText?: unknown
      error?: { message?: unknown }
    }
    const message =
      maybeError.error?.message ?? maybeError.message ?? maybeError.statusText
    if (typeof message === "string" && message.length > 0) return message
  }
  return fallback
}

export function useAppAuth() {
  const session = authClient.useSession()
  const [loadTimedOut, setLoadTimedOut] = useState(false)

  useEffect(() => {
    if (!authServiceConfigured || !session.isPending) {
      setLoadTimedOut(false)
      return
    }

    const timeout = window.setTimeout(
      () => setLoadTimedOut(true),
      AUTH_LOAD_TIMEOUT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [session.isPending])

  return {
    authLoadTimedOut: loadTimedOut,
    authServiceConfigured,
    authServiceError:
      !authServiceConfigured
        ? "Authentication is not configured for this build."
        : loadTimedOut
          ? "Authentication is taking too long to respond. Check your connection and try again."
          : null,
    isLoaded: !session.isPending || loadTimedOut || !authServiceConfigured,
    isSignedIn: Boolean(session.data?.session),
    userId: session.data?.user?.id ?? null,
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,
  }
}

export async function signOutApp() {
  await authClient.signOut({})
}
