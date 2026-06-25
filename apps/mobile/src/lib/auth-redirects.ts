const DEFAULT_APP_URL = "https://app.onerep.life"
const PENDING_VERIFICATION_EMAIL_KEY = "onerep:pending-verification-email"
const PENDING_VERIFICATION_NEXT_KEY = "onerep:pending-verification-next"

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

export function getAppOrigin() {
  const configured = import.meta.env.VITE_APP_URL as string | undefined

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

export function rememberPendingVerification(email: string, next?: string) {
  if (typeof window === "undefined") return

  window.sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, email)
  if (next) {
    window.sessionStorage.setItem(PENDING_VERIFICATION_NEXT_KEY, next)
  } else {
    window.sessionStorage.removeItem(PENDING_VERIFICATION_NEXT_KEY)
  }
}

export function getPendingVerification() {
  if (typeof window === "undefined") return { email: "", next: "" }

  return {
    email: window.sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) ?? "",
    next: window.sessionStorage.getItem(PENDING_VERIFICATION_NEXT_KEY) ?? "",
  }
}

export function clearPendingVerification() {
  if (typeof window === "undefined") return

  window.sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY)
  window.sessionStorage.removeItem(PENDING_VERIFICATION_NEXT_KEY)
}
