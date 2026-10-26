import { tr } from "@repo/ui/i18n"
import { healthProviderLabel, type HealthWriteFailure } from "./health-provider"
import { recordSyncActivity, updateHealthSyncStatus } from "./health-sync-status"

/**
 * What the health store's answer means, in a sentence somebody can act on.
 *
 * The store's raw words ("SecurityException: ...") belong in the journal for
 * diagnosis, not on a Settings row. This is the half a person reads.
 */
export function healthWriteFailureMessage(
  reason: HealthWriteFailure | undefined
): string {
  const store = healthProviderLabel()
  switch (reason) {
    case "no_permission":
      // The one failure with a fix attached, so it names the fix.
      return tr(
        "{{value0}} has read access but not write access, so your food was not saved there. Grant access below and it will catch up.",
        { value0: store }
      )
    case "unsupported_metric":
      return tr("{{value0}} has no record for this, so it was not saved.", {
        value0: store,
      })
    case "invalid_record":
      return tr(
        "{{value0}} rejected the value. Your OneRep log is unaffected.",
        { value0: store }
      )
    case "unavailable":
      return tr("{{value0}} is not available on this device.", {
        value0: store,
      })
    default:
      return tr(
        "{{value0}} did not accept the write. Your OneRep log is unaffected.",
        { value0: store }
      )
  }
}

export type HealthWriteOutcome = {
  saved: number
  refused: number
  reason?: HealthWriteFailure
  message?: string
}

/**
 * A run of identical outcomes should say one thing, not one thing per meal.
 *
 * Food logging is bursty and the write-back fires after each burst, so a
 * refused day would otherwise fill the journal — six entries deep — with the
 * same sentence and bury whatever actually happened. The first refusal is
 * reported; the repeats are not. A later success clears the warning, because a
 * stale failure row is the same lie in the other direction.
 */
let lastFailure: string | null = null
let reportedSuccess = false

export function reportHealthWriteOutcome(outcome: HealthWriteOutcome): void {
  const key = outcome.reason ?? "unknown"

  if (outcome.refused <= 0) {
    if (outcome.saved > 0 && !reportedSuccess) {
      reportedSuccess = true
      recordSyncActivity(
        tr("Wrote today's food to {{value0}}", {
          value0: healthProviderLabel(),
        }),
        outcome.saved
      )
    }
    if (lastFailure !== null) {
      lastFailure = null
      updateHealthSyncStatus({ lastError: null })
    }
    return
  }

  if (lastFailure === key) return
  lastFailure = key
  const message = healthWriteFailureMessage(outcome.reason)
  // The journal keeps the store's own words beside the sentence, because the
  // next person to look at this will want to know which refusal it was.
  recordSyncActivity(
    outcome.message ? `${message} (${outcome.message})` : message,
    outcome.refused
  )
  updateHealthSyncStatus({ lastError: message })
}
