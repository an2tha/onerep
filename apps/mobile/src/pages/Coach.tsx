import { useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { PaperPlaneTilt, Sparkle } from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { useAiFeatureGate } from "@/lib/ai-access"
import {
  currentDateKey,
  dateForOffset,
  detectTimeZone,
  type FoodLogEntry,
} from "@/lib/food-log"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { CachedWorkoutLog } from "@/lib/workout-sync"

type CoachInsight = {
  label: string
  title: string
  detail: string
}

type CoachMessage = {
  role: "user" | "assistant"
  content: string
}

type FoodLogSnapshot = {
  date: string
  entries: FoodLogEntry[]
}

type CoachContext = {
  goal: string | null
  weightPaceKgPerWeek: number | null
  weightStatus: string
  calorieTarget: number
  averageCalories: number
  averageProtein: number
  proteinTarget: number
  proteinAdherence: number
  calorieAccuracy: number
  macroConsistency: number
  workoutDays7: number
  volumeChange7Pct: number | null
  hardSets7: number
  selectedExerciseName: string | null
  selectedLiftPaceKgPerWeek: number | null
  selectedLiftFrequency: number | null
  dataConfidence: number
  existingInsights: CoachInsight[]
}

function average(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return 0
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function sumFood(entries: FoodLogEntry[]) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + (Number(entry.calories) || 0),
      protein: totals.protein + (Number(entry.protein) || 0),
      carbs: totals.carbs + (Number(entry.carbs) || 0),
      fat: totals.fat + (Number(entry.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function sumWorkoutVolume(log: CachedWorkoutLog) {
  return log.exercises.reduce((total, exercise) => {
    return (
      total +
      exercise.sets.reduce((setTotal, set) => {
        if (!set.completed) return setTotal
        const weight = Number(set.weight)
        const reps = Number(set.reps)
        if (!Number.isFinite(weight) || !Number.isFinite(reps)) return setTotal
        return setTotal + weight * reps
      }, 0)
    )
  }, 0)
}

function countHardSets(logs: CachedWorkoutLog[]) {
  return logs.reduce(
    (total, log) =>
      total +
      log.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal + exercise.sets.filter((set) => set.completed).length,
        0,
      ),
    0,
  )
}

function weightPace(entries: BodyMeasurementEntry[]) {
  const withWeight = entries
    .filter((entry) => typeof entry.weightKg === "number")
    .slice(-8)
  const first = withWeight.at(0)
  const last = withWeight.at(-1)
  if (!first || !last || first.loggedAt === last.loggedAt) return null

  const days =
    (new Date(`${last.loggedAt}T12:00:00Z`).getTime() -
      new Date(`${first.loggedAt}T12:00:00Z`).getTime()) /
    86400000
  if (!Number.isFinite(days) || days <= 0) return null
  return (((last.weightKg ?? 0) - (first.weightKg ?? 0)) / days) * 7
}

function buildContext({
  foodLogs,
  workouts,
  body,
  goals,
}: {
  foodLogs: FoodLogSnapshot[]
  workouts: CachedWorkoutLog[]
  body: BodyMeasurementEntry[]
  goals:
    | {
        effective: {
          calories: number
          protein: number
          carbs: number
          fat: number
        }
        health?: { calorieStrategy?: string }
      }
    | null
    | undefined
}): CoachContext {
  const timeZone = detectTimeZone()
  const effective = goals?.effective ?? {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
  }
  const nutrition = foodLogs
    .map((day) => sumFood(day.entries))
    .filter((day) => day.calories > 0)
  const last7Start = dateForOffset(-6, timeZone)
  const previous7Start = dateForOffset(-13, timeZone)
  const workouts7 = workouts.filter((log) => log.date >= last7Start)
  const previousWorkouts7 = workouts.filter(
    (log) => log.date >= previous7Start && log.date < last7Start,
  )
  const volume7 = workouts7.reduce((sum, log) => sum + sumWorkoutVolume(log), 0)
  const previousVolume7 = previousWorkouts7.reduce(
    (sum, log) => sum + sumWorkoutVolume(log),
    0,
  )
  const averageCalories = average(nutrition.map((day) => day.calories))
  const averageProtein = average(nutrition.map((day) => day.protein))
  const proteinAdherence =
    effective.protein > 0 ? (averageProtein / effective.protein) * 100 : 0
  const calorieAccuracy =
    effective.calories > 0
      ? 100 -
        Math.min(
          100,
          (Math.abs(averageCalories - effective.calories) /
            effective.calories) *
            100,
        )
      : 0

  const context = {
    goal: goals?.health?.calorieStrategy ?? null,
    weightPaceKgPerWeek: weightPace(body),
    weightStatus:
      body.length > 0 ? `${body.length} body check-ins logged` : "No body trend yet",
    calorieTarget: effective.calories,
    averageCalories,
    averageProtein,
    proteinTarget: effective.protein,
    proteinAdherence,
    calorieAccuracy,
    macroConsistency: average([
      proteinAdherence,
      effective.carbs > 0
        ? (average(nutrition.map((day) => day.carbs)) / effective.carbs) * 100
        : 0,
      effective.fat > 0
        ? (average(nutrition.map((day) => day.fat)) / effective.fat) * 100
        : 0,
    ]),
    workoutDays7: workouts7.length,
    volumeChange7Pct:
      previousVolume7 > 0 ? ((volume7 - previousVolume7) / previousVolume7) * 100 : null,
    hardSets7: countHardSets(workouts7),
    selectedExerciseName: workouts7[0]?.exercises[0]?.name ?? null,
    selectedLiftPaceKgPerWeek: null,
    selectedLiftFrequency: workouts7.length,
    dataConfidence: average([
      Math.min(100, nutrition.length * 14),
      Math.min(100, workouts7.length * 25),
      Math.min(100, body.length * 20),
    ]),
  }

  return {
    ...context,
    existingInsights: [
      {
        label: "Nutrition",
        title: `${Math.round(averageCalories)} kcal average`,
        detail: `Target is ${Math.round(effective.calories)} kcal with ${Math.round(averageProtein)}g protein average.`,
      },
      {
        label: "Training",
        title: `${workouts7.length} workouts this week`,
        detail: `${countHardSets(workouts7)} completed sets in the last 7 days.`,
      },
    ],
  }
}

function useCoachContext() {
  const timeZone = detectTimeZone()
  const todayKey = currentDateKey(timeZone)
  const foodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 14,
  }) as FoodLogSnapshot[] | undefined
  const workouts = useQuery(api.logs.workouts.getHistory) as
    | CachedWorkoutLog[]
    | undefined
  const body = useQuery(api.bodyProgress.list) as
    | BodyMeasurementEntry[]
    | undefined
  const goals = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })

  return useMemo(
    () => ({
      loading: foodLogs === undefined || workouts === undefined || body === undefined,
      context: buildContext({
        foodLogs: foodLogs ?? [],
        workouts: workouts ?? [],
        body: body ?? [],
        goals,
      }),
    }),
    [body, foodLogs, goals, workouts],
  )
}

export default function Coach() {
  const { context, loading } = useCoachContext()
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const generateChat = useAction(api.ai.metricGeneration.generateCoachChatMessage)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()

  async function submit() {
    const prompt = input.trim()
    if (!prompt || busy) return
    if (!requireAiAccess()) return

    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content: prompt },
    ]
    setMessages(nextMessages)
    setInput("")
    setBusy(true)

    try {
      const result = await generateChat({
        context,
        message: prompt,
        history: messages.slice(-8),
      })
      setMessages([
        ...nextMessages,
        { role: "assistant", content: result.reply },
      ])
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I could not answer that right now.",
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-page flex min-h-svh flex-col pb-[calc(var(--app-safe-bottom-lg)+5rem)] lg:pl-64">
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end gap-5 py-5">
        {messages.length === 0 ? (
          <div className="mb-4 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-foreground text-background">
              <Sparkle size={19} weight="fill" />
            </div>
            <h1 className="mt-4 text-[28px] font-bold tracking-tight text-foreground">
              Coach
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Ask anything about your training, food, recovery, or progress.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                "What should I do today?",
                "How is my week going?",
                "Adjust my plan.",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-full border border-border/55 bg-card px-3 py-2 text-[12px] font-semibold text-muted-foreground active:bg-muted"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[88%] rounded-[8px] px-3.5 py-2.5 text-[14px] leading-relaxed",
                  message.role === "user"
                    ? "ml-auto bg-foreground text-background"
                    : "bg-card text-foreground shadow-sm ring-1 ring-border/55",
                )}
              >
                {message.content}
              </div>
            ))}
            {busy ? (
              <div className="mr-auto rounded-[8px] bg-card px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/55">
                Thinking...
              </div>
            ) : null}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="sticky bottom-[calc(var(--app-safe-bottom)+1rem)]"
        >
          <div className="flex items-center gap-2 rounded-[8px] border border-border/60 bg-card/95 p-2 shadow-xl backdrop-blur-xl">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={loading ? "Loading your data..." : "Message Coach"}
              disabled={loading}
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-muted-foreground/55 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || busy || input.trim().length === 0}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-foreground text-background transition-opacity disabled:opacity-35"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
          </div>
        </form>
      </section>
      {aiAccessModal}
    </main>
  )
}
