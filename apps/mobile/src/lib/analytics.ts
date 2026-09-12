type UmamiClient = {
  track: (event: string, data?: Record<string, unknown>) => unknown
}

declare global {
  interface Window {
    umami?: UmamiClient
  }
}

/**
 * Umami property values are truncated server-side, and anything that looks like
 * a name, an email or free text the user typed has no business leaving the
 * device. So: primitives only, strings clipped, everything else dropped.
 */
function sanitizeUmamiData(properties: Record<string, unknown>) {
  const data: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue
    if (typeof value === "string") data[key] = value.slice(0, 100)
    else if (typeof value === "number" && Number.isFinite(value))
      data[key] = value
    else if (typeof value === "boolean") data[key] = value
  }
  return data
}

/**
 * Fire an anonymous Umami event.
 *
 * Umami is cookieless and stores
 * no identifier, and the privacy policy lists it as the non-optional usage
 * analytics that runs on every visit. The hard rule is that
 * the one that follows a person around. The price of that is a hard rule:
 * nothing identifying may be passed in `properties`. Counts, buckets, enums.
 *
 * The script is loaded `defer` from a self-hosted host that a blocker will
 * happily eat, so `window.umami` may never appear. That is fine and silent.
 */
export function trackUmami(
  event: string,
  properties?: Record<string, unknown>
) {
  if (typeof window === "undefined") return false
  const umami = window.umami
  if (!umami?.track) return false
  try {
    umami.track(event, properties ? sanitizeUmamiData(properties) : undefined)
    return true
  } catch {
    return false
  }
}

/**
 * Collapses a live path back to its route pattern: `/foods/review/j57x…`
 * becomes `/foods/review/:id`.
 *
 * Umami's tracker patches `pushState` and logs every client route change on its
 * own, which means the raw URL — document ids and all — is what lands in the
 * pageview table. Nothing can be done about that from here, but a screen event
 * keyed on the pattern gives numbers that are actually groupable.
 */
export function routePattern(
  pathname: string,
  params: Record<string, string | undefined>
) {
  let pattern = pathname
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue
    pattern = pattern.replace(`/${value}`, `/:${key}`)
  }
  return pattern || "/"
}

/**
 * The single feature-event boundary for anonymous Umami counts.
 */
export function captureFeatureUsage(
  event: string,
  properties?: Record<string, unknown>
) {
  return trackUmami(event, properties)
}

export function durationBucket(seconds: number) {
  if (seconds < 15 * 60) return "under_15m"
  if (seconds < 30 * 60) return "15_to_29m"
  if (seconds < 60 * 60) return "30_to_59m"
  return "60m_plus"
}

/** Keeps allowance numbers out of the payload while still showing the shape. */
export function usageBucket(remaining: number, limit: number) {
  if (limit <= 0) return "unlimited"
  if (remaining <= 0) return "spent"
  const share = remaining / limit
  if (share <= 0.1) return "under_10pct"
  if (share <= 0.5) return "under_50pct"
  return "over_50pct"
}
