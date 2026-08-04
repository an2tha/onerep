/**
 * Pure decision logic for over-the-air web bundle updates.
 *
 * Deliberately imports nothing: every rule that decides whether a device
 * installs a bundle is testable without mocking Capacitor or the network.
 * The runtime glue that talks to the plugin lives in ./ota.
 */

export type OtaPlatform = "ios" | "android"

export type OtaManifest = {
  schema: 1
  /** Semver of the web bundle, e.g. "1.0.482". */
  version: string
  /** Absolute https URL of the bundle zip, on the expected origin. */
  url: string
  /** sha256 of the zip, lowercase hex. */
  checksum: string
  /** Native shells older than this must not run this bundle. */
  minNativeVersion: string
  /** Optional upper bound, for pinning an old JS line to an old shell. */
  maxNativeVersion?: string
  commit?: string
  releasedAt?: string
  /** Apply immediately without waiting for the user to tap Update. */
  mandatory?: boolean
  /** Per-platform overrides, merged over the base fields. */
  platforms?: {
    ios?: Partial<OtaManifest>
    android?: Partial<OtaManifest>
  }
}

export type OtaSkipReason =
  | "up-to-date"
  | "older"
  | "native-too-old"
  | "native-too-new"
  | "invalid-manifest"
  | "already-staged"
  | "blocked"

export type OtaDecision =
  | {
      action: "download"
      version: string
      url: string
      checksum: string
      mandatory: boolean
    }
  | { action: "skip"; reason: OtaSkipReason }

const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function isSemver(value: unknown): value is string {
  return typeof value === "string" && SEMVER_PATTERN.test(value)
}

/**
 * Numeric-segment semver comparison. A string compare would rank "1.0.9"
 * above "1.0.10", which is exactly the case that breaks after ten releases.
 *
 * Build metadata (`+sha`) is ignored, per semver. A prerelease sorts below the
 * release it precedes ("1.0.0-rc.1" < "1.0.0").
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const split = (value: string) => {
    const withoutBuild = value.split("+")[0] ?? ""
    const [core = "", ...prereleaseParts] = withoutBuild.split("-")
    return {
      core: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prereleaseParts.join("-"),
    }
  }

  const left = split(a)
  const right = split(b)

  const length = Math.max(left.core.length, right.core.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.core[index] ?? 0
    const rightPart = right.core[index] ?? 0
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1
  }

  if (left.prerelease === right.prerelease) return 0
  // A missing prerelease outranks any present one.
  if (left.prerelease === "") return 1
  if (right.prerelease === "") return -1
  return left.prerelease > right.prerelease ? 1 : -1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validates and normalises a manifest fetched from the CDN.
 *
 * `expectedOrigin` is the only origin a bundle may be downloaded from. Pinning
 * it here means a tampered or spoofed manifest cannot repoint the plugin at an
 * attacker-controlled host, which is the one thing a manifest could otherwise
 * do that the native layer would happily obey.
 *
 * Returns null rather than throwing: an unparseable manifest is an ordinary
 * "keep running what you have" outcome, not an error path.
 */
export function parseOtaManifest(
  raw: unknown,
  platform: OtaPlatform,
  expectedOrigin: string
): OtaManifest | null {
  if (!isRecord(raw)) return null
  if (raw.schema !== 1) return null

  const platformOverride = isRecord(raw.platforms)
    ? raw.platforms[platform]
    : undefined
  const merged: Record<string, unknown> = {
    ...raw,
    ...(isRecord(platformOverride) ? platformOverride : {}),
  }

  if (!isSemver(merged.version)) return null
  if (!isSemver(merged.minNativeVersion)) return null
  if (
    merged.maxNativeVersion !== undefined &&
    !isSemver(merged.maxNativeVersion)
  ) {
    return null
  }

  if (
    typeof merged.checksum !== "string" ||
    !SHA256_HEX_PATTERN.test(merged.checksum)
  ) {
    return null
  }

  if (typeof merged.url !== "string") return null
  let parsedUrl: URL
  try {
    parsedUrl = new URL(merged.url)
  } catch {
    return null
  }
  if (parsedUrl.protocol !== "https:") return null

  let allowedOrigin: string
  try {
    allowedOrigin = new URL(expectedOrigin).origin
  } catch {
    return null
  }
  if (parsedUrl.origin !== allowedOrigin) return null

  return {
    schema: 1,
    version: merged.version,
    url: merged.url,
    checksum: merged.checksum,
    minNativeVersion: merged.minNativeVersion,
    ...(merged.maxNativeVersion === undefined
      ? {}
      : { maxNativeVersion: merged.maxNativeVersion as string }),
    ...(typeof merged.commit === "string" ? { commit: merged.commit } : {}),
    ...(typeof merged.releasedAt === "string"
      ? { releasedAt: merged.releasedAt }
      : {}),
    mandatory: merged.mandatory === true,
  }
}

/**
 * Decides what to do with a parsed manifest.
 *
 * Ordering matters: validity, then the native gate, then version, then local
 * state. The native gate comes early because a bundle this shell cannot run is
 * not "newer", it is inapplicable.
 */
export function decideOtaUpdate(input: {
  manifest: OtaManifest | null
  /** Version of the bundle currently running. */
  currentVersion: string
  /** CapacitorUpdater.current().native — the store-installed shell version. */
  nativeVersion: string
  /** Version already downloaded and staged via next(), if any. */
  stagedVersion?: string | null
  /** Versions that previously failed to boot and were rolled back. */
  blockedVersions?: readonly string[]
}): OtaDecision {
  const {
    manifest,
    currentVersion,
    nativeVersion,
    stagedVersion,
    blockedVersions = [],
  } = input

  if (!manifest) return { action: "skip", reason: "invalid-manifest" }
  if (!isSemver(currentVersion) || !isSemver(nativeVersion)) {
    return { action: "skip", reason: "invalid-manifest" }
  }

  if (compareVersions(nativeVersion, manifest.minNativeVersion) < 0) {
    return { action: "skip", reason: "native-too-old" }
  }
  if (
    manifest.maxNativeVersion &&
    compareVersions(nativeVersion, manifest.maxNativeVersion) > 0
  ) {
    return { action: "skip", reason: "native-too-new" }
  }

  if (blockedVersions.includes(manifest.version)) {
    return { action: "skip", reason: "blocked" }
  }

  const versionDelta = compareVersions(manifest.version, currentVersion)
  if (versionDelta === 0) return { action: "skip", reason: "up-to-date" }
  // Never move a device backwards: an older manifest means a stale CDN read or
  // a botched release, and downgrading would fight the next check forever.
  if (versionDelta < 0) return { action: "skip", reason: "older" }

  if (stagedVersion && compareVersions(manifest.version, stagedVersion) <= 0) {
    return { action: "skip", reason: "already-staged" }
  }

  return {
    action: "download",
    version: manifest.version,
    url: manifest.url,
    checksum: manifest.checksum,
    mandatory: manifest.mandatory === true,
  }
}
