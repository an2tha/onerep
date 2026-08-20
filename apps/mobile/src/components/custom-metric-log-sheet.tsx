import { useEffect, useMemo, useState } from "react"
import { CalendarBlank, CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import {
  CompactSwitch,
  DateKeyCalendar,
  PrimaryButton,
  ToolbarButton,
} from "@repo/ui"
import { hapticSelection } from "@/lib/haptics"
import { currentDateKey } from "@/lib/food-log"
import { shiftDate } from "../../../../convex/lib/healthSeries"

/**
 * Hand entries for the metrics a person invented themselves.
 *
 * A custom metric could be defined and charted and targeted, and the only way
 * to put a figure into one was to wait for a health sync that, for the ones
 * bound to nothing, was never coming. Same shape as the two correction sheets
 * next door — a day, a flat list, one number each — with the difference that
 * these rows come from the user's own definitions rather than a catalogue, so
 * the kind and the unit are whatever they said they were.
 */

/** As far back as the steppers on Health and Progress reach. Kept identical. */
const EDITABLE_DAYS = 7

type MetricKind = "counter" | "number" | "toggle"
type MetricTab = "body" | "nutrition" | "training"

type Entry = { date: string; value: number; manual?: boolean }

type Metric = {
  _id: Id<"customProgressMetrics">
  title: string
  tab: MetricTab
  kind: MetricKind
  unit: string
  step: number
  entries: Entry[]
}

/** The order the Progress tabs sit in, so the sections read the same way. */
const TAB_ORDER: MetricTab[] = ["body", "nutrition", "training"]

const TAB_LABEL: Record<MetricTab, string> = {
  body: "Body",
  nutrition: "Nutrition",
  training: "Training",
}

function formatDay(date: string, today: string) {
  if (date === today) return "Today"
  if (date === shiftDate(today, -1)) return "Yesterday"
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
}

/**
 * How many decimals a metric's own step justifies.
 *
 * A step of 0.25 has to be able to show 0.25, and a step of 5 showing "12.000"
 * makes a step counter look like a lab instrument. Derived rather than stored
 * because the definition never asked anyone for a decimal count.
 */
function decimalsFor(step: number) {
  const text = String(step)
  const dot = text.indexOf(".")
  return dot === -1 ? 0 : Math.min(text.length - dot - 1, 3)
}

function formatNumber(value: number, decimals: number) {
  return String(Number(value.toFixed(decimals)))
}

export function CustomMetricLogSheet({
  today = currentDateKey(),
  onClose,
}: {
  /**
   * The day the sheet opens on. Defaults to the local day key rather than a
   * UTC slice: an entry filed by `toISOString()` lands on tomorrow for anyone
   * east of London after their evening, which is exactly the bug that was
   * fixed across the body measurements today.
   */
  today?: string
  onClose: () => void
}) {
  const [date, setDate] = useState(today)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [pickingDate, setPickingDate] = useState(false)

  // No `tab` argument on purpose. The query filters to one tab when asked, and
  // asking is how a person ends up staring at a sheet that cannot see two
  // thirds of the metrics they defined.
  const metrics = useQuery(api.customProgressMetrics.list, {}) as
    Metric[] | undefined
  const setValue = useMutation(api.customProgressMetrics.setValue)
  const clearValue = useMutation(api.customProgressMetrics.clearValue)

  const sections = useMemo(() => {
    const all = metrics ?? []
    return TAB_ORDER.map((tab) => ({
      tab,
      rows: all.filter((metric) => metric.tab === tab),
    })).filter((section) => section.rows.length > 0)
  }, [metrics])

  // A draft carried across a date change would file Tuesday's figure under
  // Wednesday, which is the one mistake this sheet must never make.
  useEffect(() => {
    setDrafts({})
    setError("")
  }, [date])

  function entryFor(metric: Metric) {
    return metric.entries.find((entry) => entry.date === date)
  }

  function baselineFor(metric: Metric) {
    const entry = entryFor(metric)
    if (!entry) return ""
    if (metric.kind === "toggle") return entry.value >= 1 ? "1" : "0"
    return formatNumber(entry.value, decimalsFor(metric.step))
  }

  function shownValue(metric: Metric) {
    const draft = drafts[metric._id]
    return draft !== undefined ? draft : baselineFor(metric)
  }

  const rows = sections.flatMap((section) => section.rows)
  const dirty = rows.some((metric) => {
    const draft = drafts[metric._id]
    return draft !== undefined && draft.trim() !== baselineFor(metric)
  })

  const oldest = shiftDate(today, -(EDITABLE_DAYS - 1))

  async function commit() {
    setError("")
    const pending: { metric: Metric; value: number | null }[] = []

    for (const metric of rows) {
      const draft = drafts[metric._id]
      if (draft === undefined) continue
      const trimmed = draft.trim()
      if (trimmed === baselineFor(metric)) continue

      // An emptied box means the same here as it does on the two sheets next
      // door: delete the day. The comparison against the baseline above is what
      // keeps a row nobody touched from firing a clear, which would otherwise
      // wipe a synced figure every time someone saved a single unrelated row.
      if (trimmed === "") {
        pending.push({ metric, value: null })
        continue
      }

      const typed = Number(trimmed.replace(",", "."))
      if (!Number.isFinite(typed)) {
        setError(`${metric.title} needs a number.`)
        return
      }
      if (typed < 0) {
        setError(`${metric.title} can't be negative.`)
        return
      }
      pending.push({ metric, value: typed })
    }

    if (pending.length === 0) return

    setSaving(true)
    try {
      for (const { metric, value } of pending) {
        if (value === null) await clearValue({ metricId: metric._id, date })
        else await setValue({ metricId: metric._id, date, value })
      }
      hapticSelection()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That did not save. Try again."
      )
    } finally {
      setSaving(false)
    }
  }

  function setDraft(metric: Metric, value: string) {
    setError("")
    setDrafts((current) => ({ ...current, [metric._id]: value }))
  }

  return (
    <MobileSheet
      ariaLabel="Log a metric"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-card"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Log a metric</h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Put a figure into any metric you made, for any day this week.
          </p>
        </div>
        <ToolbarButton
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-2 px-0"
        >
          <X size={14} weight="bold" />
        </ToolbarButton>
      </div>

      <div className="mt-4 px-5">
        <div className="app-translucent flex items-center gap-1 rounded-full p-1">
          <button
            type="button"
            disabled={date <= oldest}
            onClick={() => {
              hapticSelection()
              setDate(shiftDate(date, -1))
            }}
            aria-label="Previous day"
            className="motion-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
          >
            <CaretLeft size={15} weight="bold" />
          </button>
          <p className="flex-1 text-center text-[14px] font-semibold">
            {formatDay(date, today)}
          </p>
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              setPickingDate((open) => !open)
            }}
            aria-label="Pick a day"
            aria-expanded={pickingDate}
            className={`motion-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
              pickingDate ? "bg-foreground/10 text-foreground" : ""
            }`}
          >
            <CalendarBlank size={15} weight="bold" />
          </button>
          <button
            type="button"
            disabled={date >= today}
            onClick={() => {
              hapticSelection()
              setDate(shiftDate(date, 1))
            }}
            aria-label="Next day"
            className="motion-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
          >
            <CaretRight size={15} weight="bold" />
          </button>
        </div>

        {/*
          Inline, not a popover: the sheet traps Tab inside its own panel and
          closes on Escape, and a portalled panel outside it fights both.
        */}
        {pickingDate && (
          <div className="mt-2 rounded-2xl border border-border p-3">
            <DateKeyCalendar
              value={date}
              min={oldest}
              max={today}
              onSelect={(picked) => {
                hapticSelection()
                setDate(picked)
                setPickingDate(false)
              }}
            />
            <p className="mt-1 text-center text-[12px] text-muted-foreground">
              You can log the last {EDITABLE_DAYS} days.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {metrics === undefined ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Loading your metrics…
          </p>
        ) : rows.length === 0 ? (
          <div className="py-6">
            <p className="text-[14px] font-semibold">
              You haven't made any metrics yet.
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Close this and tap "Track something new" on Health. Whatever you
              make lands here to be filled in.
            </p>
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <div key={section.tab} className="mb-4 last:mb-0">
                <p className="pb-1 text-[12px] font-semibold text-muted-foreground">
                  {TAB_LABEL[section.tab]}
                </p>
                {section.rows.map((metric) => {
                  const entry = entryFor(metric)
                  const decimals = decimalsFor(metric.step)
                  const shown = shownValue(metric)
                  return (
                    <div
                      key={metric._id}
                      className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`metric-${metric._id}`}
                          className="block text-[14px] font-semibold"
                        >
                          {metric.title}
                        </label>
                        <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                          {!entry
                            ? "nothing recorded"
                            : entry.manual
                              ? "you typed this"
                              : "synced"}
                        </p>
                      </div>
                      {metric.kind === "toggle" ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {/*
                            A switch has two positions and the day has three
                            states: on, off, and never asked. Without this, an
                            off day and an unrecorded day looked identical and
                            there was no way back out of the first.
                          */}
                          {baselineFor(metric) !== "" && shown !== "" && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                hapticSelection()
                                setDraft(metric, "")
                              }}
                              className="motion-tactile text-[12px] font-semibold text-muted-foreground disabled:opacity-35"
                            >
                              Clear
                            </button>
                          )}
                          <CompactSwitch
                            checked={shown === "1"}
                            onChange={(checked) =>
                              setDraft(metric, checked ? "1" : "0")
                            }
                            onInteract={hapticSelection}
                            disabled={saving}
                            label={metric.title}
                          />
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-baseline gap-1">
                          <input
                            id={`metric-${metric._id}`}
                            name={`metric-${metric._id}`}
                            type="text"
                            inputMode={decimals > 0 ? "decimal" : "numeric"}
                            pattern="[0-9]*[.,]?[0-9]*"
                            autoComplete="off"
                            disabled={saving}
                            value={shown}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) =>
                              setDraft(metric, event.target.value)
                            }
                            placeholder="—"
                            className="w-20 border-b-2 border-transparent bg-transparent text-right text-[17px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40 focus-visible:border-foreground/40"
                          />
                          <span className="w-11 truncate text-[12px] font-semibold text-muted-foreground">
                            {metric.unit}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            {error && (
              <p
                className="mt-3 text-[13px] leading-5 text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
              A day you fill in by hand stops syncing. If the metric is tied to
              a health reading, that reading will no longer replace what you
              typed.
            </p>

            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              Empty a row to delete that day. A metric tied to a health reading
              fills back in on the next sync; one that isn't stays empty.
            </p>

            <PrimaryButton
              onClick={() => void commit()}
              disabled={!dirty || saving}
              className="mt-3 w-full"
            >
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </>
        )}
      </div>
    </MobileSheet>
  )
}
