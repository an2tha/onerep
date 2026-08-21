import { useEffect, useMemo, useState } from "react"
import { useWeightUnit } from "@/lib/use-weight-unit"
import { useEnergyUnit, type EnergyUnit } from "@/lib/use-energy-unit"
import { CalendarBlank, CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { MobileSheet } from "@/components/mobile-sheet"
import {
  CompactSwitch,
  DateKeyCalendar,
  PrimaryButton,
  ToolbarButton,
} from "@repo/ui"
import { hapticSelection } from "@/lib/haptics"
import * as healthProvider from "@/lib/health-provider"
import {
  healthMetric,
  saneHealthMetric,
} from "../../../../convex/lib/healthMetricCatalog"
import { shiftDate } from "../../../../convex/lib/healthSeries"

/**
 * Hand corrections for the numbers the Health page is built out of.
 *
 * A watch left on the charger and a phone in a coat pocket both produce a day
 * that is wrong rather than missing, and every score on that page is a
 * composite — one bad night of "two hours of sleep" drags a fortnight of
 * recovery down and there was previously nowhere to say so. Everything here
 * writes a per-field override that later syncs are forbidden from stamping
 * over, and every override can be handed back.
 */

/** How far back you can reach. Beyond a week you are guessing, not correcting. */
const EDITABLE_DAYS = 7

type FieldKind = "daily" | "body"

type Field = {
  /** The catalogue key, which is also the stored field and the override name. */
  key: string
  kind: FieldKind
  label: string
  /** Unit as shown, which is not always the unit as stored — see `toStored`. */
  unit: string
  /** Stored value to the figure a person reads. */
  toDisplay: (stored: number) => number
  /** The typed figure back to what the table holds. */
  toStored: (shown: number) => number
  decimals: number
}

const MINUTES_PER_HOUR = 60
const LBS_PER_KG = 2.20462

function identity(value: number) {
  return value
}

/**
 * Sleep is stored in minutes and nobody types 447. The conversion lives here
 * rather than at the input so the sanity bounds, which the catalogue states in
 * stored units, keep applying to what actually gets written.
 */
function fields(weightUnit: "kg" | "lbs", energyUnit: EnergyUnit): Field[] {
  return [
    {
      key: "sleepMinutes",
      kind: "daily",
      label: "Sleep",
      unit: "h",
      decimals: 2,
      toDisplay: (stored) => stored / MINUTES_PER_HOUR,
      toStored: (shown) => Math.round(shown * MINUTES_PER_HOUR),
    },
    {
      key: "steps",
      kind: "daily",
      label: "Steps",
      unit: "steps",
      decimals: 0,
      toDisplay: identity,
      toStored: (shown) => Math.round(shown),
    },
    {
      key: "restingHeartRateBpm",
      kind: "daily",
      label: "Resting heart rate",
      unit: "bpm",
      decimals: 0,
      toDisplay: identity,
      toStored: (shown) => Math.round(shown),
    },
    {
      key: "hrvMs",
      kind: "daily",
      label: "Heart rate variability",
      unit: "ms",
      decimals: 0,
      toDisplay: identity,
      toStored: (shown) => Math.round(shown),
    },
    {
      key: "activeEnergyKcal",
      kind: "daily",
      label: "Active energy",
      unit: energyUnit,
      decimals: 0,
      toDisplay: identity,
      toStored: (shown) => Math.round(shown),
    },
    {
      key: "weightKg",
      kind: "body",
      label: "Weight",
      unit: weightUnit,
      decimals: 1,
      toDisplay: (stored) =>
        weightUnit === "lbs" ? stored * LBS_PER_KG : stored,
      toStored: (shown) => (weightUnit === "lbs" ? shown / LBS_PER_KG : shown),
    },
    {
      key: "bodyFatPct",
      kind: "body",
      label: "Body fat",
      unit: "%",
      decimals: 1,
      toDisplay: identity,
      toStored: identity,
    },
  ]
}

type ManualByDate = Record<string, string[]>

type DayRow = {
  date: string
  sleepMinutes?: number
  steps?: number
  restingHeartRateBpm?: number
  hrvMs?: number
  activeEnergyKcal?: number
  /**
   * Fields on this day someone set by hand. Optional because the dashboard
   * projects these rows down to the numbers the score needs and drops it; if
   * that projection ever carries it, this picks the marker up for free.
   */
  manualFields?: string[]
}

type BodyRow = {
  clientId: string
  loggedAt: string
  weightKg?: number
  bodyFatPct?: number
  source?: string
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

function formatNumber(value: number, decimals: number) {
  const rounded = Number(value.toFixed(decimals))
  return String(rounded)
}

export function HealthReadingsSheet({
  today,
  onClose,
}: {
  today: string
  onClose: () => void
}) {
  const [date, setDate] = useState(today)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [alsoStore, setAlsoStore] = useState(false)
  const [pickingDate, setPickingDate] = useState(false)

  const dashboard = useQuery(api.logs.healthMetrics.dashboard, { today })
  const measurements = useQuery(api.bodyProgress.list) as BodyRow[] | undefined
  const preferences = useQuery(api.users.users.getPreferences)
  const saveBody = useMutation(api.bodyProgress.save)
  const setDailyMetric = useMutation(api.logs.healthMetrics.setDailyMetric)
  /**
   * Overrides written in this sitting, by day.
   *
   * The day rows the dashboard hands back are projected down to the five
   * numbers the score needs and carry no marker, so a field corrected a second
   * ago would otherwise still claim to have come off the phone. The mutation
   * returns the day's list; holding it here keeps the labels honest until the
   * projection carries it.
   */
  const [justEdited, setJustEdited] = useState<ManualByDate>({})

  const weightUnit = useWeightUnit()
  const energyUnit = useEnergyUnit()
  const rows = useMemo(
    () => fields(weightUnit, energyUnit),
    [weightUnit, energyUnit]
  )
  const storeName = healthProvider.healthProviderLabel()
  const canWriteBack = healthProvider.isHealthSyncSupportedPlatform()

  const day = ((dashboard?.days ?? []) as DayRow[]).find(
    (row) => row.date === date
  )
  const bodyRow = (measurements ?? []).find(
    (row) => row.loggedAt.slice(0, 10) === date
  )
  const manual = new Set([
    ...(day?.manualFields ?? []),
    ...(justEdited[date] ?? []),
  ])

  // A draft carried across a date change would silently write Tuesday's figure
  // onto Wednesday, which is the one mistake this sheet must never make.
  useEffect(() => {
    setDrafts({})
    setError("")
  }, [date])

  function storedValue(field: Field) {
    if (field.kind === "body") {
      return field.key === "weightKg" ? bodyRow?.weightKg : bodyRow?.bodyFatPct
    }
    return day?.[field.key as keyof DayRow] as number | undefined
  }

  function isManual(field: Field) {
    if (field.kind === "body") return bodyRow?.source === "manual"
    return manual.has(field.key)
  }

  function shownValue(field: Field) {
    const draft = drafts[field.key]
    if (draft !== undefined) return draft
    const stored = storedValue(field)
    return stored == null
      ? ""
      : formatNumber(field.toDisplay(stored), field.decimals)
  }

  const dirty = rows.some((field) => {
    const draft = drafts[field.key]
    if (draft === undefined) return false
    const stored = storedValue(field)
    const baseline =
      stored == null
        ? ""
        : formatNumber(field.toDisplay(stored), field.decimals)
    return draft.trim() !== baseline
  })

  const oldest = shiftDate(today, -(EDITABLE_DAYS - 1))

  async function commit(field: Field, value: number | null) {
    if (field.kind === "body") {
      // Nothing to clear and nothing to clear it on: saving here would file an
      // empty check-in for the day and put a phantom dot on the weight chart.
      if (value === null && !bodyRow) return
      // The check-in row is the record for body figures, so a correction goes
      // through the same path Progress uses and inherits its manual marking.
      await saveBody({
        clientId: bodyRow?.clientId ?? `health-edit-${date}`,
        loggedAt: date,
        ...(value === null ? {} : { [field.key]: value }),
        clearFields: value === null ? [field.key] : [],
      })
      return
    }
    const result = await setDailyMetric({
      date,
      field: field.key,
      value,
    })
    setJustEdited((current) => ({ ...current, [date]: result.manualFields }))
  }

  async function save() {
    setError("")
    setSaving(true)
    try {
      for (const field of rows) {
        const draft = drafts[field.key]
        if (draft === undefined) continue
        const trimmed = draft.trim()
        const stored = storedValue(field)
        const baseline =
          stored == null
            ? ""
            : formatNumber(field.toDisplay(stored), field.decimals)
        if (trimmed === baseline) continue

        if (trimmed === "") {
          await commit(field, null)
          continue
        }
        const typed = Number(trimmed.replace(",", "."))
        if (!Number.isFinite(typed)) {
          setError(`${field.label} needs a number.`)
          return
        }
        const value = saneHealthMetric(field.key, field.toStored(typed))
        if (value === undefined) {
          const bounds = healthMetric(field.key)
          setError(
            bounds
              ? `${field.label} has to be between ${formatNumber(field.toDisplay(bounds.min), field.decimals)} and ${formatNumber(field.toDisplay(bounds.max), field.decimals)}${field.unit === "%" ? "" : ` ${field.unit}`}.`
              : `${field.label} is out of range.`
          )
          return
        }
        await commit(field, value)
        if (alsoStore) {
          // Best effort by design: the app already holds the correction, and a
          // store that refuses the write is not a reason to fail the edit.
          await healthProvider.saveHealthDailyMetric({
            metric: field.key,
            date,
            value,
          })
        }
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

  async function revert(field: Field) {
    setError("")
    setSaving(true)
    try {
      await commit(field, null)
      setDrafts((current) => {
        const next = { ...current }
        delete next[field.key]
        return next
      })
      hapticSelection()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That did not clear. Try again."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileSheet
      ariaLabel="Correct a reading"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-card"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Correct a reading
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Whatever you type here is what every score on this page uses. Empty
            a field to hand the day back to {storeName}.
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

      {/*
        One control, four parts. The carets are still the fast way to reach
        yesterday, which is what nearly every correction is about; the calendar
        is for the Thursday you only remembered on Monday, which used to cost
        four taps on the same caret. They share one translucent shell so the
        row reads as a date picker rather than as three loose buttons.
      */}
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
          Opens in place rather than in a popover: the sheet traps Tab inside
          its own panel and dismisses on Escape, and a portalled panel sitting
          outside it fights both. Inline, the grid is just more sheet.
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
              You can correct the last {EDITABLE_DAYS} days.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {rows.map((field) => {
          const overridden = isManual(field)
          const stored = storedValue(field)
          return (
            <div
              key={field.key}
              className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`reading-${field.key}`}
                  className="block text-[14px] font-semibold"
                >
                  {field.label}
                </label>
                <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                  {overridden
                    ? "you typed this"
                    : stored == null
                      ? "nothing recorded"
                      : `read from ${storeName}`}
                </p>
              </div>
              {overridden && (
                <button
                  type="button"
                  onClick={() => void revert(field)}
                  disabled={saving}
                  className="motion-tactile shrink-0 text-[12px] font-semibold text-muted-foreground underline underline-offset-4"
                >
                  Use synced
                </button>
              )}
              <div className="flex shrink-0 items-baseline gap-1">
                <input
                  id={`reading-${field.key}`}
                  name={`reading-${field.key}`}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  autoComplete="off"
                  disabled={saving}
                  value={shownValue(field)}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    setError("")
                    setDrafts((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }}
                  placeholder="—"
                  className="w-20 border-b-2 border-transparent bg-transparent text-right text-[17px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40 focus-visible:border-foreground/40"
                />
                <span className="w-11 text-[12px] font-semibold text-muted-foreground">
                  {field.unit}
                </span>
              </div>
            </div>
          )
        })}

        {canWriteBack && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold">
                Also update {storeName}
              </p>
              <CompactSwitch
                checked={alsoStore}
                onChange={setAlsoStore}
                onInteract={hapticSelection}
                label={`Also update ${storeName}`}
              />
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              OneRep uses your figure either way; this only changes what other
              apps see. Neither Apple nor Health Connect lets one app amend
              another's sample, so yours is added next to the original and{" "}
              {storeName} will show both.
            </p>
          </div>
        )}

        {error && (
          <p
            className="mt-3 text-[13px] leading-5 text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <PrimaryButton
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="mt-4 w-full"
        >
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </div>
    </MobileSheet>
  )
}
