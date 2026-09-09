/**
 * Live status for health syncing, for the Health & Wearables page.
 *
 * The server keeps only `lastSyncedAt` / `lastSyncError` — a timestamp and a
 * string. That can't show *progress*, and it can't show what a sync actually
 * did, which is the first question when a number on the Health page looks
 * wrong. So the client keeps its own small journal: what is running right now,
 * what the last syncs read and wrote, and an error phrased for a person
 * rather than a Java class name.
 *
 * Device-local on purpose — it sits in localStorage beside the Lite sync
 * state, so nothing new is asked of the server and nothing here needs to
 * survive a phone swap.
 */

import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"
import { useSyncExternalStore } from "react"

export type SyncActivity = {
  at: number
  label: string
  /** Items the sync read or wrote, when it means something. */
  count?: number
}

export type HealthSyncStatus = {
  /** A sync (or repair) is mid-flight and the UI should show a progress bar. */
  running: boolean
  /** What the running sync is currently doing, e.g. "Reading workouts…". */
  phase: string | null
  startedAt: number | null
  /** Wall-clock length of the last completed sync, for the "took ~2s" line. */
  lastDurationMs: number | null
  lastError: string | null
  /** Newest first, capped. */
  recent: SyncActivity[]
}

const STORAGE_KEY = "onerep.healthSyncStatus.v1"
const MAX_RECENT = 6

function emptyStatus(): HealthSyncStatus {
  return {
    running: false,
    phase: null,
    startedAt: null,
    lastDurationMs: null,
    lastError: null,
    recent: [],
  }
}

function load(): HealthSyncStatus {
  const raw = safeLocalStorageGet(STORAGE_KEY)
  if (!raw) return emptyStatus()
  try {
    const parsed = JSON.parse(raw) as Partial<HealthSyncStatus>
    return {
      ...emptyStatus(),
      ...parsed,
      // A persisted "running" can never still be running — the process that
      // set it is gone. Only the live module state may say running.
      running: false,
      phase: null,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
    }
  } catch {
    return emptyStatus()
  }
}

function save(status: HealthSyncStatus) {
  safeLocalStorageSet(STORAGE_KEY, JSON.stringify(status))
}

let status: HealthSyncStatus = load()
const listeners = new Set<() => void>()

function update(patch: Partial<HealthSyncStatus>) {
  status = { ...status, ...patch }
  save(status)
  for (const listener of listeners) listener()
}

export function getHealthSyncStatus(): HealthSyncStatus {
  return status
}

export function subscribeHealthSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React binding for the live sync status. */
export function useHealthSyncStatus(): HealthSyncStatus {
  return useSyncExternalStore(subscribeHealthSyncStatus, getHealthSyncStatus)
}

/** Marks a sync as started. `phase` is what it is doing first. */
export function beginHealthSync(phase: string) {
  update({
    running: true,
    phase,
    startedAt: Date.now(),
  })
}

/** Updates what the running sync is doing. No-op when nothing is running. */
export function setHealthSyncPhase(phase: string) {
  if (!status.running) return
  update({ phase })
}

/**
 * Ends the running sync. `error` is already friendly — map raw messages
 * through `friendlyHealthError` before calling.
 */
export function endHealthSync(outcome: { error?: string | null }) {
  const startedAt = status.startedAt
  update({
    running: false,
    phase: null,
    startedAt: null,
    lastDurationMs: startedAt ? Date.now() - startedAt : status.lastDurationMs,
    lastError: outcome.error ?? null,
  })
}

/** Appends what a sync did to the journal, newest first. */
export function recordSyncActivity(label: string, count?: number) {
  const entry: SyncActivity = { at: Date.now(), label, count }
  update({ recent: [entry, ...status.recent].slice(0, MAX_RECENT) })
}

/** Drops the journal (Settings "clear", or a repair that rewrote history). */
export function clearSyncActivities() {
  update({ recent: [] })
}

/**
 * Translates sync failures into sentences. The server keeps the raw string
 * for diagnosis; this is what a person sees. Unknown failures degrade to a
 * plain "try again" rather than leaking a stack trace into Settings.
 */
export function friendlyHealthError(raw: string | null | undefined): string | null {
  if (!raw) return null
  const r = raw.toLowerCase()
  if (
    r.includes("securityexception") ||
    r.includes("does not have permission") ||
    r.includes("permission was denied")
  ) {
    return "Health Connect refused a read. Open Manage permissions below, re-grant access, then sync again."
  }
  if (r.includes("consent") || r.includes("not enabled for this account")) {
    return "OneRep needs wearable consent for your account before importing. Finish the consent step in your profile setup."
  }
  if (r.includes("update_required") || r.includes("too old") || r.includes("unavailable")) {
    return "Health Connect is missing or too old on this device. Install the latest version, then sync again."
  }
  if (r.includes("network") || r.includes("fetch") || r.includes("timeout")) {
    return "Couldn't reach OneRep's server. Check your connection and sync again."
  }
  return "Sync failed. Try again shortly."
}
