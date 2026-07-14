export function absoluteHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}

export function resolveConvexSiteUrl(
  explicitSiteUrl: unknown,
  deploymentUrl: unknown
): string | undefined {
  const explicit = absoluteHttpUrl(explicitSiteUrl)
  if (explicit) return explicit

  const deployment = absoluteHttpUrl(deploymentUrl)
  if (!deployment) return undefined
  try {
    const url = new URL(deployment)
    if (!url.hostname.endsWith(".convex.cloud")) return undefined
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site")
    return url.toString().replace(/\/$/, "")
  } catch {
    return undefined
  }
}
