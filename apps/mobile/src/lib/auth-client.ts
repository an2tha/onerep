import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { createAuthClient } from "better-auth/react"

const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined

if (!convexSiteUrl) {
  throw new Error("Missing VITE_CONVEX_SITE_URL")
}

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
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
  return {
    isLoaded: !session.isPending,
    isSignedIn: Boolean(session.data?.session),
    userId: session.data?.user?.id ?? null,
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,
  }
}

export async function signOutApp() {
  await authClient.signOut({})
}
