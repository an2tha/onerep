import { useRef, useState } from "react"
import { tr } from "@repo/ui/i18n"
import { MobileSheet } from "@/components/mobile-sheet"
import type { TimelineEntry } from "./timeline"

export type EntrySelection = {
  entry: TimelineEntry
  date: string
  deleting?: boolean
  amount?: number
  unit?: string
  duration?: number
  timeZone?: string
}

export function EntrySheet({
  selection,
  onClose,
  onSave,
  onDelete,
  onDetails,
}: {
  selection: EntrySelection
  onClose: () => void
  onSave: (time: string, amount: number, duration: number) => Promise<void>
  onDelete: () => Promise<void>
  onDetails?: () => void
}) {
  const [time, setTime] = useState(selection.entry.time)
  const [amount, setAmount] = useState(String(selection.amount ?? 1))
  const [duration, setDuration] = useState(String(selection.duration ?? 1))
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const run = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      if (selection.deleting) await onDelete()
      else {
        if (
          selection.amount !== undefined &&
          (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
        )
          throw new Error(tr("Enter a positive amount."))
        if (
          selection.duration !== undefined &&
          (!Number.isFinite(Number(duration)) || Number(duration) <= 0)
        )
          throw new Error(tr("Enter a positive duration."))
        await onSave(time, Number(amount), Number(duration))
      }
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Could not save. Try again.")
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <MobileSheet
      ariaLabel={selection.deleting ? tr("Delete entry?") : tr("Edit entry")}
      onClose={onClose}
      dismissible={!busy}
    >
      <div className="space-y-4 p-4" aria-busy={busy}>
        <h2 className="text-xl font-semibold">
          {selection.deleting ? tr("Delete entry?") : tr("Edit entry")}
        </h2>
        <p className="font-semibold">{selection.entry.title}</p>
        <p className="text-sm text-muted-foreground">
          {selection.date} · {selection.entry.detail}
        </p>
        {selection.deleting ? (
          <p>
            {tr(
              "This removes the selected entry from this day. You can cancel to keep it."
            )}
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span>
                {tr("Time")} ({selection.timeZone})
              </span>
              <input
                aria-label={tr("Time")}
                type="time"
                required
                value={time}
                onChange={(event) => setTime(event.target.value)}
                onInput={(event) => setTime(event.currentTarget.value)}
                onBlur={(event) => setTime(event.currentTarget.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                disabled={busy}
              />
            </label>
            {selection.amount !== undefined && (
              <label className="block space-y-1">
                <span>
                  {tr("Amount")} ({selection.unit})
                </span>
                <input
                  aria-label={tr("Amount")}
                  type="number"
                  min="0.01"
                  step="any"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                  disabled={busy}
                />
              </label>
            )}
            {selection.duration !== undefined && (
              <label className="block space-y-1">
                <span>{tr("Duration (minutes)")}</span>
                <input
                  aria-label={tr("Duration (minutes)")}
                  type="number"
                  min="1"
                  max="1440"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3"
                  disabled={busy}
                />
              </label>
            )}
            {onDetails && (
              <button
                type="button"
                onClick={onDetails}
                disabled={busy}
                className="app-button app-button-secondary w-full"
              >
                {tr("Edit details")}
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="app-button app-button-secondary flex-1"
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy || (!selection.deleting && !time)}
            onClick={() => void run()}
            className="app-button flex-1 bg-foreground text-background"
          >
            {busy
              ? tr("Saving…")
              : selection.deleting
                ? tr("Delete entry")
                : tr("Save changes")}
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}
