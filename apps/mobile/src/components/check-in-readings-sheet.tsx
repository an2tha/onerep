import { useEffect, useMemo, useState } from "react"
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react"
import { useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { MobileSheet } from "@/components/mobile-sheet"
import { PrimaryButton, ToolbarButton } from "@repo/ui"
import { hapticSelection } from "@/lib/haptics"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { WeightUnit } from "@/lib/health-goals"
import { writeBackBodyMetrics } from "@/lib/health-provider"
import { shiftDate } from "../../../../convex/lib/healthSeries"

/**
 * Hand corrections for the numbers a check-in is made of.
 *
 * Health has the same affordance for its readings, and Progress had nothing
 * like it: the only way to fix Tuesday was to find Tuesday in the list, open
 * the full check-in form and re-read the whole thing to change one figure.
 * This is the flat version — a day, every number a check-in can hold, no
 * disclosure, no carry forward of yesterday's weight into a day you are only
 * passing through.
 */

/** How far back the stepper reaches. Beyond a week you are inventing figures. */
const EDITABLE_DAYS = 7

const LBS_PER_KG = 2.20462

type Field = {
  /** The stored field name, which is also what `clearFields` takes. */
  key:
    | "weightKg"
    | "bodyFatPct"
    | "waistCm"
    | "hipsCm"
    | "chestCm"
    | "armsCm"
    | "thighsCm"
    | "calvesCm"
    | "neckCm"
    | "leanBodyMassKg"
    | "boneMassKg"
    | "basalMetabolicRateKcal"
  label: string
  unit: string
  decimals: number
  min: number
  max: number
  /** Stored value to the figure a person reads. */
  toDisplay: (stored: number) => number
  /** The typed figure back to what the table holds. */
  toStored: (shown: number) => number
}

function identity(value: number) {
  return value
}

/**
 * Weight converts here rather than at the input so the bounds, which are
 * stated in the unit shown, keep applying to what actually gets written.
 */
function fields(unit: WeightUnit): Field[] {
  return [
    {
      key: "weightKg",
      label: "Weight",
      unit,
      decimals: 1,
      min: unit === "lbs" ? 44 : 20,
      max: unit === "lbs" ? 1100 : 500,
      toDisplay: (stored) => (unit === "lbs" ? stored * LBS_PER_KG : stored),
      toStored: (shown) => (unit === "lbs" ? shown / LBS_PER_KG : shown),
    },
    {
      key: "bodyFatPct",
      label: "Body fat",
      unit: "%",
      decimals: 1,
      min: 1,
      max: 100,
      toDisplay: identity,
      toStored: identity,
    },
    {
      key: "waistCm",
      label: "Waist",
      unit: "cm",
      decimals: 1,
      min: 1,
      max: 300,
      toDisplay: identity,
      toStored: identity,
    },
    {
      key: "hipsCm",
      label: "Hips",
      unit: "cm",
      decimals: 1,
      min: 1,
      max: 300,
      toDisplay: identity,
      toStored: identity,
    },
    {
      key: "chestCm",
      label: "Chest",
      unit: "cm",
      decimals: 1,
      min: 1,
      max: 300,
      toDisplay: identity,
      toStored: identity,
    },
    ...(["armsCm", "thighsCm", "calvesCm", "neckCm"] as const).map((key) => ({
      key,
      label: {
        armsCm: "Arms",
        thighsCm: "Thighs",
        calvesCm: "Calves",
        neckCm: "Neck",
      }[key],
      unit: "cm",
      decimals: 1,
      min: 1,
      max: 300,
      toDisplay: identity,
      toStored: identity,
    })),
    // The scale's own figures. They arrive through the health sync and sat
    // here uneditable, which meant a scale that misread lean mass by ten
    // kilos on one damp morning was in the record for good.
    {
      key: "leanBodyMassKg",
      label: "Lean mass",
      unit,
      decimals: 1,
      min: unit === "lbs" ? 22 : 10,
      max: unit === "lbs" ? 660 : 300,
      toDisplay: (stored) => (unit === "lbs" ? stored * LBS_PER_KG : stored),
      toStored: (shown) => (unit === "lbs" ? shown / LBS_PER_KG : shown),
    },
    {
      key: "boneMassKg",
      label: "Bone mass",
      unit,
      decimals: 1,
      min: unit === "lbs" ? 1 : 0.5,
      max: unit === "lbs" ? 44 : 20,
      toDisplay: (stored) => (unit === "lbs" ? stored * LBS_PER_KG : stored),
      toStored: (shown) => (unit === "lbs" ? shown / LBS_PER_KG : shown),
    },
    {
      key: "basalMetabolicRateKcal",
      label: "Basal metabolic rate",
      unit: "kcal",
      decimals: 0,
      min: 500,
      max: 6000,
      toDisplay: identity,
      toStored: identity,
    },
  ]
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
  return String(Number(value.toFixed(decimals)))
}

export function CheckInReadingsSheet({
  today,
  unit,
  measurements,
  onClose,
}: {
  today: string
  unit: WeightUnit
  /** Every check-in the page already holds; no second subscription for this. */
  measurements: BodyMeasurementEntry[] | undefined
  onClose: () => void
}) {
  const [date, setDate] = useState(today)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const save = useMutation(api.bodyProgress.save)

  const rows = useMemo(() => fields(unit), [unit])
  // Last write on the day wins, matching what the chart and the list plot.
  const row = [...(measurements ?? [])]
    .reverse()
    .find((entry) => entry.loggedAt.slice(0, 10) === date)

  // A draft carried across a date change would file Tuesday's figure under
  // Wednesday, which is the one mistake this sheet must never make.
  useEffect(() => {
    setDrafts({})
    setError("")
  }, [date])

  function stored(field: Field) {
    return row?.[field.key]
  }

  function baselineFor(field: Field) {
    const value = stored(field)
    return value == null
      ? ""
      : formatNumber(field.toDisplay(value), field.decimals)
  }

  function shownValue(field: Field) {
    const draft = drafts[field.key]
    return draft !== undefined ? draft : baselineFor(field)
  }

  const dirty = rows.some((field) => {
    const draft = drafts[field.key]
    return draft !== undefined && draft.trim() !== baselineFor(field)
  })

  const oldest = shiftDate(today, -(EDITABLE_DAYS - 1))

  async function commit() {
    setError("")

    const changed: Record<string, number> = {}
    const cleared: string[] = []
    for (const field of rows) {
      const draft = drafts[field.key]
      if (draft === undefined) continue
      const trimmed = draft.trim()
      if (trimmed === baselineFor(field)) continue
      if (trimmed === "") {
        cleared.push(field.key)
        continue
      }
      const typed = Number(trimmed.replace(",", "."))
      if (!Number.isFinite(typed)) {
        setError(`${field.label} needs a number.`)
        return
      }
      if (typed < field.min || typed > field.max) {
        setError(
          `${field.label} has to be between ${field.min} and ${field.max}${
            field.unit === "%" ? "%" : ` ${field.unit}`
          }.`
        )
        return
      }
      changed[field.key] = field.toStored(typed)
    }

    // Weight is what every reader of a check-in reads first — the list row,
    // the chart point, the hero. A row without one renders as a blank line you
    // cannot fix, so emptying it is routed to the delete that already exists.
    const weightAfter =
      changed.weightKg ?? (cleared.includes("weightKg") ? null : row?.weightKg)
    if (weightAfter == null) {
      setError(
        row
          ? "A check-in needs a weight. Delete the day from Recent check-ins instead."
          : "Enter a weight for this day."
      )
      return
    }

    setSaving(true)
    try {
      await save({
        clientId: row?.clientId ?? crypto.randomUUID(),
        // The local day key the stepper is standing on, never a UTC timestamp:
        // every reader compares `loggedAt` against `currentDateKey()`, and an
        // ISO string files the entry a day out for anyone east or west of UTC.
        loggedAt: date,
        ...changed,
        // Named explicitly, and only the fields this sheet shows. The note
        // and the photo are nobody's business here and stay put.
        clearFields: cleared,
      })
      // Best-effort write-back: the save already landed in OneRep, so a
      // health store that refuses is a shrug rather than a failure.
      writeBackBodyMetrics({ date, ...changed }).catch(() => {})
      hapticSelection()
      onClose()
    } catch {
      setError("That did not save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileSheet
      ariaLabel="Correct a check-in"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-card"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Correct a check-in
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Step back through the week and fix a figure. Empty a field to drop
            it from that day.
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

      <div className="mt-4 flex items-center justify-between gap-2 px-5">
        <button
          type="button"
          disabled={date <= oldest}
          onClick={() => {
            hapticSelection()
            setDate(shiftDate(date, -1))
          }}
          aria-label="Previous day"
          className="app-translucent motion-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
        >
          <CaretLeft size={15} weight="bold" />
        </button>
        <p className="text-[14px] font-semibold">{formatDay(date, today)}</p>
        <button
          type="button"
          disabled={date >= today}
          onClick={() => {
            hapticSelection()
            setDate(shiftDate(date, 1))
          }}
          aria-label="Next day"
          className="app-translucent motion-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
        >
          <CaretRight size={15} weight="bold" />
        </button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {rows.map((field) => (
          <div
            key={field.key}
            className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`check-in-${field.key}`}
                className="block text-[14px] font-semibold"
              >
                {field.label}
              </label>
              <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                {stored(field) == null
                  ? "nothing recorded"
                  : row?.source === "health"
                    ? "synced from your scale"
                    : "you typed this"}
              </p>
            </div>
            <div className="flex shrink-0 items-baseline gap-1">
              <input
                id={`check-in-${field.key}`}
                name={`check-in-${field.key}`}
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
        ))}

        {error && (
          <p
            className="mt-3 text-[13px] leading-5 text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <PrimaryButton
          onClick={() => void commit()}
          disabled={!dirty || saving}
          className="mt-4 w-full"
        >
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </div>
    </MobileSheet>
  )
}
