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
 * - A staged bundle applies on its own. download() is always followed by
 *   next(), so the update lands when the app is next backgrounded or
 *   relaunched even if the user never sees or taps the toast.
 * - A bundle that cannot boot rolls itself back. notifyAppReady() is only
 *   called once React has actually committed; if it never runs, the plugin's
 *   appReadyTimeout reverts the device on the next launch. A revert is treated
 *   as evidence, not a verdict — see recordVersionFailure.
 *
 * All decision rules live in ./ota-manifest so they are testable in isolation.
 * This file is only the glue: platform guard, network, plugin calls, state.
 *
 * ── OTA DISABLED FOR APPLE REVIEW ─────────────────────────────────────────
 * Apple's guideline 2.7.2 disallows downloading executable code after review.
 * The whole OTA flow is therefore switched off at module level via
 * OTA_ENABLED. Every public entry point short-circuits to a no-op, so no
 * manifest is fetched, no bundle is downloaded, staged or applied, and the
 * native plugin is never invoked. To re-enable (e.g. for Android builds or
 * after obtaining explicit App Store clearance), set OTA_ENABLED to True.
 * The native side stays configured with autoUpdate: false and empty
 * updateUrl/statsUrl in capacitor.config.ts as a second layer of defence.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Capacitor } from "@capacitor/core"
import {
  compareVersions,
  decideOtaUpdate,
  isSemver,
  parseOtaManifest,
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

/**
 * Master switch, defined in ./ota-config so tests can alias it. False = OTA
 * completely disabled (Apple review mode). Only flip to True when the flow is
 * explicitly cleared for use.
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
type BundleInfo = Awaited<
  ReturnType<CapgoModule["CapacitorUpdater"]["download"]>
>

let state: OtaState = { phase: "idle" }
const subscribers = new Set<(next: OtaState) => void>()
/** Bundle staged this session, held so the toast's Update action can apply it. */
let stagedBundle: BundleInfo | null = null

export function otaOrigin(): string {
  const configured = import.meta.env.VITE_OTA_ORIGIN as string | undefined
  return configured?.trim() || DEFAULT_OTA_ORIGIN
}

function manifestUrl(): string {
  const configured = import.meta.env.VITE_OTA_MANIFEST_URL as string | undefined
  return configured?.trim() || `${otaOrigin()}/ota/manifest.json`
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
  return Capacitor.isNativePlatform()
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

async function fetchManifest(platform: OtaPlatform) {
  // Cache-busted and no-store: both the Cloudflare edge and the WebView's own
  // HTTP cache sit in front of this, and a stale manifest silently pins a
  // device to an old bundle.
  const url = `${manifestUrl()}?v=${Date.now()}`
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`manifest responded ${response.status}`)
  return parseOtaManifest(await response.json(), platform, otaOrigin())
}

/**
 * Fetches the manifest and, if a newer applicable bundle exists, downloads and
 * stages it. Never throws and never blocks anything the user is doing.
 */
export async function checkForOtaUpdate(
  options: { force?: boolean } = {}
): Promise<OtaDecision> {
  if (!OTA_ENABLED || !isOtaSupported()) return { action: "skip", reason: "up-to-date" }

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
    manifest = await fetchManifest(platform)
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

  let stagedVersion: string | null = null
  try {
    stagedVersion = (await updater.getNextBundle())?.version ?? null
  } catch {
    stagedVersion = null
  }

  const decision = decideOtaUpdate({
    manifest,
    currentVersion: versions.current,
    nativeVersion: versions.native,
    stagedVersion,
    blockedVersions: readBlockedVersions(),
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

    // Stage immediately. This is what makes the update land on its own when
    // the app is next backgrounded or relaunched; the toast below is only an
    // opportunity to have it sooner.
    await updater.next({ id: bundle.id })
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
  const bundle = stagedBundle
  if (!bundle || state.phase !== "ready") return

  setState({ phase: "applying", version: bundle.version })
  try {
    const updater = await loadCapgo()
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
 * Wires plugin listeners and reports a rollback if the previous bundle failed
 * to boot. Returns a disposer.
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
    const staged = await updater.getNextBundle()
    return {
      ...base,
      current: bundle.version,
      native,
      staged: staged?.version ?? null,
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
