/**
 * What the health-sync block says at a glance, and the one thing to do next.
 *
 * The page used to answer "how is sync doing?" with five separate places: a
 * section label with a timestamp, a progress bar that appeared under the
 * switches, a repair card that was always there, a red paragraph of raw error
 * text, and a journal at the foot. Any one of them could be the answer you
 * wanted, which meant none of them was.
 *
 * So the state is computed once, here, as a value: a word for how it stands, a
 * line about what actually happened, and exactly one action that is the useful
 * next move for that state. The pure function is what the tests pin down; the
 * component above it only renders the result.
 */

import { tr, uiLocale } from "@repo/ui/i18n"

export type HealthSyncState =
  | "unavailable"
  | "off"
  | "permission"
  | "consent"
  | "running"
  | "attention"
  | "ready"
  | "connected"

export type HealthSyncAction = "enable" | "consent" | "grant" | "sync"

export type HealthSyncPresentation = {
  state: HealthSyncState
  /** The state in one word, for the pill. */
  label: string
  /** What happened last, or what will happen next. */
  detail: string
  action: HealthSyncAction | null
  actionLabel: string | null
}

/** "2 h ago" and friends, for a timestamp people read at a glance. */
export function syncedAgoLabel(
  at?: number | null,
  now = Date.now()
): string | null {
  if (!at) return null
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  if (minutes < 1) return tr("just now")
  if (minutes < 60) return tr("{{value0}} min ago", { value0: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return tr("{{value0}} h ago", { value0: hours })
  const days = Math.round(hours / 24)
  if (days === 1) return tr("yesterday")
  if (days < 7) return tr("{{value0}} days ago", { value0: days })
  return new Date(at).toLocaleDateString(uiLocale(), {
    month: "short",
    day: "numeric",
  })
}

export function healthSyncPresentation({
  providerLabel,
  providerAvailable,
  consentMissing,
  enabled,
  running,
  phase,
  needsPermission,
  lastSyncedAt,
  error,
  lastActivity,
  now = Date.now(),
}: {
  providerLabel: string
  providerAvailable: boolean
  consentMissing: boolean
  enabled: boolean
  running: boolean
  phase?: string | null
  needsPermission?: boolean
  lastSyncedAt?: number | null
  /** A failure worth acting on, already phrased for a person. */
  error?: string | null
  lastActivity?: { at: number; label: string } | null
  now?: number
}): HealthSyncPresentation {
  // A device with no health store cannot sync at any setting, and the install
  // row underneath the card is the fix; offering an action here would be a
  // button that does nothing.
  if (!providerAvailable) {
    return {
      state: "unavailable",
      label: tr("Unavailable"),
      detail: tr(
        "{{value0}} is not installed on this device, or is too old to read from.",
        { value0: providerLabel }
      ),
      action: null,
      actionLabel: null,
    }
  }

  // Running comes before errors: a fresh attempt should not be told about the
  // one before it while it is working.
  if (running) {
    return {
      state: "running",
      label: tr("Syncing…"),
      detail: phase ?? tr("Looking for new workouts"),
      action: "sync",
      actionLabel: tr("Syncing…"),
    }
  }

  // A refusal is its own state, not a failure to retry: the fix is a grant, and
  // "try again" would earn the same denial a second time.
  if (needsPermission) {
    return {
      state: "permission",
      label: tr("Needs permission"),
      detail: tr(
        "Access was denied. {{value0}} grants it from its own screen, not from here.",
        { value0: providerLabel }
      ),
      action: "grant",
      actionLabel: tr("Grant access"),
    }
  }

  // Consent outranks a stale error: nothing can be read until it is on.
  if (consentMissing) {
    return {
      state: "consent",
      label: tr("Needs consent"),
      detail: tr(
        "OneRep needs wearable consent from your profile setup before it can read anything."
      ),
      action: "consent",
      actionLabel: tr("Turn on wearable data"),
    }
  }

  if (error) {
    return {
      state: "attention",
      label: tr("Needs attention"),
      detail: error,
      action: "sync",
      actionLabel: tr("Try again"),
    }
  }

  if (!enabled) {
    return {
      state: "off",
      label: tr("Off"),
      detail: tr("OneRep is not reading workouts from {{value0}}.", {
        value0: providerLabel,
      }),
      action: "enable",
      actionLabel: tr("Turn on"),
    }
  }

  const ago = syncedAgoLabel(lastSyncedAt, now)
  if (!ago) {
    return {
      state: "ready",
      label: tr("Ready"),
      detail: tr("Nothing has been read yet. The first sync looks back a week."),
      action: "sync",
      actionLabel: tr("Sync now"),
    }
  }

  const what = lastActivity?.label ?? tr("No new workouts")
  return {
    state: "connected",
    label: tr("Connected"),
    detail: tr("Synced {{value0}} · {{value1}}", { value0: ago, value1: what }),
    action: "sync",
    actionLabel: tr("Sync now"),
  }
}
