import { resolveConvexSiteUrl } from "./service-urls"

/**
 * Runtime server override. The app is built against one Convex deployment
 * (the hosted service, via VITE_* vars), but a self-hoster can point this
 * same build at their own install by entering its address. The choice lives
 * in localStorage because the Convex and auth clients are module-scope
 * singletons — applying a change means a full reload.
 */
const STORAGE_KEY = "onerep:server-override"
const AUTH_STORAGE_PREFIX = "onerep-auth"

export type ServerTarget = {
  /** What the user typed, kept for display and re-editing. */
  input: string
  convexUrl: string
  convexSiteUrl: string
}

/**
 * Accepts what a self-hoster would realistically paste: a bare IP or
 * hostname (`192.168.1.42`), host with port, or a full URL. Self-hosted
 * Convex serves the client API on 3210 and HTTP actions on the next port
 * up (3211), so one address is enough to derive both. A `*.convex.cloud`
 * URL works too and maps to its `.convex.site` twin.
 */
export function normalizeServerInput(raw: string): ServerTarget | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // An explicit non-http scheme (ftp://, ws://) must fail outright rather
  // than get an http:// prefix stacked on top and parse as host "ftp".
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) return null
  const withScheme = schemeMatch ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!url.hostname) return null

  if (url.hostname.endsWith(".convex.cloud")) {
    const convexUrl = url.origin
    const convexSiteUrl = resolveConvexSiteUrl(undefined, convexUrl)
    if (!convexSiteUrl) return null
    return { input: trimmed, convexUrl, convexSiteUrl }
  }

  const cloudPort = url.port ? Number(url.port) : 3210
  if (!Number.isInteger(cloudPort) || cloudPort < 1 || cloudPort > 65534) {
    return null
  }

  const host = `${url.protocol}//${url.hostname}`
  return {
    input: trimmed,
    convexUrl: `${host}:${cloudPort}`,
    convexSiteUrl: `${host}:${cloudPort + 1}`,
  }
}

function readStoredOverride(): ServerTarget | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { input?: unknown }
    if (typeof parsed.input !== "string") return null
    return normalizeServerInput(parsed.input)
  } catch {
    return null
  }
}

/** Read once at startup — everything downstream is a singleton anyway. */
export const serverOverride = readStoredOverride()

/** The deployment this build shipped with, before any override. */
export const defaultConvexUrl = import.meta.env.VITE_CONVEX_URL as
  string | undefined

export function defaultServerHostname(): string | null {
  if (!defaultConvexUrl) return null
  try {
    return new URL(defaultConvexUrl).hostname
  } catch {
    return null
  }
}

/**
 * A session token minted by one server is meaningless on another, and a
 * stale one makes the login screen sit in "finishing sign-in" limbo. Drop
 * the auth client's storage whenever the target changes.
 */
function clearAuthStorage() {
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(AUTH_STORAGE_PREFIX)) doomed.push(key)
    }
    doomed.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Storage unavailable means there was no session to clear either.
  }
}

/** Persist a custom server and reload into it. Returns false on bad input. */
export function applyServerOverride(rawInput: string): boolean {
  const target = normalizeServerInput(rawInput)
  if (!target) return false
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ input: target.input })
    )
  } catch {
    return false
  }
  clearAuthStorage()
  window.location.reload()
  return true
}

/** Back to the build's default server, with a reload. */
export function clearServerOverride() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored, nothing to do.
  }
  clearAuthStorage()
  window.location.reload()
}
