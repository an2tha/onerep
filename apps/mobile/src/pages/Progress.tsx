import React, { useState } from "react"
import { useNavigate } from "react-router"
import {
  ArrowLeft,
  Bell,
  ChartLine,
  Clock,
  Minus,
  Percent,
  Plus,
  Ruler,
  Target,
  Trash,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Card } from "@repo/ui"
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import {
  formatReminderLabel,
  syncDailyCheckInReminder,
  type BodyMeasurementEntry,
  type DailyCheckInReminder,
} from "@/lib/body-progress"
import { api } from "../../../../convex/_generated/api"
import { cn } from "@/lib/utils"

type GoalId = "lose" | "build" | "health" | "performance"

function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold tracking-[0.01em]">{title}</h2>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">{sub}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function fmtNumber(value?: number, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toFixed(digits)
}

function formatMeasurementDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function goalDelta(entries: BodyMeasurementEntry[], goal: GoalId | null) {
  const withWeight = entries.filter((entry) => entry.weightKg != null)
  if (withWeight.length < 2) return null
  const first = withWeight[0].weightKg!
  const last = withWeight[withWeight.length - 1].weightKg!
  const delta = last - first

  if (goal === "lose") {
    return delta <= 0
      ? `-${Math.abs(delta).toFixed(1)} kg`
      : `+${delta.toFixed(1)} kg`
  }
  if (goal === "build") {
    return delta >= 0
      ? `+${delta.toFixed(1)} kg`
      : `-${Math.abs(delta).toFixed(1)} kg`
  }
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (values.length === 0) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    })
    .join(" ")
}

import { rollingAvg } from "@/lib/progress-metrics"

type MetricSeries = {
  values: number[]
  color: string
  strokeWidth?: number
  opacity?: number
  dashed?: boolean
}

function MultiLineChart({
  series,
  width = 240,
  height = 96,
  sharedScale = true,
}: {
  series: MetricSeries[]
  width?: number
  height?: number
  sharedScale?: boolean
}) {
  if (series.every((s) => s.values.length === 0)) return null

  function getPoints(values: number[], min: number, max: number): string {
    const range = max - min || 1
    return values
      .map((v, i) => {
        const x =
          values.length === 1
            ? width / 2
            : (i / (values.length - 1)) * width
        const y = height - ((v - min) / range) * (height * 0.85)
        return `${x},${y}`
      })
      .join(" ")
  }

  const allValues = sharedScale ? series.flatMap((s) => s.values) : []
  const globalMin = sharedScale ? Math.min(...allValues) : 0
  const globalMax = sharedScale ? Math.max(...allValues) : 0

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full overflow-visible">
      {series.map((s, i) => {
        if (s.values.length < 2) return null
        const min = sharedScale ? globalMin : Math.min(...s.values)
        const max = sharedScale ? globalMax : Math.max(...s.values)
        const pts = getPoints(s.values, min, max)
        return (
          <polyline
            key={i}
            fill="none"
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.opacity ?? 1}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            points={pts}
          />
        )
      })}
    </svg>
  )
}

type MetricTab = "weight" | "bodyFat" | "circumference"

function MetricRow({
  label,
  value,
  unit,
  Icon,
}: {
  label: string
  value: string
  unit: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="flex items-center justify-between border-t border-border/40 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50">
          <Icon size={14} className="text-foreground/55" />
        </div>
        <span className="text-[12.5px] font-medium">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-[15px] font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </span>
        <span className="ml-1 text-[10px] text-muted-foreground/45">
          {unit}
        </span>
      </div>
    </div>
  )
}

function MeasurementField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/45 uppercase">
        {label}
      </span>
      <div className="flex items-center rounded-[18px] border border-border/55 bg-background px-3">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums outline-none"
        />
        <span className="text-[10px] text-muted-foreground/45">{unit}</span>
      </div>
    </label>
  )
}

function MeasurementSheet({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (entry: Omit<BodyMeasurementEntry, "clientId">) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [loggedAt, setLoggedAt] = useState(today)
  const [weightKg, setWeightKg] = useState("")
  const [bodyFatPct, setBodyFatPct] = useState("")
  const [waistCm, setWaistCm] = useState("")
  const [hipsCm, setHipsCm] = useState("")
  const [chestCm, setChestCm] = useState("")
  const [armsCm, setArmsCm] = useState("")
  const [thighsCm, setThighsCm] = useState("")
  const [calvesCm, setCalvesCm] = useState("")
  const [neckCm, setNeckCm] = useState("")
  const [notes, setNotes] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)

  function toNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const canSave =
    Boolean(toNumber(weightKg)) ||
    Boolean(toNumber(bodyFatPct)) ||
    Boolean(toNumber(waistCm)) ||
    Boolean(toNumber(hipsCm)) ||
    Boolean(toNumber(chestCm)) ||
    Boolean(toNumber(armsCm)) ||
    Boolean(toNumber(thighsCm)) ||
    Boolean(toNumber(calvesCm)) ||
    Boolean(toNumber(neckCm))

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel mx-auto w-full max-w-sm rounded-t-[28px] border-t border-border/60 bg-card shadow-[0_-16px_48px_rgba(0,0,0,0.18)]"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
    >
      <div className="px-4 pt-1">
        <div className="mb-4 border-b border-border/45 pb-4">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground/45 uppercase">
            Daily check-in
          </p>
          <h2 className="mt-1.5 text-[1.35rem] leading-tight font-semibold tracking-[-0.03em]">
            Body measurements
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Core fields */}
          {[
            { label: "Weight",   unit: "kg", value: weightKg,   onChange: setWeightKg },
            { label: "Body fat", unit: "%",  value: bodyFatPct, onChange: setBodyFatPct },
            { label: "Waist",    unit: "cm", value: waistCm,    onChange: setWaistCm },
            { label: "Hips",     unit: "cm", value: hipsCm,     onChange: setHipsCm },
            { label: "Chest",    unit: "cm", value: chestCm,    onChange: setChestCm },
          ].map((field) => (
            <MeasurementField key={field.label} {...field} />
          ))}

          {/* Advanced sites toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="col-span-2 flex items-center gap-1.5 py-1 text-[11px] font-medium text-muted-foreground/50 transition-colors active:text-foreground/60"
          >
            <span>{showAdvanced ? "▴" : "▾"}</span>
            {showAdvanced ? "Fewer measurements" : "More measurements (arms, thighs, calves, neck)"}
          </button>

          {/* Advanced measurement sites */}
          {showAdvanced && [
            { label: "Arms",   unit: "cm", value: armsCm,   onChange: setArmsCm },
            { label: "Thighs", unit: "cm", value: thighsCm, onChange: setThighsCm },
            { label: "Calves", unit: "cm", value: calvesCm, onChange: setCalvesCm },
            { label: "Neck",   unit: "cm", value: neckCm,   onChange: setNeckCm },
          ].map((field) => (
            <MeasurementField key={field.label} {...field} />
          ))}

          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/45 uppercase">
              Date
            </span>
            <input
              type="date"
              value={loggedAt}
              onChange={(event) => setLoggedAt(event.target.value)}
              className="h-11 rounded-[18px] border border-border/55 bg-background px-3 text-[14px] font-medium outline-none"
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/45 uppercase">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="rounded-[18px] border border-border/55 bg-background px-3 py-3 text-[14px] leading-relaxed outline-none"
              placeholder="Sleep, stress, cycle, travel, hydration."
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              if (!canSave) return
              onSave({
                loggedAt,
                weightKg: toNumber(weightKg),
                bodyFatPct: toNumber(bodyFatPct),
                waistCm: toNumber(waistCm),
                hipsCm: toNumber(hipsCm),
                chestCm: toNumber(chestCm),
                armsCm: toNumber(armsCm),
                thighsCm: toNumber(thighsCm),
                calvesCm: toNumber(calvesCm),
                neckCm: toNumber(neckCm),
                notes: notes.trim() || undefined,
              })
            }}
            className={cn(
              "flex-1 rounded-[18px] py-3 text-[13px] font-semibold transition-colors",
              canSave
                ? "bg-foreground text-background active:opacity-80"
                : "bg-muted text-muted-foreground/40"
            )}
          >
            Save check-in
          </button>
          <button
            onClick={onClose}
            className="rounded-[18px] px-4 py-3 text-[13px] font-medium text-muted-foreground active:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

export default function Progress() {
  const navigate = useNavigate()
  
  const onboarding = useQuery(api.users.onboarding.get, {})
  const measurementsQuery = useQuery(api.bodyProgress.list, {})
  const preferences = useQuery(api.users.users.getPreferences, {})

  const saveMeasurement = useMutation(api.bodyProgress.save)
  const removeMeasurement = useMutation(api.bodyProgress.remove)
  const setBodyReminder = useMutation(api.users.users.setBodyReminder)

  const goal = (onboarding?.goal as GoalId) ?? null
  const entries = (measurementsQuery ?? []) as BodyMeasurementEntry[]
  const reminder = preferences?.bodyReminder || { enabled: false, hour: 19, minute: 0 }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [metricTab, setMetricTab] = useState<MetricTab>("weight")

  const latest = entries[entries.length - 1] ?? null
  const weightEntries = entries.filter((entry) => entry.weightKg != null)
const trend = goalDelta(entries, goal)
  const startWeight = weightEntries[0]?.weightKg
  const endWeight = weightEntries[weightEntries.length - 1]?.weightKg

  async function applyReminder(next: DailyCheckInReminder) {
    try {
      await setBodyReminder(next)
      const result = await syncDailyCheckInReminder(next)
      if (result === "scheduled") {
        toast.success(`Daily reminder set for ${formatReminderLabel(next)}`)
      } else if (result === "disabled") {
        toast.message("Daily reminder turned off")
      } else if (result === "denied") {
        toast.error("Notifications permission is required for reminders")
      } else {
        toast.message(
          "Reminder saved. Native notifications work on device builds."
        )
      }
    } catch (err) {
      console.error("Failed to set reminder:", err)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-24">
        <header className="px-5 pt-14 pb-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground/70 transition-colors active:bg-muted"
              aria-label="Back"
            >
              <ArrowLeft size={14} weight="bold" />
            </button>
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-opacity active:opacity-80"
            >
              <Plus size={11} weight="bold" />
              Add check-in
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-4">
          <section>
            <SectionHeader title="Trends" />
            <Card>
              <div className="px-4 pt-3 pb-4">
                {/* ── Tab bar ── */}
                <div className="mb-4 flex gap-1 rounded-xl bg-muted/40 p-1">
                  {(
                    [
                      { id: "weight", label: "Weight" },
                      { id: "bodyFat", label: "Body fat" },
                      { id: "circumference", label: "Girth" },
                    ] as { id: MetricTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMetricTab(tab.id)}
                      className={cn(
                        "flex-1 rounded-lg py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-200",
                        metricTab === tab.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground/55 active:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── Weight tab ── */}
                {metricTab === "weight" && (() => {
                  const allWeightValues = weightEntries.map((e) => e.weightKg!)
                  const rolling7 = allWeightValues.length >= 2 ? rollingAvg(allWeightValues, 7) : []
                  const hasData = allWeightValues.length >= 2
                  return hasData ? (
                    <>
                      <div className="mb-3 flex items-start justify-between border-b border-border/45 pb-3">
                        <div>
                          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
                            From / to
                          </p>
                          <p className="mt-1 text-[13px] font-medium">
                            <span className="tabular-nums">{fmtNumber(startWeight)}</span>
                            <span className="mx-1.5 text-muted-foreground/30">→</span>
                            <span className="tabular-nums">{fmtNumber(endWeight)}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground/45">kg</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">Direction</p>
                          <p className="mt-1 text-[13px] font-medium">{trend ?? "—"}</p>
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-border/50 bg-muted/[0.18] px-3 pt-3 pb-2">
                        <div className="mb-3 grid" style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
                          {[0, 1, 2, 3].map((l) => (
                            <div key={l} className="h-6 border-b border-dashed border-border/35 last:border-b-0" />
                          ))}
                        </div>
                        <div className="-mt-[6.1rem]">
                          <MultiLineChart
                            series={[
                              { values: allWeightValues, color: "color-mix(in srgb, var(--foreground) 55%, transparent)", strokeWidth: 2.5 },
                              ...(rolling7.length >= 2 ? [{ values: rolling7, color: "#38bdf8", strokeWidth: 2, opacity: 0.85 }] : []),
                            ]}
                            sharedScale
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground/45">
                            {weightEntries.length > 0 && formatMeasurementDate(weightEntries[0].loggedAt)}
                          </span>
                          <div className="flex items-center gap-2.5">
                            <div className="flex items-center gap-1">
                              <div className="h-[2px] w-4 rounded-full bg-foreground/40" />
                              <span className="text-[9px] text-muted-foreground/40">Raw</span>
                            </div>
                            {rolling7.length >= 2 && (
                              <div className="flex items-center gap-1">
                                <div className="h-[2px] w-4 rounded-full bg-sky-400/80" />
                                <span className="text-[9px] text-muted-foreground/40">7-day avg</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground/45">
                            {weightEntries.length > 0 && formatMeasurementDate(weightEntries[weightEntries.length - 1].loggedAt)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <ChartLine size={28} className="text-muted-foreground/20" />
                      <p className="text-[14px] font-medium">Graph appears after two measurements</p>
                      <p className="max-w-[18rem] text-[12px] text-muted-foreground/55">One point is a note. Two points are direction.</p>
                    </div>
                  )
                })()}

                {/* ── Body fat tab ── */}
                {metricTab === "bodyFat" && (() => {
                  const bfEntries = entries.filter((e) => e.bodyFatPct != null)
                  const bfValues = bfEntries.map((e) => e.bodyFatPct!)
                  const hasData = bfValues.length >= 2
                  const first = bfValues[0]
                  const last = bfValues[bfValues.length - 1]
                  const delta = hasData ? last - first : null
                  return hasData ? (
                    <>
                      <div className="mb-3 flex items-start justify-between border-b border-border/45 pb-3">
                        <div>
                          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">From / to</p>
                          <p className="mt-1 text-[13px] font-medium">
                            <span className="tabular-nums">{fmtNumber(first)}</span>
                            <span className="mx-1.5 text-muted-foreground/30">→</span>
                            <span className="tabular-nums">{fmtNumber(last)}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground/45">%</span>
                          </p>
                        </div>
                        {delta !== null && (
                          <div className="text-right">
                            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">Change</p>
                            <p className={cn("mt-1 text-[13px] font-medium", delta < 0 ? "text-emerald-500" : delta > 0 ? "text-rose-400" : "")}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-[24px] border border-border/50 bg-muted/[0.18] px-3 pt-3 pb-2">
                        <div className="mb-3 grid" style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
                          {[0, 1, 2, 3].map((l) => (
                            <div key={l} className="h-6 border-b border-dashed border-border/35 last:border-b-0" />
                          ))}
                        </div>
                        <div className="-mt-[6.1rem]">
                          <MultiLineChart
                            series={[{ values: bfValues, color: "#a78bfa", strokeWidth: 2.5 }]}
                            sharedScale
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/45">
                          <span>{formatMeasurementDate(bfEntries[0].loggedAt)}</span>
                          <span>{formatMeasurementDate(bfEntries[bfEntries.length - 1].loggedAt)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <ChartLine size={28} className="text-muted-foreground/20" />
                      <p className="text-[14px] font-medium">No body fat data yet</p>
                      <p className="max-w-[18rem] text-[12px] text-muted-foreground/55">Add body fat % to two or more check-ins to see your trend.</p>
                    </div>
                  )
                })()}

                {/* ── Circumference tab ── */}
                {metricTab === "circumference" && (() => {
                  const waistEntries = entries.filter((e) => e.waistCm != null)
                  const hipsEntries = entries.filter((e) => e.hipsCm != null)
                  const chestEntries = entries.filter((e) => e.chestCm != null)
                  const waistValues = waistEntries.map((e) => e.waistCm!)
                  const hipsValues = hipsEntries.map((e) => e.hipsCm!)
                  const chestValues = chestEntries.map((e) => e.chestCm!)
                  const hasAny = waistValues.length >= 2 || hipsValues.length >= 2 || chestValues.length >= 2

                  const CIRC_SERIES = [
                    { label: "Waist", values: waistValues, color: "#38bdf8", unit: "cm" },
                    { label: "Hips", values: hipsValues, color: "#a78bfa", unit: "cm" },
                    { label: "Chest", values: chestValues, color: "#f59e0b", unit: "cm" },
                  ].filter((s) => s.values.length >= 2)

                  const firstDate = [...waistEntries, ...hipsEntries, ...chestEntries]
                    .map((e) => e.loggedAt).sort()[0]
                  const lastDate = [...waistEntries, ...hipsEntries, ...chestEntries]
                    .map((e) => e.loggedAt).sort().reverse()[0]

                  return hasAny ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border/45 pb-3">
                        {CIRC_SERIES.map((s) => {
                          const first = s.values[0]
                          const last = s.values[s.values.length - 1]
                          const delta = last - first
                          return (
                            <div key={s.label} className="flex items-center gap-1.5">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                              <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/50 uppercase">{s.label}</span>
                              <span className="text-[12px] font-semibold tabular-nums">{fmtNumber(last)}</span>
                              <span className="text-[9.5px] text-muted-foreground/40">cm</span>
                              {delta !== 0 && (
                                <span className={cn("text-[10px] font-medium tabular-nums", delta < 0 ? "text-emerald-500" : "text-rose-400")}>
                                  ({delta > 0 ? "+" : ""}{delta.toFixed(1)})
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="rounded-[24px] border border-border/50 bg-muted/[0.18] px-3 pt-3 pb-2">
                        <div className="mb-3 grid" style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
                          {[0, 1, 2, 3].map((l) => (
                            <div key={l} className="h-6 border-b border-dashed border-border/35 last:border-b-0" />
                          ))}
                        </div>
                        <div className="-mt-[6.1rem]">
                          <MultiLineChart
                            series={CIRC_SERIES.map((s) => ({ values: s.values, color: s.color, strokeWidth: 2 }))}
                            sharedScale={false}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/45">
                          <span>{firstDate ? formatMeasurementDate(firstDate) : ""}</span>
                          <span>{lastDate ? formatMeasurementDate(lastDate) : ""}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <ChartLine size={28} className="text-muted-foreground/20" />
                      <p className="text-[14px] font-medium">No measurement data yet</p>
                      <p className="max-w-[18rem] text-[12px] text-muted-foreground/55">Add waist, hips, or chest measurements to two or more check-ins.</p>
                    </div>
                  )
                })()}
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Latest snapshot"
              sub={
                latest
                  ? formatMeasurementDate(latest.loggedAt)
                  : "Nothing logged yet"
              }
            />
            <Card>
              <div className="px-4 py-4">
                <MetricRow
                  label="Body fat"
                  value={fmtNumber(latest?.bodyFatPct)}
                  unit="%"
                  Icon={Percent}
                />
                <MetricRow
                  label="Waist"
                  value={fmtNumber(latest?.waistCm)}
                  unit="cm"
                  Icon={Ruler}
                />
                <MetricRow
                  label="Hips"
                  value={fmtNumber(latest?.hipsCm)}
                  unit="cm"
                  Icon={Target}
                />
                <MetricRow
                  label="Chest"
                  value={fmtNumber(latest?.chestCm)}
                  unit="cm"
                  Icon={Minus}
                />
                {latest?.armsCm != null && (
                  <MetricRow
                    label="Arms"
                    value={fmtNumber(latest.armsCm)}
                    unit="cm"
                    Icon={Ruler}
                  />
                )}
                {latest?.thighsCm != null && (
                  <MetricRow
                    label="Thighs"
                    value={fmtNumber(latest.thighsCm)}
                    unit="cm"
                    Icon={Ruler}
                  />
                )}
                {latest?.calvesCm != null && (
                  <MetricRow
                    label="Calves"
                    value={fmtNumber(latest.calvesCm)}
                    unit="cm"
                    Icon={Ruler}
                  />
                )}
                {latest?.neckCm != null && (
                  <MetricRow
                    label="Neck"
                    value={fmtNumber(latest.neckCm)}
                    unit="cm"
                    Icon={Ruler}
                  />
                )}
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Daily reminder"
              sub={reminder.enabled ? formatReminderLabel(reminder) : "Off"}
            />
            <Card>
              <div className="px-4 py-4">
                <div className="mb-4 flex items-start justify-between gap-4 border-b border-border/45 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50">
                      <Bell size={15} className="text-foreground/60" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold">
                        Check-in prompt
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/55">
                        Keep one daily appointment with your own data.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      void applyReminder({
                        ...reminder,
                        enabled: !reminder.enabled,
                      })
                    }
                    className={cn(
                      "flex h-7 min-w-12 items-center rounded-full p-1 transition-colors",
                      reminder.enabled ? "bg-foreground" : "bg-muted"
                    )}
                    aria-label="Toggle reminder"
                  >
                    <span
                      className={cn(
                        "h-5 w-5 rounded-full bg-background transition-transform",
                        reminder.enabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/45 uppercase">
                    Time
                  </span>
                  <input
                    type="time"
                    value={`${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`}
                    onChange={(event) => {
                      const [hour, minute] = event.target.value
                        .split(":")
                        .map(Number)
                      void applyReminder({ ...reminder, hour, minute })
                    }}
                    className="h-11 rounded-[18px] border border-border/55 bg-background px-3 text-[14px] font-medium outline-none"
                  />
                </label>

                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/50">
                  Native reminders fire on installed iOS or Android builds. Web
                  still saves the schedule.
                </p>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Check-in ledger"
              sub={
                entries.length === 0
                  ? "No entries yet"
                  : `${entries.length} total`
              }
            />
            <div className="flex flex-col gap-2.5">
              {entries.length === 0 ? (
                <Card>
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Clock size={28} className="text-muted-foreground/20" />
                    <p className="text-[14px] font-medium">
                      No measurements logged
                    </p>
                    <p className="max-w-[18rem] text-[12px] text-muted-foreground/55">
                      Add one check-in. Repeat it daily if you want tighter trend data.
                    </p>
                  </div>
                </Card>
              ) : (
                [...entries].reverse().map((entry) => (
                  <Card key={entry.clientId}>
                    <div className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                            <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
                              {formatMeasurementDate(entry.loggedAt)}
                            </span>
                            {entry.weightKg != null && (
                              <span className="text-[13px] font-semibold tabular-nums">
                                {entry.weightKg.toFixed(1)} kg
                              </span>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground/62">
                            <span>Body fat {fmtNumber(entry.bodyFatPct)}%</span>
                            <span>Waist {fmtNumber(entry.waistCm)} cm</span>
                            <span>Hips {fmtNumber(entry.hipsCm)} cm</span>
                            <span>Chest {fmtNumber(entry.chestCm)} cm</span>
                          </div>

                          {entry.notes && (
                            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground/52">
                              {entry.notes}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={async () => {
                            try {
                              await removeMeasurement({ clientId: entry.clientId })
                            } catch (err) {
                              console.error("Failed to remove measurement:", err)
                            }
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/45 transition-colors active:bg-destructive/10 active:text-destructive"
                          aria-label="Delete measurement"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <BottomBar onAdd={() => setSheetOpen(true)} />

      {sheetOpen && (
        <MeasurementSheet
          onClose={() => setSheetOpen(false)}
          onSave={async (entry) => {
            const clientId = crypto.randomUUID()
            setSheetOpen(false)
            try {
              await saveMeasurement({ clientId, ...entry })
              toast.success("Measurement saved")
            } catch (err) {
              console.error("Failed to save measurement:", err)
            }
          }}
        />
      )}
    </div>
  )
}
