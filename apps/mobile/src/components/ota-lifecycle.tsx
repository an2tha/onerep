import { useEffect } from "react"
import { toast } from "sonner"
import {
  applyOtaUpdateNow,
  checkForOtaUpdate,
  initializeOta,
  isOtaSupported,
  notifyOtaAppReady,
  subscribeOtaState,
} from "../lib/ota"

/**
 * Drives over-the-air bundle updates on the native shells.
 *
 * Mirrors PwaLifecycle's trigger set (online, visibility, hourly) so both
 * update paths behave the same way, but the outcome differs: on native the
 * bundle is already staged by the time the toast appears, so declining it only
 * defers the update to the next launch rather than skipping it.
 *
 * Rendered inside the app's ErrorBoundary on purpose — see notifyOtaAppReady
 * below.
 */
export function OtaLifecycle() {
  useEffect(() => {
    if (!isOtaSupported()) return

    let disposed = false
    let disposeListeners: (() => void) | undefined

    // Two committed frames means React mounted and painted something real.
    // Anything that throws before this leaves notifyAppReady() uncalled, which
    // is precisely the signal the plugin's rollback timer waits for — so this
    // must never move to module scope or a timeout.
    const outerFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!disposed) void notifyOtaAppReady()
      })
    })

    void initializeOta({
      onRollback: ({ version }) => {
        if (disposed) return
        toast.error("The last update didn't start correctly", {
          id: "onerep-ota-rollback",
          description: `OneRep went back to the previous version (${version} was rolled back).`,
        })
      },
    }).then((dispose) => {
      if (disposed) dispose()
      else disposeListeners = dispose
    })

    const unsubscribe = subscribeOtaState((state) => {
      if (disposed || state.phase !== "ready") return

      if (state.mandatory) {
        void applyOtaUpdateNow()
        return
      }

      toast.message("A OneRep update is ready", {
        id: "onerep-ota-update",
        description: "Update now, or it will apply next time you open OneRep.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => void applyOtaUpdateNow(),
        },
      })
    })

    const checkForUpdate = () => {
      if (document.visibilityState === "hidden") return
      void checkForOtaUpdate()
    }

    checkForUpdate()
    window.addEventListener("online", checkForUpdate)
    document.addEventListener("visibilitychange", checkForUpdate)
    const updateTimer = window.setInterval(checkForUpdate, 60 * 60 * 1000)

    return () => {
      disposed = true
      cancelAnimationFrame(outerFrame)
      unsubscribe()
      disposeListeners?.()
      window.removeEventListener("online", checkForUpdate)
      document.removeEventListener("visibilitychange", checkForUpdate)
      window.clearInterval(updateTimer)
    }
  }, [])

  return null
}
