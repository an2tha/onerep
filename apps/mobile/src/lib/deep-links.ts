/**
 * `onerep://` deep links.
 *
 * Widgets, the iOS Live Activity, and the Android ongoing notification all open
 * the app through this scheme. Until now nothing listened for it: the round trip
 * worked only because Capacitor's default URL handling happened to leave the
 * query string on the WebView's location, which is incidental on iOS and does
 * not hold on Android at all.
 */

/** Hosts owned by the auth flow; `src/lib/auth-redirects.ts` handles those. */
const RESERVED_HOSTS = new Set(["auth"])

const ROUTES: Record<string, string> = {
  today: "/",
  workout: "/workout/active",
  workouts: "/workouts",
  nutrition: "/nutrition",
  progress: "/progress",
  coach: "/coach",
  settings: "/settings",
  shared: "/shared",
}

/** Hosts whose subpath is meaningful, e.g. onerep://shared/accept?token=…. */
const SUBPATH_HOSTS = new Set(["shared"])

/**
 * Maps a deep link to an in-app path, preserving the query string.
 *
 * Returns null for anything unrecognised or reserved, so an unknown link is a
 * no-op rather than a navigation to a 404.
 */
export function deepLinkToPath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== "onerep:") return null

  // "onerep://workout?x=1" parses with hostname "workout"; some platforms hand
  // back "onerep:/workout" instead, where the value lands in pathname.
  const raw = parsed.hostname
    ? `${parsed.hostname}${parsed.pathname}`
    : parsed.pathname.replace(/^\/+/, "")
  const [host, ...restParts] = raw.split("/").filter(Boolean)
  if (!host || RESERVED_HOSTS.has(host)) return null

  const route = ROUTES[host]
  if (!route) return null

  const rest =
    SUBPATH_HOSTS.has(host) && restParts.length > 0
      ? `/${restParts.join("/")}`
      : ""

  return `${route}${rest}${parsed.search}`
}
