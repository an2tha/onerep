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

  // First-run seed: an account with lb saved is imperial until they say
  // otherwise. Only applies while the local switch has never been touched.
  useEffect(() => {
    if (preferences === undefined) return
    if (preferences.weightUnit === "lbs" && readMeasurementSystem() === "metric") {
      applyMeasurementSystem("imperial")
      setSystemState("imperial")
    }
  }, [preferences])

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
