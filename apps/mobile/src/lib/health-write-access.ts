import { useEffect, useSyncExternalStore } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  getHealthWriteAccess,
  requestHealthAuthorization,
  type HealthWriteAccess,
} from "./health-provider"
import {
  healthWriteFailureMessage,
  reportHealthWriteOutcome,
} from "./health-write-report"
import { recordSyncActivity } from "./health-sync-status"

/**
 * Whether the health store will take our writes — asked, not assumed.
 *
 * This exists because the app had no way to tell "saving" from "refused".
 * `authorizationStatus` reports on *read* permissions, so a phone that had
 * granted nothing but reads still showed "Connected"; the write-back switch said
 * on; and every meal silently went nowhere. The store is the only authority on
 * the write half, so it gets asked directly, and its answer gets a screen.
 *
 * A module store rather than a hook's own state because two places care: the
 * app root, which repairs the permission, and Settings, which reports it.
 */

type WriteAccessState = {
  status: HealthWriteAccess
  /** When the store was last asked, or null if it never was. */
  checkedAt: number | null
}

let state: WriteAccessState = { status: "unknown", checkedAt: null }
const listeners = new Set<() => void>()

function setState(next: WriteAccessState) {
  state = next
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): WriteAccessState {
  return state
}

export function useHealthWriteAccess(): WriteAccessState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Asks the store whether it will accept writes. Prompts nobody. */
export async function refreshHealthWriteAccess(): Promise<HealthWriteAccess> {
  const status = await getHealthWriteAccess()
  setState({ status, checkedAt: Date.now() })
  return status
}

/**
 * Asks the store for write access and re-reads its answer.
 *
 * This is what the Settings row's tap-to-fix runs, and what the session guard
 * below calls. On Android the permission sheet only appears if something is
 * genuinely missing, because the plugin short-circuits when every write
 * permission it needs is already granted.
 */
export async function requestHealthWriteAccess(): Promise<HealthWriteAccess> {
  await requestHealthAuthorization({ includeWrite: true }).catch(() => null)
  return refreshHealthWriteAccess()
}

/**
 * One repair attempt per app session.
 *
 * Health Connect's sheet backgrounds the app, so a retry loop would read as an
 * app that keeps interrupting. Once per launch is enough to fix a phone that
 * connected before write-back existed without nagging someone who has decided
 * against it.
 */
let repairedThisSession = false

/**
 * Keeps the write half of health access honest, on app start.
 *
 * The order matters: ask the store first, and only ask the *user* when the
 * store says no. A phone whose preference says write-back is on but whose
 * permissions predate it is exactly the state that produced silent failures,
 * and it is the state this repairs without anybody having to think of it.
 */
export function useEnsureHealthWriteAccess(): WriteAccessState {
  const preferences = useQuery(api.users.users.getPreferences)
  const enabled = preferences?.healthSync?.writeEnabled ?? false

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function ensure() {
      const status = await refreshHealthWriteAccess()
      if (cancelled || status !== "missing") return
      if (!repairedThisSession) {
        repairedThisSession = true
        const after = await requestHealthWriteAccess()
        if (cancelled) return
        if (after === "granted") {
          reportHealthWriteOutcome({ saved: 1, refused: 0 })
          return
        }
      }
      reportHealthWriteOutcome({ saved: 0, refused: 1, reason: "no_permission" })
    }

    void ensure()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return useHealthWriteAccess()
}

/** The sentence Settings shows for the current answer, or null when fine. */
export function writeAccessWarning(status: HealthWriteAccess): string | null {
  if (status === "granted" || status === "unknown") return null
  if (status === "unavailable") return healthWriteFailureMessage("unavailable")
  return healthWriteFailureMessage("no_permission")
}
