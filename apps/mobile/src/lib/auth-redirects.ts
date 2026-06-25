const DEFAULT_APP_URL = "https://app.onerep.life"

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
