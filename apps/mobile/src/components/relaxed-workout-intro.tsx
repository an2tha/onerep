import { useEffect, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { MobileSheet } from "@repo/ui"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import {
  useFullScreenEvent,
  useSuppressFullScreenEvents,
} from "@/lib/full-screen-events"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

export function RelaxedWorkoutIntroSheet({
  onClose,
  onEnable,
}: {
  onClose: () => void
  onEnable: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function enable() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await onEnable()
      onClose()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <MobileSheet
      ariaLabel={tr("Relaxed workout logging")}
      onClose={onClose}
      dismissible={!busy}
      showHandle={false}
      panelClassName="w-full max-w-md rounded-t-3xl bg-card p-6 text-foreground sm:rounded-3xl"
    >
      <h2 className="text-xl font-semibold">
        {tr("Less tracking, same workout")}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {tr(
          "With relaxed logging, skip weights and enter reps only if you want. Tap to complete each set, even with no numbers."
        )}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {tr(
          "Useful for recovery days or whenever you want less tracking. Turn it on or off in Settings, or ask Coach. It stays on until you switch it off."
        )}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {tr("Could not save workout logging preference")}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="min-h-11 rounded-xl bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-50"
        >
          {busy ? tr("Saving...") : tr("Turn on relaxed logging")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-11 rounded-xl px-4 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr("Keep current logging")}
        </button>
      </div>
    </MobileSheet>
  )
}

export function RelaxedWorkoutIntro() {
  const { isAuthenticated } = useConvexAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    isAuthenticated ? {} : "skip"
  )
  const user = useQuery(
    api.users.users.getCurrentUser,
    isAuthenticated ? {} : "skip"
  )
  const acknowledge = useMutation(
    api.users.users.acknowledgeRelaxedWorkoutLogging
  )
  const enable = useMutation(api.users.users.setRelaxedWorkoutLogging)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const userId = user ? String(user._id) : null
  const storageKey = userId
    ? `onerep:relaxed-workout-introduced:${userId}`
    : null
  const seen =
    preferences?.relaxedWorkoutLoggingIntroducedAt !== undefined ||
    Boolean(storageKey && safeLocalStorageGet(storageKey))
  const open = userId !== null && openFor === userId
  const event = useFullScreenEvent({
    id: "feature.relaxed-workout-logging",
    key: userId && preferences !== undefined && (!seen || open) ? "v1" : null,
    priority: 100,
  })
  useSuppressFullScreenEvents(open)
  useEffect(() => {
    if (event.active && userId) setOpenFor(userId)
  }, [event.active, userId])
  useEffect(() => {
    // Only record an introduction after the sheet has actually rendered.
    if (!open || !storageKey) return
    safeLocalStorageSet(storageKey, "seen")
    void acknowledge({}).catch(() => {})
  }, [open, storageKey, acknowledge])
  if (!open) return null
  return (
    <RelaxedWorkoutIntroSheet
      onEnable={() => enable({ enabled: true })}
      onClose={() => {
        event.close("resolved")
        setOpenFor(null)
      }}
    />
  )
}
