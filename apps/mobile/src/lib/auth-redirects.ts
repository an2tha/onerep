import {
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/utils"
import { Capacitor } from "@capacitor/core"

const DEFAULT_APP_URL = "https://app.onerep.life"
const DEFAULT_NATIVE_SCHEME = "onerep"
const PENDING_VERIFICATION_EMAIL_KEY = "onerep:pending-verification-email"
const PENDING_VERIFICATION_NEXT_KEY = "onerep:pending-verification-next"

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function getNativeAppOrigin() {
  const scheme =
    (import.meta.env.VITE_CAPACITOR_URL_SCHEME as string | undefined) ||
    DEFAULT_NATIVE_SCHEME

  return `${trimTrailingSlash(scheme.replace(/:\/+$/, ""))}://auth`
}

export function getAppOrigin() {
  const configured = import.meta.env.VITE_APP_URL as string | undefined

  if (Capacitor.isNativePlatform()) {
    return getNativeAppOrigin()
  }

  if (typeof window !== "undefined") {
    const { hostname, origin, protocol } = window.location
    const isHttpOrigin = protocol === "http:" || protocol === "https:"
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1"

    if (isHttpOrigin && (import.meta.env.DEV || !isLocalhost)) {
      return trimTrailingSlash(origin)
    }
  }

  return trimTrailingSlash(configured || DEFAULT_APP_URL)
}

export function getAuthCallbackUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${getAppOrigin()}${normalizedPath}`
}

/**
 * Where an OAuth provider drops the user back. Everything lands on
 * `/sso-callback` so one screen waits out the Better Auth to Convex handoff
 * before forwarding to `path`.
 */
export function getSocialCallbackUrl(
  path: string,
  options?: { isNewUser?: boolean }
) {
  const params = new URLSearchParams({ next: path, method: "google" })
  if (options?.isNewUser) params.set("new", "1")

  return getAuthCallbackUrl(`/sso-callback?${params.toString()}`)
}

export function getEmailVerificationCallbackUrl() {
  return getAuthCallbackUrl("/email-verified?source=email")
}

export function rememberPendingVerification(email: string, next?: string) {
  if (typeof window === "undefined") return

  safeSessionStorageSet(PENDING_VERIFICATION_EMAIL_KEY, email)
  if (next) {
    safeSessionStorageSet(PENDING_VERIFICATION_NEXT_KEY, next)
  } else {
    safeSessionStorageRemove(PENDING_VERIFICATION_NEXT_KEY)
  }
}

export function getPendingVerification() {
  if (typeof window === "undefined") return { email: "", next: "" }

  return {
    email: safeSessionStorageGet(PENDING_VERIFICATION_EMAIL_KEY) ?? "",
    next: safeSessionStorageGet(PENDING_VERIFICATION_NEXT_KEY) ?? "",
  }
}

export function clearPendingVerification() {
  if (typeof window === "undefined") return

  safeSessionStorageRemove(PENDING_VERIFICATION_EMAIL_KEY)
  safeSessionStorageRemove(PENDING_VERIFICATION_NEXT_KEY)
}
