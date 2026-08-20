/**
 * What this bundle actually is, from the stamp the build wrote.
 *
 * `VITE_BUNDLE_VERSION` is only set for release builds, so reading it alone
 * reports "0.0.0" for everything else — a version number that names no build
 * and helps nobody. `version.json` is emitted next to the assets by the same
 * plugin and also carries the commit and the build time, which is what
 * identifies an unversioned build.
 */
export type BuildInfo = {
  version: string
  commit: string
  builtAt: string
}

const UNSTAMPED_VERSION = "0.0.0"

let cached: Promise<BuildInfo | null> | null = null

export function isStampedVersion(version: string | null | undefined) {
  return Boolean(version) && version !== UNSTAMPED_VERSION
}

/** Short form for display: `a1b2c3d` from a full sha, or "" when unknown. */
export function shortCommit(commit: string | null | undefined) {
  if (!commit || commit === "unknown") return ""
  return commit.slice(0, 7)
}

export function formatBuiltAt(builtAt: string | null | undefined) {
  if (!builtAt) return ""
  const date = new Date(builtAt)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export async function loadBuildInfo(): Promise<BuildInfo | null> {
  if (cached) return cached
  cached = (async () => {
    try {
      // Anchored to the app's base rather than the current route: a plain
      // relative fetch from /foods/recipe/new asks for
      // /foods/recipe/version.json. BASE_URL keeps a self-hosted subpath
      // deployment working too.
      const base = import.meta.env.BASE_URL || "/"
      const response = await fetch(
        `${base.endsWith("/") ? base : `${base}/`}version.json`,
        { cache: "no-store" }
      )
      if (!response.ok) return null
      const body = (await response.json()) as Partial<BuildInfo>
      if (typeof body.version !== "string") return null
      return {
        version: body.version,
        commit: typeof body.commit === "string" ? body.commit : "unknown",
        builtAt: typeof body.builtAt === "string" ? body.builtAt : "",
      }
    } catch {
      // A dev server never emits the stamp. That is itself the answer.
      return null
    }
  })()
  return cached
}

/** Exported for tests. */
export function resetBuildInfoCache() {
  cached = null
}
