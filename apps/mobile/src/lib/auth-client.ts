import { useEffect, useState } from "react"
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { createAuthClient } from "better-auth/react"
import { resolveConvexSiteUrl } from "@/lib/service-urls"

const convexSiteUrl = resolveConvexSiteUrl(
  import.meta.env.VITE_CONVEX_SITE_URL,
  import.meta.env.VITE_CONVEX_URL
)
const AUTH_LOAD_TIMEOUT_MS = 6500

export const authServiceConfigured = Boolean(convexSiteUrl)

export const authClient = createAuthClient({
  baseURL: convexSiteUrl ?? "https://onerep-auth-unconfigured.invalid",
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

export function isEmailNotVerifiedError(error: unknown) {
  if (typeof error !== "object" || error === null) return false

  const candidate = error as {
    code?: unknown
    message?: unknown
    status?: unknown
    statusCode?: unknown
    error?: { code?: unknown; message?: unknown; status?: unknown }
  }
  const code = candidate.error?.code ?? candidate.code
  const message = candidate.error?.message ?? candidate.message
  const status =
    candidate.error?.status ?? candidate.statusCode ?? candidate.status

  return (
    code === "EMAIL_NOT_VERIFIED" ||
    (status === 403 &&
      typeof message === "string" &&
      message.toLowerCase().includes("email not verified"))
  )
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
    authServiceError: !authServiceConfigured
      ? "Sign-in is unavailable right now. Your data on this device is safe. Try again shortly, and contact support if it continues."
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

/**
 * Which social providers the deployment has credentials for. Read over plain
 * HTTP rather than a Convex query because the Convex client holds queries
 * until a session exists, and the login screen has none.
 */
export function useSocialProviders() {
  const [providers, setProviders] = useState<{ google: boolean } | null>(null)

  useEffect(() => {
    if (!convexSiteUrl) return

    const controller = new AbortController()
    fetch(`${convexSiteUrl}/auth-providers`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setProviders({ google: data.google === true })
      })
      .catch(() => {
        // Offline or unreachable: the social buttons stay hidden and email
        // sign-in still works.
      })

    return () => controller.abort()
  }, [])

  return providers
}

export async function signOutApp() {
  await authClient.signOut({})
}
