/**
 * React binding for the measurement system.
 *
 * Seeds from the account's existing units the first time (a "lb" account is
 * already an imperial household even before they find this switch), then
 * follows the local switch. The switch is a *default-setter*: the individual
 * server-synced units stay authoritative for what they own, exactly like the
 * weight-unit cache pattern.
 */

import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  applyMeasurementSystem,
  readMeasurementSystem,
  writeMeasurementSystem,
  type MeasurementSystem,
} from "./measurement-system"
import { setActiveWaterAccount } from "./use-water-unit"

let reconciledAccountKey: string | null = null

export function useMeasurementSystem(): {
  system: MeasurementSystem
  /** Applies the system everywhere: caches + persisted label. */
  setSystem: (system: MeasurementSystem) => void
  /** Syncs only the label (no cache writes) when a hand-picked unit
   * happens to imply a system. */
  setSystemLabel: (system: MeasurementSystem) => void
} {
  const preferences = useQuery(api.users.users.getPreferences)
  const [system, setSystemState] = useState<MeasurementSystem>(
    () => readMeasurementSystem()
  )
  // The preferences row id is a stable per-account sentinel: when it changes,
  // a different account took over the device. Module scope preserves the
  // sentinel across Settings remounts, so reopening the page cannot reset a
  // deliberate local system label.
  const accountKey = preferences?._id ?? null

  // Seed AND reconcile from the active account. The original seed only went
  // one direction (lbs→imperial), so an imperial account's cached switch
  // leaked onto a metric account that signed in on the same phone. The
  // reconciliation runs only when the active account *changes* — re-running
  // it on every preferences render would clobber a deliberate local choice
  // (someone using kg weights but imperial water) on every server tick.
  useEffect(() => {
    if (preferences === undefined) return
    const accountChanged = accountKey !== reconciledAccountKey
    reconciledAccountKey = accountKey
    setActiveWaterAccount(accountKey)
    if (accountKey === null || !accountChanged) return

    const implied: MeasurementSystem | null =
      preferences.weightUnit === "lbs"
        ? "imperial"
        : preferences.weightUnit === "kg"
          ? "metric"
          : null
    if (implied && readMeasurementSystem() !== implied) {
      applyMeasurementSystem(implied)
      setSystemState(implied)
    }
  }, [preferences, accountKey])

  const setSystem = (next: MeasurementSystem) => {
    applyMeasurementSystem(next)
    setSystemState(next)
  }

  const setSystemLabel = (next: MeasurementSystem) => {
    writeMeasurementSystem(next)
    setSystemState(next)
  }

  return { system, setSystem, setSystemLabel }
}
