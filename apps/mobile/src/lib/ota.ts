/**
 * Over-the-air web bundle updates for the native shells.
 *
 * The native app ships with the web bundle that was reviewed by the stores.
 * This module lets a JS-only fix reach devices without another review: it
 * fetches a manifest we publish to Cloudflare Pages alongside the PWA, and if
 * it advertises a newer bundle that this native shell is new enough to run,
 * downloads it and stages it with the Capgo plugin.
 *
 * Three properties this is built around:
 *
 * - Boot never waits on the network. Every failure path leaves the currently
 *   installed bundle running, so an offline launch is indistinguishable from
 *   a normal one.
 * - A staged bundle applies on a later cold launch. The user may also choose
 *   Update from the ready toast; iOS never forces an immediate reload.
 * - A bundle that cannot boot rolls itself back. notifyAppReady() is only
 *   called once React has actually committed; if it never runs, the plugin's
 *   appReadyTimeout reverts the device on the next launch. A revert is treated
 *   as evidence, not a verdict — see recordVersionFailure.
 *
 * All decision rules live in ./ota-manifest so they are testable in isolation.
 * This file is only the glue: platform guard, network, plugin calls, state.
 *
 * Apple App Review guideline 2.5.2 means this channel is only for content,
 * security repairs, and bug fixes that restore already-reviewed behaviour.
 * It must never introduce a feature or new use of a native capability. The
 * mechanism is enabled in the exact build App Review receives and documented
 * in docs/app-store-review/ota-updates.md; there is no review-only switch.
 */

import { Capacitor, registerPlugin } from "@capacitor/core"
import {
  compareVersions,
  decodeOtaSignedPayload,
  decideOtaUpdate,
  isSemver,
  parseOtaManifest,
  parseOtaSignedEnvelope,
  type OtaDecision,
  type OtaPlatform,
} from "./ota-manifest"
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "./utils"
import { OTA_ENABLED } from "./ota-config"

export type OtaState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string; bundleId: string; mandatory: boolean }
  | { phase: "applying"; version: string }
  | { phase: "error"; message: string }

export type OtaRollback = { version: string }

const LAST_CHECK_KEY = "onerep:ota:last-check"
const FAILURE_COUNT_KEY = "onerep:ota:failure-count"
const BLOCKED_VERSIONS_KEY = "onerep:ota:blocked-versions"
const REPORTED_ROLLBACK_KEY = "onerep:ota:reported-rollback"
const VERSION_FAILURES_KEY = "onerep:ota:version-failures"
const ROLLOUT_BUCKET_KEY = "onerep:ota:rollout-bucket"
/**
 * Bundle downloaded in a prior JS context and awaiting a cold launch.
 * Persisted so a reload (which destroys module state) does not lose it, and
 * consumed exactly once by initializeOta on the next launch.
 */
const PENDING_BUNDLE_KEY = "onerep:ota:pending-bundle"

/**
 * Master switch, defined in ./ota-config so tests can alias it. False = OTA
 * completely disabled. The supported path is also gated on the native
 * OtaTrust plugin: store builds predating it safely remain on built-in
 * assets.
 */

const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000
/** Backoff after consecutive failures: 30m, 1h, then 4h. */
const FAILURE_BACKOFF_MS = [30 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000]
const MANIFEST_TIMEOUT_MS = 8000
const MAX_BLOCKED_VERSIONS = 10
/** Rollbacks of one version tolerated before the device stops trying it. */
const ROLLBACK_STRIKES = 2

const DEFAULT_OTA_ORIGIN = "https://app.onerep.life"

type CapgoModule = typeof import("@capgo/capacitor-updater")
type OtaTrustPlugin = {
  verifyManifest(options: {
    payload: string
    signature: string
    keyId: string
  }): Promise<{ valid: boolean }>
}

const otaTrust = registerPlugin<OtaTrustPlugin>("OtaTrust")
type BundleInfo = Awaited<
  ReturnType<CapgoModule["CapacitorUpdater"]["download"]>
>

let state: OtaState = { phase: "idle" }
const subscribers = new Set<(next: OtaState) => void>()
/** Bundle staged this session, held so the toast's Update action can apply it. */
let stagedBundle: BundleInfo | null = null

export type OtaPendingBundle = { id: string; version: string }

function readPendingBundle(): OtaPendingBundle | null {
  const raw = safeLocalStorageGet(PENDING_BUNDLE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { id?: unknown }).id === "string" &&
      typeof (parsed as { version?: unknown }).version === "string" &&
      (parsed as { id: string }).id.length > 0 &&
      (parsed as { version: string }).version.length > 0
    ) {
      return {
        id: (parsed as { id: string }).id,
        version: (parsed as { version: string }).version,
      }
    }
    return null
  } catch {
    return null
  }
}

function writePendingBundle(bundle: { id: string; version: string }) {
  safeLocalStorageSet(PENDING_BUNDLE_KEY, JSON.stringify(bundle))
}

function clearPendingBundle() {
  safeLocalStorageRemove(PENDING_BUNDLE_KEY)
}

export function otaOrigin(): string {
  const configured = import.meta.env.VITE_OTA_ORIGIN as string | undefined
  return configured?.trim() || DEFAULT_OTA_ORIGIN
}

function manifestUrl(platform: OtaPlatform, nativeVersion: string): string {
  const configured = import.meta.env.VITE_OTA_MANIFEST_URL as string | undefined
  const template =
    configured?.trim() ||
    `${otaOrigin()}/ota/channels/{platform}/{nativeVersion}/manifest.json`
  return template
    .replace("{platform}", encodeURIComponent(platform))
    .replace("{nativeVersion}", encodeURIComponent(nativeVersion))
}

/**
 * Version of the web bundle compiled into this build, stamped by CI.
 *
 * Only consulted when the plugin reports "builtin" — i.e. the store-installed
 * assets, which the plugin has no version for. Once an OTA bundle is active,
 * the plugin's own version is authoritative.
 */
export function otaBuildVersion(): string {
  const stamped = import.meta.env.VITE_BUNDLE_VERSION as string | undefined
  return isSemver(stamped) ? stamped : "0.0.0"
}

export function isOtaSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("OtaTrust")
}

function otaPlatform(): OtaPlatform | null {
  const platform = Capacitor.getPlatform()
  return platform === "ios" || platform === "android" ? platform : null
}

function setState(next: OtaState) {
  state = next
  for (const subscriber of subscribers) subscriber(next)
}

export function getOtaState(): OtaState {
  return state
}

export function subscribeOtaState(callback: (next: OtaState) => void) {
  subscribers.add(callback)
  callback(state)
  return () => {
    subscribers.delete(callback)
  }
}

function readBlockedVersions(): string[] {
  const raw = safeLocalStorageGet(BLOCKED_VERSIONS_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : []
  } catch {
    return []
  }
}

function blockVersion(version: string) {
  if (!version) return
  const existing = readBlockedVersions().filter((entry) => entry !== version)
  const next = [version, ...existing].slice(0, MAX_BLOCKED_VERSIONS)
  safeLocalStorageSet(BLOCKED_VERSIONS_KEY, JSON.stringify(next))
}

function readVersionFailures(): Record<string, number> {
  const raw = safeLocalStorageGet(VERSION_FAILURES_KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {}
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

/**
 * Records that a version was rolled back, and blocks it once it has failed
 * enough times to look like the bundle's fault rather than the moment's.
 *
 * A rollback is not proof of a bad bundle. The plugin arms its appReadyTimeout
 * the instant it swaps a bundle in, including when it does so from
 * appMovedToBackground — so a slow resume, a device that suspends mid-reload,
 * or anything else that delays notifyAppReady() reads exactly like a crash.
 * Blocking on the first strike turned those into a device that would never
 * take that release again, and since every release met the same fate, a device
 * that fell out of the update path stayed out. Two strikes still stops a
 * genuinely broken bundle within one extra launch.
 */
function recordVersionFailure(version: string): void {
  if (!version) return
  const failures = readVersionFailures()
  const count = (failures[version] ?? 0) + 1

  if (count >= ROLLBACK_STRIKES) {
    blockVersion(version)
    delete failures[version]
  } else {
    failures[version] = count
  }

  // Only versions still on probation are worth remembering, and only as many
  // as the block list itself would hold.
  const trimmed = Object.entries(failures).slice(-MAX_BLOCKED_VERSIONS)
  safeLocalStorageSet(
    VERSION_FAILURES_KEY,
    JSON.stringify(Object.fromEntries(trimmed))
  )
}

function readFailureCount(): number {
  const parsed = Number.parseInt(
    safeLocalStorageGet(FAILURE_COUNT_KEY) ?? "0",
    10
  )
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function recordFailure() {
  safeLocalStorageSet(FAILURE_COUNT_KEY, String(readFailureCount() + 1))
}

function clearFailures() {
  safeLocalStorageRemove(FAILURE_COUNT_KEY)
}

function rolloutBucket(): number {
  const existing = Number.parseInt(
    safeLocalStorageGet(ROLLOUT_BUCKET_KEY) ?? "",
    10
  )
  if (Number.isInteger(existing) && existing >= 0 && existing <= 99) {
    return existing
  }
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  const bucket = (values[0] ?? 0) % 100
  safeLocalStorageSet(ROLLOUT_BUCKET_KEY, String(bucket))
  return bucket
}

/**
 * Rate limits checks so foregrounding the app repeatedly does not hammer the
 * CDN, and backs off further while checks keep failing.
 */
function shouldCheckNow(now: number): boolean {
  const last = Number.parseInt(safeLocalStorageGet(LAST_CHECK_KEY) ?? "0", 10)
  if (!Number.isFinite(last) || last <= 0) return true

  const failures = readFailureCount()
  const wait =
    failures === 0
      ? MIN_CHECK_INTERVAL_MS
      : (FAILURE_BACKOFF_MS[
          Math.min(failures, FAILURE_BACKOFF_MS.length) - 1
        ] ?? MIN_CHECK_INTERVAL_MS)

  return now - last >= wait
}

async function loadCapgo(): Promise<CapgoModule["CapacitorUpdater"]> {
  const module = await import("@capgo/capacitor-updater")
  return module.CapacitorUpdater
}

/**
 * Signals that this bundle booted successfully.
 *
 * Must only be called once the UI has genuinely rendered. If a bundle crashes
 * before this runs, the plugin reverts to the previous one — that silence is
 * the entire rollback mechanism, so never call this optimistically at module
 * scope or from a timer.
 */
export async function notifyOtaAppReady(): Promise<void> {
  if (!OTA_ENABLED || !isOtaSupported()) return
  try {
    const updater = await loadCapgo()
    await updater.notifyAppReady()
  } catch (error) {
    console.warn("OTA notifyAppReady failed", error)
  }
}

async function currentVersions(
  updater: CapgoModule["CapacitorUpdater"]
): Promise<{ current: string; native: string }> {
  const { bundle, native } = await updater.current()
  return {
    // "builtin" means the store-installed assets, which the plugin cannot
    // version; the CI stamp compiled into those assets is the real answer.
    current:
      bundle.version === "builtin" || !isSemver(bundle.version)
        ? otaBuildVersion()
        : bundle.version,
    native,
  }
}

async function fetchManifest(platform: OtaPlatform, nativeVersion: string) {
  // Cache-busted and no-store: both the Cloudflare edge and the WebView's own
  // HTTP cache sit in front of this, and a stale manifest silently pins a
  // device to an old bundle.
  const url = `${manifestUrl(platform, nativeVersion)}?v=${Date.now()}`
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`manifest responded ${response.status}`)
  const envelope = parseOtaSignedEnvelope(await response.json())
  if (!envelope) return null

  const verification = await otaTrust.verifyManifest({
    payload: envelope.payload,
    signature: envelope.signature,
    keyId: envelope.keyId,
  })
  if (!verification.valid) return null

  return parseOtaManifest(
    decodeOtaSignedPayload(envelope),
    platform,
    otaOrigin()
  )
}

/**
 * Fetches the manifest and, if a newer applicable bundle exists, downloads and
 * stages it. Never throws and never blocks anything the user is doing.
 */
export async function checkForOtaUpdate(
  options: { force?: boolean } = {}
): Promise<OtaDecision> {
  if (!OTA_ENABLED || !isOtaSupported())
    return { action: "skip", reason: "up-to-date" }

  const platform = otaPlatform()
  if (!platform) return { action: "skip", reason: "up-to-date" }

  // A staged bundle is already waiting to apply; another download would only
  // race it.
  if (state.phase === "checking" || state.phase === "downloading") {
    return { action: "skip", reason: "already-staged" }
  }
  if (!options.force && state.phase === "ready") {
    return { action: "skip", reason: "already-staged" }
  }

  const now = Date.now()
  if (!options.force && !shouldCheckNow(now)) {
    return { action: "skip", reason: "up-to-date" }
  }

  setState({ phase: "checking" })

  let updater: CapgoModule["CapacitorUpdater"]
  let versions: { current: string; native: string }
  let manifest: Awaited<ReturnType<typeof fetchManifest>>
  try {
    updater = await loadCapgo()
    versions = await currentVersions(updater)
    manifest = await fetchManifest(platform, versions.native)
    safeLocalStorageSet(LAST_CHECK_KEY, String(now))
  } catch (error) {
    // Offline, timed out, or malformed: keep the installed bundle and try
    // again later. This is the common path on a phone and is not an error.
    console.warn("OTA update check failed", error)
    safeLocalStorageSet(LAST_CHECK_KEY, String(now))
    recordFailure()
    setState({ phase: "idle" })
    return { action: "skip", reason: "invalid-manifest" }
  }

  clearFailures()

  // A bundle staged by a previous session (persisted marker) or by this
  // session (in-memory) counts as already staged. getNextBundle is retained
  // for shells that staged via next() before the cold-launch-only change.
  let stagedVersion: string | null =
    stagedBundle?.version ?? readPendingBundle()?.version ?? null
  try {
    stagedVersion ??= (await updater.getNextBundle())?.version ?? null
  } catch {
    // Nothing staged via the plugin.
  }

  const decision = decideOtaUpdate({
    manifest,
    currentVersion: versions.current,
    nativeVersion: versions.native,
    stagedVersion,
    blockedVersions: readBlockedVersions(),
    rolloutBucket: rolloutBucket(),
  })

  if (decision.action === "skip") {
    console.info(`OTA: no update applied (${decision.reason})`)
    setState({ phase: "idle" })
    return decision
  }

  setState({ phase: "downloading", version: decision.version, percent: 0 })

  try {
    const bundle = await updater.download({
      url: decision.url,
      version: decision.version,
      checksum: decision.checksum,
    })

    // Persist for a later cold launch; the toast is an explicit opportunity
    // to apply it sooner. Deliberately never call updater.next(): Capgo
    // applies a next bundle when the app backgrounds, which would bypass the
    // explicit-action-or-cold-launch policy. The marker is consumed exactly
    // once by initializeOta on the next launch and is never applied in this
    // same session.
    writePendingBundle({ id: bundle.id, version: bundle.version })
    stagedBundle = bundle

    setState({
      phase: "ready",
      version: decision.version,
      bundleId: bundle.id,
      mandatory: decision.mandatory,
    })
  } catch (error) {
    console.warn("OTA download failed", error)
    recordFailure()
    setState({
      phase: "error",
      message: error instanceof Error ? error.message : "Download failed",
    })
  }

  return decision
}

/**
 * Applies the staged bundle right now. This reloads the WebView and destroys
 * the JS context, so nothing after it runs.
 */
export async function applyOtaUpdateNow(): Promise<void> {
  if (!OTA_ENABLED || !isOtaSupported()) return
  const bundle = stagedBundle ?? readPendingBundle()
  if (!bundle || state.phase !== "ready") return

  setState({ phase: "applying", version: bundle.version })
  try {
    const updater = await loadCapgo()
    clearPendingBundle()
    stagedBundle = null
    await updater.set({ id: bundle.id })
  } catch (error) {
    console.warn("OTA apply failed", error)
    setState({
      phase: "error",
      message: error instanceof Error ? error.message : "Update failed",
    })
  }
}

/**
 * Wires plugin listeners, applies a bundle staged by a previous JS context
 * on this cold launch, and reports a rollback if the previous bundle failed
 * to boot. Returns a disposer.
 *
 * Cold-launch activation: checkForOtaUpdate only downloads and persists a
 * marker — it never calls updater.next(), so backgrounding cannot apply it.
 * The marker is consumed here, exactly once, on the next launch via
 * updater.set(). A bundle downloaded in this same session (stagedBundle
 * non-null) is never applied here; it waits for the explicit Update action
 * or the following cold launch.
 *
 * `onRollback` fires at most once per failed version so a user is not told
 * about the same bad release on every launch.
 */
export async function initializeOta(
  options: { onRollback?: (rollback: OtaRollback) => void } = {}
): Promise<() => void> {
  if (!OTA_ENABLED || !isOtaSupported()) return () => {}

  let disposed = false
  const handles: { remove: () => Promise<void> }[] = []
  const track = (handle: { remove: () => Promise<void> }) => {
    if (disposed) void handle.remove().catch(() => {})
    else handles.push(handle)
  }

  try {
    const updater = await loadCapgo()

    // Apply a bundle staged by a prior JS context. Skip when this session
    // already staged one: that bundle must wait for explicit action or the
    // next cold launch, never this same session.
    if (stagedBundle === null) {
      const pending = readPendingBundle()
      if (pending) {
        clearPendingBundle()
        try {
          await updater.set({ id: pending.id })
        } catch (error) {
          console.warn("OTA cold-launch apply failed", error)
        }
      }
    }

    let lastPercent = -1
    track(
      await updater.addListener("download", (event) => {
        const percent = Math.round(event.percent)
        // Whole-percent steps only: the native layer emits far more often than
        // React needs to re-render.
        if (percent === lastPercent) return
        lastPercent = percent
        if (state.phase === "downloading") {
          setState({ ...state, percent })
        }
      })
    )

    track(
      await updater.addListener("downloadFailed", (event) => {
        console.warn(`OTA download failed for ${event.version}`)
      })
    )

    track(
      await updater.addListener("updateFailed", (event) => {
        const version = event.bundle?.version
        if (!version) return
        console.warn(`OTA bundle ${version} failed to start; rolled back`)
        recordVersionFailure(version)
        options.onRollback?.({ version })
      })
    )

    // A bundle that failed on a previous launch is reported by the plugin
    // after the fact, since the JS that would have observed it never ran.
    try {
      const failed = await updater.getFailedUpdate()
      const version = failed?.bundle?.version
      if (version) {
        recordVersionFailure(version)
        if (safeLocalStorageGet(REPORTED_ROLLBACK_KEY) !== version) {
          safeLocalStorageSet(REPORTED_ROLLBACK_KEY, version)
          options.onRollback?.({ version })
        }
      }
    } catch {
      // Nothing to report.
    }
  } catch (error) {
    console.warn("OTA initialization failed", error)
  }

  return () => {
    disposed = true
    for (const handle of handles) void handle.remove().catch(() => {})
    handles.length = 0
  }
}

/** Support/debug snapshot. Safe to call on any platform. */
export async function otaDiagnostics(): Promise<{
  supported: boolean
  enabled: boolean
  buildVersion: string
  current: string | null
  native: string | null
  staged: string | null
  blocked: string[]
  state: OtaState
}> {
  const base = {
    supported: isOtaSupported(),
    enabled: OTA_ENABLED,
    buildVersion: otaBuildVersion(),
    blocked: readBlockedVersions(),
    state,
  }
  if (!OTA_ENABLED || !isOtaSupported()) {
    return { ...base, current: null, native: null, staged: null }
  }

  try {
    const updater = await loadCapgo()
    const { bundle, native } = await updater.current()
    const pending = readPendingBundle()?.version ?? null
    let nextVersion: string | null = null
    try {
      nextVersion = (await updater.getNextBundle())?.version ?? null
    } catch {
      nextVersion = null
    }
    return {
      ...base,
      current: bundle.version,
      native,
      staged: stagedBundle?.version ?? pending ?? nextVersion,
    }
  } catch {
    return { ...base, current: null, native: null, staged: null }
  }
}

/** Exported for tests: clears module-level state between cases. */
export function resetOtaStateForTests() {
  state = { phase: "idle" }
  stagedBundle = null
  subscribers.clear()
}

export { compareVersions }
