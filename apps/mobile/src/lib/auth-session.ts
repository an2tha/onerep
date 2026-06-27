import type { NavigateOptions, To } from "react-router"

type Navigate = (to: To, options?: NavigateOptions) => void | Promise<void>
type SignOut = () => void | Promise<void>

const LOGIN_PATH = "/login"
const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"
const LOCAL_STORAGE_PREFIXES_TO_CLEAR = ["onerep:", "onerep_", "convex:"]
const LOCAL_STORAGE_KEYS_TO_CLEAR = new Set(["theme"])

let authRedirectInFlight = false

function hasStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message)
  }
  return String(error)
}

export function isUnauthenticatedError(error: unknown) {
  const text = getErrorText(error)
  return /\bUnauthenticated\b/i.test(text)
}

export function clearLocalStorageCache() {
  if (!hasStorage()) return

  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key) keys.push(key)
  }

  for (const key of keys) {
    if (
      LOCAL_STORAGE_KEYS_TO_CLEAR.has(key) ||
      LOCAL_STORAGE_PREFIXES_TO_CLEAR.some((prefix) => key.startsWith(prefix))
    ) {
      localStorage.removeItem(key)
    }
  }
}

export function clearUnauthenticatedLocalState() {
  clearLocalStorageCache()

  if (!hasStorage()) return
  localStorage.setItem(PRELOGIN_SEEN_KEY, "true")
}

function getGlobalSignOut(): SignOut | undefined {
  if (typeof window === "undefined") return undefined
  const maybeClerk = (
    window as typeof window & {
      Clerk?: { signOut?: SignOut }
    }
  ).Clerk
  return maybeClerk?.signOut?.bind(maybeClerk)
}

async function clearAuthClientSession(signOut?: SignOut) {
  const clearSession = signOut ?? getGlobalSignOut()
  if (!clearSession) return

  try {
    await clearSession()
  } catch (error) {
    console.warn(
      "Failed to sign out auth client after unauthenticated error",
      error
    )
  }
}

function redirectToLogin(navigate?: Navigate) {
  if (navigate) {
    void navigate(LOGIN_PATH, { replace: true })
    return
  }

  if (typeof window === "undefined") return
  if (window.location.pathname === LOGIN_PATH) return

  window.location.replace(LOGIN_PATH)
}

export async function handleUnauthenticatedSession(options?: {
  navigate?: Navigate
  signOut?: SignOut
}) {
  if (authRedirectInFlight) return
  authRedirectInFlight = true

  clearUnauthenticatedLocalState()
  await clearAuthClientSession(options?.signOut)
  redirectToLogin(options?.navigate)
}
