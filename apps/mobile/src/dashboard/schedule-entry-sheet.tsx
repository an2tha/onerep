/**
 * The sheet behind the wheel's + buttons: "schedule an entry" — workout or
 * food, at the minute the wheel was pointing at. Choosing one doesn't log
 * anything; it sets a one-shot notification for that time, because the
 * whole point of pointing the wheel somewhere is that the moment matters
 * more than this tap.
 */

import { useState } from "react"
import { Barbell, CaretRight, ForkKnife } from "@phosphor-icons/react"
import { MobileSheet, toast } from "@repo/ui"

import { scheduleEntryReminder, type EntryReminderKind } from "@/lib/reminders"
import { hapticMedium } from "@/lib/haptics"

export type ScheduleEntryRequest = {
  minutes: number
  phase: "past" | "future"
}

export function ScheduleEntrySheet({
  request,
  onClose,
}: {
  request: ScheduleEntryRequest | null
  onClose: () => void
}) {
  const [pendingKind, setPendingKind] = useState<EntryReminderKind | null>(null)
  if (!request) return null

  const at = new Date()
  at.setHours(
    Math.floor(request.minutes / 60) % 24,
    Math.round(request.minutes % 60),
    0,
    0
  )
  const timeLabel = at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })

  async function choose(kind: EntryReminderKind) {
    if (pendingKind) return
    setPendingKind(kind)
    hapticMedium()
    try {
      const result = await scheduleEntryReminder(kind, at)
      if (result === "scheduled") {
        toast.success(`Reminder set for ${timeLabel}`)
      } else if (result === "denied") {
        toast.error("Notifications are off — allow them to get reminders")
      } else {
        toast.error("Reminders need the mobile app")
      }
    } finally {
      setPendingKind(null)
      onClose()
    }
  }

  const options: Array<{
    kind: EntryReminderKind
    label: string
    detail: string
    icon: typeof Barbell
  }> = [
    {
      kind: "workout",
      label: "Workout",
      detail: "A nudge to start a session",
      icon: Barbell,
    },
    {
      kind: "food",
      label: "Food",
      detail: "A nudge to log a meal",
      icon: ForkKnife,
    },
  ]

  return (
    <MobileSheet onClose={onClose} ariaLabel="Schedule an entry">
      <div className="flex flex-col gap-4 px-5 pt-5 pb-8">
        <header>
          <h2 className="text-[19px] font-semibold tracking-tight text-foreground">
            {request.phase === "past"
              ? `Retro-log around ${timeLabel}?`
              : `Schedule an entry for ${timeLabel}?`}
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Pick what it is — the app will remind you at {timeLabel}.
          </p>
        </header>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option.kind}
              type="button"
              disabled={pendingKind !== null}
              onClick={() => void choose(option.kind)}
              className="motion-tactile flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left disabled:opacity-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <option.icon size={18} weight="bold" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-foreground">
                  {option.label}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  {option.detail}
                </span>
              </span>
              <CaretRight
                size={16}
                weight="bold"
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>
    </MobileSheet>
  )
}
