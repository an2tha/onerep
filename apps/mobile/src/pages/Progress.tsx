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
import { SectionHeader } from "@repo/ui"

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
    <div className="flex items-center justify-between border-t border-border/20 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/20">
          <Icon size={12} className="text-foreground/40" />
        </div>
        <span className="text-[12px] font-bold text-foreground/70">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-[14px] font-bold tracking-tight tabular-nums text-foreground/80">
          {value}
        </span>
        <span className="ml-1 text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tight">
          {unit}
        </span>
      </div>
    </div>
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
  const [notes, setNotes] = useState("")

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
    Boolean(toNumber(chestCm))

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
            <label key={field.label} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/45 uppercase">
                {field.label}
              </span>
              <div className="flex items-center rounded-[18px] border border-border/55 bg-background px-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums outline-none"
                />
                <span className="text-[10px] text-muted-foreground/45">
                  {field.unit}
                </span>
              </div>
            </label>
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

  const latest = entries[entries.length - 1] ?? null
  const weightEntries = entries.filter((entry) => entry.weightKg != null)
  const weightValues = weightEntries.slice(-8).map((entry) => entry.weightKg!)
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
            <SectionHeader
              title="Weight graph"
              sub={
                weightValues.length > 1
                  ? `${weightValues.length} logged points`
                  : "Add another check-in to start the line"
              }
            />
            <Card>
              <div className="px-4 py-4">
                {weightValues.length > 1 ? (
                  <>
                    <div className="mb-3.5 flex items-start justify-between border-b border-border/20 pb-3">
                      <div>
                        <p className="text-[9px] font-bold tracking-[0.12em] text-muted-foreground/30 uppercase">
                          From / to
                        </p>
                        <p className="mt-1 text-[12.5px] font-bold text-foreground/80 leading-none">
                          <span className="tabular-nums">
                            {fmtNumber(startWeight)}
                          </span>
                          <span className="mx-1 text-muted-foreground/20">
                            →
                          </span>
                          <span className="tabular-nums">
                            {fmtNumber(endWeight)}
                          </span>
                          <span className="ml-0.5 text-[8.5px] font-bold text-muted-foreground/35 uppercase">
                            kg
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold tracking-[0.12em] text-muted-foreground/30 uppercase">
                          Trend
                        </p>
                        <p className="mt-1 text-[12.5px] font-bold text-foreground/80 leading-none">
                          {trend ?? "—"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/30 bg-muted/[0.08] px-3 py-3">
                      <div
                        className="mb-3 grid"
                        style={{
                          gridTemplateRows: "repeat(4, minmax(0, 1fr))",
                        }}
                      >
                        {[0, 1, 2, 3].map((line) => (
                          <div
                            key={line}
                            className="h-6 border-b border-dashed border-border/35 last:border-b-0"
                          />
                        ))}
                      </div>
                      <svg
                        viewBox="0 0 240 96"
                        className="-mt-[6.1rem] h-28 w-full"
                      >
                        <polyline
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-foreground/80"
                          points={sparklinePoints(weightValues, 240, 96)}
                        />
                      </svg>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/45">
                        <span>
                          {weightEntries.length >= weightValues.length && formatMeasurementDate(
                            weightEntries[
                              weightEntries.length - weightValues.length
                            ].loggedAt
                          )}
                        </span>
                        <span>
                          {weightEntries.length > 0 && formatMeasurementDate(
                            weightEntries[weightEntries.length - 1].loggedAt
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <ChartLine size={28} className="text-muted-foreground/20" />
                    <p className="text-[14px] font-medium">
                      The graph appears after the second measurement
                    </p>
                    <p className="max-w-[18rem] text-[12px] text-muted-foreground/55">
                      One point is a note. Two points are direction.
                    </p>
                  </div>
                )}
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
                <div className="mb-4 flex items-start justify-between gap-4 border-b border-border/20 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/20">
                      <Bell size={13} className="text-foreground/40" />
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-foreground/80 leading-none pt-1">
                        Check-in prompt
                      </p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/40 font-medium">
                        Keep one daily appointment with your data.
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
                  <Card key={entry.clientId} size="sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 border-b border-border/20 pb-1.5">
                          <span className="text-[9px] font-bold tracking-[0.12em] text-muted-foreground/35 uppercase">
                            {formatMeasurementDate(entry.loggedAt)}
                          </span>
                          {entry.weightKg != null && (
                            <span className="text-[12px] font-bold tabular-nums text-foreground/80">
                              {entry.weightKg.toFixed(1)} kg
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] font-medium text-muted-foreground/50">
                          <span>BF {fmtNumber(entry.bodyFatPct)}%</span>
                          <span>Waist {fmtNumber(entry.waistCm)}cm</span>
                          <span>Hips {fmtNumber(entry.hipsCm)}cm</span>
                          <span>Chest {fmtNumber(entry.chestCm)}cm</span>
                        </div>

                        {entry.notes && (
                          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/40 font-medium italic">
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
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/25 transition-colors active:bg-destructive/5 active:text-destructive/60"
                        aria-label="Delete measurement"
                      >
                        <Trash size={12} />
                      </button>
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
