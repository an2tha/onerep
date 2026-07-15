import { CalendarBlank, CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { MobileSheet } from "./mobile-sheet"

function offsetDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatDateLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const date = new Date(`${dateKey}T12:00:00Z`)
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function DateSelectorButton({
  value,
  todayKey,
  onChange,
  open,
  onOpenChange,
  label = "Select date",
  onInteract,
}: {
  value: string
  todayKey: string
  onChange: (dateKey: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  label?: string
  onInteract?: () => void
}) {
  const isToday = value === todayKey
  const dateLabel = formatDateLabel(value, todayKey)

  function setDate(next: string) {
    onChange(next)
    onInteract?.()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors active:bg-foreground/[0.06] active:text-foreground"
        aria-label={`${label}: ${dateLabel}`}
      >
        <CalendarBlank size={18} weight="bold" />
      </button>

      {open && (
        <MobileSheet
          onClose={() => onOpenChange(false)}
          overlayClassName="bg-black/35 backdrop-blur-[4px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)] md:!w-full md:!max-w-sm"
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-[20px] font-semibold">{dateLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors active:bg-foreground/[0.06] active:text-foreground"
                aria-label="Close date selector"
              >
                <X size={13} weight="bold" />
              </button>
            </div>

            <div className="border-y border-border py-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDate(offsetDateKey(value, -1))}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-muted-foreground/62 transition-colors active:bg-background active:text-foreground"
                  aria-label="Previous day"
                >
                  <CaretLeft size={14} weight="bold" />
                </button>
                <input
                  type="date"
                  value={value}
                  max={todayKey}
                  onChange={(event) => {
                    if (event.target.value) setDate(event.target.value)
                  }}
                  className="min-w-0 flex-1 rounded-[0.8rem] border border-border/45 bg-background px-3 py-2.5 text-center text-[13px] font-bold text-foreground outline-none"
                  aria-label="Selected date"
                />
                <button
                  type="button"
                  onClick={() => setDate(offsetDateKey(value, 1))}
                  disabled={isToday}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-muted-foreground/62 transition-colors active:bg-background active:text-foreground disabled:opacity-25"
                  aria-label="Next day"
                >
                  <CaretRight size={14} weight="bold" />
                </button>
              </div>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setDate(todayKey)}
                  className="app-button app-button-quiet mt-2 min-h-10 w-full justify-center bg-transparent"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </MobileSheet>
      )}
    </>
  )
}
