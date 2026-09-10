/**
 * Re-pushes the past week's nutrition and hydration day totals to the health
 * store, replacing whatever earlier versions of the app left there.
 *
 * Why this exists: builds before the native upsert fix filed every writeback
 * push as a NEW record, and Health Connect aggregates by summing — so a day
 * logged three times can read three days' worth of food. The fix stops future
 * stacking; this repair washes out the past. Each re-push lands on a clean
 * day (the native side deletes the app's own same-day cumulative records
 * before inserting), so one pass leaves each day correct.
 *
 * The queries live in a child component that only mounts once the user arms
 * the repair — this convex version's `useQueries` has no skip, so gating by
 * mount is what keeps fourteen queries off the wire during normal Settings
 * browsing.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { PrimaryButton } from "@repo/ui"
import { saveHealthDailyMetric } from "@/lib/health-provider"
import {
  beginHealthSync,
  endHealthSync,
  recordSyncActivity,
  setHealthSyncPhase,
} from "@/lib/health-sync-status"
import { localDateKey } from "@/lib/utils"

/** How far back the repair reaches. */
const REPAIR_DAYS = 7

function offsetKey(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return localDateKey(d)
}

export function HealthWriteBackRepair({
  disabled,
}: {
  disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  if (armed) {
    return (
      <RepairRunner
        onFinished={(result) => {
          setArmed(false)
          setSummary(
            result === null
              ? "Repair couldn't read the past week's logs. Try again."
              : `Repair re-wrote ${result.days} day${result.days === 1 ? "" : "s"} (${result.writes} values${
                  result.failures > 0 ? `, ${result.failures} refused` : ""
                }).`
          )
        }}
      />
    )
  }

  return (
    <>
      <PrimaryButton
        className="w-full"
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        Repair last week's written totals
      </PrimaryButton>
      {summary && (
        <p className="native-row-detail px-[var(--app-page-x)]">{summary}</p>
      )}
    </>
  )
}

type RepairSummary = { days: number; writes: number; failures: number }

type DayPayload = {
  date: string
  totals: { calories: number; protein: number; carbs: number; fat: number }
  waterMl: number
}

function RepairRunner({
  onFinished,
}: {
  onFinished: (result: RepairSummary | null) => void
}) {
  const dayKeys = useMemo(
    () => Array.from({ length: REPAIR_DAYS }, (_, i) => offsetKey(i)),
    []
  )

  // Object form — this convex version's useQueries takes a keyed record and
  // has no skip sentinel, hence the arm-then-mount gating above.
  const foodQueries = useQueries(
    useMemo(
      () =>
        Object.fromEntries(
          dayKeys.map((date) => [
            date,
            {
              query: api.logs.foodLogs.getRange,
              args: { start: date, end: date },
            },
          ])
        ),
      [dayKeys]
    )
  )
  const waterQueries = useQueries(
    useMemo(
      () =>
        Object.fromEntries(
          dayKeys.map((date) => [
            date,
            { query: api.logs.water.getDay, args: { date } },
          ])
        ),
      [dayKeys]
    )
  )

  // loading → writing → done. The snapshot for the writes is taken exactly
  // once, at the loading→writing transition, so the loop can never mix a
  // later re-render's data into an in-flight push.
  const [phase, setPhase] = useState<"loading" | "writing" | "done">("loading")
  const [snapshot, setSnapshot] = useState<DayPayload[] | null>(null)
  const [progress, setProgress] = useState(0)
  const readErrorsRef = useRef(0)
  const timedOutRef = useRef(false)

  // Every key must be a loaded value or an Error — undefined means the query
  // is still in flight and pushing now could file a day as empty. If the
  // device has lost connectivity the queries can stay undefined forever, so
  // a real timer owns the abort: render-triggered checks alone would never
  // fire, because nothing re-renders when nothing arrives.
  useEffect(() => {
    if (phase !== "loading") return
    timedOutRef.current = false
    const timer = window.setTimeout(() => {
      timedOutRef.current = true
      onFinished(null)
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "loading" || timedOutRef.current) return

    const allSettled = dayKeys.every(
      (key) =>
        foodQueries[key] !== undefined && waterQueries[key] !== undefined
    )
    if (!allSettled) return
    let readErrors = 0
    const payloads: DayPayload[] = dayKeys.map((date) => {
      const food = foodQueries[date]
      const water = waterQueries[date]
      if (food instanceof Error || water instanceof Error) {
        readErrors += 1
        return { date, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, waterMl: 0 }
      }
      const entries =
        (food as { date: string; entries: { calories: number; protein: number; carbs: number; fat: number }[] }[])
          ?.find((doc) => doc.date === date)?.entries ?? []
      const totals = entries.reduce(
        (acc, e) => ({
          calories: acc.calories + e.calories,
          protein: acc.protein + e.protein,
          carbs: acc.carbs + e.carbs,
          fat: acc.fat + e.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
      const waterMl = ((water as { amountMl: number }[]) ?? []).reduce(
        (sum, e) => sum + e.amountMl,
        0
      )
      return { date, totals, waterMl }
    })
    readErrorsRef.current = readErrors
    setSnapshot(payloads)
    setPhase("writing")
    // One-shot transition; the reactive query maps only matter until the
    // snapshot exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dayKeys, foodQueries, waterQueries])

  useEffect(() => {
    if (phase !== "writing" || !snapshot) return
    let cancelled = false

    async function writeAll() {
      beginHealthSync("Reading the past week's logs…")
      const summary: RepairSummary = { days: 0, writes: 0, failures: 0 }
      summary.failures += readErrorsRef.current

      for (let i = 0; i < snapshot!.length; i++) {
        if (cancelled) return
        const { date, totals, waterMl } = snapshot![i]
        setHealthSyncPhase(i === 0 ? "Rewriting today…" : `Rewriting ${date}…`)
        setProgress(i)

        const hadNutrition = totals.calories > 0 || totals.protein > 0 || totals.carbs > 0 || totals.fat > 0
        const hadWater = waterMl > 0
        if (hadNutrition || hadWater) {
          if (hadNutrition) {
            const pushes: [string, number][] = [
              ["dietaryEnergyKcal", Math.round(totals.calories)],
              ["dietaryProteinG", Math.round(totals.protein)],
              ["dietaryCarbsG", Math.round(totals.carbs)],
              ["dietaryFatG", Math.round(totals.fat)],
            ]
            for (const [metric, value] of pushes) {
              const result = await saveHealthDailyMetric({ metric, date, value })
              if (result.saved) summary.writes += 1
              else summary.failures += 1
            }
          }
          if (hadWater) {
            const result = await saveHealthDailyMetric({
              metric: "hydrationMl",
              date,
              value: Math.round(waterMl),
            })
            if (result.saved) summary.writes += 1
            else summary.failures += 1
          }
          summary.days += 1
        } else if (!cancelled) {
          // A day with no logged food or water still may have stacked Health
          // Connect records from an older build. Clean them so the day ends
          // empty, not doubled.
          for (const recordType of [
            "dietaryEnergyKcal",
            "dietaryProteinG",
            "dietaryCarbsG",
            "dietaryFatG",
            "hydrationMl",
          ]) {
            const result = await saveHealthDailyMetric({
              metric: recordType as any,
              date,
              value: 0,
            })
            if (!result.saved) summary.failures += 1
          }
        }
      }

      if (cancelled) return
      recordSyncActivity(
        summary.failures === 0
          ? "Repair re-pushed the past week"
          : `Repair finished, ${summary.failures} write${summary.failures === 1 ? "" : "s"} refused`,
        summary.writes
      )
      setProgress(snapshot!.length)
      endHealthSync({ error: null })
      setPhase("done")
      onFinished(summary)
    }

    void writeAll()
    return () => {
      cancelled = true
      // If the runner unmounts mid-write, end the persisted status so the
      // Health & Wearables page does not stay "syncing" for the rest of the
      // process.
      endHealthSync({ error: "Repair cancelled" })
    }
    // onFinished is a setState-wrapping closure from the parent; it is stable
    // enough for a one-shot run and must not restart the writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, snapshot])

  return (
    <div className="px-[var(--app-page-x)]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300"
          style={{ width: `${Math.round((progress / REPAIR_DAYS) * 100)}%` }}
        />
      </div>
      <p className="native-row-detail mt-2">Re-pushing day totals…</p>
    </div>
  )
}
