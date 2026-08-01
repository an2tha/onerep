export type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => unknown
}

type ConsentStore = { getItem: (key: string) => string | null }

export function analyticsConsentEnabled(store?: ConsentStore) {
  const consentStore =
    store ?? (typeof window !== "undefined" ? window.localStorage : undefined)
  if (!consentStore) return false
  try {
    return consentStore.getItem("onerep:analytics-enabled") === "true"
  } catch {
    return false
  }
}

/** The single capture boundary: opt-out is enforced before touching PostHog. */
export function captureFeatureUsage(
  client: AnalyticsClient | undefined,
  event: string,
  properties?: Record<string, unknown>,
  store?: ConsentStore
) {
  if (!client || !analyticsConsentEnabled(store)) return false
  client.capture(event, properties)
  return true
}

export function durationBucket(seconds: number) {
  if (seconds < 15 * 60) return "under_15m"
  if (seconds < 30 * 60) return "15_to_29m"
  if (seconds < 60 * 60) return "30_to_59m"
  return "60m_plus"
}

