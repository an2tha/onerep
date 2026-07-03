import type { NavigateOptions, To } from "react-router"
import {
  browserLocalStorage,
  logDevWarn,
  safeLocalStorageSet,
  safeStorageKeys,
} from "@/lib/utils"

type Navigate = (to: To, options?: NavigateOptions) => void | Promise<void>
type SignOut = () => void | Promise<void>

const LOGIN_PATH = "/login"
const PRELOGIN_SEEN_KEY = "onerep:prelogin-onboarding-seen"
const LOCAL_STORAGE_PREFIXES_TO_CLEAR = [
  "onerep:",
  "onerep_",
  "convex:",
  "onerep-auth_",
  "better-auth_",
]
const LOCAL_STORAGE_KEYS_TO_CLEAR = new Set(["theme"])
const AUTH_REDIRECT_COOLDOWN_MS = 2_000
const APP_ORIGIN_FOR_PATHS = "https://app.onerep.local"

let authRedirectInFlight = false
let lastAuthRedirectAt = 0
let lastAuthRedirectTarget = ""

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
  const storage = browserLocalStorage()
  if (!storage) return

  for (const key of safeStorageKeys(storage)) {
    if (
      LOCAL_STORAGE_KEYS_TO_CLEAR.has(key) ||
      LOCAL_STORAGE_PREFIXES_TO_CLEAR.some((prefix) => key.startsWith(prefix))
    ) {
      try {
        storage.removeItem(key)
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

export function clearUnauthenticatedLocalState() {
  clearLocalStorageCache()
  safeLocalStorageSet(PRELOGIN_SEEN_KEY, "true")
}

export function safeAuthRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/"

  try {
    const parsed = new URL(value, APP_ORIGIN_FOR_PATHS)
    if (parsed.origin !== APP_ORIGIN_FOR_PATHS) return "/"
    if (parsed.pathname === LOGIN_PATH || parsed.pathname === "/sso-callback") {
      return "/"
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/"
  }
}

function currentAuthRedirectPath() {
  if (typeof window === "undefined") return "/"
  return safeAuthRedirectPath(
    `${window.location.pathname}${window.location.search ?? ""}${window.location.hash ?? ""}`
  )
}

export function loginPathForAuthRedirect(next = currentAuthRedirectPath()) {
  const safeNext = safeAuthRedirectPath(next)
  return safeNext === LOGIN_PATH || safeNext === "/"
    ? LOGIN_PATH
    : `${LOGIN_PATH}?next=${encodeURIComponent(safeNext)}`
}

function getGlobalSignOut(): SignOut | undefined {
  if (typeof window === "undefined") return undefined
  const maybeAuth = (
    window as typeof window & {
      __onerepSignOut?: SignOut
    }
  ).__onerepSignOut
  return maybeAuth
}

async function clearAuthClientSession(signOut?: SignOut) {
  const clearSession = signOut ?? getGlobalSignOut()
  if (!clearSession) return

  try {
    await clearSession()
  } catch (error) {
    logDevWarn(
      "Failed to sign out auth client after unauthenticated error",
      error
    )
  }
}

function redirectToLogin(loginPath: string, navigate?: Navigate) {
  if (navigate) {
    void navigate(loginPath, { replace: true })
    return
  }

  if (typeof window === "undefined") return
  if (window.location.pathname === LOGIN_PATH) return

  window.location.replace(loginPath)
}

export async function handleUnauthenticatedSession(options?: {
  navigate?: Navigate
  signOut?: SignOut
}) {
  const now = Date.now()
  const loginPath = loginPathForAuthRedirect()
  if (
    now - lastAuthRedirectAt < AUTH_REDIRECT_COOLDOWN_MS &&
    loginPath === lastAuthRedirectTarget
  ) {
    return
  }
  if (authRedirectInFlight) return
  authRedirectInFlight = true

  try {
    clearUnauthenticatedLocalState()
    await clearAuthClientSession(options?.signOut)
    redirectToLogin(loginPath, options?.navigate)
  } finally {
    lastAuthRedirectTarget = loginPath
    lastAuthRedirectAt = Date.now()
    authRedirectInFlight = false
  }
}
