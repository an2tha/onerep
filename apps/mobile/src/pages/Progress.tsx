import React, { useEffect, useMemo, useState } from "react"
import {
  Camera,
  CaretRight,
  ChartLine,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  Question,
  Sparkle,
  TrashSimple,
  X,
} from "@phosphor-icons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { toast } from "sonner"
import { useBottomBarAction } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { APP_ACCENT_COLORS } from "@/lib/design-tokens"
import { rollingAvg } from "@/lib/progress-metrics"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useSmoothNavigate } from "@/lib/navigation"

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
  label?: string
  strokeWidth?: number
  opacity?: number
  dashed?: boolean
}

type MetricGraphPoint = {
  date: string
  value: number
}

type MetricGraphSeries = {
  label: string
  points: MetricGraphPoint[]
  color: string
  strokeWidth?: number
  opacity?: number
  dashed?: boolean
}

type MetricGraph = {
  title: string
  subtitle: string
  unit?: string
  yDigits?: number
  emptyDetail?: string
  series: MetricGraphSeries[]
}

function appendUnit(label: string, unit?: string) {
  if (!unit) return label
  return unit === "%" ? `${label}%` : `${label} ${unit}`
}

function formatAxisValue(value: number, unit?: string, digits = 1) {
  if (!Number.isFinite(value)) return "—"
  const normalized = Math.abs(value) < 0.000001 ? 0 : value
  const abs = Math.abs(normalized)
  const hasFraction = Math.abs(normalized - Math.round(normalized)) > 0.001
  const displayDigits = digits === 0 && hasFraction ? 1 : abs >= 100 ? 0 : digits
  return appendUnit(normalized.toFixed(displayDigits), unit)
}

function formatGraphMetricValue(
  value: number,
  graph?: Pick<MetricGraph, "unit" | "yDigits">
) {
  return appendUnit(fmtNumber(value, graph?.yDigits ?? 1), graph?.unit)
}

function formatGraphMetricDelta(value: number, graph?: MetricGraph) {
  const normalized = Math.abs(value) < 0.000001 ? 0 : value
  const sign = normalized > 0 ? "+" : ""
  return `${sign}${formatGraphMetricValue(normalized, graph)}`
}

function MultiLineChart({
  series,
  width = 320,
  height = 180,
  sharedScale = true,
  xLabels = [],
  yUnit,
  yDigits = 1,
  showLegend = false,
  interactive = false,
  className,
}: {
  series: MetricSeries[]
  width?: number
  height?: number
  sharedScale?: boolean
  xLabels?: string[]
  yUnit?: string
  yDigits?: number
  showLegend?: boolean
  interactive?: boolean
  className?: string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const visibleSeries = series
    .map((item) => ({
      ...item,
      values: item.values.filter((value) => Number.isFinite(value)),
    }))
    .filter((item) => item.values.length > 0)

  if (visibleSeries.length === 0) return null

  const allValues = sharedScale
    ? visibleSeries.flatMap((item) => item.values)
    : visibleSeries[0]?.values ?? []
  if (allValues.length === 0) return null

  const rawMinValue = Math.min(...allValues)
  let minValue = rawMinValue
  let maxValue = Math.max(...allValues)
  const spread = maxValue - minValue
  const padding =
    spread === 0 ? Math.max(Math.abs(maxValue) * 0.08, 1) : spread * 0.08
  minValue -= padding
  maxValue += padding
  if (rawMinValue >= 0) minValue = Math.max(0, minValue)

  const yTicks = [maxValue, minValue + (maxValue - minValue) / 2, minValue]
  const yTickLabels = yTicks.map((tick) =>
    formatAxisValue(tick, yUnit, yDigits)
  )
  const axisLabelWidth = Math.min(
    68,
    Math.max(42, Math.max(...yTickLabels.map((label) => label.length)) * 4.3 + 12)
  )
  const plot = {
    top: showLegend ? 26 : 12,
    right: interactive ? 16 : 12,
    bottom: interactive ? 32 : 28,
    left: axisLabelWidth,
  }
  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const maxLength = Math.max(...visibleSeries.map((item) => item.values.length))
  const xTickIndexes = Array.from(
    new Set([0, Math.floor((maxLength - 1) / 2), maxLength - 1])
  ).filter((index) => index >= 0)

  function xFor(index: number, length: number) {
    if (length <= 1) return plot.left + plotWidth / 2
    return plot.left + (index / (length - 1)) * plotWidth
  }

  function yFor(value: number, values: number[]) {
    let localMin = minValue
    let localMax = maxValue
    if (!sharedScale) {
      const rawLocalMin = Math.min(...values)
      localMin = rawLocalMin
      localMax = Math.max(...values)
      const localSpread = localMax - localMin
      const localPadding =
        localSpread === 0
          ? Math.max(Math.abs(localMax) * 0.08, 1)
          : localSpread * 0.08
      localMin -= localPadding
      localMax += localPadding
      if (rawLocalMin >= 0) localMin = Math.max(0, localMin)
    }
    return (
      plot.top +
      ((localMax - value) / (localMax - localMin || 1)) * plotHeight
    )
  }

  function pointsFor(values: number[]) {
    return values
      .map(
        (value, index) =>
          `${xFor(index, values.length)},${yFor(value, values)}`
      )
      .join(" ")
  }

  function formatXAxisLabel(index: number) {
    const label = xLabels[index]
    if (!label) return index === 0 ? "Start" : "Now"
    return formatMeasurementDate(label.slice(0, 10))
  }

  function clampIndex(index: number) {
    return Math.min(maxLength - 1, Math.max(0, index))
  }

  function updateActiveIndex(event: React.PointerEvent<SVGSVGElement>) {
    if (!interactive || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const viewX = ((event.clientX - rect.left) / rect.width) * width
    const ratio = (viewX - plot.left) / Math.max(1, plotWidth)
    setActiveIndex(clampIndex(Math.round(ratio * (maxLength - 1))))
  }

  const displayIndex = interactive
    ? clampIndex(activeIndex ?? maxLength - 1)
    : null
  const activeX =
    displayIndex == null ? null : xFor(displayIndex, Math.max(1, maxLength))
  const activeDateLabel =
    displayIndex == null
      ? ""
      : xLabels[displayIndex]
        ? formatMeasurementDate(xLabels[displayIndex].slice(0, 10))
        : displayIndex === 0
          ? "Start"
          : "Now"
  const activeValues =
    displayIndex == null
      ? []
      : visibleSeries
          .map((item) => {
            const value = item.values[displayIndex]
            if (value == null || !Number.isFinite(value)) return null
            return {
              item,
              value,
              x: xFor(displayIndex, item.values.length),
              y: yFor(value, item.values),
            }
          })
          .filter(
            (
              item
            ): item is {
              item: MetricSeries
              value: number
              x: number
              y: number
            } => Boolean(item)
          )
  const tooltipRows = activeValues.slice(0, 3)
  const tooltipWidth = Math.min(
    154,
    Math.max(118, width - plot.left - plot.right - 16)
  )
  const tooltipHeight = 24 + tooltipRows.length * 13
  const tooltipX =
    activeX == null
      ? 0
      : activeX + tooltipWidth + 10 > width
        ? Math.max(4, activeX - tooltipWidth - 10)
        : activeX + 10
  const tooltipY = Math.max(4, plot.top + 4)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        "block w-full max-w-full overflow-hidden text-muted-foreground/45",
        interactive && "touch-none cursor-crosshair select-none",
        className
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label="Progress line chart with scaled axes"
      onPointerDown={interactive ? updateActiveIndex : undefined}
      onPointerMove={interactive ? updateActiveIndex : undefined}
    >
      <rect width={width} height={height} fill="transparent" />

      {showLegend && (
        <g>
          {visibleSeries.slice(0, 3).map((item, index) => (
            <g
              key={item.label ?? index}
              transform={`translate(${plot.left + index * 86} 9)`}
            >
              <line
                x1="0"
                x2="13"
                y1="0"
                y2="0"
                stroke={item.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={item.dashed ? "5 4" : undefined}
              />
              <text
                x="18"
                y="3"
                fill="currentColor"
                className="font-bold text-[8px] uppercase tracking-[0.12em]"
              >
                {item.label}
              </text>
            </g>
          ))}
        </g>
      )}

      {yTicks.map((tick, index) => {
        const y = plot.top + (index / (yTicks.length - 1)) * plotHeight
        return (
          <g key={`${tick}-${index}`}>
            <line
              x1={plot.left}
              x2={width - plot.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="0.65"
              opacity={index === yTicks.length - 1 ? 0.45 : 0.24}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={plot.left - 7}
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
              className="font-bold text-[8px] tabular-nums"
              opacity="0.78"
            >
              {yTickLabels[index]}
            </text>
          </g>
        )
      })}

      <line
        x1={plot.left}
        x2={plot.left}
        y1={plot.top}
        y2={height - plot.bottom}
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.4"
        vectorEffect="non-scaling-stroke"
      />

      {xTickIndexes.map((index) => {
        const x = xFor(index, maxLength)
        return (
          <g key={index}>
            <line
              x1={x}
              x2={x}
              y1={height - plot.bottom}
              y2={height - plot.bottom + 4}
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={height - 9}
              textAnchor="middle"
              fill="currentColor"
              className="font-bold text-[8px]"
              opacity="0.72"
            >
              {formatXAxisLabel(index)}
            </text>
          </g>
        )
      })}

      {visibleSeries.map((item, index) => {
        const lastIndex = item.values.length - 1
        const lastValue = item.values[lastIndex]
        const lastX = xFor(lastIndex, item.values.length)
        const lastY = yFor(lastValue, item.values)
        return (
          <g key={item.label ?? index}>
            {item.values.length >= 2 && (
              <polyline
                fill="none"
                stroke={item.color}
                strokeWidth={item.strokeWidth ?? 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={item.opacity ?? 1}
                strokeDasharray={item.dashed ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
                points={pointsFor(item.values)}
              />
            )}
            <circle
              cx={lastX}
              cy={lastY}
              r={item.strokeWidth ? item.strokeWidth + 0.8 : 3.2}
              fill="var(--background)"
              stroke={item.color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              opacity={item.opacity ?? 1}
            />
          </g>
        )
      })}

      {interactive && activeX != null && activeValues.length > 0 && (
        <g pointerEvents="none">
          <line
            x1={activeX}
            x2={activeX}
            y1={plot.top}
            y2={height - plot.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            opacity="0.55"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          {activeValues.map(({ item, value, x, y }) => (
            <circle
              key={`${item.label}-${value}`}
              cx={x}
              cy={y}
              r="4.1"
              fill="var(--background)"
              stroke={item.color}
              strokeWidth="2.2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g>
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="9"
              fill="var(--background)"
              stroke="currentColor"
              strokeWidth="0.7"
              opacity="0.96"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={tooltipX + 8}
              y={tooltipY + 13}
              fill="currentColor"
              className="font-extrabold text-[8px]"
            >
              {activeDateLabel}
            </text>
            {tooltipRows.map(({ item, value }, index) => (
              <text
                key={`${item.label}-${index}`}
                x={tooltipX + 8}
                y={tooltipY + 27 + index * 13}
                fill={item.color}
                className="font-bold text-[8px] tabular-nums"
              >
                {item.label}: {formatAxisValue(value, yUnit, yDigits)}
              </text>
            ))}
          </g>
        </g>
      )}
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
      <span className="font-semibold text-[10px] text-muted-foreground/45 uppercase tracking-[0.14em]">
        {label}
      </span>
      <div className="flex items-center bg-background px-3 border border-border/55 rounded-[10px]">
        <input
          type="text"
          name={`body-measurement-${label.toLowerCase().replace(/\s+/g, "-")}`}
          aria-label={`${label} measurement in ${unit}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent outline-none min-w-0 h-11 font-medium tabular-nums text-[14px]"
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
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (entry: MeasurementDraft) => void | Promise<void>
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
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>()
  const [photoFile, setPhotoFile] = useState<File | undefined>()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const saveRef = React.useRef(false)

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

  const canSave =
    Boolean(toNumber(weightKg)) ||
    Boolean(toNumber(bodyFatPct)) ||
    Boolean(toNumber(waistCm)) ||
    Boolean(toNumber(hipsCm)) ||
    Boolean(toNumber(chestCm)) ||
    Boolean(toNumber(armsCm)) ||
    Boolean(toNumber(thighsCm)) ||
    Boolean(toNumber(calvesCm)) ||
    Boolean(toNumber(neckCm)) ||
    Boolean(photoDataUrl)

  return (
    <MobileSheet
      onClose={saving ? () => {} : onClose}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-sm border-t border-border/60"
      panelStyle={{
        paddingBottom: "var(--app-safe-bottom-lg)",
      }}
      closeOnBackdrop={!saving}
      showHandle={!saving}
    >
      <div className="px-4 pt-1">
        <div className="mb-4 pb-4 border-border/45 border-b">
          <p className="app-eyebrow">Daily check-in</p>
          <h2 className="mt-1.5 font-semibold text-[1.35rem] leading-tight">
            Body measurements
          </h2>
        </div>

        <div className="gap-2.5 short-phone:gap-2 grid grid-cols-2">
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
            className="flex items-center gap-1.5 col-span-2 py-1 font-medium text-[11px] text-muted-foreground/50 active:text-foreground/60 transition-colors"
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
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="font-semibold text-[10px] text-muted-foreground/45 uppercase">
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
              <div className="relative border border-border/55 rounded-[18px] w-full aspect-square overflow-hidden">
                <img
                  src={photoDataUrl}
                  alt="Progress"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove progress photo"
                  onClick={() => {
                    setPhotoDataUrl(undefined)
                    setPhotoFile(undefined)
                  }}
                  className="top-2 right-2 absolute flex justify-center items-center bg-black/50 active:bg-black/70 backdrop-blur-md rounded-[10px] w-10 h-10 text-white transition-colors"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-col justify-center active:bg-muted/30 w-full h-32 short-phone:h-24 text-muted-foreground/55 active:text-foreground/60 transition-colors app-empty"
              >
                <Camera size={24} />
                <span className="font-medium text-[11px]">Add photo</span>
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="font-semibold text-[10px] text-muted-foreground/45 uppercase">
              Date
            </span>
            <input
              type="date"
              name="body-measurement-date"
              aria-label="Body measurement date"
              value={loggedAt}
              onChange={(event) => setLoggedAt(event.target.value)}
              className="h-11 app-input"
            />
          </label>

          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="font-semibold text-[10px] text-muted-foreground/45 uppercase">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="py-3 min-h-[5.5rem] leading-relaxed app-input"
              placeholder="Sleep, stress, cycle, travel, hydration."
            />
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            disabled={!canSave}
            aria-busy={saving}
            onClick={async () => {
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
              } finally {
                saveRef.current = false
                setSaving(false)
              }
            }}
            className={cn(
              "flex-1 py-3 text-[13px] transition-colors app-button",
              canSave
                ? "bg-foreground text-background active:opacity-80"
                : "bg-muted text-muted-foreground/40"
            )}
          >
            {saving ? "Saving..." : "Save check-in"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-3 text-[13px] app-button app-button-quiet"
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

type RecentFoodLogEntry = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

type RecentFoodLogDay = {
  date: string
  entries?: RecentFoodLogEntry[]
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
  graph?: MetricGraph
}

type CustomMetric = {
  id: string
  title: string
  detail: string
}

const SELECTED_METRICS_KEY = "onerep:progress:selectedMetrics"
const CUSTOM_METRICS_KEY = "onerep:progress:customMetrics"

const DEFAULT_METRIC_IDS = [
  "body.weight_rate",
  "nutrition.protein_adherence",
  "training.volume_change_7",
  "quality.data_confidence",
] as const

type ExerciseProgressStat = {
  id: string
  name: string
  sessions: number
  sets: number
  totalVolume: number
  lastDate: string
  points: Array<{ date: string; best: number; volume: number; sets: number }>
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

function macroTotal(day: RecentFoodLogDay, key: keyof RecentFoodLogEntry) {
  return (day.entries ?? []).reduce(
    (sum, entry) => sum + (Number(entry[key]) || 0),
    0
  )
}

function calorieTotal(day: RecentFoodLogDay) {
  return macroTotal(day, "calories")
}

function average(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return 0
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0)
    return null
  return ((current - previous) / previous) * 100
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function signedPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${Math.round(value)}%`
}

function signedValue(value: number | null | undefined, unit = "", digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}${unit}`
}

function goalLabel(goal: GoalId | null) {
  switch (goal) {
    case "lose":
      return "fat loss"
    case "build":
      return "muscle gain"
    case "performance":
      return "performance"
    case "health":
      return "health"
    default:
      return "goal"
  }
}

function goalAlignedWeightTrend(rateKgPerWeek: number | null, goal: GoalId | null) {
  if (rateKgPerWeek == null || !Number.isFinite(rateKgPerWeek)) return "Need data"
  if (goal === "lose") {
    if (rateKgPerWeek < -0.2 && rateKgPerWeek > -1.1) return "On track"
    if (rateKgPerWeek <= -1.1) return "Fast loss"
    return "Too flat"
  }
  if (goal === "build" || goal === "performance") {
    if (rateKgPerWeek > 0.1 && rateKgPerWeek < 0.6) return "On track"
    if (rateKgPerWeek >= 0.6) return "Fast gain"
    return "Too flat"
  }
  if (Math.abs(rateKgPerWeek) <= 0.25) return "Stable"
  return rateKgPerWeek > 0 ? "Trending up" : "Trending down"
}

function goalAlignedWeightTone(rateKgPerWeek: number | null, goal: GoalId | null) {
  const status = goalAlignedWeightTrend(rateKgPerWeek, goal)
  if (status === "On track" || status === "Stable") return APP_ACCENT_COLORS.complete
  if (status === "Need data") return "var(--foreground)"
  if (status === "Fast loss" || status === "Fast gain") return APP_ACCENT_COLORS.progress
  return "var(--status-danger)"
}

function valuePerWeek(points: MetricGraphPoint[]) {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const days = Math.max(1, daysBetweenKeys(first.date, last.date))
  return ((last.value - first.value) / days) * 7
}

function cumulativeAveragePoints(points: MetricGraphPoint[]) {
  let total = 0
  return points.map((point, index) => {
    total += point.value
    return { date: point.date, value: total / (index + 1) }
  })
}

function cumulativeDeltaPoints(points: MetricGraphPoint[]) {
  const first = points[0]?.value
  if (first == null) return []
  return points.map((point) => ({ ...point, value: point.value - first }))
}

function cumulativeCountPoints(dateKeys: string[], activeDates: Set<string>) {
  let total = 0
  return dateKeys.map((date) => {
    if (activeDates.has(date)) total += 1
    return { date, value: total }
  })
}

function cumulativeValuePoints(
  dateKeys: string[],
  valueForDate: (date: string) => number
) {
  let total = 0
  return dateKeys.map((date) => {
    const value = valueForDate(date)
    if (Number.isFinite(value)) total += value
    return { date, value: total }
  })
}

function cumulativePoints<T extends { date: string }>(
  points: T[],
  valueForPoint: (point: T) => number
) {
  let total = 0
  return points.map((point) => {
    const value = valueForPoint(point)
    if (Number.isFinite(value)) total += value
    return { date: point.date, value: total }
  })
}

function latestAgePoints(dateKeys: string[], checkinDates: string[]) {
  if (checkinDates.length === 0) return []
  let latestIndex = -1
  return dateKeys.map((date) => {
    while (
      latestIndex + 1 < checkinDates.length &&
      checkinDates[latestIndex + 1] <= date
    ) {
      latestIndex += 1
    }
    return {
      date,
      value:
        latestIndex >= 0 ? daysBetweenKeys(checkinDates[latestIndex], date) : 0,
    }
  })
}

function prProgressPoints(points: Array<{ date: string; best: number }>) {
  let previousBest = 0
  let prs = 0
  return points.map((point) => {
    if (point.best > previousBest + 0.1) {
      if (previousBest > 0) prs += 1
      previousBest = point.best
    }
    return { date: point.date, value: prs }
  })
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

function compareExerciseData(
  a: ExerciseProgressStat,
  b: ExerciseProgressStat
) {
  return (
    b.points.length - a.points.length ||
    b.sessions - a.sessions ||
    b.sets - a.sets ||
    b.totalVolume - a.totalVolume ||
    b.lastDate.localeCompare(a.lastDate) ||
    a.name.localeCompare(b.name)
  )
}

function ProgressOutcomeCard({
  label,
  value,
  detail,
  onAction,
  actionLabel,
  tone = "var(--foreground)",
  wide = false,
}: {
  label: string
  value: string
  detail: string
  onAction?: () => void
  actionLabel?: string
  tone?: string
  wide?: boolean
}) {
  const content = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: tone }}
        />
        <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/52">
          {label}
        </p>
      </div>
      <p className="truncate text-[1.45rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold leading-4 text-muted-foreground/55">
        {detail}
      </p>
      {actionLabel && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground/[0.055] px-2 py-1 text-[10px] font-extrabold text-muted-foreground/55">
          {actionLabel}
          <CaretRight size={10} weight="bold" />
        </span>
      )}
    </>
  )
  const className = cn(
    "min-w-0 rounded-[0.9rem] bg-foreground/[0.045] p-3",
    wide && "min-[520px]:col-span-2",
    onAction &&
      "text-left transition active:scale-[0.99] active:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
  )

  if (onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className={className}
        aria-label={`${actionLabel ?? "Open"}: ${label}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={className}>{content}</div>
  )
}

function ProgressActionRow({
  title,
  detail,
  actionLabel,
  onAction,
  askAiLabel,
  onAskAi,
  tone = "var(--foreground)",
}: {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
  askAiLabel: string
  onAskAi: () => void
  tone?: string
}) {
  return (
    <div className="rounded-[0.9rem] bg-foreground/[0.035] p-3">
      <div className="flex gap-3">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: tone }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold leading-tight">{title}</p>
          <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground/58">
            {detail}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-5">
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground/[0.07] px-3 text-[10.5px] font-extrabold text-foreground transition active:scale-[0.98] active:bg-foreground/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          aria-label={`${actionLabel}: ${title}`}
        >
          {actionLabel}
          <CaretRight size={10} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onAskAi}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground/[0.035] px-3 text-[10.5px] font-extrabold text-muted-foreground/58 transition active:scale-[0.98] active:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          aria-label={`${askAiLabel}: ${title}`}
        >
          <Sparkle size={10} weight="fill" />
          {askAiLabel}
        </button>
      </div>
    </div>
  )
}

function ProgressMiniMeter({
  label,
  value,
  detail,
  tone = "var(--foreground)",
}: {
  label: string
  value: number
  detail: string
  tone?: string
}) {
  const pct = clamp(value, 0, 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-bold text-muted-foreground/60">
          {label}
        </p>
        <p className="shrink-0 text-[11px] font-extrabold tabular-nums">
          {Math.round(pct)}%
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: tone }}
        />
      </div>
      <p className="mt-1 text-[10.5px] text-muted-foreground/45">{detail}</p>
    </div>
  )
}

type ProgressInsight = {
  id: string
  label: string
  title: string
  detail: string
  tone?: string
}

type AiCoachMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

function InsightCard({
  insight,
  onDelete,
  onClarify,
  clarifyBusy = false,
}: {
  insight: ProgressInsight
  onDelete?: (id: string) => void
  onClarify?: (insight: ProgressInsight) => void
  clarifyBusy?: boolean
}) {
  return (
    <div className="group/insight bg-foreground/[0.04] px-3 py-3 rounded-[0.9rem] min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="rounded-full size-2 shrink-0"
            style={{ backgroundColor: insight.tone ?? "var(--foreground)" }}
          />
          <p className="truncate font-bold text-[9.5px] text-muted-foreground/52 uppercase tracking-[0.12em]">
            {insight.label}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-60 transition-opacity md:opacity-0 md:group-hover/insight:opacity-70 md:group-focus-within/insight:opacity-70">
          {onClarify && (
            <button
              type="button"
              disabled={clarifyBusy}
              onClick={() => onClarify(insight)}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground/50 active:bg-foreground/[0.06] disabled:opacity-35"
              aria-label={`Ask AI to clarify ${insight.title}`}
            >
              <Question size={11} weight="bold" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(insight.id)}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground/40 active:bg-foreground/[0.06]"
              aria-label={`Delete ${insight.title}`}
            >
              <TrashSimple size={11} weight="bold" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 font-extrabold text-[13px] leading-tight">
        {insight.title}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/58 leading-4">
        {insight.detail}
      </p>
    </div>
  )
}

function InsightStrip({
  insights,
  onGenerateAi,
  onOpenAiHistory,
  onDeleteInsight,
  onClarifyInsight,
  aiBusy = false,
}: {
  insights: ProgressInsight[]
  onGenerateAi?: () => void
  onOpenAiHistory?: () => void
  onDeleteInsight?: (id: string) => void
  onClarifyInsight?: (insight: ProgressInsight) => void
  aiBusy?: boolean
}) {
  if (insights.length === 0) return null
  return (
    <section className="mt-3 p-4 app-surface">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="app-section-title">Coach analysis</p>
          <p className="app-section-subtitle">
            Trends translated into what to do next.
          </p>
        </div>
        {(onGenerateAi || onOpenAiHistory) && (
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
            {onGenerateAi && (
              <button
                type="button"
                disabled={aiBusy}
                onClick={onGenerateAi}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-foreground/[0.035] px-2 text-[10px] font-bold text-muted-foreground/45 transition-colors active:bg-foreground/[0.07] disabled:opacity-45"
                aria-label="Generate AI coaching advice"
              >
                <Sparkle size={10} weight="fill" />
                {aiBusy ? "Thinking" : "AI"}
              </button>
            )}
            {onOpenAiHistory && (
              <button
                type="button"
                onClick={onOpenAiHistory}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/[0.025] text-muted-foreground/38 transition-colors active:bg-foreground/[0.06]"
                aria-label="Open AI coach history"
              >
                <CaretRight size={12} weight="bold" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {insights.slice(0, 10).map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onDelete={onDeleteInsight}
            onClarify={onClarifyInsight}
            clarifyBusy={aiBusy}
          />
        ))}
      </div>
    </section>
  )
}

function AiCoachModal({
  messages,
  input,
  busy,
  onInputChange,
  onSend,
  onClose,
  onClear,
}: {
  messages: AiCoachMessage[]
  input: string
  busy: boolean
  onInputChange: (value: string) => void
  onSend: () => void
  onClose: () => void
  onClear: () => void
}) {
  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-sm border-t border-border/60"
      panelStyle={{ paddingBottom: "var(--app-safe-bottom-lg)" }}
      maxHeight="88vh"
    >
      <div className="flex min-h-[58vh] flex-col px-4 pt-1">
        <div className="flex items-start justify-between gap-3 border-b border-border/45 pb-3">
          <div className="min-w-0">
            <p className="app-eyebrow">AI coach</p>
            <h2 className="mt-1 text-[1.1rem] font-semibold leading-tight">
              Coaching history
            </h2>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground/48">
              Each sent message uses 1 AI request.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="flex h-8 items-center rounded-full bg-foreground/[0.035] px-2 text-[10px] font-bold text-muted-foreground/42 active:bg-foreground/[0.06]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full bg-foreground/[0.045] text-muted-foreground/55"
              aria-label="Close AI coach"
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3">
          {messages.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-[1rem] bg-foreground/[0.035] px-4 text-center">
              <Sparkle size={22} className="text-muted-foreground/28" weight="fill" />
              <p className="mt-2 text-[13px] font-bold">Ask a follow-up</p>
              <p className="mt-1 max-w-[18rem] text-[11.5px] leading-5 text-muted-foreground/52">
                Keep it specific: calories, lift plateau, fatigue, or which coaching card to act on first.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-[0.95rem] px-3 py-2 text-[12px] leading-5",
                  message.role === "user"
                    ? "ml-auto bg-foreground text-background"
                    : "mr-auto bg-foreground/[0.045] text-foreground"
                )}
              >
                {message.content}
              </div>
            ))
          )}
          {busy && (
            <div className="mr-auto max-w-[88%] rounded-[0.95rem] bg-foreground/[0.045] px-3 py-2 text-[12px] text-muted-foreground/55">
              Thinking…
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/35 pt-3">
          <input
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend()
            }}
            placeholder="Ask for tailored advice…"
            className="min-w-0 flex-1 rounded-[0.85rem] bg-foreground/[0.045] px-3 text-[12.5px] font-semibold outline-none placeholder:text-muted-foreground/35"
          />
          <button
            type="button"
            disabled={busy || input.trim().length < 2}
            onClick={onSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] bg-foreground text-background disabled:opacity-35"
            aria-label="Send AI coach message"
          >
            <PaperPlaneTilt size={14} weight="bold" />
          </button>
        </div>
      </div>
    </MobileSheet>
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
    <div className="flex flex-col items-center gap-2 bg-muted/25 px-4 py-8 rounded-[16px] text-center">
      <ChartLine size={28} className="text-muted-foreground/22" />
      <p className="font-bold text-[14px]">{title}</p>
      <p className="max-w-[19rem] text-[12px] text-muted-foreground/55 leading-5">
        {detail}
      </p>
    </div>
  )
}

function MetricCard({
  metric,
  onRemove,
  onOpen,
}: {
  metric: ComputedMetric
  onRemove: (id: string) => void
  onOpen: (id: string) => void
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onOpen(metric.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(metric.id)}
      onKeyDown={handleKeyDown}
      className="group relative bg-foreground/[0.045] active:bg-foreground/[0.08] px-3 py-3 rounded-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 transition cursor-pointer active:scale-[0.985]"
      aria-label={`Open ${metric.title} progression graph`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(metric.id)
        }}
        className="top-1.5 right-1.5 absolute flex justify-center items-center opacity-0 md:group-hover:opacity-100 group-active:opacity-100 focus:opacity-100 rounded-[0.45rem] w-6 h-6 text-muted-foreground/35 transition-opacity"
        aria-label={`Remove ${metric.title}`}
      >
        <X size={10} weight="bold" />
      </button>
      <p className="max-w-[calc(100%-1.5rem)] font-bold text-[10px] text-muted-foreground/62 truncate">
        {metric.title}
      </p>
      <p className="mt-1 font-extrabold tabular-nums text-[1.15rem] leading-none">
        {metric.value}
      </p>
      <p className="mt-1 font-semibold text-[10px] text-muted-foreground/48 truncate">
        {metric.detail}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 bg-background/70 rounded-full h-1 overflow-hidden">
          <div
            className="rounded-full h-full"
            style={{
              width: "100%",
              backgroundColor: metric.tone ?? "var(--foreground)",
              opacity: 0.7,
            }}
          />
        </div>
        <span className="font-bold text-[8.5px] text-muted-foreground/35 uppercase tracking-[0.12em]">
          Graph
        </span>
      </div>
    </div>
  )
}

function MetricGrid({
  metrics,
  onRemove,
  onOpenMetric,
  className,
}: {
  metrics: ComputedMetric[]
  onRemove: (id: string) => void
  onOpenMetric: (id: string) => void
  className?: string
}) {
  if (metrics.length === 0) return null
  return (
    <div className={cn("gap-2 grid grid-cols-2", className)}>
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          onRemove={onRemove}
          onOpen={onOpenMetric}
        />
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
        <div className="mb-4 pb-4 border-border/45 border-b">
          <p className="app-eyebrow">Metric library</p>
          <h2 className="mt-1.5 font-semibold text-[1.35rem] leading-tight">
            Add progress metrics
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground/58 leading-5">
            Search, pin, remove, or generate a custom metric idea.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="top-1/2 left-3 absolute text-muted-foreground/45 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="search"
              name="metric-library-search"
              aria-label="Search progress metrics"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search metrics: volume, waist, protein, streak..."
              className="bg-foreground/[0.045] pr-3 pl-9 border-0 rounded-[0.8rem] outline-none w-full h-11 font-semibold text-[13px] placeholder:text-muted-foreground/38"
            />
          </div>

          <div className="bg-foreground/[0.035] p-3 rounded-[0.9rem]">
            <p className="font-bold text-[10px] text-muted-foreground/58">
              AI generate
            </p>
            <div className="flex gap-2 mt-2">
              <input
                name="metric-ai-prompt"
                aria-label="Describe a metric to generate"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="e.g. fat loss, bench progress, consistency"
                className="flex-1 bg-background px-3 border-0 rounded-[0.7rem] outline-none min-w-0 font-semibold text-[12.5px] placeholder:text-muted-foreground/36"
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
                className="disabled:opacity-45 px-3 h-10 text-[12px] app-button app-button-primary shrink-0"
              >
                {aiBusy ? "Generating" : "Generate"}
              </button>
            </div>
          </div>

          <div className="space-y-2 pr-1 max-h-[45vh] overflow-y-auto">
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
                    "px-3 py-3 rounded-[0.85rem] w-full text-left transition-colors",
                    selected
                      ? "bg-foreground text-background"
                      : "bg-foreground/[0.035] active:bg-foreground/[0.07]"
                  )}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[13px] truncate">
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
                    <span className="opacity-65 font-bold text-[10px] shrink-0">
                      {selected ? "Added" : metric.group}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="bg-foreground/[0.035] p-3 rounded-[0.9rem]">
            <p className="font-bold text-[10px] text-muted-foreground/58">
              Custom metric
            </p>
            <div className="flex gap-2 mt-2">
              <input
                name="custom-progress-metric"
                aria-label="Custom progress metric name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a metric name"
                className="flex-1 bg-background px-3 border-0 rounded-[0.7rem] outline-none min-w-0 font-semibold text-[12.5px] placeholder:text-muted-foreground/36"
              />
              <button
                type="button"
                onClick={() => {
                  onAddCustomMetric(query)
                  setQuery("")
                }}
                className="px-3 h-10 text-[12px] app-button app-button-quiet shrink-0"
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

function MetricProgressChart({
  graph,
  expanded = false,
  interactive = false,
}: {
  graph: MetricGraph
  expanded?: boolean
  interactive?: boolean
}) {
  const primary = graph.series.find((item) => item.points.length > 0)
  const xLabels = primary?.points.map((point) => point.date) ?? []
  const series = graph.series
    .filter((item) => item.points.length > 0)
    .map((item) => ({
      label: item.label,
      values: item.points.map((point) => point.value),
      color: item.color,
      strokeWidth: item.strokeWidth,
      opacity: item.opacity,
      dashed: item.dashed,
    }))

  if (series.length === 0) return null

  return (
    <MultiLineChart
      series={series}
      xLabels={xLabels}
      yUnit={graph.unit}
      yDigits={graph.yDigits}
      width={expanded ? 390 : 320}
      height={expanded ? 240 : 180}
      showLegend={series.length > 1}
      interactive={interactive}
    />
  )
}

function ExpandableChartButton({
  children,
  onExpand,
}: {
  children: React.ReactNode
  onExpand?: () => void
}) {
  if (!onExpand) return <>{children}</>
  return (
    <button
      type="button"
      onClick={onExpand}
      className="block w-full rounded-[0.9rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      aria-label="Open interactive graph"
    >
      {children}
    </button>
  )
}

function MetricProgressSheet({
  metric,
  onClose,
}: {
  metric: ComputedMetric
  onClose: () => void
}) {
  const graph = metric.graph
  const primarySeries = graph?.series.find((item) => item.points.length > 0)
  const firstPoint = primarySeries?.points[0]
  const lastPoint = primarySeries?.points.at(-1)
  const delta =
    firstPoint && lastPoint ? lastPoint.value - firstPoint.value : null

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[5px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-sm border-t border-border/60"
      panelStyle={{ paddingBottom: "var(--app-safe-bottom-lg)" }}
      maxHeight="90vh"
    >
      <div className="px-4 pt-1">
        <div className="flex justify-between items-start gap-3 mb-4 pb-4 border-border/45 border-b">
          <div className="min-w-0">
            <p className="app-eyebrow">{metric.group} progression</p>
            <h2 className="mt-1.5 font-semibold text-[1.35rem] leading-tight">
              {graph?.title ?? metric.title}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground/58 leading-5">
              {graph?.subtitle ?? metric.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex justify-center items-center bg-foreground/[0.045] rounded-full w-9 h-9 text-muted-foreground/55 shrink-0"
            aria-label="Close metric graph"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="bg-foreground/[0.04] p-3 rounded-[1rem]">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <p className="font-bold text-[10px] text-muted-foreground/52 uppercase tracking-[0.13em]">
                Current
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[1.75rem] leading-none">
                {metric.value}
              </p>
              <p className="mt-1 font-semibold text-[11px] text-muted-foreground/52 truncate">
                {metric.detail}
              </p>
            </div>
            {delta != null && graph && (
              <div className="bg-background/80 px-3 py-2 rounded-[0.8rem] text-right shrink-0">
                <p className="font-bold text-[10px] text-muted-foreground/48">
                  Change
                </p>
                <p className="mt-0.5 font-extrabold tabular-nums text-[15px]">
                  {formatGraphMetricDelta(delta, graph)}
                </p>
              </div>
            )}
          </div>

          <div className="bg-background/65 mt-4 px-2 pt-3 pb-2 rounded-[0.9rem]">
            {graph && primarySeries ? (
              <MetricProgressChart graph={graph} interactive />
            ) : (
              <div className="flex flex-col justify-center items-center gap-2 h-36 text-center">
                <ChartLine size={26} className="text-muted-foreground/25" />
                <p className="font-bold text-[13px]">No progression yet</p>
                <p className="max-w-[18rem] text-[11.5px] text-muted-foreground/52 leading-5">
                  {graph?.emptyDetail ??
                    "Keep logging this metric and its trend will appear here."}
                </p>
              </div>
            )}
          </div>
        </div>

        {graph && firstPoint && lastPoint && (
          <div className="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                First
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {formatGraphMetricValue(firstPoint.value, graph)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                {formatMeasurementDate(firstPoint.date)}
              </p>
            </div>
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                Latest
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {formatGraphMetricValue(lastPoint.value, graph)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                {formatMeasurementDate(lastPoint.date)}
              </p>
            </div>
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                Points
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {primarySeries.points.length}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                logged
              </p>
            </div>
          </div>
        )}
      </div>
    </MobileSheet>
  )
}

function ExpandedGraphSheet({
  graph,
  onClose,
}: {
  graph: MetricGraph
  onClose: () => void
}) {
  const primarySeries = graph.series.find((item) => item.points.length > 0)
  const firstPoint = primarySeries?.points[0]
  const lastPoint = primarySeries?.points.at(-1)
  const delta =
    firstPoint && lastPoint ? lastPoint.value - firstPoint.value : null

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/55 backdrop-blur-[6px]"
      panelClassName="sheet-panel app-sheet-panel mx-auto w-full max-w-lg border-t border-border/60 md:max-w-2xl"
      panelStyle={{ paddingBottom: "var(--app-safe-bottom-lg)" }}
      maxHeight="92vh"
    >
      <div className="px-4 pt-1">
        <div className="flex justify-between items-start gap-3 mb-4 pb-4 border-border/45 border-b">
          <div className="min-w-0">
            <p className="app-eyebrow">Interactive graph</p>
            <h2 className="mt-1.5 font-semibold text-[1.35rem] leading-tight">
              {graph.title}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground/58 leading-5">
              {graph.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex justify-center items-center bg-foreground/[0.045] rounded-full w-9 h-9 text-muted-foreground/55 shrink-0"
            aria-label="Close expanded graph"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="bg-foreground/[0.04] p-3 rounded-[1rem]">
          <div className="bg-background/70 px-2 pt-3 pb-2 rounded-[0.9rem]">
            {primarySeries ? (
              <MetricProgressChart graph={graph} expanded interactive />
            ) : (
              <div className="flex flex-col justify-center items-center gap-2 h-44 text-center">
                <ChartLine size={28} className="text-muted-foreground/25" />
                <p className="font-bold text-[13px]">No progression yet</p>
                <p className="max-w-[18rem] text-[11.5px] text-muted-foreground/52 leading-5">
                  {graph.emptyDetail ??
                    "Keep logging this metric and its trend will appear here."}
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 text-center font-bold text-[10px] text-muted-foreground/42 uppercase tracking-[0.14em]">
            Drag or tap across the chart for exact values
          </p>
        </div>

        {graph && firstPoint && lastPoint && (
          <div className="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                Start
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {formatGraphMetricValue(firstPoint.value, graph)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                {formatMeasurementDate(firstPoint.date)}
              </p>
            </div>
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                Latest
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {formatGraphMetricValue(lastPoint.value, graph)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                {formatMeasurementDate(lastPoint.date)}
              </p>
            </div>
            <div className="bg-foreground/[0.04] px-3 py-3 rounded-[0.85rem]">
              <p className="font-bold text-[9.5px] text-muted-foreground/50 uppercase tracking-[0.12em]">
                Delta
              </p>
              <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                {delta == null ? "—" : formatGraphMetricDelta(delta, graph)}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/42">
                {primarySeries.points.length} points
              </p>
            </div>
          </div>
        )}
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
        existing.points.push({
          date: log.date,
          best,
          volume: strengthVolume,
          sets: sets.length,
        })
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
  const navigate = useSmoothNavigate()
  const todayKey = useMemo(() => localDateKey(), [])
  const last30 = useMemo(() => lastDateKeys(todayKey, 30), [todayKey])
  const last14 = useMemo(() => lastDateKeys(todayKey, 14), [todayKey])
  const last7 = useMemo(() => lastDateKeys(todayKey, 7), [todayKey])
  const last30Set = useMemo(() => new Set(last30), [last30])
  const last14Set = useMemo(() => new Set(last14), [last14])
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
  const generateCoachAdvice = useAction(
    api.ai.metricGeneration.generateCoachAdvice
  )
  const generateCoachChatMessage = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const { hasAiAccess, requireAiAccess, aiAccessModal } = useAiFeatureGate()

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
  const [openMetricGraphId, setOpenMetricGraphId] = useState<string | null>(
    null
  )
  const [expandedMetricGraphId, setExpandedMetricGraphId] = useState<
    string | null
  >(null)
  useBottomBarAction(() => setSheetOpen(true))
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_METRIC_IDS]
    try {
      const saved = window.localStorage.getItem(SELECTED_METRICS_KEY)
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
      const saved = window.localStorage.getItem(CUSTOM_METRICS_KEY)
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
  const [aiCoachInsights, setAiCoachInsights] = useState<ProgressInsight[]>([])
  const [dismissedInsightIds, setDismissedInsightIds] = useState<string[]>([])
  const [aiCoachBusy, setAiCoachBusy] = useState(false)
  const [aiCoachOpen, setAiCoachOpen] = useState(false)
  const [aiCoachInput, setAiCoachInput] = useState("")
  const [aiCoachMessages, setAiCoachMessages] = useState<AiCoachMessage[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = window.localStorage.getItem("onerep:progress:aiCoachHistory")
      const parsed = saved ? JSON.parse(saved) : null
      return Array.isArray(parsed)
        ? parsed.filter(
            (message): message is AiCoachMessage =>
              typeof message?.id === "string" &&
              (message?.role === "user" || message?.role === "assistant") &&
              typeof message?.content === "string"
          )
        : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      SELECTED_METRICS_KEY,
      JSON.stringify(selectedMetricIds)
    )
  }, [selectedMetricIds])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      CUSTOM_METRICS_KEY,
      JSON.stringify(customMetrics)
    )
  }, [customMetrics])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      "onerep:progress:aiCoachHistory",
      JSON.stringify(aiCoachMessages.slice(-30))
    )
  }, [aiCoachMessages])

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
  const underTargetDates = new Set(
    foodDaysInWindow
      .filter(
        (day) =>
          (day.entries ?? []).length > 0 && calorieTotal(day) <= calorieTarget
      )
      .map((day) => day.date)
  )
  const averageCalories = foodDateSet.size
    ? Math.round(
        foodDaysInWindow.reduce((sum, day) => sum + calorieTotal(day), 0) /
          Math.max(1, foodDateSet.size)
      )
    : 0

  const exerciseProgress = useMemo(
    () => buildExerciseProgress(workoutLogs, last30Set),
    [workoutLogs, last30Set]
  )

  const topDataExercises = useMemo(
    () => [...exerciseProgress.stats].sort(compareExerciseData).slice(0, 3),
    [exerciseProgress.stats]
  )

  const selectedExercise =
    exerciseProgress.stats.find((exercise) => exercise.id === selectedExerciseId) ??
    topDataExercises[0] ??
    exerciseProgress.topExercise

  const exerciseChoices = useMemo(() => {
    if (
      selectedExercise &&
      !topDataExercises.some((exercise) => exercise.id === selectedExercise.id)
    ) {
      return [
        selectedExercise,
        ...topDataExercises.filter((exercise) => exercise.id !== selectedExercise.id),
      ].slice(0, 3)
    }
    return topDataExercises
  }, [selectedExercise, topDataExercises])

  const exerciseSearchResults = useMemo(() => {
    const query = exerciseQuery.trim().toLowerCase()
    if (!query) return []
    const visibleIds = new Set(exerciseChoices.map((exercise) => exercise.id))
    return exerciseProgress.stats
      .filter(
        (exercise) =>
          !visibleIds.has(exercise.id) &&
          exercise.name.toLowerCase().includes(query)
      )
      .sort(compareExerciseData)
  }, [exerciseChoices, exerciseProgress.stats, exerciseQuery])

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
  const underTargetDays = underTargetDates.size
  const adherenceScore = Math.round(
    safeRatio(bodyCheckinDays30.size, 30) * 30 +
      safeRatio(workoutDays30.size, 12) * 35 +
      safeRatio(foodDateSet.size, 30) * 35
  )

  const bodyWeightPoints = weightEntries.map((entry) => ({
    date: entry.loggedAt.slice(0, 10),
    value: entry.weightKg!,
  }))
  const bodyFatPoints = bodyFatEntries.map((entry) => ({
    date: entry.loggedAt.slice(0, 10),
    value: entry.bodyFatPct!,
  }))
  const waistPoints = waistEntries.map((entry) => ({
    date: entry.loggedAt.slice(0, 10),
    value: entry.waistCm!,
  }))
  const weightRollingPoints = weightRolling.map((value, index) => ({
    date: bodyWeightPoints[index]?.date ?? todayKey,
    value,
  }))
  const bodyCheckinProgressPoints = cumulativeCountPoints(
    last30,
    bodyCheckinDays30
  )
  const latestAgeProgressPoints = latestAgePoints(
    last30,
    entries.map((entry) => entry.loggedAt.slice(0, 10))
  )

  const workoutTotalsByDate = new Map<
    string,
    { sets: number; hardSets: number; volume: number; minutes: number }
  >()
  const categoryVolume30 = new Map<string, number>()
  for (const log of workoutLogs) {
    if (!last30Set.has(log.date)) continue
    const totals = workoutTotalsByDate.get(log.date) ?? {
      sets: 0,
      hardSets: 0,
      volume: 0,
      minutes: 0,
    }
    totals.minutes += (log.durationSeconds ?? 0) / 60
    for (const exercise of log.exercises ?? []) {
      const sets = completedSets(exercise)
      const hardSets = sets.filter(
        (set) =>
          setVolume(set) > 0 &&
          !String(set.type ?? "").toLowerCase().includes("warm")
      )
      const strengthVolume = sets.reduce((sum, set) => sum + setVolume(set), 0)
      totals.sets += sets.length
      totals.hardSets += hardSets.length
      totals.volume += strengthVolume
      const category = exercise.category?.trim() || "General"
      categoryVolume30.set(
        category,
        (categoryVolume30.get(category) ?? 0) + strengthVolume
      )
    }
    workoutTotalsByDate.set(log.date, totals)
  }

  const workoutDayProgress30 = cumulativeCountPoints(last30, workoutDays30)
  const workoutDayProgress7 = cumulativeCountPoints(last7, workoutDays7)
  const trainingSetsProgress = cumulativeValuePoints(
    last30,
    (date) => workoutTotalsByDate.get(date)?.sets ?? 0
  )
  const trainingHardSetsProgress = cumulativeValuePoints(
    last30,
    (date) => workoutTotalsByDate.get(date)?.hardSets ?? 0
  )
  const trainingVolumeProgress = cumulativeValuePoints(
    last30,
    (date) => workoutTotalsByDate.get(date)?.volume ?? 0
  )
  const trainingMinutesProgress = cumulativeValuePoints(
    last30,
    (date) => workoutTotalsByDate.get(date)?.minutes ?? 0
  )

  const prEventsByDate = new Map<string, number>()
  for (const exercise of exerciseProgress.stats) {
    let best = 0
    for (const point of exercise.points) {
      if (point.best > best + 0.1) {
        if (best > 0) {
          prEventsByDate.set(
            point.date,
            (prEventsByDate.get(point.date) ?? 0) + 1
          )
        }
        best = point.best
      }
    }
  }
  const prDateKeys = Array.from(
    new Set([...workoutLogs.map((log) => log.date), ...prEventsByDate.keys()])
  ).sort((a, b) => a.localeCompare(b))
  const prProgress = cumulativeValuePoints(
    prDateKeys,
    (date) => prEventsByDate.get(date) ?? 0
  )

  const selectedExercisePoints = selectedExercise?.points ?? []
  const selectedBestProgress = selectedExercisePoints.map((point) => ({
    date: point.date,
    value: point.best,
  }))
  const selectedLiftRatePoints = selectedBestProgress.map((point, index) => {
    const first = selectedBestProgress[0]
    const days = first ? Math.max(1, daysBetweenKeys(first.date, point.date)) : 1
    return {
      date: point.date,
      value: first && index > 0 ? ((point.value - first.value) / days) * 7 : 0,
    }
  })
  const selectedSessionProgress = selectedExercisePoints.map((point, index) => ({
    date: point.date,
    value: index + 1,
  }))
  const selectedSetsProgress = cumulativePoints(
    selectedExercisePoints,
    (point) => point.sets
  )
  const selectedVolumeProgress = cumulativePoints(
    selectedExercisePoints,
    (point) => point.volume
  )
  const selectedPrProgress = prProgressPoints(selectedExercisePoints)

  const caloriesByDate = new Map(
    foodDaysInWindow.map((day) => [day.date, calorieTotal(day)])
  )
  const dailyCaloriesPoints = last30
    .filter((date) => foodDateSet.has(date))
    .map((date) => ({ date, value: caloriesByDate.get(date) ?? 0 }))
  const calorieTargetPoints = dailyCaloriesPoints.map((point) => ({
    date: point.date,
    value: calorieTarget,
  }))
  const foodLogProgress = cumulativeCountPoints(last30, foodDateSet)
  const daysOverProgress = cumulativeCountPoints(last30, overshotDates)
  const daysUnderProgress = cumulativeCountPoints(last30, underTargetDates)
  const adherenceProgress = last30.map((date, index) => ({
    date,
    value: Math.round(
      safeRatio(bodyCheckinProgressPoints[index]?.value ?? 0, 30) * 30 +
        safeRatio(workoutDayProgress30[index]?.value ?? 0, 12) * 35 +
        safeRatio(foodLogProgress[index]?.value ?? 0, 30) * 35
    ),
  }))

  const weightRateKgPerWeek = valuePerWeek(bodyWeightPoints)
  const weightGoalStatus = goalAlignedWeightTrend(weightRateKgPerWeek, goal)
  const weightGoalTone = goalAlignedWeightTone(weightRateKgPerWeek, goal)
  const weightRatePoints = bodyWeightPoints.map((point, index) => {
    const first = bodyWeightPoints[0]
    const days = first ? Math.max(1, daysBetweenKeys(first.date, point.date)) : 1
    return {
      date: point.date,
      value: first && index > 0 ? ((point.value - first.value) / days) * 7 : 0,
    }
  })
  const fatMassPoints = entries
    .filter((entry) => entry.weightKg != null && entry.bodyFatPct != null)
    .map((entry) => ({
      date: entry.loggedAt.slice(0, 10),
      value: entry.weightKg! * (entry.bodyFatPct! / 100),
    }))
  const leanMassPoints = entries
    .filter((entry) => entry.weightKg != null && entry.bodyFatPct != null)
    .map((entry) => ({
      date: entry.loggedAt.slice(0, 10),
      value: entry.weightKg! * (1 - entry.bodyFatPct! / 100),
    }))
  const waistToWeightPoints = entries
    .filter((entry) => entry.waistCm != null && entry.weightKg != null)
    .map((entry) => ({
      date: entry.loggedAt.slice(0, 10),
      value: entry.waistCm! / entry.weightKg!,
    }))
  const latestFatMass = fatMassPoints.at(-1)?.value ?? null
  const latestLeanMass = leanMassPoints.at(-1)?.value ?? null
  const latestWaistToWeight = waistToWeightPoints.at(-1)?.value ?? null
  const photoEntries = entries.filter(
    (entry) => entry.photoUrl || entry.photoDataUrl || entry.photoStorageId
  )
  const photoProgressPoints = cumulativeCountPoints(
    last30,
    new Set(photoEntries.map((entry) => entry.loggedAt.slice(0, 10)))
  )

  const foodDayMap = new Map(foodDaysInWindow.map((day) => [day.date, day]))
  const proteinTarget = Math.round(goals?.effective?.protein ?? 140)
  const carbsTarget = Math.round(goals?.effective?.carbs ?? 200)
  const fatTarget = Math.round(goals?.effective?.fat ?? 65)
  const foodRecords = last30.map((date) => {
    const day = foodDayMap.get(date)
    const logged = Boolean(day && (day.entries ?? []).length > 0)
    return {
      date,
      logged,
      calories: day ? calorieTotal(day) : 0,
      protein: day ? macroTotal(day, "protein") : 0,
      carbs: day ? macroTotal(day, "carbs") : 0,
      fat: day ? macroTotal(day, "fat") : 0,
    }
  })
  const loggedFoodRecords = foodRecords.filter((record) => record.logged)
  const averageProtein = average(loggedFoodRecords.map((record) => record.protein))
  const proteinHitRecords = loggedFoodRecords.map((record) => ({
    date: record.date,
    value: record.protein >= proteinTarget * 0.9 ? 100 : 0,
  }))
  const proteinAdherence = Math.round(
    average(proteinHitRecords.map((record) => record.value))
  )
  const dailyProteinPoints = loggedFoodRecords.map((record) => ({
    date: record.date,
    value: record.protein,
  }))
  const proteinTargetPoints = dailyProteinPoints.map((point) => ({
    date: point.date,
    value: proteinTarget,
  }))
  const proteinAdherenceProgress = cumulativeAveragePoints(proteinHitRecords)
  const calorieAccuracyRecords = loggedFoodRecords.map((record) => ({
    date: record.date,
    value:
      Math.abs(record.calories - calorieTarget) <= calorieTarget * 0.1
        ? 100
        : 0,
  }))
  const calorieAccuracy = Math.round(
    average(calorieAccuracyRecords.map((record) => record.value))
  )
  const avgCalorieDeviation = Math.round(
    average(
      loggedFoodRecords.map((record) => Math.abs(record.calories - calorieTarget))
    )
  )
  const calorieAccuracyProgress = cumulativeAveragePoints(calorieAccuracyRecords)
  const macroScorePoints = loggedFoodRecords.map((record) => {
    const calorieScore = 1 - Math.abs(record.calories - calorieTarget) / calorieTarget
    const proteinScore = 1 - Math.abs(record.protein - proteinTarget) / proteinTarget
    const carbsScore = 1 - Math.abs(record.carbs - carbsTarget) / carbsTarget
    const fatScore = 1 - Math.abs(record.fat - fatTarget) / fatTarget
    return {
      date: record.date,
      value: Math.round(
        clamp(
          average([calorieScore, proteinScore, carbsScore, fatScore]) * 100,
          0,
          100
        )
      ),
    }
  })
  const macroConsistency = Math.round(
    average(macroScorePoints.map((point) => point.value))
  )
  const macroConsistencyProgress = cumulativeAveragePoints(macroScorePoints)

  const previous7 = lastDateKeys(offsetDateKey(todayKey, -7), 7)
  const previous7Set = new Set(previous7)
  const avgCaloriesLast7 = average(
    foodRecords
      .filter((record) => record.logged && last7Set.has(record.date))
      .map((record) => record.calories)
  )
  const avgCaloriesPrevious7 = average(
    foodRecords
      .filter((record) => record.logged && previous7Set.has(record.date))
      .map((record) => record.calories)
  )
  const calorieChange7Pct = percentChange(
    avgCaloriesLast7,
    avgCaloriesPrevious7
  )
  const avgProteinLast7 = average(
    foodRecords
      .filter((record) => record.logged && last7Set.has(record.date))
      .map((record) => record.protein)
  )
  const avgProteinPrevious7 = average(
    foodRecords
      .filter((record) => record.logged && previous7Set.has(record.date))
      .map((record) => record.protein)
  )
  const proteinChange7Pct = percentChange(
    avgProteinLast7,
    avgProteinPrevious7
  )
  const last7Volume = sumValues(
    last7.map((date) => workoutTotalsByDate.get(date)?.volume ?? 0)
  )
  let previous7Volume = 0
  let previous7HardSets = 0
  let previous7WorkoutDays = 0
  for (const log of workoutLogs) {
    if (!previous7Set.has(log.date)) continue
    previous7WorkoutDays += 1
    for (const exercise of log.exercises ?? []) {
      const sets = completedSets(exercise)
      previous7Volume += sets.reduce((sum, set) => sum + setVolume(set), 0)
      previous7HardSets += sets.filter(
        (set) =>
          setVolume(set) > 0 &&
          !String(set.type ?? "").toLowerCase().includes("warm")
      ).length
    }
  }
  const last7HardSets = sumValues(
    last7.map((date) => workoutTotalsByDate.get(date)?.hardSets ?? 0)
  )
  const volumeChange7Pct = percentChange(last7Volume, previous7Volume)
  const workoutDayChange7Pct = percentChange(workoutDays7.size, previous7WorkoutDays)
  const hardSetChange7Pct = percentChange(last7HardSets, previous7HardSets)
  const avgHardSetsPerWeek30 = exerciseProgress.sets30 / (30 / 7)
  const topCategory = Array.from(categoryVolume30.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0]
  const categoryFocusShare = topCategory
    ? safeRatio(topCategory[1], exerciseProgress.volume30) * 100
    : 0
  const selectedLiftSessions30 = selectedExercisePoints.filter((point) =>
    last30Set.has(point.date)
  ).length
  const selectedLiftFrequency = selectedLiftSessions30 / (30 / 7)
  const selectedLiftRateKgPerWeek = valuePerWeek(selectedBestProgress)
  const selectedPrRatePerMonth = selectedExercisePoints.length >= 2
    ? safeRatio(
        selectedExercise?.prs ?? 0,
        Math.max(
          1,
          daysBetweenKeys(
            selectedExercisePoints[0].date,
            selectedExercisePoints[selectedExercisePoints.length - 1].date
          ) / 30
        )
      )
    : 0

  const bodyConfidence = Math.round(
    clamp(
      safeRatio(weightEntries.length, 8) * 55 +
        (latestCheckInAge == null ? 0 : clamp((14 - latestCheckInAge) / 14, 0, 1) * 45),
      0,
      100
    )
  )
  const nutritionConfidence = Math.round(clamp(safeRatio(foodDateSet.size, 14) * 100, 0, 100))
  const trainingConfidence = Math.round(clamp(safeRatio(workoutDays30.size, 8) * 100, 0, 100))
  const dataConfidenceScore = Math.round(
    average([bodyConfidence, nutritionConfidence, trainingConfidence])
  )
  const confidencePoints = last30.map((date, index) => {
    const bodyLogged = bodyCheckinProgressPoints[index]?.value ?? 0
    const foodLogged = foodLogProgress[index]?.value ?? 0
    const workoutsLogged = workoutDayProgress30[index]?.value ?? 0
    return {
      date,
      value: Math.round(
        average([
          clamp(safeRatio(bodyLogged, 8) * 100, 0, 100),
          clamp(safeRatio(foodLogged, 14) * 100, 0, 100),
          clamp(safeRatio(workoutsLogged, 8) * 100, 0, 100),
        ])
      ),
    }
  })

  const waistRateCmPerWeek = valuePerWeek(waistPoints)
  const bodyFatRatePctPerWeek = valuePerWeek(bodyFatPoints)
  const fatMassRateKgPerWeek = valuePerWeek(fatMassPoints)
  const leanMassRateKgPerWeek = valuePerWeek(leanMassPoints)
  const waistToWeightDelta =
    waistToWeightPoints.length >= 2
      ? waistToWeightPoints[waistToWeightPoints.length - 1].value -
        waistToWeightPoints[0].value
      : null
  const recentWeightPoints14 = bodyWeightPoints.filter((point) =>
    last14Set.has(point.date)
  )
  const weightRate14KgPerWeek = valuePerWeek(recentWeightPoints14)
  const weightPlateau =
    recentWeightPoints14.length >= 3 &&
    weightRate14KgPerWeek != null &&
    Math.abs(weightRate14KgPerWeek) < 0.1
  const avgCaloriesVsTarget =
    loggedFoodRecords.length > 0 ? averageCalories - calorieTarget : null
  const foodLoggedDays7 = foodRecords.filter(
    (record) => record.logged && last7Set.has(record.date)
  ).length
  const lastPhotoAge = photoEntries.at(-1)
    ? daysBetweenKeys(photoEntries.at(-1)!.loggedAt.slice(0, 10), todayKey)
    : null
  const selectedLiftAge = selectedExercise?.lastDate
    ? daysBetweenKeys(selectedExercise.lastDate, todayKey)
    : null
  const highWorkloadSpike =
    (volumeChange7Pct != null && volumeChange7Pct > 40) || last7HardSets > 26
  const workloadDrop = volumeChange7Pct != null && volumeChange7Pct < -30
  const lowTrainingDose = workoutDays7.size <= 1 || (last7HardSets > 0 && last7HardSets < 6)
  const strengthStall =
    selectedExercise != null &&
    selectedExercise.sessions >= 4 &&
    selectedLiftRateKgPerWeek != null &&
    selectedLiftRateKgPerWeek <= 0.05

  const progressInsights: ProgressInsight[] = []
  if (weightRateKgPerWeek != null) {
    progressInsights.push({
      id: "weight-goal",
      label: goalLabel(goal),
      title: `${weightGoalStatus}: ${signedValue(weightRateKgPerWeek, " kg/week")}`,
      detail:
        goal === "lose"
          ? "Fat-loss pace is judged against a sustainable weekly drop. Adjust calories only if this stays off-track for another week."
          : goal === "build" || goal === "performance"
            ? "Gain pace is judged against lean-mass focused progress. Faster is not always better."
            : "Your body-weight trend is evaluated for stability and drift.",
      tone: weightGoalTone,
    })
  }

  if (waistRateCmPerWeek != null || fatMassRateKgPerWeek != null) {
    const recompSignal =
      weightPlateau && waistRateCmPerWeek != null && waistRateCmPerWeek < -0.25
    progressInsights.push({
      id: "composition-signal",
      label: "body comp",
      title: recompSignal
        ? "Recomp signal: waist down while scale is flat"
        : fatMassRateKgPerWeek != null && fatMassRateKgPerWeek < -0.1
          ? `Fat mass trending ${signedValue(fatMassRateKgPerWeek, " kg/wk")}`
          : goal === "build" && waistToWeightDelta != null && waistToWeightDelta > 0.03
            ? "Bulk may be getting waist-heavy"
            : "Composition needs paired measurements",
      detail: recompSignal
        ? "Do not over-correct calories yet; waist movement suggests the scale is hiding useful progress."
        : leanMassRateKgPerWeek != null && leanMassRateKgPerWeek < -0.15
          ? "Lean-mass estimate is slipping. Check protein, lifting consistency, and deficit size."
          : bodyFatRatePctPerWeek != null
            ? `Body-fat estimate is moving ${signedValue(bodyFatRatePctPerWeek, "%/wk")}. Keep pairing weight with waist/body-fat logs.`
            : "Log weight with waist or body-fat on the same days to separate fat loss from scale noise.",
      tone: recompSignal || (fatMassRateKgPerWeek != null && fatMassRateKgPerWeek < -0.1)
        ? APP_ACCENT_COLORS.complete
        : APP_ACCENT_COLORS.progress,
    })
  }

  if (loggedFoodRecords.length >= 5 && weightRateKgPerWeek != null) {
    progressInsights.push({
      id: "energy-balance",
      label: "energy balance",
      title:
        goal === "lose" && weightRateKgPerWeek > -0.2 && (avgCaloriesVsTarget ?? 0) > 100
          ? "Deficit is not showing up yet"
          : (goal === "build" || goal === "performance") &&
              weightRateKgPerWeek < 0.1 &&
              (avgCaloriesVsTarget ?? 0) <= 0
            ? "Surplus is probably too small"
            : goal === "lose" && weightRateKgPerWeek < -1.1
              ? "Cut pace is aggressive"
              : "Calories and scale are coherent",
      detail:
        goal === "lose" && weightRateKgPerWeek > -0.2 && (avgCaloriesVsTarget ?? 0) > 100
          ? `Average intake is ${Math.abs(avgCaloriesVsTarget ?? 0)} cal above target while weight is not dropping. Tighten logging before lowering targets.`
          : (goal === "build" || goal === "performance") && weightRateKgPerWeek < 0.1
            ? "If performance is the priority, add a small planned calorie bump or improve carb timing around training."
            : goal === "lose" && weightRateKgPerWeek < -1.1
              ? "Fast loss can be fine briefly, but protect protein and training performance before pushing harder."
              : "Food logs and body trend point in the same direction; this makes adjustments more reliable.",
      tone:
        goal === "lose" && weightRateKgPerWeek > -0.2 && (avgCaloriesVsTarget ?? 0) > 100
          ? "var(--status-danger)"
          : APP_ACCENT_COLORS.complete,
    })
  }

  if (foodLoggedDays7 > 0 && foodLoggedDays7 < 4) {
    progressInsights.push({
      id: "nutrition-sampling",
      label: "nutrition data",
      title: `Only ${foodLoggedDays7}/7 food days logged`,
      detail:
        "Weekly calorie and macro conclusions are weak. Log at least four days this week before making target changes.",
      tone: APP_ACCENT_COLORS.progress,
    })
  }

  if (loggedFoodRecords.length > 0) {
    progressInsights.push({
      id: "nutrition-quality",
      label: "nutrition quality",
      title:
        proteinAdherence < 70
          ? `Protein is the weak link (${proteinAdherence}%)`
          : calorieAccuracy < 60
            ? `Calories are drifting (${avgCalorieDeviation} cal avg miss)`
            : `Nutrition is consistent (${macroConsistency}%)`,
      detail:
        proteinAdherence < 70
          ? `Average protein is ${Math.round(averageProtein)}g against a ${proteinTarget}g target. Prioritize protein before chasing smaller macro tweaks.`
          : calorieAccuracy < 60
            ? "Most logged days are outside ±10% of target. Tighten portions or plan meals earlier in the day."
            : "Protein and macro targets are close enough for the trend data to mean something.",
      tone:
        proteinAdherence >= 70 && calorieAccuracy >= 60
          ? APP_ACCENT_COLORS.complete
          : "var(--status-danger)",
    })
  }

  if (selectedExercise && selectedExercise.points.length >= 2) {
    progressInsights.push({
      id: "selected-lift-coach",
      label: "lift coach",
      title:
        selectedLiftFrequency < 1
          ? `${selectedExercise.name} is under-dosed`
          : strengthStall
            ? `${selectedExercise.name} is stalling`
            : selectedLiftRateKgPerWeek != null && selectedLiftRateKgPerWeek > 0.25
              ? `${selectedExercise.name} has momentum`
              : `${selectedExercise.name} is being maintained`,
      detail:
        selectedLiftFrequency < 1
          ? `It appears ${selectedLiftFrequency.toFixed(1)}x/week in the last 30 days. Most lifts need more exposures to progress reliably.`
          : strengthStall
            ? "Keep the lift in rotation, but change one variable: rep range, pause/tempo, or backoff volume."
            : selectedLiftAge != null && selectedLiftAge > 14
              ? `Last exposure was ${selectedLiftAge} days ago. The trend is stale until you train it again.`
              : `Estimated 1RM pace is ${signedValue(selectedLiftRateKgPerWeek, " kg/wk", 2)} with ${selectedExercise.sessions} logged sessions.`,
      tone:
        selectedLiftFrequency < 1 || strengthStall
          ? APP_ACCENT_COLORS.progress
          : APP_ACCENT_COLORS.complete,
    })
  }

  if (highWorkloadSpike || workloadDrop || lowTrainingDose) {
    progressInsights.push({
      id: "recovery-dose",
      label: "recovery dose",
      title: highWorkloadSpike
        ? "Fatigue risk is elevated"
        : workloadDrop
          ? "Training load dropped sharply"
          : "Training dose is probably too low",
      detail: highWorkloadSpike
        ? `${fmtInt(last7HardSets)} hard sets and ${signedPercent(volumeChange7Pct)} volume change this week. Avoid testing maxes until performance rebounds.`
        : workloadDrop
          ? "If this was not a planned deload, schedule one achievable session to keep momentum."
          : "One or fewer workout days, or fewer than six hard sets, is usually not enough stimulus for visible strength progress.",
      tone: highWorkloadSpike ? APP_ACCENT_COLORS.progress : "var(--status-danger)",
    })
  }

  if (
    loggedFoodRecords.length >= 5 &&
    proteinAdherence < 70 &&
    selectedExercise &&
    strengthStall
  ) {
    progressInsights.push({
      id: "protein-strength-link",
      label: "fueling strength",
      title: "Strength plateau may be protein-limited",
      detail: `Protein adherence is ${proteinAdherence}% while ${selectedExercise.name} is flat. Fix protein consistency before adding more sets.`,
      tone: "var(--status-danger)",
    })
  }

  if (photoEntries.length === 0 && entries.length >= 3) {
    progressInsights.push({
      id: "photo-gap",
      label: "visual proof",
      title: "Add progress photos",
      detail:
        "You have enough body check-ins for a trend, but no photos. Photos catch recomposition that scale and waist can miss.",
      tone: APP_ACCENT_COLORS.water,
    })
  } else if (lastPhotoAge != null && lastPhotoAge > 30) {
    progressInsights.push({
      id: "photo-stale",
      label: "visual proof",
      title: "Progress photo is stale",
      detail: `Last photo is ${lastPhotoAge} days old. Take a matched-lighting photo to make body composition changes easier to judge.`,
      tone: APP_ACCENT_COLORS.water,
    })
  }

  progressInsights.push({
    id: "training-quality",
    label: "training quality",
    title:
      volumeChange7Pct == null
        ? `${Math.round(avgHardSetsPerWeek30)} hard sets/week avg`
        : `Volume ${signedPercent(volumeChange7Pct)} vs prior week`,
    detail:
      volumeChange7Pct != null && volumeChange7Pct < -30
        ? "Workload dropped sharply. If this was not planned, schedule easier sessions before testing strength."
        : volumeChange7Pct != null && volumeChange7Pct > 40
          ? "Workload spiked. Watch soreness and performance; this is where fatigue can mask progress."
          : topCategory
            ? `${topCategory[0]} is your largest recent focus at ${Math.round(categoryFocusShare)}% of tonnage.`
            : "Log completed sets with weights to unlock workload and focus analysis.",
    tone:
      volumeChange7Pct != null && (volumeChange7Pct < -30 || volumeChange7Pct > 40)
        ? APP_ACCENT_COLORS.progress
        : APP_ACCENT_COLORS.complete,
  })
  progressInsights.push({
    id: "data-confidence",
    label: "confidence",
    title: `${dataConfidenceScore}% data confidence`,
    detail:
      dataConfidenceScore < 55
        ? "There is not enough recent body, food, and training data for strong conclusions yet."
        : latestCheckInAge != null && latestCheckInAge > 7
          ? "Training and food data exist, but body trend confidence is stale. Add a check-in."
          : "Enough recent data exists for these trends to be directionally useful.",
    tone:
      dataConfidenceScore >= 70
        ? APP_ACCENT_COLORS.complete
        : dataConfidenceScore >= 45
          ? APP_ACCENT_COLORS.progress
          : "var(--status-danger)",
  })

  const metricCatalog: ComputedMetric[] = (() => {
      const metricGraphs = new Map<string, MetricGraph>([
        [
          "body.weight_current",
          {
            title: "Weight trend",
            subtitle: "Scale weight across logged body check-ins.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Add at least one weight check-in to begin the line.",
            series: [
              {
                label: "Weight",
                points: bodyWeightPoints,
                color: APP_ACCENT_COLORS.water,
                strokeWidth: 2.8,
              },
              ...(weightRollingPoints.length >= 2
                ? [
                    {
                      label: "Rolling",
                      points: weightRollingPoints,
                      color: "color-mix(in srgb, var(--foreground) 58%, transparent)",
                      strokeWidth: 2,
                      opacity: 0.8,
                      dashed: true,
                    },
                  ]
                : []),
            ],
          },
        ],
        [
          "body.weight_delta",
          {
            title: "Weight change",
            subtitle: "Cumulative change from your first weight entry.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Log two weights to see how this delta moves.",
            series: [
              {
                label: "Change",
                points: cumulativeDeltaPoints(bodyWeightPoints),
                color: APP_ACCENT_COLORS.water,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.weight_rate",
          {
            title: "Weight pace",
            subtitle: `Weekly weight velocity compared with your ${goalLabel(goal)} goal.`,
            unit: "kg/wk",
            yDigits: 2,
            emptyDetail: "Log at least two weights to calculate weekly pace.",
            series: [
              {
                label: "Pace",
                points: weightRatePoints,
                color: weightGoalTone,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.fat_mass",
          {
            title: "Fat mass estimate",
            subtitle: "Estimated fat mass from weight and body-fat entries.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Log weight and body fat together to estimate fat mass.",
            series: [
              {
                label: "Fat mass",
                points: fatMassPoints,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.lean_mass",
          {
            title: "Lean mass estimate",
            subtitle: "Estimated lean mass from weight and body-fat entries.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Log weight and body fat together to estimate lean mass.",
            series: [
              {
                label: "Lean",
                points: leanMassPoints,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.waist_to_weight",
          {
            title: "Waist-to-weight ratio",
            subtitle: "Waist centimeters divided by body weight kilograms.",
            yDigits: 2,
            emptyDetail: "Log waist and weight together to track this ratio.",
            series: [
              {
                label: "Ratio",
                points: waistToWeightPoints,
                color: "var(--foreground)",
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.photo_checkins",
          {
            title: "Progress photo cadence",
            subtitle: "Cumulative photo check-ins over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Attach progress photos to body check-ins to compare visually.",
            series: [
              {
                label: "Photos",
                points: photoProgressPoints,
                color: APP_ACCENT_COLORS.water,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.waist_current",
          {
            title: "Waist trend",
            subtitle: "Waist circumference across check-ins.",
            unit: "cm",
            yDigits: 1,
            emptyDetail: "Add a waist measurement to start this chart.",
            series: [
              {
                label: "Waist",
                points: waistPoints,
                color: "var(--foreground)",
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.waist_delta",
          {
            title: "Waist change",
            subtitle: "Cumulative waist change from your first waist entry.",
            unit: "cm",
            yDigits: 1,
            emptyDetail: "Log two waist measurements to see the delta.",
            series: [
              {
                label: "Change",
                points: cumulativeDeltaPoints(waistPoints),
                color: "var(--foreground)",
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.bodyfat_current",
          {
            title: "Body fat trend",
            subtitle: "Body fat percentage across check-ins.",
            unit: "%",
            yDigits: 1,
            emptyDetail: "Add a body fat estimate to start this chart.",
            series: [
              {
                label: "Body fat",
                points: bodyFatPoints,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.bodyfat_delta",
          {
            title: "Body fat change",
            subtitle: "Cumulative percentage-point change from the first body fat entry.",
            unit: "%",
            yDigits: 1,
            emptyDetail: "Log two body fat estimates to see the delta.",
            series: [
              {
                label: "Change",
                points: cumulativeDeltaPoints(bodyFatPoints),
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.checkins_30",
          {
            title: "Check-in cadence",
            subtitle: "Cumulative body check-in days over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Log a body check-in to see cadence build.",
            series: [
              {
                label: "Check-ins",
                points: bodyCheckinProgressPoints,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "body.last_checkin_age",
          {
            title: "Check-in freshness",
            subtitle: "Days elapsed since the latest body check-in on each day.",
            unit: "days",
            yDigits: 0,
            emptyDetail: "Log a check-in to begin freshness tracking.",
            series: [
              {
                label: "Age",
                points: latestAgeProgressPoints,
                color: "var(--foreground)",
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_1rm",
          {
            title: "Estimated 1RM",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Train this lift with weight and reps to generate points.",
            series: [
              {
                label: "1RM",
                points: selectedBestProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.9,
              },
            ],
          },
        ],
        [
          "strength.selected_delta",
          {
            title: "Selected lift change",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            unit: "kg",
            yDigits: 1,
            emptyDetail: "Add two sessions for this lift to see change over time.",
            series: [
              {
                label: "Change",
                points: cumulativeDeltaPoints(selectedBestProgress),
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.9,
              },
            ],
          },
        ],
        [
          "strength.selected_rate",
          {
            title: "Selected lift pace",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            unit: "kg/wk",
            yDigits: 2,
            emptyDetail: "Add two sessions for this lift to calculate strength pace.",
            series: [
              {
                label: "Pace",
                points: selectedLiftRatePoints,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.9,
              },
            ],
          },
        ],
        [
          "strength.selected_sessions",
          {
            title: "Selected lift sessions",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            yDigits: 0,
            emptyDetail: "Complete sessions for this lift to build the count.",
            series: [
              {
                label: "Sessions",
                points: selectedSessionProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_frequency",
          {
            title: "Selected lift frequency",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            yDigits: 0,
            emptyDetail: "Train this lift over the last 30 days to measure frequency.",
            series: [
              {
                label: "Sessions",
                points: selectedSessionProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_sets",
          {
            title: "Selected lift sets",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            yDigits: 0,
            emptyDetail: "Completed sets for this lift will accumulate here.",
            series: [
              {
                label: "Sets",
                points: selectedSetsProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_volume",
          {
            title: "Selected lift volume",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            unit: "kg",
            yDigits: 0,
            emptyDetail: "Logged sets with weight and reps will build this line.",
            series: [
              {
                label: "Volume",
                points: selectedVolumeProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_prs",
          {
            title: "Selected lift PRs",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            yDigits: 0,
            emptyDetail: "Beat a previous estimated 1RM to add PR points.",
            series: [
              {
                label: "PRs",
                points: selectedPrProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "strength.selected_pr_rate",
          {
            title: "Selected lift PR rate",
            subtitle: selectedExercise?.name ?? "Search an exercise to focus the graph.",
            yDigits: 0,
            emptyDetail: "Beat previous estimated 1RMs to track PR rate.",
            series: [
              {
                label: "PRs",
                points: selectedPrProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.workouts_30",
          {
            title: "Training days",
            subtitle: "Cumulative workout days over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Complete a workout to start this progression.",
            series: [
              {
                label: "Days",
                points: workoutDayProgress30,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.workouts_7",
          {
            title: "Weekly workouts",
            subtitle: "Workout days accumulated over the current 7-day window.",
            yDigits: 0,
            emptyDetail: "Complete a workout this week to start the line.",
            series: [
              {
                label: "Days",
                points: workoutDayProgress7,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.sets_30",
          {
            title: "Completed sets",
            subtitle: "Cumulative completed strength sets over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Complete workout sets to build this chart.",
            series: [
              {
                label: "Sets",
                points: trainingSetsProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.volume_30",
          {
            title: "Total tonnage",
            subtitle: "Cumulative strength volume over the last 30 days.",
            unit: "kg",
            yDigits: 0,
            emptyDetail: "Log weighted sets to see tonnage accumulate.",
            series: [
              {
                label: "Volume",
                points: trainingVolumeProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.minutes_30",
          {
            title: "Training minutes",
            subtitle: "Cumulative logged training time over the last 30 days.",
            unit: "min",
            yDigits: 0,
            emptyDetail: "Workout durations will accumulate here.",
            series: [
              {
                label: "Minutes",
                points: trainingMinutesProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.prs_30",
          {
            title: "PR count",
            subtitle: "Cumulative detected PRs across exercise history.",
            yDigits: 0,
            emptyDetail: "Beat previous estimated 1RMs to populate this chart.",
            series: [
              {
                label: "PRs",
                points: prProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.hard_sets_week",
          {
            title: "Hard sets",
            subtitle: "Cumulative weighted non-warmup sets over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Log working sets with weight and reps to track hard sets.",
            series: [
              {
                label: "Hard sets",
                points: trainingHardSetsProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.workout_change_7",
          {
            title: "Workout frequency change",
            subtitle: "Cumulative workout days; metric compares last 7 days to the prior 7.",
            yDigits: 0,
            emptyDetail: "Complete workouts across two weeks to compare frequency.",
            series: [
              {
                label: "Days",
                points: workoutDayProgress30,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.volume_change_7",
          {
            title: "Weekly volume change",
            subtitle: "Cumulative 30-day tonnage; the metric compares the latest 7 days to the prior 7.",
            unit: "kg",
            yDigits: 0,
            emptyDetail: "Log weighted sets for two weeks to compare volume.",
            series: [
              {
                label: "Volume",
                points: trainingVolumeProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "training.focus_share",
          {
            title: "Training focus",
            subtitle: topCategory
              ? `${topCategory[0]} leads recent tonnage; chart shows total tonnage accumulation.`
              : "Largest exercise category by recent volume.",
            unit: "kg",
            yDigits: 0,
            emptyDetail: "Log categorized weighted sets to detect training focus.",
            series: [
              {
                label: "Tonnage",
                points: trainingVolumeProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.logged_days",
          {
            title: "Nutrition logged",
            subtitle: "Cumulative logged food days over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Log food to see nutrition consistency build.",
            series: [
              {
                label: "Days",
                points: foodLogProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.avg_calories",
          {
            title: "Daily calories",
            subtitle: "Logged calorie totals with your current target as a dashed guide.",
            unit: "cal",
            yDigits: 0,
            emptyDetail: "Log food for a day to draw calorie progression.",
            series: [
              {
                label: "Calories",
                points: dailyCaloriesPoints,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
              ...(calorieTargetPoints.length > 0
                ? [
                    {
                      label: "Target",
                      points: calorieTargetPoints,
                      color: "color-mix(in srgb, var(--foreground) 50%, transparent)",
                      strokeWidth: 2,
                      opacity: 0.75,
                      dashed: true,
                    },
                  ]
                : []),
            ],
          },
        ],
        [
          "nutrition.avg_protein",
          {
            title: "Daily protein",
            subtitle: "Logged protein with your current target as a dashed guide.",
            unit: "g",
            yDigits: 0,
            emptyDetail: "Log food with protein to draw this chart.",
            series: [
              {
                label: "Protein",
                points: dailyProteinPoints,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
              ...(proteinTargetPoints.length > 0
                ? [
                    {
                      label: "Target",
                      points: proteinTargetPoints,
                      color: "color-mix(in srgb, var(--foreground) 50%, transparent)",
                      strokeWidth: 2,
                      opacity: 0.75,
                      dashed: true,
                    },
                  ]
                : []),
            ],
          },
        ],
        [
          "nutrition.protein_adherence",
          {
            title: "Protein adherence",
            subtitle: "Cumulative average of logged days hitting at least 90% of protein target.",
            unit: "%",
            yDigits: 0,
            emptyDetail: "Log protein for multiple days to measure adherence.",
            series: [
              {
                label: "Adherence",
                points: proteinAdherenceProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.calorie_accuracy",
          {
            title: "Calorie accuracy",
            subtitle: "Cumulative average of logged days within ±10% of calorie target.",
            unit: "%",
            yDigits: 0,
            emptyDetail: "Log calories to measure target accuracy.",
            series: [
              {
                label: "Accuracy",
                points: calorieAccuracyProgress,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.macro_consistency",
          {
            title: "Macro consistency",
            subtitle: "Average closeness to calories, protein, carbs, and fat targets.",
            unit: "%",
            yDigits: 0,
            emptyDetail: "Log complete macros to score consistency.",
            series: [
              {
                label: "Score",
                points: macroConsistencyProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.calorie_change_7",
          {
            title: "Calorie change",
            subtitle: "Daily calories; metric compares last 7-day average to the previous 7 days.",
            unit: "cal",
            yDigits: 0,
            emptyDetail: "Log calories across two weeks to compare averages.",
            series: [
              {
                label: "Calories",
                points: dailyCaloriesPoints,
                color: APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.protein_change_7",
          {
            title: "Protein change",
            subtitle: "Daily protein; metric compares last 7-day average to the previous 7 days.",
            unit: "g",
            yDigits: 0,
            emptyDetail: "Log protein across two weeks to compare averages.",
            series: [
              {
                label: "Protein",
                points: dailyProteinPoints,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.days_over",
          {
            title: "Days over budget",
            subtitle: "Cumulative days above calorie target over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Days above target will appear once food is logged.",
            series: [
              {
                label: "Over",
                points: daysOverProgress,
                color: "var(--status-danger)",
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "nutrition.days_under",
          {
            title: "Days under budget",
            subtitle: "Cumulative logged days at or under target over the last 30 days.",
            yDigits: 0,
            emptyDetail: "Days at or below target will appear once food is logged.",
            series: [
              {
                label: "Under",
                points: daysUnderProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "quality.data_confidence",
          {
            title: "Data confidence",
            subtitle: "How much recent body, nutrition, and training data supports the insights.",
            unit: "%",
            yDigits: 0,
            emptyDetail: "Log body, food, and training data to raise confidence.",
            series: [
              {
                label: "Confidence",
                points: confidencePoints,
                color: dataConfidenceScore >= 70 ? APP_ACCENT_COLORS.complete : APP_ACCENT_COLORS.progress,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
        [
          "adherence.score",
          {
            title: "Adherence score",
            subtitle: "Composite body, training, and nutrition score over the last 30 days.",
            unit: "%",
            yDigits: 0,
            emptyDetail: "Log body, training, or nutrition events to move the score.",
            series: [
              {
                label: "Score",
                points: adherenceProgress,
                color: APP_ACCENT_COLORS.complete,
                strokeWidth: 2.8,
              },
            ],
          },
        ],
      ])

      return [
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
        id: "body.weight_rate",
        title: "Weight pace",
        group: "Body",
        value: signedValue(weightRateKgPerWeek, " kg/wk", 2),
        detail: `${weightGoalStatus} for ${goalLabel(goal)}`,
        description: "Weekly weight change interpreted against your current goal.",
        keywords: ["body", "weight", "weekly", "goal", "rate"],
        tone: weightGoalTone,
      },
      {
        id: "body.fat_mass",
        title: "Fat mass",
        group: "Body",
        value: latestFatMass == null ? "—" : `${fmtNumber(latestFatMass)} kg`,
        detail: fatMassPoints.length >= 1 ? "weight × body fat" : "Needs body fat",
        description: "Estimated fat mass from weight and body fat percentage.",
        keywords: ["body", "fat mass", "composition", "body fat"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "body.lean_mass",
        title: "Lean mass",
        group: "Body",
        value: latestLeanMass == null ? "—" : `${fmtNumber(latestLeanMass)} kg`,
        detail: leanMassPoints.length >= 1 ? "estimated" : "Needs body fat",
        description: "Estimated lean body mass from weight and body fat percentage.",
        keywords: ["body", "lean mass", "muscle", "composition"],
        tone: APP_ACCENT_COLORS.complete,
      },
      {
        id: "body.waist_to_weight",
        title: "Waist / weight",
        group: "Body",
        value: latestWaistToWeight == null ? "—" : latestWaistToWeight.toFixed(2),
        detail: "cm per kg",
        description: "Waist circumference relative to body weight.",
        keywords: ["body", "waist", "ratio", "composition"],
      },
      {
        id: "body.photo_checkins",
        title: "Progress photos",
        group: "Body",
        value: String(photoEntries.length),
        detail: "photo check-ins",
        description: "Progress check-ins with photos attached for visual comparison.",
        keywords: ["body", "photos", "progress", "visual"],
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
        id: "strength.selected_rate",
        title: "Selected lift pace",
        group: "Strength",
        value: signedValue(selectedLiftRateKgPerWeek, " kg/wk", 2),
        detail: selectedExercise?.name ?? "Search an exercise",
        description: "Weekly estimated 1RM change for the selected exercise.",
        keywords: ["strength", "rate", "1rm", "pace", "exercise"],
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
        id: "strength.selected_frequency",
        title: "Selected lift frequency",
        group: "Strength",
        value: selectedExercise ? selectedLiftFrequency.toFixed(1) : "—",
        detail: "sessions / week · 30d",
        description: "How often the selected lift was trained recently.",
        keywords: ["strength", "frequency", "sessions", "exercise"],
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
        id: "strength.selected_pr_rate",
        title: "Selected PR rate",
        group: "Strength",
        value: selectedExercise ? selectedPrRatePerMonth.toFixed(1) : "—",
        detail: "PRs / month",
        description: "PR frequency normalized by time trained for the selected lift.",
        keywords: ["strength", "pr", "rate", "exercise"],
        tone: APP_ACCENT_COLORS.complete,
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
        id: "training.hard_sets_week",
        title: "Hard sets",
        group: "Training",
        value: fmtInt(last7HardSets),
        detail:
          hardSetChange7Pct == null
            ? "last 7 days"
            : `${signedPercent(hardSetChange7Pct)} vs prior`,
        description: "Weighted non-warmup working sets in the latest week.",
        keywords: ["training", "hard sets", "sets", "volume", "workload"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "training.volume_change_7",
        title: "Volume change",
        group: "Training",
        value: signedPercent(volumeChange7Pct),
        detail: "last 7 vs prior 7",
        description: "Training tonnage change compared with the previous week.",
        keywords: ["training", "volume", "change", "fatigue", "deload"],
        tone:
          volumeChange7Pct != null &&
          (volumeChange7Pct < -30 || volumeChange7Pct > 40)
            ? APP_ACCENT_COLORS.progress
            : APP_ACCENT_COLORS.complete,
      },
      {
        id: "training.focus_share",
        title: "Training focus",
        group: "Training",
        value: topCategory?.[0] ?? "—",
        detail: topCategory ? `${Math.round(categoryFocusShare)}% of tonnage` : "Needs volume",
        description: "Largest exercise category by recent training volume.",
        keywords: ["training", "muscle", "category", "focus", "volume"],
      },
      {
        id: "training.workout_change_7",
        title: "Workout change",
        group: "Training",
        value: signedPercent(workoutDayChange7Pct),
        detail: "days vs prior week",
        description: "Workout frequency change compared with the previous week.",
        keywords: ["training", "frequency", "workouts", "weekly"],
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
        id: "nutrition.avg_protein",
        title: "Average protein",
        group: "Nutrition",
        value: averageProtein > 0 ? `${fmtInt(averageProtein)}g` : "—",
        detail: `${proteinTarget}g target`,
        description: "Average protein intake on logged food days.",
        keywords: ["nutrition", "protein", "macro", "average"],
        tone: APP_ACCENT_COLORS.complete,
      },
      {
        id: "nutrition.protein_adherence",
        title: "Protein adherence",
        group: "Nutrition",
        value: percentLabel(proteinAdherence),
        detail: "days ≥ 90% target",
        description: "Share of logged days hitting at least 90% of protein target.",
        keywords: ["nutrition", "protein", "adherence", "macro"],
        tone:
          proteinAdherence >= 70
            ? APP_ACCENT_COLORS.complete
            : "var(--status-danger)",
      },
      {
        id: "nutrition.calorie_accuracy",
        title: "Calorie accuracy",
        group: "Nutrition",
        value: percentLabel(calorieAccuracy),
        detail: `±10% target · ${avgCalorieDeviation} cal miss`,
        description: "Share of logged days within ten percent of calorie target.",
        keywords: ["nutrition", "calories", "accuracy", "target"],
        tone:
          calorieAccuracy >= 60
            ? APP_ACCENT_COLORS.complete
            : APP_ACCENT_COLORS.progress,
      },
      {
        id: "nutrition.macro_consistency",
        title: "Macro consistency",
        group: "Nutrition",
        value: percentLabel(macroConsistency),
        detail: "cal + protein + carbs + fat",
        description: "How close logged macros are to daily targets on average.",
        keywords: ["nutrition", "macros", "consistency", "protein", "carbs", "fat"],
        tone:
          macroConsistency >= 75
            ? APP_ACCENT_COLORS.complete
            : APP_ACCENT_COLORS.progress,
      },
      {
        id: "nutrition.calorie_change_7",
        title: "Calorie change",
        group: "Nutrition",
        value: signedPercent(calorieChange7Pct),
        detail: "avg last 7 vs prior",
        description: "Average calorie intake change compared with the previous week.",
        keywords: ["nutrition", "calories", "weekly", "change"],
        tone: APP_ACCENT_COLORS.progress,
      },
      {
        id: "nutrition.protein_change_7",
        title: "Protein change",
        group: "Nutrition",
        value: signedPercent(proteinChange7Pct),
        detail: "avg last 7 vs prior",
        description: "Average protein intake change compared with the previous week.",
        keywords: ["nutrition", "protein", "weekly", "change"],
        tone: APP_ACCENT_COLORS.complete,
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
        id: "quality.data_confidence",
        title: "Data confidence",
        group: "Quality",
        value: percentLabel(dataConfidenceScore),
        detail: `body ${bodyConfidence}% · food ${nutritionConfidence}% · training ${trainingConfidence}%`,
        description: "Confidence that the current trends are backed by enough recent data.",
        keywords: ["quality", "confidence", "data", "logging"],
        tone:
          dataConfidenceScore >= 70
            ? APP_ACCENT_COLORS.complete
            : dataConfidenceScore >= 45
              ? APP_ACCENT_COLORS.progress
              : "var(--status-danger)",
      },
      {
        id: "adherence.score",
        title: "Adherence score",
        group: "Adherence",
        value: percentLabel(adherenceScore),
        detail: "30% body · 35% training · 35% food",
        description: "Transparent composite of check-ins, workouts, and nutrition logging.",
        keywords: ["adherence", "consistency", "score", "habit"],
      },
    ].map((metric) => ({ ...metric, graph: metricGraphs.get(metric.id) }))
  })()

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
  const openMetricGraph = openMetricGraphId
    ? (selectedMetrics.find((metric) => metric.id === openMetricGraphId) ??
      metricMap.get(openMetricGraphId) ??
      null)
    : null
  const bodyWeightGraph = metricMap.get("body.weight_current")?.graph
  const selectedLiftGraph = metricMap.get("strength.selected_1rm")?.graph
  const expandedMetricGraph = expandedMetricGraphId
    ? (metricMap.get(expandedMetricGraphId)?.graph ?? null)
    : null
  const visibleProgressInsights = progressInsights.filter(
    (insight) => !dismissedInsightIds.includes(insight.id)
  )
  const visibleAiCoachInsights = aiCoachInsights.filter(
    (insight) => !dismissedInsightIds.includes(insight.id)
  )
  const aiCoachContext = {
    goal,
    weightPaceKgPerWeek: weightRateKgPerWeek ?? null,
    weightStatus: weightGoalStatus,
    calorieTarget,
    averageCalories,
    averageProtein,
    proteinTarget,
    proteinAdherence,
    calorieAccuracy,
    macroConsistency,
    workoutDays7: workoutDays7.size,
    volumeChange7Pct: volumeChange7Pct ?? null,
    hardSets7: last7HardSets,
    selectedExerciseName: selectedExercise?.name ?? null,
    selectedLiftPaceKgPerWeek: selectedLiftRateKgPerWeek ?? null,
    selectedLiftFrequency: selectedExercise ? selectedLiftFrequency : null,
    dataConfidence: dataConfidenceScore,
    existingInsights: progressInsights.map((insight) => ({
      label: insight.label,
      title: insight.title,
      detail: insight.detail,
    })),
  }

  function openMetricInteractiveGraph(id: string) {
    if (metricMap.get(id)?.graph) {
      setOpenMetricGraphId(null)
      setExpandedMetricGraphId(id)
      return
    }
    setOpenMetricGraphId(id)
  }

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
    if (!requireAiAccess()) return

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
      console.error("Failed to generate metrics:", error)
      toast.error("Could not generate metrics")
    }
  }

  async function aiGenerateCoachAdvice() {
    if (aiCoachBusy || !requireAiAccess()) return
    setAiCoachBusy(true)
    try {
      const result = await generateCoachAdvice({ context: aiCoachContext })

      setAiCoachInsights(
        result.advice.map((advice, index) => ({
          id: `ai-coach-${index}-${advice.title}`,
          label: advice.label,
          title: advice.title,
          detail: advice.detail,
          tone: APP_ACCENT_COLORS.progress,
        }))
      )
      toast.success(
        result.source === "openai" ? "AI coach advice added" : "Coach advice added"
      )
    } catch (error) {
      console.error("Failed to generate coach advice:", error)
      toast.error("Could not generate coach advice")
    } finally {
      setAiCoachBusy(false)
    }
  }

  function deleteCoachInsight(id: string) {
    setDismissedInsightIds((current) =>
      current.includes(id) ? current : [...current, id]
    )
    setAiCoachInsights((current) => current.filter((insight) => insight.id !== id))
  }

  async function sendAiCoachMessage(message: string, focusInsight?: ProgressInsight) {
    const clean = message.trim()
    if (clean.length < 2 || aiCoachBusy || !requireAiAccess()) return

    const userMessage: AiCoachMessage = {
      id: `user-${aiCoachMessages.length}-${clean}`,
      role: "user",
      content: clean,
    }
    const nextHistory = [...aiCoachMessages, userMessage].slice(-30)
    setAiCoachMessages(nextHistory)
    setAiCoachOpen(true)
    setAiCoachInput("")
    setAiCoachBusy(true)

    try {
      const result = await generateCoachChatMessage({
        context: aiCoachContext,
        message: clean,
        history: aiCoachMessages.slice(-10).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        focusInsight: focusInsight
          ? {
              label: focusInsight.label,
              title: focusInsight.title,
              detail: focusInsight.detail,
            }
          : undefined,
      })
      setAiCoachMessages((current) => {
        const assistantMessage: AiCoachMessage = {
          id: `assistant-${current.length}-${result.reply}`,
          role: "assistant",
          content: result.reply,
        }
        return [...current, assistantMessage].slice(-30)
      })
    } catch (error) {
      console.error("Failed to send coach message:", error)
      toast.error("Could not ask AI coach")
    } finally {
      setAiCoachBusy(false)
    }
  }

  function clarifyCoachInsight(insight: ProgressInsight) {
    void sendAiCoachMessage(
      `Clarify this coaching step and tell me exactly what to do next: ${insight.title}. ${insight.detail}`,
      insight
    )
  }

  const displayedCoachInsights = [
    ...visibleAiCoachInsights,
    ...visibleProgressInsights,
  ]
  const primaryInsight = displayedCoachInsights[0]
  const progressVerdict =
    weightRateKgPerWeek == null
      ? "Start with a check-in"
      : weightGoalStatus
  const progressVerdictDetail =
    weightRateKgPerWeek == null
      ? "Log weight twice so OneRep can separate signal from noise."
      : goal === "lose"
        ? `${signedValue(weightRateKgPerWeek, " kg/week", 2)} against your fat-loss goal.`
        : goal === "build" || goal === "performance"
          ? `${signedValue(weightRateKgPerWeek, " kg/week", 2)} against your gain target.`
          : `${signedValue(weightRateKgPerWeek, " kg/week", 2)} body-weight drift.`
  const askAiAboutPrimaryInsight = () => {
    if (primaryInsight && hasAiAccess) {
      clarifyCoachInsight(primaryInsight)
      return
    }
    if (hasAiAccess) {
      setAiCoachOpen(true)
      return
    }
    requireAiAccess()
  }
  const askAiAboutRecommendation = (title: string, detail: string) => {
    void sendAiCoachMessage(
      `Help me act on this progress recommendation: ${title}. ${detail}`
    )
  }
  const nextActions = [
    weightEntries.length < 2
      ? {
          title: "Add another body check-in",
          detail:
            "Two weight entries are the minimum needed for a useful pace and goal verdict.",
          tone: APP_ACCENT_COLORS.progress,
          actionLabel: "Add check-in",
          onAction: () => setSheetOpen(true),
          askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
          onAskAi: () =>
            askAiAboutRecommendation(
              "Add another body check-in",
              "Two weight entries are the minimum needed for a useful pace and goal verdict."
            ),
        }
      : primaryInsight
        ? {
            title: primaryInsight.title,
            detail: primaryInsight.detail,
            tone: primaryInsight.tone ?? APP_ACCENT_COLORS.progress,
            actionLabel: hasAiAccess ? "Ask AI coach" : "Unlock AI coach",
            onAction: askAiAboutPrimaryInsight,
            askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
            onAskAi: askAiAboutPrimaryInsight,
          }
        : {
            title: "Ask for a progress read",
            detail:
              "Use the coach to turn your current body, food, and training data into a concrete next step.",
            tone: APP_ACCENT_COLORS.progress,
            actionLabel: hasAiAccess ? "Ask AI coach" : "Unlock AI coach",
            onAction: askAiAboutPrimaryInsight,
            askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
            onAskAi: askAiAboutPrimaryInsight,
          },
    proteinAdherence < 70
      ? {
          title: "Bring protein consistency up",
          detail: `${percentLabel(proteinAdherence)} of logged days hit at least 90% of your ${proteinTarget}g target.`,
          tone: "var(--status-danger)",
          actionLabel: "Log food",
          onAction: () => navigate("/foods/search"),
          askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
          onAskAi: () =>
            askAiAboutRecommendation(
              "Bring protein consistency up",
              `${percentLabel(proteinAdherence)} of logged days hit at least 90% of your ${proteinTarget}g target.`
            ),
        }
      : {
          title: "Protein is supporting the goal",
          detail: `${percentLabel(proteinAdherence)} adherence on logged days. Keep this stable while adjusting calories.`,
          tone: APP_ACCENT_COLORS.complete,
          actionLabel: "Log food",
          onAction: () => navigate("/foods/search"),
          askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
          onAskAi: () =>
            askAiAboutRecommendation(
              "Protein is supporting the goal",
              `${percentLabel(proteinAdherence)} adherence on logged days. Keep this stable while adjusting calories.`
            ),
        },
    lowTrainingDose
      ? {
          title: "Training signal is thin this week",
          detail: `${workoutDays7.size} workout days and ${fmtInt(last7HardSets)} hard sets in the last 7 days.`,
          tone: APP_ACCENT_COLORS.progress,
          actionLabel: "Start workout",
          onAction: () => navigate("/workout/active"),
          askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
          onAskAi: () =>
            askAiAboutRecommendation(
              "Training signal is thin this week",
              `${workoutDays7.size} workout days and ${fmtInt(last7HardSets)} hard sets in the last 7 days.`
            ),
        }
      : {
          title: "Training consistency is usable",
          detail: `${workoutDays7.size} workout days, ${fmtInt(last7HardSets)} hard sets, ${signedPercent(volumeChange7Pct)} volume vs prior week.`,
          tone: APP_ACCENT_COLORS.complete,
          actionLabel: "Start workout",
          onAction: () => navigate("/workout/active"),
          askAiLabel: hasAiAccess ? "Ask AI" : "Unlock AI",
          onAskAi: () =>
            askAiAboutRecommendation(
              "Training consistency is usable",
              `${workoutDays7.size} workout days, ${fmtInt(last7HardSets)} hard sets, ${signedPercent(volumeChange7Pct)} volume vs prior week.`
            ),
        },
  ]
  const latestWeightDetail =
    latest?.weightKg != null
      ? `${formatMeasurementDate(latest.loggedAt)} · ${trend ?? "trend pending"}`
      : "No body check-ins yet"

  return (
    <div className="bg-background lg:pr-8 lg:pl-72 min-h-svh desktop-canvas">
      <main className="app-page">
        <header className="app-header">
          <div className="min-w-0">
            <h1 className="app-title">Progress</h1>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              What changed, why it changed, and what to do next.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="app-header-icon-action md:hidden"
            aria-label="Add progress check-in"
          >
            <Plus weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="hidden bg-foreground text-background app-button md:inline-flex"
            aria-label="Add progress check-in"
          >
            <Plus size={13} weight="bold" /> Check in
          </button>
        </header>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)]">
          <div className="app-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="app-eyebrow">{goalLabel(goal)} progress</p>
                <h2 className="mt-2 text-[2.1rem] font-extrabold leading-none tracking-tight">
                  {progressVerdict}
                </h2>
                <p className="mt-2 max-w-xl text-[12.5px] font-semibold leading-5 text-muted-foreground/58">
                  {progressVerdictDetail}
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

            <div className="mt-5 grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-4">
              <ProgressOutcomeCard
                label="Scale"
                value={latest?.weightKg != null ? `${fmtNumber(latest.weightKg)} kg` : "—"}
                detail={latestWeightDetail}
                tone={weightGoalTone}
                actionLabel={weightEntries.length < 2 ? "Add check-in" : undefined}
                onAction={
                  weightEntries.length < 2 ? () => setSheetOpen(true) : undefined
                }
                wide
              />
              <ProgressOutcomeCard
                label="Food adherence"
                value={percentLabel(calorieAccuracy)}
                detail={`${foodDateSet.size}/30 days logged · ${avgCalorieDeviation} cal miss`}
                actionLabel={
                  nutritionConfidence < 70 || foodDateSet.size === 0
                    ? "Log food"
                    : undefined
                }
                onAction={
                  nutritionConfidence < 70 || foodDateSet.size === 0
                    ? () => navigate("/foods/search")
                    : undefined
                }
                tone={
                  calorieAccuracy >= 60
                    ? APP_ACCENT_COLORS.complete
                    : APP_ACCENT_COLORS.progress
                }
              />
              <ProgressOutcomeCard
                label="Training"
                value={`${workoutDays7.size}d`}
                detail={`${fmtInt(last7HardSets)} hard sets · 7 days`}
                actionLabel={lowTrainingDose ? "Start workout" : undefined}
                onAction={
                  lowTrainingDose ? () => navigate("/workout/active") : undefined
                }
                tone={
                  lowTrainingDose
                    ? APP_ACCENT_COLORS.progress
                    : APP_ACCENT_COLORS.complete
                }
              />
            </div>

            <div className="mt-4 rounded-[1rem] bg-foreground/[0.035] px-3 pt-3 pb-2">
              {weightValues.length >= 2 && bodyWeightGraph ? (
                <ExpandableChartButton
                  onExpand={() => setExpandedMetricGraphId("body.weight_current")}
                >
                  <MetricProgressChart graph={bodyWeightGraph} />
                </ExpandableChartButton>
              ) : (
                <div className="flex h-32 items-center justify-center text-center text-[12px] text-muted-foreground/50">
                  Add two weight check-ins to draw the trend.
                </div>
              )}
            </div>
          </div>

          <div className="app-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="app-section-title">Next best actions</p>
                <p className="app-section-subtitle">
                  Ranked from your latest body, food, and training signals.
                </p>
              </div>
              {hasAiAccess && (
                <button
                  type="button"
                  disabled={aiCoachBusy}
                  onClick={aiGenerateCoachAdvice}
                  className="h-8 shrink-0 app-button app-button-quiet"
                  aria-label="Generate AI coaching advice"
                >
                  <Sparkle size={12} weight="fill" />
                  {aiCoachBusy ? "Thinking" : "AI"}
                </button>
              )}
            </div>
            <div className="grid gap-2">
              {nextActions.map((action) => (
                <ProgressActionRow
                  key={action.title}
                  title={action.title}
                  detail={action.detail}
                  actionLabel={action.actionLabel}
                  onAction={action.onAction}
                  askAiLabel={action.askAiLabel}
                  onAskAi={action.onAskAi}
                  tone={action.tone}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="app-surface p-4">
            <div className="mb-4">
              <p className="app-section-title">Nutrition consistency</p>
              <p className="app-section-subtitle">
                Logged days only, compared with current targets.
              </p>
            </div>
            <div className="space-y-4">
              <ProgressMiniMeter
                label="Protein target"
                value={proteinAdherence}
                detail={`${fmtInt(averageProtein)}g average · ${proteinTarget}g target`}
                tone={APP_ACCENT_COLORS.complete}
              />
              <ProgressMiniMeter
                label="Calorie accuracy"
                value={calorieAccuracy}
                detail={`${fmtInt(averageCalories)} average · ${calorieTarget} target`}
                tone={APP_ACCENT_COLORS.progress}
              />
              <ProgressMiniMeter
                label="Macro consistency"
                value={macroConsistency}
                detail="Calories, protein, carbs, and fat"
                tone="var(--foreground)"
              />
            </div>
          </div>

          <div className="app-surface p-4">
            <div className="mb-4">
              <p className="app-section-title">Training momentum</p>
              <p className="app-section-subtitle">
                Frequency and workload compared with the prior week.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ProgressOutcomeCard
                label="Workouts"
                value={String(workoutDays7.size)}
                detail={`${signedPercent(workoutDayChange7Pct)} vs prior`}
                tone={APP_ACCENT_COLORS.progress}
              />
              <ProgressOutcomeCard
                label="Hard sets"
                value={fmtInt(last7HardSets)}
                detail={`${signedPercent(hardSetChange7Pct)} vs prior`}
                tone={APP_ACCENT_COLORS.complete}
              />
              <ProgressOutcomeCard
                label="Volume"
                value={signedPercent(volumeChange7Pct)}
                detail={`${fmtInt(last7Volume)} kg last 7d`}
                tone={
                  highWorkloadSpike || workloadDrop
                    ? APP_ACCENT_COLORS.progress
                    : APP_ACCENT_COLORS.complete
                }
                wide
              />
            </div>
          </div>

          <div className="app-surface p-4">
            <div className="mb-4">
              <p className="app-section-title">Data quality</p>
              <p className="app-section-subtitle">
                How much confidence to put in the current read.
              </p>
            </div>
            <div className="space-y-4">
              <ProgressMiniMeter
                label="Overall confidence"
                value={dataConfidenceScore}
                detail={`body ${bodyConfidence}% · food ${nutritionConfidence}% · training ${trainingConfidence}%`}
                tone={
                  dataConfidenceScore >= 70
                    ? APP_ACCENT_COLORS.complete
                    : APP_ACCENT_COLORS.progress
                }
              />
              <ProgressMiniMeter
                label="Adherence score"
                value={adherenceScore}
                detail="Check-ins, food logs, and workouts"
                tone="var(--foreground)"
              />
            </div>
          </div>
        </section>

        <section className="mt-3 p-4 app-surface">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="app-section-title">Metric library</p>
              <p className="app-section-subtitle">
                Pin extra diagnostics when you want a deeper view.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMetricSheetOpen(true)}
              className="h-9 app-button app-button-quiet shrink-0"
            >
              <MagnifyingGlass size={12} weight="bold" /> Metrics
            </button>
          </div>

          {selectedMetrics.length > 0 ? (
            <>
              <MetricGrid
                metrics={topMetricsMobile}
                onRemove={removeMetric}
                onOpenMetric={openMetricInteractiveGraph}
                className="md:hidden"
              />
              <MetricGrid
                metrics={topMetricsDesktop}
                onRemove={removeMetric}
                onOpenMetric={openMetricInteractiveGraph}
                className="hidden md:grid md:grid-cols-4"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMetricSheetOpen(true)}
              className="justify-center py-4 w-full font-semibold text-[13px] app-empty"
            >
              <Plus size={13} /> Add your first metric
            </button>
          )}
        </section>

        <InsightStrip
          insights={displayedCoachInsights}
          onGenerateAi={hasAiAccess ? aiGenerateCoachAdvice : undefined}
          onOpenAiHistory={hasAiAccess ? () => setAiCoachOpen(true) : undefined}
          onDeleteInsight={deleteCoachInsight}
          onClarifyInsight={hasAiAccess ? clarifyCoachInsight : undefined}
          aiBusy={aiCoachBusy}
        />

        <section className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:mt-3 lg:grid-cols-2 lg:items-start lg:gap-4">
          <div className="content-start gap-3 grid min-w-0">
            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
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
                  className="h-9 app-button app-button-quiet"
                >
                  Add
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-3">
                <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Weight
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {fmtNumber(latest?.weightKg)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(weightValues), " kg")}
                  </p>
                </div>
                <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Body fat
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {fmtNumber(latest?.bodyFatPct)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(bodyFatValues), "%")}
                  </p>
                </div>
                <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Waist
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {fmtNumber(latest?.waistCm)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    {signedValue(deltaFor(waistValues), " cm")}
                  </p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-3">
                <div className="bg-foreground/[0.035] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Fat mass
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {latestFatMass == null ? "—" : fmtNumber(latestFatMass)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    kg estimated
                  </p>
                </div>
                <div className="bg-foreground/[0.035] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Lean mass
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {latestLeanMass == null ? "—" : fmtNumber(latestLeanMass)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    kg estimated
                  </p>
                </div>
                <div className="bg-foreground/[0.035] px-3 py-3 rounded-[0.8rem]">
                  <p className="font-bold text-[10px] text-muted-foreground/62">
                    Waist / weight
                  </p>
                  <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                    {latestWaistToWeight == null ? "—" : latestWaistToWeight.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45">
                    cm per kg
                  </p>
                </div>
              </div>

              <div className="bg-foreground/[0.035] mt-4 px-3 pt-3 pb-2 rounded-[0.9rem]">
                {weightValues.length >= 2 && bodyWeightGraph ? (
                  <ExpandableChartButton
                    onExpand={() => setExpandedMetricGraphId("body.weight_current")}
                  >
                    <MetricProgressChart graph={bodyWeightGraph} />
                  </ExpandableChartButton>
                ) : (
                  <div className="flex justify-center items-center h-28 text-[12px] text-muted-foreground/50 text-center">
                    Add two weight check-ins to draw the trend.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
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
                              console.error(
                                "Failed to remove measurement:",
                                err
                              )
                            }
                          })()
                        }}
                        rowClassName="bg-card"
                      >
                        <div className="flex justify-between items-center gap-3 py-3">
                          <div className="min-w-0">
                            <p className="font-bold text-[10px] text-muted-foreground/48 uppercase">
                              {formatMeasurementDate(entry.loggedAt)}
                            </p>
                            <p className="mt-1 font-extrabold tabular-nums text-[13px] truncate">
                              {entry.weightKg != null
                                ? `${entry.weightKg.toFixed(1)} kg`
                                : "Body check"}
                            </p>
                          </div>
                          <div className="font-semibold text-[10.5px] text-muted-foreground/52 text-right shrink-0">
                            <p>{fmtNumber(entry.bodyFatPct)}% fat</p>
                            <p>{fmtNumber(entry.waistCm)} cm waist</p>
                          </div>
                        </div>
                      </SlideToDeleteRow>
                    ))}
                </div>
              )}
            </div>

            {photoEntries.length > 0 && (
              <div className="p-4 app-surface">
                <div className="mb-3">
                  <p className="app-section-title">Progress photos</p>
                  <p className="app-section-subtitle">
                    Visual checkpoints for body composition changes.
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[...photoEntries]
                    .reverse()
                    .slice(0, 6)
                    .map((entry) => {
                      const src = entry.photoUrl ?? entry.photoDataUrl
                      return (
                        <div
                          key={`photo-${entry.clientId ?? entry._id ?? entry.loggedAt}`}
                          className="relative h-28 w-20 shrink-0 overflow-hidden rounded-[0.85rem] bg-foreground/[0.05]"
                        >
                          {src ? (
                            <img
                              src={src}
                              alt={`Progress photo from ${formatMeasurementDate(entry.loggedAt)}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground/30">
                              <Camera size={22} />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-1 text-center font-bold text-[9px] text-muted-foreground/60 backdrop-blur-sm">
                            {formatMeasurementDate(entry.loggedAt)}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {bottomMetricsMobile.length > 0 && (
              <div className="md:hidden p-4 app-surface">
                <div className="flex justify-between items-center gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="app-section-title">More metrics</p>
                    <p className="app-section-subtitle">
                      Remaining pinned metrics
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="h-9 app-button app-button-quiet shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsMobile}
                  onRemove={removeMetric}
                  onOpenMetric={openMetricInteractiveGraph}
                />
              </div>
            )}

            {bottomMetricsDesktopLeft.length > 0 && (
              <div className="hidden md:block p-4 app-surface">
                <div className="flex justify-between items-center gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="app-section-title">More metrics</p>
                    <p className="app-section-subtitle">Pinned details</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="h-9 app-button app-button-quiet shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsDesktopLeft}
                  onRemove={removeMetric}
                  onOpenMetric={openMetricInteractiveGraph}
                />
              </div>
            )}
          </div>

          <div className="content-start gap-3 grid min-w-0">
            <div className="p-4 app-surface">
              <div className="mb-3">
                <p className="app-section-title">Strength trend</p>
                <p className="app-section-subtitle">
                  Search any logged exercise.
                </p>
              </div>

              <div className="relative mb-3">
                <MagnifyingGlass
                  size={14}
                  className="top-1/2 left-3 absolute text-muted-foreground/45 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="search"
                  name="strength-trend-exercise-search"
                  aria-label="Search strength trend exercise"
                  value={exerciseQuery}
                  onChange={(event) => setExerciseQuery(event.target.value)}
                  placeholder="Search exercise"
                  className="bg-foreground/[0.045] pr-3 pl-9 border-0 rounded-[0.8rem] outline-none w-full h-10 font-semibold text-[13px] placeholder:text-muted-foreground/38"
                />
              </div>

              {exerciseChoices.length > 0 && (
                <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-bold text-[9.5px] text-muted-foreground/45 uppercase tracking-[0.12em]">
                      Most data
                    </p>
                    <p className="text-[10px] text-muted-foreground/42">
                      Showing 3 · search for the rest
                    </p>
                  </div>
                  <div className="flex gap-1.5 mb-3 pb-1 overflow-x-auto">
                    {exerciseChoices.map((exercise) => {
                      const active = selectedExercise?.id === exercise.id
                      return (
                        <button
                          key={exercise.id}
                          type="button"
                          onClick={() => {
                            setSelectedExerciseId(exercise.id)
                            setExerciseQuery("")
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-[0.7rem] font-bold text-[11px] transition-colors shrink-0",
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
                </>
              )}

              {exerciseQuery.trim() && (
                <div className="mb-4 max-h-44 overflow-y-auto rounded-[0.9rem] bg-foreground/[0.035] p-1.5">
                  {exerciseSearchResults.length > 0 ? (
                    exerciseSearchResults.map((exercise) => (
                      <button
                        key={`search-${exercise.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedExerciseId(exercise.id)
                          setExerciseQuery("")
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-[0.7rem] px-2.5 py-2 text-left active:bg-foreground/[0.06]"
                      >
                        <span className="min-w-0 truncate font-bold text-[12px]">
                          {exercise.name}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground/48">
                          {exercise.sessions} sessions · {exercise.sets} sets
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-2.5 py-3 text-[11.5px] text-muted-foreground/50">
                      No other logged exercises match that search.
                    </p>
                  )}
                </div>
              )}

              {selectedExercise ? (
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="app-eyebrow">Selected lift</p>
                      <p className="mt-1 font-extrabold text-[1.25rem] truncate leading-tight">
                        {selectedExercise.name}
                      </p>
                      <p className="mt-1 font-semibold text-[11px] text-muted-foreground/56">
                        {selectedExercise.points.length >= 2
                          ? `${fmtNumber(selectedExercise.firstBest)} → ${fmtNumber(selectedExercise.lastBest)} kg est. 1RM`
                          : `${selectedExercise.sessions} session${selectedExercise.sessions === 1 ? "" : "s"} logged`}
                      </p>
                    </div>
                    <div className="bg-foreground/[0.045] px-3 py-2 rounded-[0.8rem] text-right">
                      <p className="font-bold text-[10px] text-muted-foreground/52">
                        Change
                      </p>
                      <p className="mt-0.5 font-extrabold tabular-nums text-[16px]">
                        {signedValue(selectedExercise.delta, " kg")}
                      </p>
                    </div>
                  </div>

                  <div className="bg-foreground/[0.035] mt-4 px-3 pt-3 pb-2 rounded-[0.9rem]">
                    {selectedExercise.points.length >= 2 && selectedLiftGraph ? (
                      <ExpandableChartButton
                        onExpand={() =>
                          setExpandedMetricGraphId("strength.selected_1rm")
                        }
                      >
                        <MetricProgressChart graph={selectedLiftGraph} />
                      </ExpandableChartButton>
                    ) : (
                      <div className="flex justify-center items-center h-28 text-[12px] text-muted-foreground/45">
                        Add another session to draw the trend.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
                    <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                      <p className="font-bold text-[10px] text-muted-foreground/62">
                        Sessions
                      </p>
                      <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                        {fmtInt(selectedExercise.sessions)}
                      </p>
                    </div>
                    <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                      <p className="font-bold text-[10px] text-muted-foreground/62">
                        Volume
                      </p>
                      <p className="mt-1 font-extrabold tabular-nums text-[18px]">
                        {fmtInt(selectedExercise.totalVolume)}
                      </p>
                    </div>
                    <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
                      <p className="font-bold text-[10px] text-muted-foreground/62">
                        PRs
                      </p>
                      <p className="mt-1 font-extrabold tabular-nums text-[18px]">
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
              <div className="hidden md:block p-4 app-surface">
                <div className="flex justify-between items-center gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="app-section-title">Metric details</p>
                    <p className="app-section-subtitle">Pinned details</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetricSheetOpen(true)}
                    className="h-9 app-button app-button-quiet shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <MetricGrid
                  metrics={bottomMetricsDesktopRight}
                  onRemove={removeMetric}
                  onOpenMetric={openMetricInteractiveGraph}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {openMetricGraph && (
        <MetricProgressSheet
          metric={openMetricGraph}
          onClose={() => setOpenMetricGraphId(null)}
        />
      )}

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
          onClose={() => setSheetOpen(false)}
          onSave={async ({ photoFile, ...entry }) => {
            const clientId = crypto.randomUUID()
            setSheetOpen(false)
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
                photoStorageId = (await response.json())
                  .storageId as Id<"_storage">
              }
              await saveMeasurement({ clientId, ...entry, photoStorageId })
              toast.success("Measurement saved")
            } catch (err) {
              console.error("Failed to save measurement:", err)
              toast.error("Could not save measurement")
            }
          }}
        />
      )}

      {expandedMetricGraph && (
        <ExpandedGraphSheet
          graph={expandedMetricGraph}
          onClose={() => setExpandedMetricGraphId(null)}
        />
      )}

      {hasAiAccess && aiCoachOpen && (
        <AiCoachModal
          messages={aiCoachMessages}
          input={aiCoachInput}
          busy={aiCoachBusy}
          onInputChange={setAiCoachInput}
          onSend={() => void sendAiCoachMessage(aiCoachInput)}
          onClear={() => setAiCoachMessages([])}
          onClose={() => setAiCoachOpen(false)}
        />
      )}

      {aiAccessModal}
    </div>
  )
}
