import { useEffect } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { useRecovery } from "@/lib/use-recovery"
import {
  mergeReminderSettings,
  setRecoveryReminderPolicy,
  syncPushReminders,
} from "@/lib/reminders"
import { logDevWarn } from "@/lib/utils"
import { toast } from "@repo/ui"

/** Reconcile saved preferences on every device without changing the preferences themselves. */
export function RecoveryReminderSync() {
  const { isAuthenticated } = useConvexAuth()
  const recovery = useRecovery()
  const preferences = useQuery(
    api.users.users.getPreferences,
    isAuthenticated ? {} : "skip"
  )
  const training =
    !!recovery?.active?.quietTraining || !!recovery?.active?.deferTraining
  const food = !!recovery?.active?.simpleFood
  const ready = recovery !== undefined
  useEffect(() => {
    if (!isAuthenticated) {
      setRecoveryReminderPolicy({ training: false, food: false })
      return
    }
    if (!ready || preferences === undefined) return
    setRecoveryReminderPolicy({ training, food })
    void syncPushReminders(
      mergeReminderSettings(preferences?.pushReminders),
      false
    ).catch((error) => {
      logDevWarn("Could not sync recovery reminders", error)
      toast.error(
        "Could not update this device’s reminders. Open Settings to retry."
      )
    })
  }, [isAuthenticated, ready, preferences, training, food])
  return null
}
