import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAction, useQuery } from "convex/react"
import {
  ArrowRight,
  Barbell,
  ArrowClockwise,
  CaretLeft,
  ChartLineUp,
  CheckCircle,
  Circle,
  Database,
  Lightning,
  ForkKnife,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  TrendDown,
  TrendUp,
  X,
} from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import { cn, safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import {
  hasSeenCoachOnboarding,
  markCoachOnboardingSeen,
} from "@/lib/coach-onboarding"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useSmoothNavigate } from "@/lib/navigation"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"
import {
  currentDateKey,
  dateForOffset,
  detectTimeZone,
  type FoodLogEntry,
} from "@/lib/food-log"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { CachedWorkoutLog } from "@/lib/workout-sync"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"

type CoachInsight = {
  label: string
  title: string
  detail: string
}

type CoachMessage = {
  role: "user" | "assistant"
  content: string
  uiBlocks?: CoachUiBlock[]
  error?: boolean
}

type CoachUiAction =
  | "open_nutrition"
  | "open_workouts"
  | "open_progress"
  | "open_settings"
  | "open_workout_builder"
  | "open_recipe_builder"
  | "log_food"

type CoachUiBlock =
  | {
      type: "card"
      label: string
      title: string
      detail: string
    }
  | {
      type: "stat_group"
      title: string
      stats: Array<{
        label: string
        value: string
        detail?: string
        trend?: "up" | "down" | "flat"
      }>
    }
  | {
      type: "checklist"
      title: string
      items: Array<{ label: string; detail?: string; done?: boolean }>
    }
  | {
      type: "action_row"
      title: string
      actions: Array<{ label: string; action: CoachUiAction }>
    }

type FoodLogSnapshot = {
  date: string
  entries: FoodLogEntry[]
}

type CoachContext = {
  goal: string | null
  experienceLevel: string | null
  safetyMode: string
  safetyFlags: string[]
  nutritionGuidance: string[]
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

const COACH_CONVERSATION_KEY = "onerep:coach-conversation:v1"

const COACH_ONBOARDING_STEPS = [
  {
    eyebrow: "Your data, connected",
    title: "Advice that knows your routine",
    body: "Coach brings your training, nutrition, recovery, and body trends into one conversation.",
    icon: Database,
    preview: "Daily coaching overview screenshot",
    accent: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
  },
  {
    eyebrow: "Clear next steps",
    title: "See the signal, not the spreadsheet",
    body: "Ask what changed and get concise stats, checklists, and recommendations built from your recent activity.",
    icon: ChartLineUp,
    preview: "Progress insight cards screenshot",
    accent: "from-sky-500/20 via-cyan-500/10 to-transparent",
  },
  {
    eyebrow: "Ready when you are",
    title: "Turn guidance into action",
    body: "Jump straight to logging food, planning a workout, reviewing progress, or adjusting your settings.",
    icon: Lightning,
    preview: "Coach quick actions screenshot",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
  },
] as const

const COACH_STARTERS = [
  {
    title: "Plan my day",
    detail: "Balance training, food, and recovery",
    prompt: "What should I focus on today based on my recent activity?",
    icon: Sparkle,
  },
  {
    title: "Review nutrition",
    detail: "Spot gaps in calories and macros",
    prompt: "Review my recent nutrition and give me one thing to improve.",
    icon: Database,
  },
  {
    title: "Analyze training",
    detail: "Check volume, frequency, and momentum",
    prompt: "Analyze my training this week and suggest my next workout.",
    icon: Lightning,
  },
  {
    title: "Check progress",
    detail: "Make sense of trends across your data",
    prompt: "How is my progress trending, and what should I watch next?",
    icon: ChartLineUp,
  },
] as const

const BEGINNER_SETUP_STARTERS = [
  {
    title: "Build my workout plan",
    detail: "Schedule, equipment, and a simple first week",
    prompt:
      "Help me set up my first workout plan. Ask only the essential questions about my schedule, equipment, and limitations, then give me a simple plan I can save.",
    icon: Barbell,
  },
  {
    title: "Set up easy recipes",
    detail: "Simple meals matched to my goals and needs",
    prompt:
      "Help me set up a few beginner-friendly recipes. Use what you already know about my safety needs, then ask only about food preferences, budget, and cooking access.",
    icon: ForkKnife,
  },
] as const

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
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
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
        0
      ),
    0
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
  onboarding,
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
        health?: { calorieStrategy?: string; guidance?: string[] }
      }
    | null
    | undefined
  onboarding:
    | {
        experienceLevel?: string
        safetyMode?: string
        safetyFlags?: string[]
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
    (log) => log.date >= previous7Start && log.date < last7Start
  )
  const volume7 = workouts7.reduce((sum, log) => sum + sumWorkoutVolume(log), 0)
  const previousVolume7 = previousWorkouts7.reduce(
    (sum, log) => sum + sumWorkoutVolume(log),
    0
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
            100
        )
      : 0

  const context = {
    goal: goals?.health?.calorieStrategy ?? null,
    experienceLevel: onboarding?.experienceLevel ?? null,
    safetyMode: onboarding?.safetyMode ?? "standard",
    safetyFlags: onboarding?.safetyFlags ?? [],
    nutritionGuidance: goals?.health?.guidance ?? [],
    weightPaceKgPerWeek: weightPace(body),
    weightStatus:
      body.length > 0
        ? `${body.length} body check-ins logged`
        : "No body trend yet",
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
      previousVolume7 > 0
        ? ((volume7 - previousVolume7) / previousVolume7) * 100
        : null,
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
    CachedWorkoutLog[] | undefined
  const body = useQuery(api.bodyProgress.list) as
    BodyMeasurementEntry[] | undefined
  const goals = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })
  const onboarding = useQuery(api.users.onboarding.get, {})

  return useMemo(
    () => ({
      loading:
        foodLogs === undefined ||
        workouts === undefined ||
        body === undefined ||
        onboarding === undefined,
      context: buildContext({
        foodLogs: foodLogs ?? [],
        workouts: workouts ?? [],
        body: body ?? [],
        goals,
        onboarding,
      }),
    }),
    [body, foodLogs, goals, onboarding, workouts]
  )
}

function normalizeCoachUiBlocks(value: unknown): CoachUiBlock[] {
  if (!Array.isArray(value)) return []
  return value.filter((block): block is CoachUiBlock => {
    if (!block || typeof block !== "object") return false
    const row = block as Partial<CoachUiBlock>
    if (row.type === "card")
      return Boolean(row.label && row.title && row.detail)
    if (row.type === "stat_group") {
      return Boolean(
        row.title && Array.isArray(row.stats) && row.stats.length > 0
      )
    }
    if (row.type === "checklist") {
      return Boolean(
        row.title && Array.isArray(row.items) && row.items.length > 0
      )
    }
    if (row.type === "action_row") {
      return Boolean(
        row.title && Array.isArray(row.actions) && row.actions.length > 0
      )
    }
    return false
  })
}

function CoachUiBlocks({
  blocks,
  onAction,
}: {
  blocks?: CoachUiBlock[]
  onAction: (action: CoachUiAction) => void
}) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  if (!blocks?.length) return null

  return (
    <div className="mt-5 divide-y divide-border/45 border-y border-border/45">
      {blocks.map((block, index) => {
        if (block.type === "card") {
          return (
            <div key={`${block.type}-${index}`} className="py-4">
              <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/60 uppercase">
                {block.label}
              </p>
              <p className="mt-1 text-[13px] leading-snug font-bold">
                {block.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground/75">
                {block.detail}
              </p>
            </div>
          )
        }

        if (block.type === "stat_group") {
          return (
            <div key={`${block.type}-${index}`} className="py-4">
              <p className="text-[12px] font-bold text-foreground">
                {block.title}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                {block.stats.map((stat) => {
                  const TrendIcon =
                    stat.trend === "up"
                      ? TrendUp
                      : stat.trend === "down"
                        ? TrendDown
                        : null
                  return (
                    <div key={stat.label}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold text-muted-foreground/68">
                          {stat.label}
                        </p>
                        {TrendIcon ? (
                          <TrendIcon
                            size={13}
                            weight="bold"
                            className="text-muted-foreground/55"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-[17px] leading-none font-bold tabular-nums">
                        {stat.value}
                      </p>
                      {stat.detail ? (
                        <p className="mt-1 text-[10.5px] text-muted-foreground/58">
                          {stat.detail}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        if (block.type === "checklist") {
          return (
            <div key={`${block.type}-${index}`} className="py-4">
              <p className="text-[12px] font-bold text-foreground">
                {block.title}
              </p>
              <div className="mt-2 divide-y divide-border/35">
                {block.items.map((item) => {
                  const itemKey = `${index}-${item.label}`
                  const done = Boolean(item.done || completedItems.has(itemKey))
                  const Icon = done ? CheckCircle : Circle
                  return (
                    <button
                      type="button"
                      key={item.label}
                      onClick={() => {
                        hapticSelection()
                        setCompletedItems((current) => {
                          const next = new Set(current)
                          if (next.has(itemKey)) next.delete(itemKey)
                          else next.add(itemKey)
                          return next
                        })
                      }}
                      className="flex min-h-11 w-full gap-2.5 py-2.5 text-left transition-opacity active:opacity-60"
                      aria-pressed={done}
                    >
                      <Icon
                        size={17}
                        weight={done ? "fill" : "regular"}
                        className={cn(
                          "mt-0.5 shrink-0 transition-colors",
                          done
                            ? "text-[var(--status-success)]"
                            : "text-muted-foreground/45"
                        )}
                      />
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-[12.5px] leading-snug font-semibold transition-opacity",
                            done && "line-through opacity-55"
                          )}
                        >
                          {item.label}
                        </p>
                        {item.detail ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/62">
                            {item.detail}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }

        return (
          <div key={`${block.type}-${index}`} className="py-4">
            <p className="text-[12px] font-bold text-foreground">
              {block.title}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {block.actions.map((action) => (
                <button
                  key={`${action.action}-${action.label}`}
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    onAction(action.action)
                  }}
                  className="motion-tactile inline-flex min-h-10 items-center gap-1.5 border-b border-foreground/30 text-[12px] font-bold text-foreground active:opacity-60"
                >
                  {action.label}
                  <ArrowRight size={12} weight="bold" />
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CoachOnboarding({
  open,
  onDismiss,
}: {
  open: boolean
  onDismiss: () => void
}) {
  const [step, setStep] = useState(0)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onDismiss, open])

  if (!open) return null

  const current = COACH_ONBOARDING_STEPS[step]
  const Icon = current.icon
  const isLast = step === COACH_ONBOARDING_STEPS.length - 1

  return (
    <div
      className="fixed inset-0 z-[90] flex min-h-dvh items-center justify-center overflow-y-auto bg-background/80 p-3 backdrop-blur-xl sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-onboarding-title"
    >
      <div className="relative w-full max-w-[29rem] overflow-hidden rounded-[24px] border border-border/55 bg-card shadow-2xl">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onDismiss}
          aria-label="Close Coach introduction"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground backdrop-blur transition-colors active:bg-muted active:text-foreground"
        >
          <X size={16} weight="bold" />
        </button>

        <div className="p-4 pb-0 sm:p-5 sm:pb-0">
          <div
            className={cn(
              "relative aspect-[16/10] overflow-hidden rounded-[18px] border border-border/55 bg-background",
              "bg-gradient-to-br",
              current.accent
            )}
            role="img"
            aria-label={current.preview}
          >
            <div className="absolute inset-x-3 top-3 bottom-0 overflow-hidden rounded-t-[14px] border border-border/60 bg-card/90 shadow-xl sm:inset-x-5 sm:top-5">
              <div className="flex h-8 items-center gap-1.5 border-b border-border/50 px-3">
                <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                <span className="size-1.5 rounded-full bg-muted-foreground/20" />
                <span className="size-1.5 rounded-full bg-muted-foreground/15" />
                <span className="ml-auto text-[8px] font-bold tracking-[0.14em] text-muted-foreground/45 uppercase">
                  Screenshot placeholder
                </span>
              </div>
              <div className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
                    <Icon size={13} weight="fill" />
                  </span>
                  <div className="space-y-1.5">
                    <div className="h-2 w-24 rounded-full bg-foreground/70" />
                    <div className="h-1.5 w-16 rounded-full bg-muted-foreground/20" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="rounded-lg border border-border/45 bg-background/70 p-2"
                    >
                      <div className="h-1.5 w-8 rounded-full bg-muted-foreground/20" />
                      <div
                        className={cn(
                          "mt-2 rounded-full bg-foreground/65",
                          item === 1 ? "h-2.5 w-10" : "h-2.5 w-8"
                        )}
                      />
                      <div className="mt-2 h-1 w-full rounded-full bg-muted-foreground/10" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 h-8 rounded-lg border border-border/45 bg-background/70" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/60 uppercase">
            <Icon size={14} weight="bold" />
            {current.eyebrow}
          </div>
          <h2
            id="coach-onboarding-title"
            className="mt-2 max-w-sm text-[25px] leading-tight font-bold tracking-tight text-foreground"
          >
            {current.title}
          </h2>
          <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground/75">
            {current.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div
              className="flex items-center gap-1.5"
              aria-label={`Step ${step + 1} of ${COACH_ONBOARDING_STEPS.length}`}
            >
              {COACH_ONBOARDING_STEPS.map((item, index) => (
                <span
                  key={item.title}
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    index === step
                      ? "w-5 bg-foreground"
                      : "w-1.5 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step === 0 ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="h-10 px-2 text-[12px] font-bold text-muted-foreground transition-colors active:text-foreground"
                >
                  Skip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    setStep((value) => Math.max(0, value - 1))
                  }}
                  aria-label="Previous Coach feature"
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border/60 text-muted-foreground transition-colors active:bg-muted active:text-foreground"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  hapticSelection()
                  if (isLast) {
                    onDismiss()
                    return
                  }
                  setStep((value) => value + 1)
                }}
                className="flex h-10 items-center gap-2 rounded-[10px] bg-foreground px-4 text-[12.5px] font-bold text-background transition-opacity active:opacity-80"
              >
                {isLast ? "Start coaching" : "Next"}
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const FOLLOW_UP_PROMPTS = [
  "What is the highest-impact change I can make today?",
  "Turn that into a simple plan for this week.",
  "What does my recent data say about recovery?",
] as const

function loadCoachConversation(): CoachMessage[] {
  const stored = safeLocalStorageGet(COACH_CONVERSATION_KEY)
  if (!stored) return []
  try {
    const value = JSON.parse(stored) as unknown
    if (!Array.isArray(value)) return []
    return value
      .filter((message): message is CoachMessage =>
        Boolean(
          message &&
          typeof message === "object" &&
          ((message as CoachMessage).role === "user" ||
            (message as CoachMessage).role === "assistant") &&
          typeof (message as CoachMessage).content === "string"
        )
      )
      .slice(-20)
  } catch {
    return []
  }
}

function coachBrief(context: CoachContext) {
  const calorieGap = Math.round(context.calorieTarget - context.averageCalories)
  const proteinGap = Math.round(context.proteinTarget - context.averageProtein)

  if (context.dataConfidence < 25) {
    return "There is not enough recent data for a strong recommendation yet. A few food logs, one workout, or a body check-in will make Coach more specific."
  }
  if (proteinGap > 25) {
    return `Protein is the clearest opportunity right now. Your recent average is ${Math.round(context.averageProtein)}g, about ${proteinGap}g below target.`
  }
  if (context.workoutDays7 < 2) {
    return `Training frequency is the main signal this week. You have ${context.workoutDays7} completed workout${context.workoutDays7 === 1 ? "" : "s"} in the last 7 days.`
  }
  if (calorieGap > 350) {
    return `Your logged intake is averaging about ${calorieGap} kcal below the current budget. Coach can help check whether that matches your goal and recovery.`
  }
  return "Your recent nutrition and training are reasonably aligned. The next useful step is to review progress or plan the coming week."
}

function CoachContextPanel({ context }: { context: CoachContext }) {
  return (
    <details className="group border-y border-border/45 text-[11px]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2.5 font-semibold text-muted-foreground/65 marker:hidden">
        <span>Using your last 14 days of data</span>
        <span className="text-[10px] font-medium text-muted-foreground/45 group-open:hidden">
          Show
        </span>
        <span className="hidden text-[10px] font-medium text-muted-foreground/45 group-open:inline">
          Hide
        </span>
      </summary>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pb-4 sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground/48">Calories</dt>
          <dd className="mt-0.5 font-bold text-foreground tabular-nums">
            {Math.round(context.averageCalories)} /{" "}
            {Math.round(context.calorieTarget)} kcal
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/48">Protein</dt>
          <dd className="mt-0.5 font-bold text-foreground tabular-nums">
            {Math.round(context.averageProtein)} /{" "}
            {Math.round(context.proteinTarget)}g
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/48">Training</dt>
          <dd className="mt-0.5 font-bold text-foreground">
            {context.workoutDays7} sessions · {context.hardSets7} sets
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/48">Data confidence</dt>
          <dd className="mt-0.5 font-bold text-foreground tabular-nums">
            {Math.round(context.dataConfidence)}%
          </dd>
        </div>
      </dl>
    </details>
  )
}

function CoachLoadingState() {
  return (
    <div
      className="mx-auto w-full max-w-2xl py-16"
      role="status"
      aria-label="Loading Coach"
    >
      <div className="h-7 w-52 animate-pulse rounded bg-foreground/[0.08]" />
      <div className="mt-4 h-3 w-full animate-pulse rounded bg-foreground/[0.05]" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-foreground/[0.05]" />
      <div className="mt-10 divide-y divide-border/40 border-y border-border/40">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="py-5">
            <div className="h-3 w-32 animate-pulse rounded bg-foreground/[0.07]" />
            <div className="mt-2 h-2.5 w-2/3 animate-pulse rounded bg-foreground/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="pl-1" role="status" aria-label="Coach is thinking">
      <div className="inline-flex items-center gap-3 py-2 text-muted-foreground/55">
        <div className="flex h-4 items-center gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground/55"
              style={{ animationDelay: `${dot * 140}ms` }}
            />
          ))}
        </div>
        <p className="text-[11px] font-medium">Reviewing recent signals…</p>
      </div>
    </div>
  )
}

export default function Coach() {
  const { context, loading } = useCoachContext()
  const navigate = useSmoothNavigate()
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>(
    loadCoachConversation
  )
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(
    () => !hasSeenCoachOnboarding()
  )
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const generateChat = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()

  const dismissOnboarding = useCallback(() => {
    hapticTap()
    markCoachOnboardingSeen()
    setShowOnboarding(false)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [busy, messages.length])

  useEffect(() => {
    safeLocalStorageSet(COACH_CONVERSATION_KEY, JSON.stringify(messages))
  }, [messages])

  function updateComposer(value: string, element?: HTMLTextAreaElement) {
    setInput(value)
    const textarea = element ?? composerRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
  }

  async function submit(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim()
    if (!prompt || busy || loading) return
    if (!requireAiAccess()) return

    hapticMedium()
    setLastFailedPrompt(null)
    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content: prompt },
    ]
    setMessages(nextMessages)
    updateComposer("")
    setBusy(true)

    try {
      const result = await generateChat({
        context,
        message: prompt,
        history: messages
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content })),
      })
      const response = result as {
        reply: string
        uiBlocks?: unknown
      }
      hapticTap()
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: response.reply,
          uiBlocks: normalizeCoachUiBlocks(response.uiBlocks),
        },
      ])
    } catch (error) {
      hapticHeavy()
      setLastFailedPrompt(prompt)
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I could not answer that right now.",
          error: true,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function handleUiAction(action: CoachUiAction) {
    if (action === "open_workout_builder") {
      navigate("/workouts/new", { motion: "forward" })
      return
    }
    if (action === "open_recipe_builder") {
      navigate("/foods/recipe/new", { motion: "forward" })
      return
    }
    if (action === "open_nutrition" || action === "log_food") {
      navigate("/nutrition", { motion: "switch" })
      return
    }
    if (action === "open_workouts") {
      navigate("/workouts", { motion: "switch" })
      return
    }
    if (action === "open_progress") {
      navigate("/progress", { motion: "switch" })
      return
    }
    navigate("/settings", { motion: "switch" })
  }

  function startNewChat() {
    if (busy) return
    hapticTap()
    setMessages([])
    updateComposer("")
    setLastFailedPrompt(null)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  return (
    <main className="desktop-canvas min-h-svh bg-background pb-[calc(var(--app-safe-bottom-lg)+5rem)] lg:pl-64">
      <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-[var(--app-page-x)] md:px-8">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-border/45 bg-background/95 backdrop-blur-xl">
          <h1 className="text-[18px] leading-tight font-bold tracking-tight">
            Coach
          </h1>
          {messages.length > 0 && (
            <AppTooltip
              id={APP_TOOLTIP_IDS.coachNewChat}
              content="Clear this conversation and return to Coach’s skill shortcuts."
              side="bottom"
              enabled={!showOnboarding}
            >
              <button
                type="button"
                onClick={startNewChat}
                disabled={busy}
                className="motion-tactile inline-flex min-h-11 items-center gap-1.5 px-2 text-[11px] font-bold text-muted-foreground active:text-foreground disabled:opacity-40"
              >
                <Plus size={13} weight="bold" />
                New chat
              </button>
            </AppTooltip>
          )}
        </header>

        <section className="flex flex-1 flex-col py-5">
          {loading ? (
            <CoachLoadingState />
          ) : messages.length === 0 ? (
            <div className="mx-auto my-auto w-full max-w-2xl py-10">
              <p className="text-[12px] font-semibold text-muted-foreground/55">
                Today
              </p>
              <h2 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.025em]">
                What do you want to work on?
              </h2>
              <p className="mt-5 max-w-xl text-[14px] leading-6 text-foreground/78">
                {coachBrief(context)}
              </p>
              <div className="mt-6">
                <CoachContextPanel context={context} />
              </div>

              <AppTooltip
                id={APP_TOOLTIP_IDS.coachStarters}
                content="Choose a focused coaching task."
                targetClassName="mt-8 block w-full"
                side="top"
                enabled={!showOnboarding}
              >
                <div className="divide-y divide-border/45 border-y border-border/45">
                  {(context.experienceLevel === "beginner"
                    ? [...BEGINNER_SETUP_STARTERS, ...COACH_STARTERS]
                    : COACH_STARTERS
                  ).map((starter) => (
                    <button
                      key={starter.title}
                      type="button"
                      onClick={() => void submit(starter.prompt)}
                      className="group flex min-h-[4.5rem] w-full items-center gap-4 py-3 text-left active:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-foreground">
                          {starter.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground/58">
                          {starter.detail}
                        </span>
                      </span>
                      <ArrowRight
                        size={15}
                        weight="bold"
                        className="shrink-0 text-muted-foreground/35 transition-transform group-active:translate-x-1"
                      />
                    </button>
                  ))}
                </div>
              </AppTooltip>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
              <CoachContextPanel context={context} />
              <div
                className="mt-6 flex flex-1 flex-col gap-5"
                aria-live="polite"
              >
                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <div
                      key={index}
                      className="ml-auto max-w-[82%] rounded-xl bg-foreground px-4 py-3 text-[13.5px] leading-5 text-background"
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div key={index} className="max-w-2xl">
                      <p className="mb-2 text-[10px] font-bold tracking-[0.1em] text-muted-foreground/48 uppercase">
                        Coach
                      </p>
                      <div
                        className={cn(
                          "min-w-0 border-l-2 pl-4 text-[14px] leading-6",
                          message.error
                            ? "border-destructive/35 text-foreground"
                            : "border-border text-foreground"
                        )}
                      >
                        <p>{message.content}</p>
                        {message.error && lastFailedPrompt ? (
                          <button
                            type="button"
                            onClick={() => void submit(lastFailedPrompt)}
                            className="motion-tactile mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3 text-[11px] font-bold text-background"
                          >
                            <ArrowClockwise size={13} weight="bold" />
                            Try again
                          </button>
                        ) : (
                          <CoachUiBlocks
                            blocks={message.uiBlocks}
                            onAction={handleUiAction}
                          />
                        )}
                      </div>
                    </div>
                  )
                )}
                {busy && <ThinkingIndicator />}
                {!busy &&
                  messages.at(-1)?.role === "assistant" &&
                  !messages.at(-1)?.error && (
                    <div className="max-w-2xl border-t border-border/35 pt-2">
                      {FOLLOW_UP_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void submit(prompt)}
                          className="motion-tactile block min-h-9 w-full py-2 text-left text-[11px] font-medium text-muted-foreground/62 active:text-foreground"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </section>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="sticky bottom-0 z-20 mx-auto w-full max-w-3xl border-t border-border/45 bg-background/95 pt-3 pb-[max(0.9rem,var(--app-safe-bottom))] backdrop-blur-xl"
        >
          <AppTooltip
            id={APP_TOOLTIP_IDS.coachMessage}
            content="Ask Coach about today’s workout, food choices, recovery, or what changed in your progress."
            targetClassName="block w-full"
            side="top"
            enabled={!showOnboarding}
          >
            <div className="rounded-xl border border-border/60 bg-card p-2 focus-within:border-foreground/25">
              <div className="flex items-end gap-2">
                <textarea
                  ref={composerRef}
                  value={input}
                  rows={1}
                  maxLength={1200}
                  onChange={(event) =>
                    updateComposer(event.target.value, event.currentTarget)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      void submit()
                    }
                  }}
                  placeholder={
                    loading ? "Connecting your data…" : "Ask Coach anything…"
                  }
                  disabled={loading || busy}
                  className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2.5 py-3 text-[14px] leading-5 outline-none placeholder:text-muted-foreground/45 disabled:opacity-55"
                />
                <button
                  type="submit"
                  disabled={loading || busy || input.trim().length === 0}
                  aria-label="Send message"
                  className="motion-tactile flex size-11 shrink-0 items-center justify-center rounded-lg bg-foreground text-background disabled:bg-muted-foreground/25"
                >
                  <PaperPlaneTilt size={17} weight="fill" />
                </button>
              </div>
              <div className="flex items-center justify-between px-2.5 pb-1">
                <p className="text-[9px] font-semibold text-muted-foreground/38">
                  Enter to send · Shift + Enter for a new line
                </p>
                {input.length > 900 && (
                  <p className="text-[9px] font-bold text-muted-foreground/45 tabular-nums">
                    {input.length}/1200
                  </p>
                )}
              </div>
            </div>
          </AppTooltip>
        </form>
      </div>
      <CoachOnboarding open={showOnboarding} onDismiss={dismissOnboarding} />
      {aiAccessModal}
    </main>
  )
}
