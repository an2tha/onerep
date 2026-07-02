import React, { useEffect, useMemo, useState } from "react"
import {
  Barbell,
  Camera,
  ChartLine,
  MagnifyingGlass,
  Plus,
  Ruler,
  X,
} from "@phosphor-icons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { toast } from "sonner"
import { useBottomBarAction } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import {
  bodyMeasurementCarryForwardDraft,
  localDateInputValue,
  type BodyMeasurementEntry,
} from "@/lib/body-progress"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  cn,
  createClientId,
  logDevError,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/lib/utils"
import { APP_ACCENT_COLORS } from "@/lib/design-tokens"
import { rollingAvg, sparklinePoints } from "@/lib/progress-metrics"

type GoalId = "lose" | "build" | "health" | "performance"

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

  const allValues = sharedScale ? series.flatMap((s) => s.values) : []
  const globalMin = sharedScale ? Math.min(...allValues) : undefined
  const globalMax = sharedScale ? Math.max(...allValues) : undefined

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-28 w-full overflow-visible short-phone:h-24"
    >
      {series.map((s, i) => {
        if (s.values.length < 2) return null
        const pts = sparklinePoints(
          s.values,
          width,
          height,
          globalMin,
          globalMax
        )
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
      <div className="flex items-center rounded-[10px] border border-border/55 bg-background px-3">
        <input
          type="text"
          name={`body-measurement-${label.toLowerCase().replace(/\s+/g, "-")}`}
          aria-label={`${label} measurement in ${unit}`}
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

type MeasurementDraft = Omit<
  BodyMeasurementEntry,
  "_id" | "clientId" | "photoDataUrl" | "photoStorageId" | "photoUrl"
> & { photoFile?: File }

function MeasurementSheet({
  lastEntry,
  onClose,
  onSave,
}: {
  lastEntry?: BodyMeasurementEntry | null
  onClose: () => void
  onSave: (entry: MeasurementDraft) => Promise<void> | void
}) {
  const today = localDateInputValue()
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
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>()
  const [photoFile, setPhotoFile] = useState<File | undefined>()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const saveRef = React.useRef(false)
  const carryForward = useMemo(
    () => bodyMeasurementCarryForwardDraft(lastEntry),
    [lastEntry]
  )

  function toNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        toast.error("Image too large. Please choose an image under 4MB.")
        return
      }
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoDataUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  function useLastMeasurement() {
    if (!carryForward) return
    setWeightKg(carryForward.weightKg)
    setBodyFatPct(carryForward.bodyFatPct)
    setWaistCm(carryForward.waistCm)
    setHipsCm(carryForward.hipsCm)
    setChestCm(carryForward.chestCm)
    setArmsCm(carryForward.armsCm)
    setThighsCm(carryForward.thighsCm)
    setCalvesCm(carryForward.calvesCm)
    setNeckCm(carryForward.neckCm)
    if (carryForward.hasAdvancedMeasurements) setShowAdvanced(true)
    toast.message(
      `${carryForward.filledCount} value${
        carryForward.filledCount === 1 ? "" : "s"
      } copied`
    )
  }

  const canSave =
    !saving &&
    (Boolean(toNumber(weightKg)) ||
      Boolean(toNumber(bodyFatPct)) ||
      Boolean(toNumber(waistCm)) ||
      Boolean(toNumber(hipsCm)) ||
      Boolean(toNumber(chestCm)) ||
      Boolean(toNumber(armsCm)) ||
      Boolean(toNumber(thighsCm)) ||
      Boolean(toNumber(calvesCm)) ||
      Boolean(toNumber(neckCm)) ||
      Boolean(photoDataUrl))

  async function handleSave() {
    if (!canSave || saveRef.current) return
    saveRef.current = true
    setSaving(true)
    try {
      await onSave({
        loggedAt,
        weightKg: toNumber(weightKg),
        bodyFatPct: toNumber(bodyFatPct),
        waistCm: toNumber(waistCm),
        hipsCm: hipsCm ? toNumber(hipsCm) : undefined,
        chestCm: chestCm ? toNumber(chestCm) : undefined,
        armsCm: armsCm ? toNumber(armsCm) : undefined,
        thighsCm: thighsCm ? toNumber(thighsCm) : undefined,
        calvesCm: calvesCm ? toNumber(calvesCm) : undefined,
        neckCm: neckCm ? toNumber(neckCm) : undefined,
        notes: notes.trim() || undefined,
        photoFile,
        photoTakenAt: photoFile ? Date.now() : undefined,
      })
    } catch {
      // Parent save handlers own user-facing error copy.
    } finally {
      saveRef.current = false
      setSaving(false)
    }
  }

  return (
    <MobileSheet
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={!saving}
      showHandle={!saving}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-sm border-t border-border/60"
      panelStyle={{
        paddingBottom: "var(--app-safe-bottom-lg)",
      }}
    >
      <div className="px-4 pt-1">
        <div className="mb-4 border-b border-border/45 pb-4">
          <p className="app-eyebrow">Daily check-in</p>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[1.35rem] leading-tight font-semibold">
                Body measurements
              </h2>
              {carryForward && lastEntry && (
                <p className="mt-1 text-[11px] font-medium text-muted-foreground/45">
                  Last {formatMeasurementDate(lastEntry.loggedAt)}
                </p>
              )}
            </div>
            {carryForward && (
              <button
                type="button"
                onClick={useLastMeasurement}
                className="app-button app-button-secondary h-9 shrink-0 px-3 text-[11px]"
              >
                Use last
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 short-phone:gap-2">
          {/* Core fields */}
          {[
            {
              label: "Weight",
              unit: "kg",
              value: weightKg,
              onChange: setWeightKg,
            },
            {
              label: "Body fat",
              unit: "%",
              value: bodyFatPct,
              onChange: setBodyFatPct,
            },
            {
              label: "Waist",
              unit: "cm",
              value: waistCm,
              onChange: setWaistCm,
            },
            { label: "Hips", unit: "cm", value: hipsCm, onChange: setHipsCm },
            {
              label: "Chest",
              unit: "cm",
              value: chestCm,
              onChange: setChestCm,
            },
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
            {showAdvanced
              ? "Fewer measurements"
              : "More measurements (arms, thighs, calves, neck)"}
          </button>

          {/* Advanced measurement sites */}
          {showAdvanced &&
            [
              { label: "Arms", unit: "cm", value: armsCm, onChange: setArmsCm },
              {
                label: "Thighs",
                unit: "cm",
                value: thighsCm,
                onChange: setThighsCm,
              },
              {
                label: "Calves",
                unit: "cm",
                value: calvesCm,
                onChange: setCalvesCm,
              },
              { label: "Neck", unit: "cm", value: neckCm, onChange: setNeckCm },
            ].map((field) => <MeasurementField key={field.label} {...field} />)}

          {/* Photo upload section */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/45 uppercase">
              Progress Photo
            </span>
            <input
              type="file"
              name="progress-photo"
              aria-label="Progress photo"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handlePhotoChange}
            />
            {photoDataUrl ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-[18px] border border-border/55">
                <img
                  src={photoDataUrl}
                  alt="Progress"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoDataUrl(undefined)
                    setPhotoFile(undefined)
                  }}
                  aria-label="Remove progress photo"
                  className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-[10px] bg-black/50 text-white backdrop-blur-md transition-colors active:bg-black/70"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="app-empty h-32 w-full flex-col justify-center text-muted-foreground/55 transition-colors active:bg-muted/30 active:text-foreground/60 short-phone:h-24"
              >
                <Camera size={24} />
                <span className="text-[11px] font-medium">Add photo</span>
              </button>
            )}
          </div>

          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/45 uppercase">
              Date
            </span>
            <input
              type="date"
              name="body-measurement-date"
              aria-label="Body measurement date"
              value={loggedAt}
              onChange={(event) => setLoggedAt(event.target.value)}
              className="app-input h-11"
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/45 uppercase">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="app-input min-h-[5.5rem] py-3 leading-relaxed"
              placeholder="Sleep, stress, cycle, travel, hydration."
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            aria-busy={saving}
            className={cn(
              "app-button flex-1 py-3 text-[13px] transition-colors",
              canSave
                ? "bg-foreground text-background active:opacity-80"
                : "bg-muted text-muted-foreground/40"
            )}
          >
            {saving ? "Saving..." : "Save check-in"}
          </button>
          <button
            onClick={saving ? undefined : onClose}
            disabled={saving}
            className="app-button app-button-quiet px-4 py-3 text-[13px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

type ProgressSet = {
  reps?: number
  weight?: number
  completed?: boolean
  type?: string
}

type ProgressExercise = {
  id?: string
  name?: string
  category?: string
  sets?: ProgressSet[]
}

type ProgressWorkoutLog = {
  date: string
  durationSeconds?: number
  exercises?: ProgressExercise[]
}

type RecentFoodLogDay = {
  date: string
  entries?: Array<{ calories?: number }>
}

type ComputedMetric = {
  id: string
  title: string
  group: string
  value: string
  detail: string
  description: string
  keywords: string[]
  tone?: string
}

type CustomMetric = {
  id: string
  title: string
  detail: string
}

const SELECTED_METRICS_KEY = "onerep:progress:selectedMetrics"
const CUSTOM_METRICS_KEY = "onerep:progress:customMetrics"

const DEFAULT_METRIC_IDS = [
  "body.weight_delta",
  "body.waist_delta",
  "strength.selected_delta",
  "strength.selected_volume",
] as const

type ExerciseProgressStat = {
  id: string
  name: string
  sessions: number
  sets: number
  totalVolume: number
  lastDate: string
  points: Array<{ date: string; best: number; volume: number }>
  firstBest: number
  lastBest: number
  delta: number
  prs: number
}

function localDateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function offsetDateKey(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

function lastDateKeys(todayKey: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    offsetDateKey(todayKey, index - count + 1)
  )
}

function daysBetweenKeys(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T12:00:00`).getTime()
  const to = new Date(`${toKey}T12:00:00`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

function fmtInt(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function safeRatio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function percentLabel(value: number) {
  if (!Number.isFinite(value)) return "—"
  return `${Math.round(value)}%`
}

function calorieTotal(day: RecentFoodLogDay) {
  return (day.entries ?? []).reduce(
    (sum, entry) => sum + (Number(entry.calories) || 0),
    0
  )
}

function signedValue(value: number | null | undefined, unit = "", digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}${unit}`
}

function completedSets(exercise: ProgressExercise) {
  return (exercise.sets ?? []).filter((set) => set.completed !== false)
}

function estimatedOneRepMax(set: ProgressSet) {
  const weight = Number(set.weight) || 0
  const reps = Number(set.reps) || 0
  if (weight <= 0 || reps <= 0) return 0
  return weight * (1 + reps / 30)
}

function setVolume(set: ProgressSet) {
  const weight = Number(set.weight) || 0
  const reps = Number(set.reps) || 0
  return weight > 0 && reps > 0 ? weight * reps : 0
}

function ProgressStatTile({
  label,
  value,
  detail,
  Icon,
  tone = "var(--foreground)",
}: {
  label: string
  value: string
  detail: string
  Icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" }>
  tone?: string
}) {
  return (
    <div className="min-w-0 rounded-[14px] bg-foreground/[0.045] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[9.5px] font-bold tracking-[0.12em] text-muted-foreground/48 uppercase">
          {label}
        </span>
        <Icon size={14} weight="bold" />
      </div>
      <p className="truncate text-[1.35rem] leading-none font-extrabold tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-[10.5px] font-semibold text-muted-foreground/52">
        {detail}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/70">
        <div
          className="h-full rounded-full"
          style={{ width: "100%", backgroundColor: tone, opacity: 0.7 }}
        />
      </div>
    </div>
  )
}

function EmptyProgressState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[16px] bg-muted/25 px-4 py-8 text-center">
      <ChartLine size={28} className="text-muted-foreground/22" />
      <p className="text-[14px] font-bold">{title}</p>
      <p className="max-w-[19rem] text-[12px] leading-5 text-muted-foreground/55">
        {detail}
      </p>
    </div>
  )
}

function MetricCard({
  metric,
  onRemove,
}: {
  metric: ComputedMetric
  onRemove: (id: string) => void
}) {
  return (
    <div className="group relative rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
      <button
        type="button"
        onClick={() => onRemove(metric.id)}
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-[0.45rem] text-muted-foreground/35 opacity-0 transition-opacity group-active:opacity-100 md:group-hover:opacity-100"
        aria-label={`Remove ${metric.title}`}
      >
        <X size={10} weight="bold" />
      </button>
      <p className="max-w-[calc(100%-1.5rem)] truncate text-[10px] font-bold text-muted-foreground/62">
        {metric.title}
      </p>
      <p className="mt-1 text-[1.15rem] leading-none font-extrabold tabular-nums">
        {metric.value}
      </p>
      <p className="mt-1 truncate text-[10px] font-semibold text-muted-foreground/48">
        {metric.detail}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/70">
        <div
          className="h-full rounded-full"
          style={{
            width: "100%",
            backgroundColor: metric.tone ?? "var(--foreground)",
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  )
}

function MetricGrid({
  metrics,
  onRemove,
  className,
}: {
  metrics: ComputedMetric[]
  onRemove: (id: string) => void
  className?: string
}) {
  if (metrics.length === 0) return null
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} onRemove={onRemove} />
      ))}
    </div>
  )
}

function MetricSearchSheet({
  metrics,
  selectedIds,
  customMetrics,
  onAddMetric,
  onRemoveMetric,
  onAddCustomMetric,
  onAiGenerate,
  onClose,
}: {
  metrics: ComputedMetric[]
  selectedIds: string[]
  customMetrics: CustomMetric[]
  onAddMetric: (id: string) => void
  onRemoveMetric: (id: string) => void
  onAddCustomMetric: (title: string) => void
  onAiGenerate: (prompt: string) => Promise<void> | void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiBusy, setAiBusy] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleMetrics = normalizedQuery
    ? metrics.filter((metric) =>
        [metric.title, metric.group, metric.description, ...metric.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : metrics

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-sm border-t border-border/60"
      panelStyle={{ paddingBottom: "var(--app-safe-bottom-lg)" }}
    >
      <div className="px-4 pt-1">
        <div className="mb-4 border-b border-border/45 pb-4">
          <p className="app-eyebrow">Metric library</p>
          <h2 className="mt-1.5 text-[1.35rem] leading-tight font-semibold">
            Add progress metrics
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground/58">
            Search, pin, remove, or generate a custom metric idea.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/45"
            />
            <input
              type="search"
              name="metric-library-search"
              aria-label="Search progress metrics"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search metrics: volume, waist, protein, streak..."
              className="h-11 w-full rounded-[0.8rem] border-0 bg-foreground/[0.045] pr-3 pl-9 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/38"
            />
          </div>

          <div className="rounded-[0.9rem] bg-foreground/[0.035] p-3">
            <p className="text-[10px] font-bold text-muted-foreground/58">
              AI generate
            </p>
            <div className="mt-2 flex gap-2">
              <input
                name="metric-ai-prompt"
                aria-label="Describe a metric to generate"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="e.g. fat loss, bench progress, consistency"
                className="min-w-0 flex-1 rounded-[0.7rem] border-0 bg-background px-3 text-[12.5px] font-semibold outline-none placeholder:text-muted-foreground/36"
              />
              <button
                type="button"
                disabled={aiBusy}
                onClick={async () => {
                  if (aiBusy) return
                  setAiBusy(true)
                  try {
                    await onAiGenerate(aiPrompt)
                    setAiPrompt("")
                  } finally {
                    setAiBusy(false)
                  }
                }}
                className="app-button app-button-primary h-10 shrink-0 px-3 text-[12px] disabled:opacity-45"
              >
                {aiBusy ? "Generating" : "Generate"}
              </button>
            </div>
          </div>

          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {visibleMetrics.map((metric) => {
              const selected = selectedIds.includes(metric.id)
              return (
                <button
                  key={metric.id}
                  type="button"
                  onClick={() =>
                    selected
                      ? onRemoveMetric(metric.id)
                      : onAddMetric(metric.id)
                  }
                  className={cn(
                    "w-full rounded-[0.85rem] px-3 py-3 text-left transition-colors",
                    selected
                      ? "bg-foreground text-background"
                      : "bg-foreground/[0.035] active:bg-foreground/[0.07]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold">
                        {metric.title}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] leading-4",
                          selected
                            ? "text-background/64"
                            : "text-muted-foreground/56"
                        )}
                      >
                        {metric.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold opacity-65">
                      {selected ? "Added" : metric.group}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="rounded-[0.9rem] bg-foreground/[0.035] p-3">
            <p className="text-[10px] font-bold text-muted-foreground/58">
              Custom metric
            </p>
            <div className="mt-2 flex gap-2">
              <input
                name="custom-progress-metric"
                aria-label="Custom progress metric name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a metric name"
                className="min-w-0 flex-1 rounded-[0.7rem] border-0 bg-background px-3 text-[12.5px] font-semibold outline-none placeholder:text-muted-foreground/36"
              />
              <button
                type="button"
                onClick={() => {
                  onAddCustomMetric(query)
                  setQuery("")
                }}
                className="app-button app-button-quiet h-10 shrink-0 px-3 text-[12px]"
              >
                Add custom
              </button>
            </div>
            {customMetrics.length > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground/42">
                {customMetrics.length} custom metric
                {customMetrics.length === 1 ? "" : "s"} saved locally.
              </p>
            )}
          </div>
        </div>
      </div>
    </MobileSheet>
  )
}

function buildExerciseProgress(
  workoutLogs: ProgressWorkoutLog[],
  recentDateSet: Set<string>
) {
  const byExercise = new Map<string, ExerciseProgressStat>()
  let sets30 = 0
  let volume30 = 0
  let duration30 = 0

  for (const log of workoutLogs) {
    const inRecentWindow = recentDateSet.has(log.date)
    if (inRecentWindow) duration30 += log.durationSeconds ?? 0

    for (const exercise of log.exercises ?? []) {
      const sets = completedSets(exercise)
      if (sets.length === 0) continue

      const id = exercise.id || exercise.name || "exercise"
      const name = exercise.name || id
      const strengthVolume = sets.reduce((sum, set) => sum + setVolume(set), 0)
      const best = Math.max(0, ...sets.map(estimatedOneRepMax))

      if (inRecentWindow) {
        sets30 += sets.length
        volume30 += strengthVolume
      }

      const existing = byExercise.get(id) ?? {
        id,
        name,
        sessions: 0,
        sets: 0,
        totalVolume: 0,
        lastDate: log.date,
        points: [],
        firstBest: 0,
        lastBest: 0,
        delta: 0,
        prs: 0,
      }

      existing.name = name
      existing.sessions += 1
      existing.sets += sets.length
      existing.totalVolume += strengthVolume
      existing.lastDate = log.date
      if (best > 0)
        existing.points.push({ date: log.date, best, volume: strengthVolume })
      byExercise.set(id, existing)
    }
  }

  const stats = Array.from(byExercise.values()).map((stat) => {
    let previousBest = 0
    let prs = 0
    for (const point of stat.points) {
      if (point.best > previousBest + 0.1) {
        if (previousBest > 0) prs += 1
        previousBest = point.best
      }
    }
    const firstBest = stat.points[0]?.best ?? 0
    const lastBest = stat.points[stat.points.length - 1]?.best ?? 0
    return {
      ...stat,
      firstBest,
      lastBest,
      delta: lastBest - firstBest,
      prs,
    }
  })

  const movers = [...stats]
    .filter((stat) => stat.points.length >= 2)
    .sort((a, b) => b.delta - a.delta || b.lastDate.localeCompare(a.lastDate))

  const workhorses = [...stats].sort(
    (a, b) => b.totalVolume - a.totalVolume || b.sessions - a.sessions
  )

  return {
    stats,
    movers,
    topExercise: movers[0] ?? workhorses[0] ?? null,
    prs30: stats.reduce((sum, stat) => sum + stat.prs, 0),
    sets30,
    volume30,
    duration30,
  }
}

export default function Progress() {
  const todayKey = useMemo(() => localDateKey(), [])
  const last30 = useMemo(() => lastDateKeys(todayKey, 30), [todayKey])
  const last7 = useMemo(() => lastDateKeys(todayKey, 7), [todayKey])
  const last30Set = useMemo(() => new Set(last30), [last30])
  const last7Set = useMemo(() => new Set(last7), [last7])

  const onboarding = useQuery(api.users.onboarding.get, {})
  const measurementsQuery = useQuery(api.bodyProgress.list, {})
  const workoutHistory = useQuery(api.logs.workouts.getHistory)
  const recentFoodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 30,
  })
  const goals = useQuery(api.users.users.getEffectiveGoals, { date: todayKey })
  const generateMetricSet = useAction(api.ai.metricGeneration.generateMetricSet)

  const generateUploadUrl = useMutation(api.bodyProgress.generateUploadUrl)
  const saveMeasurement = useOfflineMutation(
    api.bodyProgress.save,
    "bodyProgress.save"
  )
  const removeMeasurement = useOfflineMutation(
    api.bodyProgress.remove,
    "bodyProgress.remove"
  )

  const goal = (onboarding?.goal as GoalId) ?? null
  const entries = useMemo(
    () =>
      [...((measurementsQuery ?? []) as BodyMeasurementEntry[])].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt)
      ),
    [measurementsQuery]
  )
  const workoutLogs = useMemo(
    () =>
      [...((workoutHistory ?? []) as ProgressWorkoutLog[])].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    [workoutHistory]
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [metricSheetOpen, setMetricSheetOpen] = useState(false)
  useBottomBarAction(() => setSheetOpen(true))
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_METRIC_IDS]
    try {
      const saved = safeLocalStorageGet(SELECTED_METRICS_KEY)
      const parsed = saved ? JSON.parse(saved) : null
      return Array.isArray(parsed) && parsed.length > 0
        ? parsed.filter((id): id is string => typeof id === "string")
        : [...DEFAULT_METRIC_IDS]
    } catch {
      return [...DEFAULT_METRIC_IDS]
    }
  })
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = safeLocalStorageGet(CUSTOM_METRICS_KEY)
      const parsed = saved ? JSON.parse(saved) : null
      return Array.isArray(parsed)
        ? parsed.filter(
            (metric): metric is CustomMetric =>
              typeof metric?.id === "string" &&
              typeof metric?.title === "string" &&
              typeof metric?.detail === "string"
          )
        : []
    } catch {
      return []
    }
  })
  const [exerciseQuery, setExerciseQuery] = useState("")
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    safeLocalStorageSet(
      SELECTED_METRICS_KEY,
      JSON.stringify(selectedMetricIds)
    )
  }, [selectedMetricIds])

  useEffect(() => {
    if (typeof window === "undefined") return
    safeLocalStorageSet(
      CUSTOM_METRICS_KEY,
      JSON.stringify(customMetrics)
    )
  }, [customMetrics])

  const latest = entries.at(-1) ?? null
  const weightEntries = entries.filter((entry) => entry.weightKg != null)
  const bodyFatEntries = entries.filter((entry) => entry.bodyFatPct != null)
  const waistEntries = entries.filter((entry) => entry.waistCm != null)
  const trend = goalDelta(entries, goal)

  const weightValues = weightEntries.map((entry) => entry.weightKg!)
  const bodyFatValues = bodyFatEntries.map((entry) => entry.bodyFatPct!)
  const waistValues = waistEntries.map((entry) => entry.waistCm!)
  const weightRolling =
    weightValues.length >= 2 ? rollingAvg(weightValues, 7) : []

  const deltaFor = (values: number[]) =>
    values.length >= 2 ? values[values.length - 1] - values[0] : null

  const foodDays = (recentFoodLogs ?? []) as RecentFoodLogDay[]
  const foodDaysInWindow = foodDays.filter((day) => last30Set.has(day.date))
  const calorieTarget = Math.round(goals?.effective?.calories ?? 2000)
  const foodDateSet = new Set(
    foodDaysInWindow
      .filter((day) => (day.entries ?? []).length > 0)
      .map((day) => day.date)
  )
  const overshotDates = new Set(
    foodDaysInWindow
      .filter((day) => calorieTotal(day) > calorieTarget)
      .map((day) => day.date)
  )
  const averageCalories = foodDateSet.size
    ? Math.round(
        foodDaysInWindow.reduce((sum, day) => sum + calorieTotal(day), 0) /
          Math.max(1, foodDaysInWindow.length)
      )
    : 0

  const exerciseProgress = useMemo(
    () => buildExerciseProgress(workoutLogs, last30Set),
    [workoutLogs, last30Set]
  )

  const exerciseChoices = useMemo(() => {
    const query = exerciseQuery.trim().toLowerCase()
    const source = query
      ? exerciseProgress.stats.filter((exercise) =>
          exercise.name.toLowerCase().includes(query)
        )
      : exerciseProgress.movers.length > 0
        ? exerciseProgress.movers
        : exerciseProgress.stats

    return source.slice(0, 8)
  }, [exerciseProgress, exerciseQuery])

  const selectedExercise =
    exerciseQuery.trim() && exerciseChoices.length === 0
      ? null
      : (exerciseProgress.stats.find(
          (exercise) => exercise.id === selectedExerciseId
        ) ??
        exerciseChoices[0] ??
        exerciseProgress.topExercise)

  const bodyCheckinDays30 = new Set(
    entries
      .map((entry) => entry.loggedAt.slice(0, 10))
      .filter((date) => last30Set.has(date))
  )
  const workoutDays30 = new Set(
    workoutLogs.map((log) => log.date).filter((date) => last30Set.has(date))
  )
  const workoutDays7 = new Set(
    workoutLogs.map((log) => log.date).filter((date) => last7Set.has(date))
  )
  const latestCheckInAge = latest
    ? daysBetweenKeys(latest.loggedAt.slice(0, 10), todayKey)
    : null
  const totalWorkoutMinutes30 = Math.round(exerciseProgress.duration30 / 60)
  const underTargetDays = Math.max(0, foodDateSet.size - overshotDates.size)
  const adherenceScore = Math.round(
    safeRatio(bodyCheckinDays30.size, 30) * 30 +
      safeRatio(workoutDays30.size, 12) * 35 +
      safeRatio(foodDateSet.size, 30) * 35
  )

  const metricCatalog = useMemo<ComputedMetric[]>(
    () => [
      {
        id: "body.weight_current",
        title: "Current weight",
        group: "Body",
        value:
          latest?.weightKg != null ? `${fmtNumber(latest.weightKg)} kg` : "—",
        detail: latest ? formatMeasurementDate(latest.loggedAt) : "No check-in",
        description: "Latest logged body weight.",
        keywords: ["body", "weight", "scale", "latest"],
        tone: APP_ACCENT_COLORS.water,
      },
      {
        id: "body.weight_delta",
        title: "Weight change",
        group: "Body",
        value: signedValue(deltaFor(weightValues), " kg"),
        detail:
          weightValues.length >= 2 ? "since first check-in" : "Needs 2 weights",
        description: "Change from your first to latest logged weight.",
        keywords: ["body", "weight", "change", "fat loss", "bulk"],
        tone: APP_ACCENT_COLORS.water,
      },
      {
        id: "body.waist_current",
        title: "Current waist",
        group: "Body",
        value:
          latest?.waistCm != null ? `${fmtNumber(latest.waistCm)} cm` : "—",
        detail: "Latest waist measurement",
        description: "Latest logged waist circumference.",
        keywords: ["body", "waist", "measurement", "composition"],
      },
      {
        id: "body.waist_delta",
        title: "Waist change",
        group: "Body",
        value: signedValue(deltaFor(waistValues), " cm"),
        detail:
          waistValues.length >= 2 ? "since first waist" : "Needs 2 waists",
        description: "Waist change over logged check-ins.",
        keywords: ["body", "waist", "fat loss", "composition"],
      },
      {
        id: "body.bodyfat_current",
        title: "Current body fat",
        group: "Body",
        value:
          latest?.bodyFatPct != null ? `${fmtNumber(latest.bodyFatPct)}%` : "—",
        detail: "Latest body fat estimate",
        description: "Latest logged body fat percentage.",
        keywords: ["body", "body fat", "composition", "cut"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "body.bodyfat_delta",
        title: "Body fat change",
        group: "Body",
        value: signedValue(deltaFor(bodyFatValues), "%"),
        detail:
          bodyFatValues.length >= 2
            ? "since first body fat"
            : "Needs 2 entries",
        description: "Body fat percentage change over time.",
        keywords: ["body", "body fat", "change", "composition"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "body.checkins_30",
        title: "Body check-ins",
        group: "Body",
        value: String(bodyCheckinDays30.size),
        detail: "last 30 days",
        description: "How many days you logged body metrics recently.",
        keywords: ["body", "checkin", "consistency", "adherence"],
      },
      {
        id: "body.last_checkin_age",
        title: "Days since check-in",
        group: "Body",
        value: latestCheckInAge == null ? "—" : String(latestCheckInAge),
        detail: latestCheckInAge === 1 ? "day ago" : "days ago",
        description: "How stale your latest body metric is.",
        keywords: ["body", "stale", "checkin", "reminder"],
      },
      {
        id: "strength.selected_1rm",
        title: "Selected 1RM",
        group: "Strength",
        value: selectedExercise?.lastBest
          ? `${fmtNumber(selectedExercise.lastBest)} kg`
          : "—",
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "Latest estimated 1RM for the selected lift.",
        keywords: ["strength", "1rm", "exercise", "bench", "squat", "deadlift"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "strength.selected_delta",
        title: "Selected lift change",
        group: "Strength",
        value: selectedExercise
          ? signedValue(selectedExercise.delta, " kg")
          : "—",
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "Estimated 1RM change for the selected exercise.",
        keywords: ["strength", "progress", "change", "exercise", "pr"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "strength.selected_sessions",
        title: "Selected lift sessions",
        group: "Strength",
        value: selectedExercise ? String(selectedExercise.sessions) : "—",
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "How often this lift has been trained.",
        keywords: ["strength", "sessions", "frequency", "exercise"],
      },
      {
        id: "strength.selected_sets",
        title: "Selected lift sets",
        group: "Strength",
        value: selectedExercise ? fmtInt(selectedExercise.sets) : "—",
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "Total completed sets for selected exercise.",
        keywords: ["strength", "sets", "volume", "exercise"],
      },
      {
        id: "strength.selected_volume",
        title: "Selected lift volume",
        group: "Strength",
        value: selectedExercise ? fmtInt(selectedExercise.totalVolume) : "—",
        detail: selectedExercise ? "kg total" : "Search an exercise",
        description: "Total tonnage for the selected exercise.",
        keywords: ["strength", "volume", "tonnage", "exercise"],
      },
      {
        id: "strength.selected_prs",
        title: "Selected lift PRs",
        group: "Strength",
        value: selectedExercise ? String(selectedExercise.prs) : "—",
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "PR count detected for the selected exercise.",
        keywords: ["strength", "pr", "record", "exercise"],
      },
      {
        id: "training.workouts_30",
        title: "Training days",
        group: "Training",
        value: String(workoutDays30.size),
        detail: "last 30 days",
        description: "Number of days with a completed workout.",
        keywords: ["training", "workouts", "frequency", "consistency"],
      },
      {
        id: "training.workouts_7",
        title: "Weekly workouts",
        group: "Training",
        value: String(workoutDays7.size),
        detail: "last 7 days",
        description: "Training frequency this week.",
        keywords: ["training", "weekly", "frequency", "workouts"],
      },
      {
        id: "training.sets_30",
        title: "Completed sets",
        group: "Training",
        value: fmtInt(exerciseProgress.sets30),
        detail: "last 30 days",
        description: "Completed strength sets across all exercises.",
        keywords: ["training", "sets", "volume", "workload"],
      },
      {
        id: "training.volume_30",
        title: "Total tonnage",
        group: "Training",
        value: fmtInt(exerciseProgress.volume30),
        detail: "kg · last 30 days",
        description: "Total strength volume across logged sets.",
        keywords: ["training", "volume", "tonnage", "workload"],
      },
      {
        id: "training.minutes_30",
        title: "Training minutes",
        group: "Training",
        value: totalWorkoutMinutes30 > 0 ? `${totalWorkoutMinutes30}m` : "—",
        detail: "last 30 days",
        description: "Logged workout duration in the recent window.",
        keywords: ["training", "time", "duration", "minutes"],
      },
      {
        id: "training.prs_30",
        title: "PR count",
        group: "Training",
        value: String(exerciseProgress.prs30),
        detail: "detected from exercise history",
        description: "Total PR markers detected from your lift history.",
        keywords: ["training", "pr", "records", "strength"],
      },
      {
        id: "nutrition.logged_days",
        title: "Nutrition logged",
        group: "Nutrition",
        value: String(foodDateSet.size),
        detail: "days / 30",
        description: "How often food was logged in the last 30 days.",
        keywords: ["nutrition", "food", "logging", "adherence"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "nutrition.avg_calories",
        title: "Average calories",
        group: "Nutrition",
        value: averageCalories > 0 ? fmtInt(averageCalories) : "—",
        detail: "logged days average",
        description: "Average calorie intake on days with food logs.",
        keywords: ["nutrition", "calories", "average", "food"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "nutrition.days_over",
        title: "Days over budget",
        group: "Nutrition",
        value: String(overshotDates.size),
        detail: "last 30 days",
        description: "Days where calories exceeded target.",
        keywords: ["nutrition", "calories", "budget", "over", "cut"],
        tone: "var(--status-danger)",
      },
      {
        id: "nutrition.days_under",
        title: "Days under budget",
        group: "Nutrition",
        value: String(underTargetDays),
        detail: "logged days under target",
        description: "Logged food days at or under calorie target.",
        keywords: ["nutrition", "calories", "budget", "under", "adherence"],
        tone: APP_ACCENT_COLORS.complete,
      },
      {
        id: "adherence.score",
        title: "Adherence score",
        group: "Adherence",
        value: percentLabel(adherenceScore),
        detail: "body + training + food",
        description: "Composite of check-ins, workouts, and nutrition logging.",
        keywords: ["adherence", "consistency", "score", "habit"],
      },
    ],
    [
      adherenceScore,
      averageCalories,
      bodyCheckinDays30.size,
      bodyFatValues,
      exerciseProgress,
      foodDateSet.size,
      latest,
      latestCheckInAge,
      overshotDates.size,
      selectedExercise,
      totalWorkoutMinutes30,
      underTargetDays,
      waistValues,
      weightValues,
      workoutDays30.size,
      workoutDays7.size,
    ]
  )

  const metricMap = useMemo(
    () => new Map(metricCatalog.map((metric) => [metric.id, metric])),
    [metricCatalog]
  )
  const customMetricMap = useMemo(
    () => new Map(customMetrics.map((metric) => [metric.id, metric])),
    [customMetrics]
  )
  const selectedMetrics = selectedMetricIds
    .map((id) => {
      const metric = metricMap.get(id)
      if (metric) return metric
      const custom = customMetricMap.get(id)
      if (!custom) return null
      return {
        id: custom.id,
        title: custom.title,
        group: "Custom",
        value: "Custom",
        detail: custom.detail,
        description: custom.detail,
        keywords: [custom.title],
      } satisfies ComputedMetric
    })
    .filter((metric): metric is ComputedMetric => Boolean(metric))

  const topMetricsMobile = selectedMetrics.slice(0, 2)
  const bottomMetricsMobile = selectedMetrics.slice(2)
  const topMetricsDesktop = selectedMetrics.slice(0, 4)
  const bottomMetricsDesktop = selectedMetrics.slice(4)
  const bottomMetricsDesktopLeft = bottomMetricsDesktop.filter(
    (_, index) => index % 2 === 0
  )
  const bottomMetricsDesktopRight = bottomMetricsDesktop.filter(
    (_, index) => index % 2 === 1
  )

  function addMetric(id: string) {
    setSelectedMetricIds((current) =>
      current.includes(id) ? current : [...current, id]
    )
  }

  function removeMetric(id: string) {
    setSelectedMetricIds((current) => current.filter((item) => item !== id))
  }

  function addCustomMetric(title: string) {
    const clean = title.trim()
    if (!clean) return
    const metric: CustomMetric = {
      id: `custom:${Date.now()}`,
      title: clean.slice(0, 42),
      detail: "Custom user metric",
    }
    setCustomMetrics((current) => [...current, metric])
    addMetric(metric.id)
  }

  async function aiGenerateMetrics(prompt: string) {
    const clean = prompt.trim()
    if (!clean) {
      toast.message("Describe what you want to track")
      return
    }

    try {
      const result = await generateMetricSet({
        subapp: "progress",
        prompt: clean,
        maxResults: 4,
        metrics: metricCatalog.map((metric) => ({
          id: metric.id,
          title: metric.title,
          group: metric.group,
          description: metric.description,
          keywords: metric.keywords,
        })),
      })

      if (result.metricIds.length > 0) {
        setSelectedMetricIds((current) => [
          ...new Set([...current, ...result.metricIds]),
        ])
      }
      if (result.customMetricTitle) addCustomMetric(result.customMetricTitle)

      if (result.metricIds.length > 0 || result.customMetricTitle) {
        toast.success(
          result.source === "openai"
            ? "AI generated metric set"
            : "Generated metric set"
        )
        return
      }

      toast.message("No matching metrics found")
    } catch (error) {
      logDevError("Failed to generate metrics:", error)
      toast.error("Could not generate metrics")
    }
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page">
        <header className="app-header">
          <div className="min-w-0">
            <p className="app-eyebrow">Progress</p>
            <h1 className="app-title">Signals</h1>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Body composition and exercise-specific strength.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="app-button app-header-action bg-foreground text-background"
            aria-label="Add progress check-in"
          >
            <Plus size={13} weight="bold" /> Check in
          </button>
        </header>

        <section className="app-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="app-eyebrow">Body weight</p>
              <p className="mt-2 truncate text-[2.05rem] leading-none font-extrabold tracking-tight tabular-nums">
                {latest?.weightKg != null
                  ? `${fmtNumber(latest.weightKg)} kg`
                  : "No check-in"}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground/58">
                {latest
                  ? `${formatMeasurementDate(latest.loggedAt)} · ${trend ?? "trend pending"}`
                  : "Add weight, body fat, or waist to start."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="app-button app-button-quiet shrink-0"
            >
              Add
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <ProgressStatTile
              label="Weight"
              value={
                latest?.weightKg != null ? fmtNumber(latest.weightKg) : "—"
              }
              detail={trend ?? "needs 2"}
              Icon={Ruler}
              tone={APP_ACCENT_COLORS.water}
            />
            <ProgressStatTile
              label="Waist"
              value={latest?.waistCm != null ? fmtNumber(latest.waistCm) : "—"}
              detail={signedValue(deltaFor(waistValues), " cm")}
              Icon={Ruler}
              tone="var(--foreground)"
            />
            <ProgressStatTile
              label="Strength"
              value={
                selectedExercise?.lastBest
                  ? fmtNumber(selectedExercise.lastBest)
                  : "—"
              }
              detail={
                selectedExercise
                  ? signedValue(selectedExercise.delta, " kg")
                  : "pick lift"
              }
              Icon={Barbell}
              tone={APP_ACCENT_COLORS.progress}
            />
          </div>
        </section>

        <section className="app-surface mt-3 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="app-section-title">Pinned metrics</p>
              <p className="app-section-subtitle">
                Search or generate exactly what you want to track.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMetricSheetOpen(true)}
              className="app-button app-button-quiet h-9 shrink-0"
            >
              <MagnifyingGlass size={12} weight="bold" /> Metrics
            </button>
          </div>

          {selectedMetrics.length > 0 ? (
            <>
              <MetricGrid
                metrics={topMetricsMobile}
                onRemove={removeMetric}
                className="md:hidden"
              />
              <MetricGrid
                metrics={topMetricsDesktop}
                onRemove={removeMetric}
                className="hidden md:grid md:grid-cols-4"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMetricSheetOpen(true)}
              className="app-empty w-full justify-center py-4 text-[13px] font-semibold"
            >
              <Plus size={13} /> Add your first metric
            </button>
          )}
        </section>

        <section className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
          <div className="grid min-w-0 content-start gap-3">
            <div className="app-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="app-section-title">Body composition</p>
                  <p className="app-section-subtitle">
                    {latest
                      ? `Latest ${formatMeasurementDate(latest.loggedAt)}`
                      : "Weight, body fat, waist"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="app-button app-button-quiet h-9"
                >
                  Add
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                  <p className="text-[10px] font-bold text-muted-foreground/62">
                    Weight
                  </p>
                  <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                    {fmtNumber(latest?.weightKg)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(weightValues), " kg")}
                  </p>
                </div>
                <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                  <p className="text-[10px] font-bold text-muted-foreground/62">
                    Body fat
                  </p>
                  <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                    {fmtNumber(latest?.bodyFatPct)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(bodyFatValues), "%")}
                  </p>
                </div>
                <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                  <p className="text-[10px] font-bold text-muted-foreground/62">
                    Waist
                  </p>
                  <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                    {fmtNumber(latest?.waistCm)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(waistValues), " cm")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[0.9rem] bg-foreground/[0.035] px-3 pt-3 pb-2">
                {weightValues.length >= 2 ? (
                  <MultiLineChart
                    series={[
                      {
                        values: weightValues,
                        color:
                          "color-mix(in srgb, var(--foreground) 62%, transparent)",
                        strokeWidth: 2.6,
                      },
                      ...(weightRolling.length >= 2
                        ? [
                            {
                              values: weightRolling,
                              color: APP_ACCENT_COLORS.water,
                              strokeWidth: 2,
                              opacity: 0.9,
                            },
                          ]
                        : []),
                    ]}
                    sharedScale
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center text-center text-[12px] text-muted-foreground/50">
                    Add two weight check-ins to draw the trend.
                  </div>
                )}
              </div>
            </div>

            <div className="app-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="app-section-title">Recent check-ins</p>
                  <p className="app-section-subtitle">
                    {entries.length === 0
                      ? "No entries yet"
                      : `${entries.length} total`}
                  </p>
                </div>
              </div>

              {entries.length === 0 ? (
                <EmptyProgressState
                  title="No measurements logged"
                  detail="Add one check-in. Repeat it regularly to make the trend line useful."
                />
              ) : (
                <div className="divide-y divide-border/30">
                  {[...entries]
                    .reverse()
                    .slice(0, 5)
                    .map((entry) => (
                      <SlideToDeleteRow
                        key={entry.clientId ?? entry._id ?? entry.loggedAt}
                        deleteLabel="Delete measurement"
                        onDelete={() => {
                          void (async () => {
                            try {
                              await removeMeasurement({
                                clientId: entry.clientId,
                              })
                            } catch (err) {
                              logDevError(
                                "Failed to remove measurement:",
                                err
                              )
                            }
                          })()
                        }}
                        rowClassName="bg-card"
                      >
                        <div className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground/48 uppercase">
                              {formatMeasurementDate(entry.loggedAt)}
                            </p>
                            <p className="mt-1 truncate text-[13px] font-extrabold tabular-nums">
                              {entry.weightKg != null
                                ? `${entry.weightKg.toFixed(1)} kg`
                                : "Body check"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right text-[10.5px] font-semibold text-muted-foreground/52">
                            <p>{fmtNumber(entry.bodyFatPct)}% fat</p>
                            <p>{fmtNumber(entry.waistCm)} cm waist</p>
                          </div>
                        </div>
                      </SlideToDeleteRow>
                    ))}
                </div>
              )}
            </div>

            {bottomMetricsMobile.length > 0 && (
              <div className="app-surface p-4 md:hidden">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="app-section-title">More metrics</p>
                    <p className="app-section-subtitle">
                      Remaining pinned metrics
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="app-button app-button-quiet h-9 shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsMobile}
                  onRemove={removeMetric}
                />
              </div>
            )}

            {bottomMetricsDesktopLeft.length > 0 && (
              <div className="app-surface hidden p-4 md:block">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="app-section-title">More metrics</p>
                    <p className="app-section-subtitle">Pinned details</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="app-button app-button-quiet h-9 shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsDesktopLeft}
                  onRemove={removeMetric}
                />
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-3">
            <div className="app-surface p-4">
              <div className="mb-3">
                <p className="app-section-title">Strength trend</p>
                <p className="app-section-subtitle">
                  Search any logged exercise.
                </p>
              </div>

              <div className="relative mb-3">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/45"
                />
                <input
                  type="search"
                  name="strength-trend-exercise-search"
                  aria-label="Search strength trend exercise"
                  value={exerciseQuery}
                  onChange={(event) => setExerciseQuery(event.target.value)}
                  placeholder="Search exercise"
                  className="h-10 w-full rounded-[0.8rem] border-0 bg-foreground/[0.045] pr-3 pl-9 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/38"
                />
              </div>

              {exerciseChoices.length > 0 && (
                <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                  {exerciseChoices.map((exercise) => {
                    const active = selectedExercise?.id === exercise.id
                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => setSelectedExerciseId(exercise.id)}
                        className={cn(
                          "shrink-0 rounded-[0.7rem] px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                          active
                            ? "bg-foreground text-background"
                            : "bg-foreground/[0.045] text-muted-foreground/68 active:bg-foreground/[0.08]"
                        )}
                      >
                        {exercise.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedExercise ? (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="app-eyebrow">Selected lift</p>
                      <p className="mt-1 truncate text-[1.25rem] leading-tight font-extrabold">
                        {selectedExercise.name}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-muted-foreground/56">
                        {selectedExercise.points.length >= 2
                          ? `${fmtNumber(selectedExercise.firstBest)} → ${fmtNumber(selectedExercise.lastBest)} kg est. 1RM`
                          : `${selectedExercise.sessions} session${selectedExercise.sessions === 1 ? "" : "s"} logged`}
                      </p>
                    </div>
                    <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-2 text-right">
                      <p className="text-[10px] font-bold text-muted-foreground/52">
                        Change
                      </p>
                      <p className="mt-0.5 text-[16px] font-extrabold tabular-nums">
                        {signedValue(selectedExercise.delta, " kg")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[0.9rem] bg-foreground/[0.035] px-3 pt-3 pb-2">
                    {selectedExercise.points.length >= 2 ? (
                      <MultiLineChart
                        series={[
                          {
                            values: selectedExercise.points.map(
                              (point) => point.best
                            ),
                            color: APP_ACCENT_COLORS.progress,
                            strokeWidth: 2.8,
                          },
                        ]}
                        sharedScale
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center text-[12px] text-muted-foreground/45">
                        Add another session to draw the trend.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                      <p className="text-[10px] font-bold text-muted-foreground/62">
                        Sessions
                      </p>
                      <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                        {fmtInt(selectedExercise.sessions)}
                      </p>
                    </div>
                    <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                      <p className="text-[10px] font-bold text-muted-foreground/62">
                        Volume
                      </p>
                      <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                        {fmtInt(selectedExercise.totalVolume)}
                      </p>
                    </div>
                    <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
                      <p className="text-[10px] font-bold text-muted-foreground/62">
                        PRs
                      </p>
                      <p className="mt-1 text-[18px] font-extrabold tabular-nums">
                        {fmtInt(selectedExercise.prs)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyProgressState
                  title="No strength data"
                  detail="Log sets in a workout, then search an exercise here."
                />
              )}
            </div>

            {bottomMetricsDesktopRight.length > 0 && (
              <div className="app-surface hidden p-4 md:block">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="app-section-title">Metric details</p>
                    <p className="app-section-subtitle">Pinned details</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="app-button app-button-quiet h-9 shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsDesktopRight}
                  onRemove={removeMetric}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {metricSheetOpen && (
        <MetricSearchSheet
          metrics={metricCatalog}
          selectedIds={selectedMetricIds}
          customMetrics={customMetrics}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onAddCustomMetric={addCustomMetric}
          onAiGenerate={aiGenerateMetrics}
          onClose={() => setMetricSheetOpen(false)}
        />
      )}

      {sheetOpen && (
        <MeasurementSheet
          lastEntry={latest}
          onClose={() => setSheetOpen(false)}
          onSave={async ({ photoFile, ...entry }) => {
            const clientId = createClientId()
            try {
              let photoStorageId: Id<"_storage"> | undefined
              if (photoFile) {
                const uploadUrl = await generateUploadUrl()
                const response = await fetch(uploadUrl, {
                  method: "POST",
                  headers: { "Content-Type": photoFile.type || "image/jpeg" },
                  body: photoFile,
                })
                if (!response.ok) throw new Error("Photo upload failed")
                photoStorageId = (await response.json()).storageId as Id<"_storage">
              }
              await saveMeasurement({ clientId, ...entry, photoStorageId })
              toast.success("Measurement saved")
              setSheetOpen(false)
            } catch (err) {
              logDevError("Failed to save measurement:", err)
              toast.error("Could not save measurement")
              throw err
            }
          }}
        />
      )}
    </div>
  )
}
