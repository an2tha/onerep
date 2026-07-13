import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowRight,
  Barbell,
  ArrowClockwise,
  Brain,
  ChartLineUp,
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  Database,
  Heartbeat,
  ImageSquare,
  Lightning,
  ForkKnife,
  Microphone,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  StopCircle,
  TrendDown,
  TrendUp,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { toast } from "sonner"
import {
  cn,
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/lib/utils"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useSmoothNavigate } from "@/lib/navigation"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"
import {
  currentDateKey,
  detectTimeZone,
  type FoodLogEntry,
} from "@/lib/food-log"
import { normalizeScheduleRoutines, type Day } from "@/lib/workout-sync"
import { searchExercises, type Exercise } from "@/lib/exercise-catalog"
import { useCoachContext, type CoachContext } from "@/lib/coach-context"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"
import { prepareCoachImage } from "@/lib/coach-media"
import { useCoachDictation } from "@/lib/use-coach-dictation"

type CoachMessage = {
  role: "user" | "assistant"
  content: string
  uiBlocks?: CoachUiBlock[]
  operationResults?: CoachOperationResult[]
  pendingOperations?: CoachOperation[]
  artifacts?: CoachArtifact[]
  error?: boolean
}

type CoachAttachment = {
  id?: Id<"coachUploads">
  fileName: string
  previewUrl: string
  status: "preparing" | "uploading" | "ready" | "error"
  error?: string
}

type CoachRecipeIngredient = {
  id?: string
  name: string
  grams: number
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
}

type CoachOperationMeta = {
  confirmation: "auto" | "confirm"
  summary: string
  assumptions: string[]
  warnings: string[]
}

type CoachOperation = CoachOperationMeta &
  (
    | {
        type: "save_recipe"
        recipeId?: string
        name: string
        description: string
        servings: number
        prepMinutes: number
        tags: string[]
        ingredients: CoachRecipeIngredient[]
        steps: string[]
        logMeal?: string
        servingsToLog?: number
      }
    | {
        type: "log_nutrition"
        entryId?: string
        date?: string
        name: string
        meal: string
        calories: number
        protein: number
        carbs: number
        fat: number
      }
    | {
        type: "delete_nutrition"
        entryId: string
        date: string
        name: string
      }
    | {
        type: "create_workout_preset"
        presetId?: string
        reason?: "user_edit" | "progression" | "recovery" | "substitution"
        name: string
        focus: "strength" | "cardio" | "mobility"
        exercises: Array<{
          name: string
          sets: Array<{
            type: "working" | "warmup" | "failure" | "myoreps" | "drop"
            weight: string
            reps: string
            restSeconds: number
          }>
        }>
        scheduleDays: Day[]
      }
    | {
        type: "update_routine"
        assignments: Array<{ day: Day; presetName: string | null }>
      }
    | {
        type: "remember"
        key: string
        category: string
        value: string
      }
    | {
        type: "forget_memory"
        key: string
        value: string
      }
    | {
        type: "save_check_in"
        date: string
        energy: number
        soreness: number
        sleepQuality: number
        mood: number
        note?: string
      }
    | {
        type: "save_weekly_plan"
        weekStart: string
        title: string
        days: Array<{
          day: string
          workoutPresetId?: string
          workoutLabel?: string
          meals: Array<{ label: string; recipeId?: string; note?: string }>
          recoveryNote?: string
        }>
        planAssumptions: string[]
      }
    | {
        type: "undo_action"
        actionId: string
        actionSummary: string
      }
  )

type CoachArtifact = {
  type:
    | "today_briefing"
    | "progress_explanation"
    | "simulation"
    | "validation"
    | "recovery_adaptation"
  title: string
  status?: string
  detail: string
  evidence: string[]
  nextSteps: string[]
}

type CoachOperationResult =
  | ({ type: "save_recipe"; recipeId: string; actionId?: string } & Extract<
      CoachOperation,
      { type: "save_recipe" }
    >)
  | {
      type: "log_nutrition"
      entryId?: string
      actionId?: string
      name: string
      meal: string
      calories: number
      protein: number
      carbs: number
      fat: number
    }
  | {
      type: "delete_nutrition"
      name: string
      actionId?: string
    }
  | {
      type: "create_workout_preset"
      presetId: string
      actionId?: string
      name: string
      exerciseNames: string[]
      scheduledDays: Day[]
    }
  | {
      type: "update_routine"
      actionId?: string
      assignments: Array<{ day: Day; presetName: string | null }>
    }
  | {
      type:
        | "remember"
        | "forget_memory"
        | "save_check_in"
        | "save_weekly_plan"
        | "undo_action"
      label: string
      actionId?: string
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

const COACH_CONVERSATION_KEY = "onerep:coach-conversation:v1"
const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function weekStartKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date.toISOString().slice(0, 10)
}

const COACH_STARTERS = [
  {
    title: "Make something",
    detail: "Create a recipe, workout, or change your routine",
    prompt:
      "Create a high-protein dinner recipe for me and save it. Make reasonable assumptions from my goals.",
    icon: ForkKnife,
  },
  {
    title: "Plan my week",
    detail: "Coordinate training, meals, schedule, and recovery",
    prompt:
      "Build a practical seven-day workout and meal plan from my saved presets, recipes, goals, schedule, and recovery. Validate it before proposing changes.",
    icon: Database,
  },
  {
    title: "Adapt my training",
    detail: "Progress, deload, or substitute using recent evidence",
    prompt:
      "Review my recent completion, load, frequency, and recovery. Explain whether a progression, lighter session, or exercise substitution is justified.",
    icon: Barbell,
  },
  {
    title: "Validate my routine",
    detail: "Check recovery gaps, volume, balance, and duration",
    prompt:
      "Validate my current weekly routine for recovery spacing, repeated muscle load, session length, excessive volume, and missing movement patterns.",
    icon: CheckCircle,
  },
  {
    title: "Explore a scenario",
    detail: "Compare a goal or schedule change without saving it",
    prompt:
      "Simulate what might change if I trained three days per week instead of my current schedule. Do not change anything.",
    icon: ChartLineUp,
  },
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

function normalizeCoachOperations(value: unknown): CoachOperation[] {
  if (!Array.isArray(value)) return []
  return value.filter((operation): operation is CoachOperation => {
    if (!operation || typeof operation !== "object" || !("type" in operation))
      return false
    const row = operation as { type?: string; [key: string]: unknown }
    if (row.type === "save_recipe")
      return Boolean(row.name && Array.isArray(row.ingredients))
    if (row.type === "log_nutrition") return Boolean(row.name)
    if (row.type === "delete_nutrition") return Boolean(row.entryId && row.date)
    if (row.type === "create_workout_preset")
      return Boolean(row.name && Array.isArray(row.exercises))
    if (row.type === "update_routine") return Array.isArray(row.assignments)
    if (row.type === "remember") return Boolean(row.key && row.value)
    if (row.type === "forget_memory") return Boolean(row.key)
    if (row.type === "save_check_in") return Boolean(row.date)
    if (row.type === "save_weekly_plan")
      return Boolean(row.weekStart && Array.isArray(row.days))
    if (row.type === "undo_action") return Boolean(row.actionId)
    return false
  })
}

function normalizeCoachArtifacts(value: unknown): CoachArtifact[] {
  if (!Array.isArray(value)) return []
  return value.filter((artifact): artifact is CoachArtifact => {
    if (!artifact || typeof artifact !== "object") return false
    const row = artifact as Partial<CoachArtifact>
    return Boolean(
      row.type &&
      row.title &&
      row.detail &&
      Array.isArray(row.evidence) &&
      Array.isArray(row.nextSteps)
    )
  })
}

function validateCoachOperations(operations: CoachOperation[]) {
  const errors: string[] = []
  for (const operation of operations) {
    if (operation.type === "save_recipe") {
      if (operation.ingredients.length === 0)
        errors.push(`${operation.name} has no ingredients.`)
      if (
        operation.ingredients.some(
          (ingredient) =>
            ingredient.grams <= 0 ||
            ingredient.caloriesPer100 < 0 ||
            ingredient.proteinPer100 < 0 ||
            ingredient.carbsPer100 < 0 ||
            ingredient.fatPer100 < 0
        )
      )
        errors.push(`${operation.name} has invalid nutrition estimates.`)
    }
    if (operation.type === "create_workout_preset") {
      const names = operation.exercises.map((exercise) =>
        normalizedExerciseName(exercise.name)
      )
      if (new Set(names).size !== names.length)
        errors.push(`${operation.name} repeats an exercise.`)
      const totalSets = operation.exercises.reduce(
        (sum, exercise) => sum + exercise.sets.length,
        0
      )
      if (totalSets > 40)
        errors.push(`${operation.name} exceeds a practical 40-set session.`)
    }
    if (operation.type === "update_routine") {
      const days = operation.assignments.map((assignment) => assignment.day)
      if (new Set(days).size !== days.length)
        errors.push("The routine proposal changes the same day twice.")
    }
    if (operation.type === "save_weekly_plan") {
      const days = operation.days.map((day) => day.day)
      if (new Set(days).size !== days.length)
        errors.push("The weekly plan contains duplicate days.")
    }
  }
  return errors
}

function normalizedExerciseName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function bestExerciseMatch(query: string, candidates: Exercise[]) {
  const normalizedQuery = normalizedExerciseName(query)
  return (
    [...candidates].sort((a, b) => {
      const score = (exercise: Exercise) => {
        const name = normalizedExerciseName(exercise.name)
        if (name === normalizedQuery) return 100
        if (name.includes(normalizedQuery) || normalizedQuery.includes(name))
          return 80
        return normalizedQuery
          .split(" ")
          .filter((token) => token.length > 2 && name.includes(token)).length
      }
      return score(b) - score(a)
    })[0] ?? null
  )
}

function recipeTotals(ingredients: CoachRecipeIngredient[], servings: number) {
  const total = ingredients.reduce(
    (sum, ingredient) => {
      const scale = ingredient.grams / 100
      return {
        calories: sum.calories + ingredient.caloriesPer100 * scale,
        protein: sum.protein + ingredient.proteinPer100 * scale,
        carbs: sum.carbs + ingredient.carbsPer100 * scale,
        fat: sum.fat + ingredient.fatPer100 * scale,
      }
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
  const divisor = Math.max(1, servings)
  return Object.fromEntries(
    Object.entries(total).map(([key, value]) => [
      key,
      Math.round(value / divisor),
    ])
  ) as typeof total
}

function CoachOperationResults({
  results,
  onOpenRecipe,
  onOpenWorkouts,
  onOpenNutrition,
  onUndo,
  onLogRecipe,
}: {
  results?: CoachOperationResult[]
  onOpenRecipe: (id: string) => void
  onOpenWorkouts: () => void
  onOpenNutrition: () => void
  onUndo: (id: string) => void
  onLogRecipe: (
    result: Extract<CoachOperationResult, { type: "save_recipe" }>
  ) => void
}) {
  if (!results?.length) return null

  return (
    <div className="mt-4 space-y-3">
      {results.map((result, index) => {
        if (result.type === "save_recipe") {
          const totals = recipeTotals(result.ingredients, result.servings)
          return (
            <article
              key={`${result.type}-${result.recipeId}`}
              className="relative overflow-hidden rounded-[22px] border border-amber-500/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.14),rgba(249,115,22,0.05)_48%,transparent)] p-4 shadow-[0_18px_50px_rgba(120,53,15,0.08)]"
            >
              <div className="absolute -top-12 -right-10 size-28 rounded-full bg-amber-400/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.16em] text-amber-700/70 uppercase dark:text-amber-300/65">
                      Saved recipe
                    </p>
                    <h3 className="mt-1 text-[20px] leading-tight font-black tracking-tight">
                      {result.name}
                    </h3>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                    <ForkKnife size={18} weight="fill" />
                  </span>
                </div>
                {result.description ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-foreground/68">
                    {result.description}
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-white/30 bg-background/60 p-3 backdrop-blur">
                  {[
                    ["Energy", `${totals.calories}`],
                    ["Protein", `${totals.protein}g`],
                    ["Carbs", `${totals.carbs}g`],
                    ["Fat", `${totals.fat}g`],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 text-center">
                      <p className="text-[14px] font-black tabular-nums">
                        {value}
                      </p>
                      <p className="mt-0.5 truncate text-[8px] font-bold tracking-wide text-muted-foreground uppercase">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-foreground/60">
                  <span className="rounded-full bg-background/65 px-2.5 py-1">
                    {result.prepMinutes} min
                  </span>
                  <span className="rounded-full bg-background/65 px-2.5 py-1">
                    {result.servings} serving{result.servings === 1 ? "" : "s"}
                  </span>
                  {result.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-background/65 px-2.5 py-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <details className="native-collapsible mt-3 border-t border-amber-800/10 pt-3 text-[11px]">
                  <summary className="cursor-pointer font-bold">
                    Ingredients & method
                  </summary>
                  <ul className="mt-2 space-y-1 text-foreground/68">
                    {result.ingredients.map((ingredient) => (
                      <li key={ingredient.name}>
                        {Math.round(ingredient.grams)}g {ingredient.name}
                      </li>
                    ))}
                  </ul>
                  {result.steps.length > 0 ? (
                    <ol className="mt-3 space-y-1.5 text-foreground/68">
                      {result.steps.map((step, stepIndex) => (
                        <li key={step}>
                          {stepIndex + 1}. {step}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </details>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(result.recipeId)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[11px] font-black text-background"
                  >
                    Edit recipe <ArrowRight size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogRecipe(result)}
                    className="inline-flex min-h-10 items-center rounded-full border border-border/70 px-4 text-[11px] font-black"
                  >
                    Log serving
                  </button>
                  {result.actionId ? (
                    <button
                      type="button"
                      onClick={() => onUndo(result.actionId!)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-[10px] font-bold text-muted-foreground"
                    >
                      <ClockCounterClockwise size={13} /> Undo
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }

        if (result.type === "create_workout_preset") {
          return (
            <div
              key={`${result.type}-${result.presetId}`}
              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                <Barbell size={18} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black">
                  {result.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {result.exerciseNames.join(" · ")}
                  {result.scheduledDays.length > 0
                    ? ` · ${result.scheduledDays.join(", ")}`
                    : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={onOpenWorkouts}
                className="text-[10px] font-black"
              >
                Open
              </button>
              {result.actionId ? (
                <button
                  type="button"
                  onClick={() => onUndo(result.actionId!)}
                  aria-label={`Undo ${result.name}`}
                >
                  <ClockCounterClockwise size={17} />
                </button>
              ) : (
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="text-[var(--status-success)]"
                />
              )}
            </div>
          )
        }

        const label =
          result.type === "log_nutrition"
            ? `${result.name} logged to ${result.meal}`
            : result.type === "update_routine"
              ? `${result.assignments.length} routine day${result.assignments.length === 1 ? "" : "s"} updated`
              : result.type === "delete_nutrition"
                ? `${result.name} removed`
                : result.label
        return (
          <div
            key={`${result.type}-${index}`}
            className="flex items-center gap-2 rounded-xl border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 px-3 py-2.5 text-[11px] font-bold"
          >
            <CheckCircle
              size={16}
              weight="fill"
              className="text-[var(--status-success)]"
            />
            {label}
            {result.type === "log_nutrition" ||
            result.type === "delete_nutrition" ? (
              <button
                type="button"
                onClick={onOpenNutrition}
                className="ml-auto min-h-8 px-2 text-[9px] font-black"
              >
                Open
              </button>
            ) : null}
            {result.actionId ? (
              <button
                type="button"
                onClick={() => onUndo(result.actionId!)}
                className="inline-flex min-h-8 items-center gap-1 px-2 text-[9px]"
              >
                <ClockCounterClockwise size={12} /> Undo
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function CoachArtifacts({ artifacts }: { artifacts?: CoachArtifact[] }) {
  if (!artifacts?.length) return null
  const labels: Record<CoachArtifact["type"], string> = {
    today_briefing: "Today",
    progress_explanation: "Progress explanation",
    simulation: "Scenario",
    validation: "Plan check",
    recovery_adaptation: "Recovery",
  }
  return (
    <div className="mt-4 space-y-3">
      {artifacts.map((artifact, index) => (
        <article
          key={`${artifact.type}-${index}`}
          className="rounded-2xl border border-border/60 bg-card/70 p-4"
        >
          <div className="flex items-center gap-2">
            {artifact.type === "recovery_adaptation" ? (
              <Heartbeat size={16} weight="fill" />
            ) : artifact.type === "validation" ? (
              <WarningCircle size={16} weight="fill" />
            ) : (
              <ChartLineUp size={16} weight="bold" />
            )}
            <p className="text-[9px] font-black tracking-[0.14em] text-muted-foreground uppercase">
              {labels[artifact.type]}
            </p>
            {artifact.status ? (
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[8px] font-bold">
                {artifact.status}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-[14px] font-black">{artifact.title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground/68">
            {artifact.detail}
          </p>
          {artifact.evidence.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[10px] text-muted-foreground">
              {artifact.evidence.map((evidence) => (
                <li key={evidence}>• {evidence}</li>
              ))}
            </ul>
          ) : null}
          {artifact.nextSteps.length > 0 ? (
            <p className="mt-3 text-[10px] font-bold">
              Next: {artifact.nextSteps.join(" · ")}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function CoachProposal({
  operations,
  applying,
  onApply,
  onDismiss,
}: {
  operations?: CoachOperation[]
  applying: boolean
  onApply: () => void
  onDismiss: () => void
}) {
  if (!operations?.length) return null
  const assumptions = [
    ...new Set(operations.flatMap((item) => item.assumptions)),
  ]
  const warnings = [...new Set(operations.flatMap((item) => item.warnings))]
  return (
    <section className="mt-4 rounded-2xl border border-foreground/15 bg-card p-4">
      <p className="text-[9px] font-black tracking-[0.14em] text-muted-foreground uppercase">
        Review changes
      </p>
      <div className="mt-3 space-y-2">
        {operations.map((operation, index) => (
          <div
            key={`${operation.type}-${index}`}
            className="flex gap-2 text-[12px] font-bold"
          >
            <CheckCircle
              size={15}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            {operation.summary}
          </div>
        ))}
      </div>
      {assumptions.length > 0 ? (
        <div className="mt-3 rounded-xl bg-muted/45 p-3">
          <p className="text-[9px] font-black uppercase">Assumptions</p>
          {assumptions.map((item) => (
            <p key={item} className="mt-1 text-[10px] text-muted-foreground">
              {item}
            </p>
          ))}
        </div>
      ) : null}
      {warnings.map((warning) => (
        <p
          key={warning}
          className="mt-2 flex gap-1.5 text-[10px] text-amber-700 dark:text-amber-300"
        >
          <WarningCircle size={13} className="shrink-0" /> {warning}
        </p>
      ))}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="min-h-10 rounded-full bg-foreground px-4 text-[11px] font-black text-background disabled:opacity-40"
        >
          {applying ? "Applying…" : "Apply changes"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={applying}
          className="min-h-10 px-3 text-[11px] font-bold text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </section>
  )
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
    <details className="native-collapsible group border-y border-border/45 text-[11px]">
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

function CoachSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[82svh] w-full overflow-y-auto rounded-t-[26px] bg-background p-5 pb-[max(1.5rem,var(--app-safe-bottom))] shadow-2xl lg:mx-auto lg:max-w-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-10 items-center justify-center rounded-full bg-muted"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export default function Coach() {
  const { context, loading } = useCoachContext()
  const navigate = useSmoothNavigate()
  const todayKey = currentDateKey(detectTimeZone())
  const presets = useQuery(api.logs.presets.list, {})
  const schedule = useQuery(api.users.schedules.get, {})
  const recipes = useQuery(api.logs.recipes.list, {})
  const recentFoodDays = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 14,
  })
  const todayWorkouts = useQuery(api.logs.workouts.getLog, { date: todayKey })
  const recentWorkouts = useQuery(api.logs.workouts.getHistory)
  const memories = useQuery(api.ai.coachState.listMemories, { limit: 40 })
  const checkIns = useQuery(api.ai.coachState.listCheckIns, { limit: 14 })
  const actionHistory = useQuery(api.ai.coachState.listActionHistory, {
    limit: 30,
  })
  const weeklyPlan = useQuery(api.ai.coachState.getWeeklyPlan, {
    weekStart: weekStartKey(todayKey),
  })
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [applyingMessageIndex, setApplyingMessageIndex] = useState<
    number | null
  >(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const [showMemory, setShowMemory] = useState(false)
  const [newMemoryCategory, setNewMemoryCategory] = useState("preference")
  const [newMemoryValue, setNewMemoryValue] = useState("")
  const [savingMemory, setSavingMemory] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>(
    loadCoachConversation
  )
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<CoachAttachment | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRequestRef = useRef(0)
  const attachmentRef = useRef<CoachAttachment | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const generateChat = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const saveRecipe = useMutation(api.logs.recipes.save)
  const addFoodEntry = useMutation(api.logs.foodLogs.addEntry)
  const updateFoodEntry = useMutation(api.logs.foodLogs.updateEntry)
  const removeFoodEntry = useMutation(api.logs.foodLogs.removeEntry)
  const createPreset = useMutation(api.logs.presets.create)
  const updatePreset = useMutation(api.logs.presets.update)
  const setSchedule = useMutation(api.users.schedules.set)
  const recordAction = useMutation(api.ai.coachState.recordAction)
  const undoCoachAction = useMutation(api.ai.coachState.undoAction)
  const setMemory = useMutation(api.ai.coachState.setMemory)
  const removeMemory = useMutation(api.ai.coachState.removeMemory)
  const generateCoachUploadUrl = useMutation(
    api.ai.coachState.generateUploadUrl
  )
  const registerCoachUpload = useMutation(api.ai.coachState.registerUpload)
  const removeCoachUpload = useMutation(api.ai.coachState.removeUpload)
  const saveCheckIn = useMutation(api.ai.coachState.saveCheckIn)
  const saveWeeklyPlan = useMutation(api.ai.coachState.saveWeeklyPlan)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const dictation = useCoachDictation({
    value: input,
    onChange: updateComposer,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [busy, messages.length])

  useEffect(() => {
    safeLocalStorageSet(COACH_CONVERSATION_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    attachmentRef.current = attachment
  }, [attachment])

  useEffect(
    () => () => {
      const current = attachmentRef.current
      if (current) URL.revokeObjectURL(current.previewUrl)
    },
    []
  )

  const coachWorkspace = useMemo(() => {
    const presetRows = (presets ?? []).map((preset) => ({
      id: String(preset._id),
      name: preset.name,
      updatedAt: preset.updatedAt,
      snapshot: {
        items: preset.items,
        exerciseData: preset.exerciseData,
        ...(preset.focus ? { focus: preset.focus } : {}),
        ...(preset.duration ? { duration: preset.duration } : {}),
        ...(preset.steps ? { steps: preset.steps } : {}),
      },
    }))
    const byId = new Map(presetRows.map((preset) => [preset.id, preset.name]))
    const routines = normalizeScheduleRoutines(schedule?.routine)
    return {
      today: todayKey,
      presets: presetRows,
      recipes: (recipes ?? []).slice(0, 30).map((recipe) => ({
        id: String(recipe._id),
        name: recipe.name,
        updatedAt: recipe.updatedAt,
        ...(recipe.servings ? { servings: recipe.servings } : {}),
        ingredients: recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          grams: ingredient.grams,
          caloriesPer100: ingredient.caloriesPer100,
          proteinPer100: ingredient.proteinPer100,
          carbsPer100: ingredient.carbsPer100,
          fatPer100: ingredient.fatPer100,
        })),
      })),
      foodEntries: (recentFoodDays ?? []).flatMap((day) =>
        (day.entries as FoodLogEntry[]).slice(-12).map((entry) => ({
          id: entry.id,
          date: day.date,
          name: entry.name,
          meal: entry.meal,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
        }))
      ),
      memories: (memories ?? []).map((memory) => ({
        key: memory.key,
        category: memory.category,
        value: memory.value,
      })),
      checkIns: (checkIns ?? []).map((checkIn) => ({
        date: checkIn.date,
        energy: checkIn.energy,
        soreness: checkIn.soreness,
        sleepQuality: checkIn.sleepQuality,
        mood: checkIn.mood,
      })),
      recentWorkouts: (recentWorkouts ?? []).slice(0, 30).map((workout) => ({
        id: String(workout._id),
        date: workout.date,
        durationMinutes: Math.round(workout.durationSeconds / 60),
        exercises: workout.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          completedSets: exercise.sets.filter((set) => set.completed).length,
          sets: exercise.sets,
        })),
      })),
      recentActions: (actionHistory ?? []).map((event) => ({
        id: String(event._id),
        summary: event.summary,
        status: event.status,
      })),
      routine: DAYS.map((day) => ({
        day,
        presetId: routines.primary[day],
        presetName: routines.primary[day]
          ? (byId.get(routines.primary[day] as string) ?? null)
          : null,
      })),
    }
  }, [
    checkIns,
    actionHistory,
    memories,
    presets,
    recentFoodDays,
    recentWorkouts,
    recipes,
    schedule,
    todayKey,
  ])

  async function executeOperations(operations: CoachOperation[]) {
    const validationErrors = validateCoachOperations(operations)
    if (validationErrors.length > 0) throw new Error(validationErrors[0])
    const results: CoachOperationResult[] = []
    const knownPresets = new Map(
      (presets ?? []).map((preset) => [
        preset.name.trim().toLowerCase(),
        String(preset._id),
      ])
    )
    const originalRoutines = normalizeScheduleRoutines(schedule?.routine)
    let routine = originalRoutines.primary
    let routineChanged = false
    const presetOrder = (schedule?.presetOrder ?? []).map(String)

    const orderedOperations = [...operations].sort((left, right) => {
      const priority = (operation: CoachOperation) =>
        operation.type === "create_workout_preset"
          ? 0
          : operation.type === "update_routine"
            ? 2
            : 1
      return priority(left) - priority(right)
    })

    for (const operation of orderedOperations) {
      if (operation.type === "save_recipe") {
        const existing = operation.recipeId
          ? (recipes ?? []).find(
              (recipe) => String(recipe._id) === operation.recipeId
            )
          : null
        if (operation.recipeId && !existing) {
          throw new Error("That recipe no longer exists.")
        }
        const ingredients = operation.ingredients.map((ingredient) => ({
          id: ingredient.id ?? createClientId(),
          name: ingredient.name,
          grams: ingredient.grams,
          displayAmount: ingredient.grams,
          displayUnit: "g",
          caloriesPer100: ingredient.caloriesPer100,
          proteinPer100: ingredient.proteinPer100,
          carbsPer100: ingredient.carbsPer100,
          fatPer100: ingredient.fatPer100,
        }))
        const recipeId = await saveRecipe({
          ...(operation.recipeId
            ? { id: operation.recipeId as Id<"recipes"> }
            : {}),
          name: operation.name,
          description: operation.description,
          servings: operation.servings,
          prepMinutes: operation.prepMinutes,
          tags: operation.tags,
          steps: operation.steps,
          ingredients,
        })
        const actionId = await recordAction({
          kind: existing ? "edit_recipe" : "create_recipe",
          summary: operation.summary,
          targetType: "recipe",
          targetId: String(recipeId),
          undoPayload: existing
            ? {
                kind: "restore_recipe",
                id: String(existing._id),
                body: {
                  name: existing.name,
                  ...(existing.description
                    ? { description: existing.description }
                    : {}),
                  ...(existing.servings ? { servings: existing.servings } : {}),
                  ...(existing.prepMinutes
                    ? { prepMinutes: existing.prepMinutes }
                    : {}),
                  ...(existing.tags ? { tags: existing.tags } : {}),
                  ...(existing.steps ? { steps: existing.steps } : {}),
                  ingredients: existing.ingredients,
                },
              }
            : { kind: "delete_recipe", id: String(recipeId) },
        })
        results.push({
          ...operation,
          recipeId: String(recipeId),
          actionId: String(actionId),
        })
        if (operation.logMeal) {
          const totals = recipeTotals(operation.ingredients, operation.servings)
          const servings = operation.servingsToLog ?? 1
          const entryId = createClientId()
          await addFoodEntry({
            date: todayKey,
            entry: {
              id: entryId,
              name: operation.name,
              meal: operation.logMeal,
              loggedAt: new Date().toISOString(),
              calories: Math.round(totals.calories * servings),
              protein: Math.round(totals.protein * servings),
              carbs: Math.round(totals.carbs * servings),
              fat: Math.round(totals.fat * servings),
              recipeId: String(recipeId),
            },
          })
          const logActionId = await recordAction({
            kind: "log_recipe",
            summary: `Logged ${servings} serving${servings === 1 ? "" : "s"} of ${operation.name}`,
            targetType: "nutrition",
            targetId: entryId,
            undoPayload: {
              kind: "remove_food_entry",
              date: todayKey,
              entryId,
            },
          })
          results.push({
            type: "log_nutrition",
            name: operation.name,
            meal: operation.logMeal,
            calories: Math.round(totals.calories * servings),
            protein: Math.round(totals.protein * servings),
            carbs: Math.round(totals.carbs * servings),
            fat: Math.round(totals.fat * servings),
            entryId,
            actionId: String(logActionId),
          })
        }
        continue
      }

      if (operation.type === "log_nutrition") {
        const date = operation.date ?? todayKey
        const existing = operation.entryId
          ? (recentFoodDays ?? [])
              .find((day) => day.date === date)
              ?.entries.find(
                (entry: FoodLogEntry) => entry.id === operation.entryId
              )
          : null
        if (operation.entryId && !existing) {
          throw new Error("That nutrition entry no longer exists.")
        }
        const entryId = operation.entryId ?? createClientId()
        const entry = {
          id: entryId,
          name: operation.name,
          meal: operation.meal,
          loggedAt: new Date().toISOString(),
          calories: operation.calories,
          protein: operation.protein,
          carbs: operation.carbs,
          fat: operation.fat,
        }
        if (existing) {
          await updateFoodEntry({ date, entry })
        } else {
          await addFoodEntry({ date, entry })
        }
        const actionId = await recordAction({
          kind: existing ? "correct_nutrition" : "log_nutrition",
          summary: operation.summary,
          targetType: "nutrition",
          targetId: entryId,
          undoPayload: existing
            ? { kind: "restore_food_entry", date, entry: existing }
            : { kind: "remove_food_entry", date, entryId },
        })
        results.push({
          ...operation,
          entryId,
          actionId: String(actionId),
        })
        continue
      }

      if (operation.type === "delete_nutrition") {
        const existing = (recentFoodDays ?? [])
          .find((day) => day.date === operation.date)
          ?.entries.find(
            (entry: FoodLogEntry) => entry.id === operation.entryId
          )
        if (!existing) throw new Error("That nutrition entry no longer exists.")
        await removeFoodEntry({
          date: operation.date,
          entryId: operation.entryId,
        })
        const actionId = await recordAction({
          kind: "delete_nutrition",
          summary: operation.summary,
          targetType: "nutrition",
          targetId: operation.entryId,
          undoPayload: {
            kind: "restore_food_entry",
            date: operation.date,
            entry: existing,
          },
        })
        results.push({
          type: operation.type,
          name: operation.name,
          actionId: String(actionId),
        })
        continue
      }

      if (operation.type === "create_workout_preset") {
        const resolved = await Promise.all(
          operation.exercises.map(async (exerciseDraft) => {
            const candidates = await searchExercises({
              query: exerciseDraft.name,
              limit: 6,
            })
            return {
              draft: exerciseDraft,
              exercise: bestExerciseMatch(exerciseDraft.name, candidates),
            }
          })
        )
        const matched = resolved.filter(
          (item): item is typeof item & { exercise: Exercise } =>
            Boolean(item.exercise)
        )
        if (matched.length !== operation.exercises.length) {
          throw new Error(
            "Coach couldn't match every exercise to the catalog. Revise the plan before saving."
          )
        }
        const seen = new Set<string>()
        const unique = matched.filter(({ exercise }) => {
          if (seen.has(exercise.id)) return false
          seen.add(exercise.id)
          return true
        })
        const items = unique.map(({ exercise }) => ({
          kind: "solo" as const,
          exerciseId: exercise.id,
        }))
        const exerciseData = Object.fromEntries(
          unique.map(({ draft, exercise }) => [
            exercise.id,
            {
              sets:
                exercise.category === "cardio"
                  ? []
                  : draft.sets.map((set) => ({
                      ...set,
                      id: createClientId(),
                    })),
              trackRpe: false,
              trackUnilateral: false,
              barWeight: "",
              barType: "olympic",
            },
          ])
        )
        const totalSets = unique.reduce(
          (sum, item) => sum + item.draft.sets.length,
          0
        )
        const presetBody = {
          name: operation.name,
          items,
          exerciseData,
          focus: operation.focus,
          duration: `${Math.max(15, 8 + totalSets * 3)} min`,
          steps: unique.map(({ exercise }) => exercise.name),
        }
        const existing = operation.presetId
          ? (presets ?? []).find(
              (preset) => String(preset._id) === operation.presetId
            )
          : null
        if (operation.presetId && !existing) {
          throw new Error("That workout preset no longer exists.")
        }
        let presetId: string
        if (existing) {
          await updatePreset({
            id: existing._id,
            ...presetBody,
          })
          presetId = String(existing._id)
        } else {
          const created = await createPreset(presetBody)
          presetId = String(created.id)
        }
        knownPresets.set(operation.name.trim().toLowerCase(), presetId)
        if (!presetOrder.includes(presetId)) presetOrder.push(presetId)
        for (const day of operation.scheduleDays) {
          routine = { ...routine, [day]: presetId }
          routineChanged = true
        }
        const actionId = await recordAction({
          kind: existing
            ? (operation.reason ?? "edit_workout_preset")
            : "create_workout_preset",
          summary: operation.summary,
          targetType: "workout_preset",
          targetId: presetId,
          undoPayload: existing
            ? {
                kind: "restore_preset",
                id: presetId,
                body: {
                  name: existing.name,
                  items: existing.items,
                  exerciseData: existing.exerciseData,
                  ...(existing.focus ? { focus: existing.focus } : {}),
                  ...(existing.duration ? { duration: existing.duration } : {}),
                  ...(existing.steps ? { steps: existing.steps } : {}),
                },
              }
            : { kind: "delete_preset", id: presetId },
        })
        results.push({
          type: operation.type,
          presetId,
          actionId: String(actionId),
          name: operation.name,
          exerciseNames: unique.map(({ exercise }) => exercise.name),
          scheduledDays: operation.scheduleDays,
        })
        continue
      }

      if (operation.type === "remember") {
        const saved = await setMemory({
          key: operation.key,
          category: operation.category,
          value: operation.value,
          source: "coach",
        })
        results.push({
          type: operation.type,
          label: `Remembered: ${operation.value}`,
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "forget_memory") {
        const memory = (memories ?? []).find(
          (item) => item.key.toLowerCase() === operation.key.toLowerCase()
        )
        if (!memory) throw new Error("That Coach memory no longer exists.")
        const removed = await removeMemory({ id: memory._id })
        results.push({
          type: operation.type,
          label: `Forgot: ${operation.value}`,
          actionId: String(removed.actionId),
        })
        continue
      }

      if (operation.type === "save_check_in") {
        const saved = await saveCheckIn({
          date: operation.date,
          kind:
            operation.date === todayKey && (todayWorkouts ?? []).length > 0
              ? "post_workout"
              : "daily",
          energy: operation.energy,
          soreness: operation.soreness,
          sleepQuality: operation.sleepQuality,
          mood: operation.mood,
          ...(operation.note ? { note: operation.note } : {}),
        })
        results.push({
          type: operation.type,
          label: "Recovery check-in saved",
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "save_weekly_plan") {
        const saved = await saveWeeklyPlan({
          weekStart: operation.weekStart,
          title: operation.title,
          days: operation.days,
          assumptions: operation.planAssumptions,
        })
        results.push({
          type: operation.type,
          label: operation.title,
          actionId: String(saved.actionId),
        })
        continue
      }

      if (operation.type === "undo_action") {
        await undoCoachAction({
          id: operation.actionId as Id<"coachActionEvents">,
        })
        results.push({
          type: operation.type,
          label: `Undid: ${operation.actionSummary}`,
        })
        continue
      }

      const previousSchedule = {
        routine: schedule?.routine ?? {
          primary: originalRoutines.primary,
          secondary: originalRoutines.secondary,
        },
        presetOrder: schedule?.presetOrder ?? [],
      }
      const applied: Array<{ day: Day; presetName: string | null }> = []
      for (const assignment of operation.assignments) {
        const presetId = assignment.presetName
          ? knownPresets.get(assignment.presetName.trim().toLowerCase())
          : null
        if (assignment.presetName && !presetId) {
          throw new Error(
            `No preset named “${assignment.presetName}” exists yet.`
          )
        }
        routine = { ...routine, [assignment.day]: presetId ?? null }
        routineChanged = true
        applied.push(assignment)
      }
      results.push({ type: operation.type, assignments: applied })
      if (applied.length > 0) {
        ;(
          results.at(-1) as Extract<
            CoachOperationResult,
            { type: "update_routine" }
          >
        ).actionId = String(
          await recordAction({
            kind: "update_routine",
            summary: operation.summary,
            targetType: "routine",
            undoPayload: { kind: "restore_schedule", body: previousSchedule },
          })
        )
      }
    }

    if (routineChanged) {
      await setSchedule({
        routine: {
          primary: routine,
          secondary: originalRoutines.secondary,
        },
        presetOrder,
      })
    }
    return results
  }

  async function applyPendingOperations(messageIndex: number) {
    const operations = messages[messageIndex]?.pendingOperations
    if (!operations?.length || applyingMessageIndex !== null) return
    setApplyingMessageIndex(messageIndex)
    try {
      const operationResults = await executeOperations(operations)
      setMessages((current) =>
        current.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                pendingOperations: undefined,
                operationResults,
              }
            : message
        )
      )
      hapticTap()
      toast.success("Coach applied your changes")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not apply Coach changes"
      )
    } finally {
      setApplyingMessageIndex(null)
    }
  }

  function dismissPendingOperations(messageIndex: number) {
    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? { ...message, pendingOperations: undefined }
          : message
      )
    )
  }

  async function undoAction(id: string) {
    try {
      await undoCoachAction({ id: id as Id<"coachActionEvents"> })
      hapticTap()
      toast.success("Coach change undone")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not undo change"
      )
    }
  }

  async function logRecipeResult(
    result: Extract<CoachOperationResult, { type: "save_recipe" }>
  ) {
    const totals = recipeTotals(result.ingredients, result.servings)
    const entryId = createClientId()
    try {
      await addFoodEntry({
        date: todayKey,
        entry: {
          id: entryId,
          name: result.name,
          meal: "Meal",
          loggedAt: new Date().toISOString(),
          calories: totals.calories,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          recipeId: result.recipeId,
        },
      })
      await recordAction({
        kind: "log_recipe",
        summary: `Logged one serving of ${result.name}`,
        targetType: "nutrition",
        targetId: entryId,
        undoPayload: {
          kind: "remove_food_entry",
          date: todayKey,
          entryId,
        },
      })
      toast.success(`${result.name} logged`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not log recipe"
      )
    }
  }

  async function addManualMemory() {
    const value = newMemoryValue.trim()
    if (!value || savingMemory) return
    setSavingMemory(true)
    try {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 38)
      await setMemory({
        key: `manual-${newMemoryCategory}-${slug || createClientId().slice(-8)}`,
        category: newMemoryCategory,
        value,
        source: "manual",
      })
      setNewMemoryValue("")
      toast.success("Added to Coach memory")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add memory"
      )
    } finally {
      setSavingMemory(false)
    }
  }

  function updateComposer(value: string, element?: HTMLTextAreaElement) {
    const nextValue = value.slice(0, 1200)
    setInput(nextValue)
    const textarea = element ?? composerRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
  }

  function setActiveAttachment(next: CoachAttachment | null) {
    attachmentRef.current = next
    setAttachment(next)
  }

  function clearAttachment(removeRemote = true) {
    uploadRequestRef.current += 1
    const current = attachmentRef.current
    if (!current) return
    setActiveAttachment(null)
    URL.revokeObjectURL(current.previewUrl)
    if (removeRemote && current.id) {
      void removeCoachUpload({ id: current.id }).catch(() => undefined)
    }
  }

  async function attachImage(file: File) {
    clearAttachment()
    const requestId = ++uploadRequestRef.current
    const previewUrl = URL.createObjectURL(file)
    setActiveAttachment({
      fileName: file.name || "Coach image",
      previewUrl,
      status: "preparing",
    })
    try {
      const prepared = await prepareCoachImage(file)
      if (requestId !== uploadRequestRef.current) return
      setActiveAttachment({
        fileName: prepared.name,
        previewUrl,
        status: "uploading",
      })
      const uploadUrl = await generateCoachUploadUrl({})
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": prepared.type },
        body: prepared,
      })
      if (!uploadResponse.ok) throw new Error("Image upload failed. Try again.")
      const payload = (await uploadResponse.json()) as { storageId?: string }
      if (!payload.storageId) throw new Error("Image upload was incomplete.")
      const registered = await registerCoachUpload({
        storageId: payload.storageId as Id<"_storage">,
        mimeType: prepared.type,
        fileName: prepared.name,
        size: prepared.size,
      })
      if (requestId !== uploadRequestRef.current) {
        await removeCoachUpload({ id: registered.id }).catch(() => undefined)
        return
      }
      setActiveAttachment({
        id: registered.id,
        fileName: prepared.name,
        previewUrl,
        status: "ready",
      })
      hapticTap()
    } catch (error) {
      if (requestId !== uploadRequestRef.current) return
      const message =
        error instanceof Error ? error.message : "Could not attach that image."
      setActiveAttachment({
        fileName: file.name || "Coach image",
        previewUrl,
        status: "error",
        error: message,
      })
      toast.error(message)
    }
  }

  async function submit(promptOverride?: string) {
    const dictatedInput =
      dictation.status === "listening" ? await dictation.stop() : input
    const selectedAttachment = attachmentRef.current
    const rawPrompt = (promptOverride ?? dictatedInput).trim().slice(0, 1200)
    if (!rawPrompt && !selectedAttachment) return
    if (selectedAttachment && selectedAttachment.status !== "ready") {
      toast.error(
        selectedAttachment.status === "error"
          ? selectedAttachment.error
          : "Wait for the image to finish uploading."
      )
      return
    }
    const prompt =
      rawPrompt ||
      "Analyze this image in the context of my goals and recent data."
    if (busy || loading) return
    if (!requireAiAccess()) return

    hapticMedium()
    setLastFailedPrompt(null)
    const visiblePrompt = selectedAttachment
      ? `${rawPrompt || "Take a look at this image."}\n\n📷 ${selectedAttachment.fileName}`
      : prompt
    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content: visiblePrompt },
    ]
    setMessages(nextMessages)
    updateComposer("")
    setBusy(true)

    try {
      const result = await generateChat({
        context,
        message: prompt,
        ...(selectedAttachment?.id
          ? { attachmentId: selectedAttachment.id }
          : {}),
        workspace: coachWorkspace,
        history: messages
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content })),
      })
      const response = result as {
        reply: string
        uiBlocks?: unknown
        operations?: unknown
        artifacts?: unknown
      }
      const operations = normalizeCoachOperations(response.operations)
      if (selectedAttachment) clearAttachment()
      const needsConfirmation = operations.some(
        (operation) =>
          operation.confirmation === "confirm" || operation.warnings.length > 0
      )
      const operationResults =
        operations.length > 0 && !needsConfirmation
          ? await executeOperations(operations)
          : []
      hapticTap()
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: response.reply,
          uiBlocks: normalizeCoachUiBlocks(response.uiBlocks),
          operationResults,
          pendingOperations: needsConfirmation ? operations : undefined,
          artifacts: normalizeCoachArtifacts(response.artifacts),
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
    dictation.cancel()
    clearAttachment()
    setMessages([])
    updateComposer("")
    setLastFailedPrompt(null)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const todayDay = DAYS[(new Date(`${todayKey}T12:00:00Z`).getUTCDay() + 6) % 7]
  const todayRoutine = normalizeScheduleRoutines(schedule?.routine).primary
  const scheduledPreset = (presets ?? []).find(
    (preset) => String(preset._id) === todayRoutine[todayDay]
  )
  const latestCheckIn = checkIns?.[0]
  const recoveryStatus = latestCheckIn
    ? latestCheckIn.energy <= 2 ||
      latestCheckIn.sleepQuality <= 2 ||
      latestCheckIn.soreness >= 5
      ? "Recovery deserves a lighter approach today."
      : "Your latest check-in supports the planned workload."
    : "Add a quick check-in to make recovery advice more specific."

  return (
    <main className="desktop-canvas h-svh overflow-hidden bg-background lg:pl-64">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-[var(--app-page-x)] md:px-8">
        <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border/45 bg-background/95 backdrop-blur-xl">
          <h1 className="text-[18px] leading-tight font-bold tracking-tight">
            Coach
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowMemory(true)}
              aria-label="Coach memory"
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <Brain size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              aria-label="Coach action history"
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <ClockCounterClockwise size={16} weight="bold" />
            </button>
            {messages.length > 0 ? (
              <AppTooltip
                id={APP_TOOLTIP_IDS.coachNewChat}
                content="Clear this conversation and return to Coach’s skill shortcuts."
                side="bottom"
                enabled
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
            ) : null}
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto py-5">
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
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/55 bg-card/60 p-3">
                  <p className="text-[8px] font-black tracking-wider text-muted-foreground uppercase">
                    Workout
                  </p>
                  <p className="mt-1 text-[12px] font-black">
                    {scheduledPreset?.name ?? "Recovery / open day"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/55 bg-card/60 p-3">
                  <p className="text-[8px] font-black tracking-wider text-muted-foreground uppercase">
                    Recovery
                  </p>
                  <p className="mt-1 text-[10px] leading-snug font-bold">
                    {recoveryStatus}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/55 bg-card/60 p-3">
                  <p className="text-[8px] font-black tracking-wider text-muted-foreground uppercase">
                    Week plan
                  </p>
                  <p className="mt-1 text-[12px] font-black">
                    {weeklyPlan?.title ?? "Not planned yet"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate("/progress?checkIn=1", { motion: "switch" })
                }
                className="mt-5 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/55 p-4 text-left active:opacity-60"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
                  <Heartbeat size={17} weight="fill" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black">
                    Today’s check-in
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Add your body measurement in Progress
                  </span>
                </span>
                <ArrowRight size={16} weight="bold" />
              </button>
              <div className="mt-6">
                <CoachContextPanel context={context} />
              </div>

              <AppTooltip
                id={APP_TOOLTIP_IDS.coachStarters}
                content="Choose a focused coaching task."
                targetClassName="mt-8 block w-full"
                side="top"
                enabled
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
                          <>
                            <CoachUiBlocks
                              blocks={message.uiBlocks}
                              onAction={handleUiAction}
                            />
                            <CoachArtifacts artifacts={message.artifacts} />
                            <CoachProposal
                              operations={message.pendingOperations}
                              applying={applyingMessageIndex === index}
                              onApply={() => void applyPendingOperations(index)}
                              onDismiss={() => dismissPendingOperations(index)}
                            />
                            <CoachOperationResults
                              results={message.operationResults}
                              onOpenRecipe={(id) =>
                                navigate(`/foods/recipe/${id}`, {
                                  motion: "forward",
                                })
                              }
                              onOpenWorkouts={() =>
                                navigate("/workouts", { motion: "switch" })
                              }
                              onOpenNutrition={() =>
                                navigate("/nutrition", { motion: "switch" })
                              }
                              onUndo={(id) => void undoAction(id)}
                              onLogRecipe={(result) =>
                                void logRecipeResult(result)
                              }
                            />
                          </>
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
          className="z-20 mx-auto w-full max-w-3xl shrink-0 border-t border-border/45 bg-background/95 pt-3 pb-[calc(var(--app-safe-bottom)+5.75rem)] backdrop-blur-xl lg:pb-4"
        >
          <AppTooltip
            id={APP_TOOLTIP_IDS.coachMessage}
            content="Ask Coach about today’s workout, food choices, recovery, or what changed in your progress."
            targetClassName="block w-full"
            side="top"
            enabled
          >
            <div className="rounded-xl border border-border/60 bg-card p-2 focus-within:border-foreground/25">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ""
                  if (file) void attachImage(file)
                }}
              />
              {attachment ? (
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-muted/55 p-2">
                  <img
                    src={attachment.previewUrl}
                    alt="Selected Coach attachment"
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-black">
                      {attachment.fileName}
                    </p>
                    <p
                      role="status"
                      className={cn(
                        "mt-0.5 text-[9px] font-medium",
                        attachment.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {attachment.status === "preparing"
                        ? "Preparing image…"
                        : attachment.status === "uploading"
                          ? "Uploading securely…"
                          : attachment.status === "ready"
                            ? "Ready for Coach"
                            : attachment.error}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => clearAttachment()}
                    aria-label="Remove attached image"
                    className="motion-tactile flex size-9 shrink-0 items-center justify-center rounded-full bg-background"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || busy}
                  aria-label="Attach a picture"
                  className="motion-tactile flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-35"
                >
                  <ImageSquare size={18} weight="bold" />
                </button>
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
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    if (dictation.status === "listening") void dictation.stop()
                    else void dictation.start()
                  }}
                  disabled={loading || busy || !dictation.available}
                  aria-label={
                    dictation.status === "listening"
                      ? "Stop voice input"
                      : "Start voice input"
                  }
                  aria-pressed={dictation.status === "listening"}
                  title={
                    dictation.available
                      ? "Voice input"
                      : "Voice input is unavailable on this device"
                  }
                  className={cn(
                    "motion-tactile flex size-11 shrink-0 items-center justify-center rounded-lg disabled:opacity-35",
                    dictation.status === "listening"
                      ? "animate-pulse bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {dictation.status === "listening" ? (
                    <StopCircle size={18} weight="fill" />
                  ) : (
                    <Microphone size={18} weight="bold" />
                  )}
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    busy ||
                    (input.trim().length === 0 &&
                      attachment?.status !== "ready")
                  }
                  aria-label="Send message"
                  className="motion-tactile flex size-11 shrink-0 items-center justify-center rounded-lg bg-foreground text-background disabled:bg-muted-foreground/25"
                >
                  <PaperPlaneTilt size={17} weight="fill" />
                </button>
              </div>
              {dictation.status === "listening" ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="px-2.5 pt-1 text-[9px] font-bold text-foreground/65"
                >
                  Listening{dictation.interim ? ` · ${dictation.interim}` : "…"}
                </p>
              ) : dictation.error ? (
                <p
                  role="status"
                  className="px-2.5 pt-1 text-[9px] font-medium text-destructive"
                >
                  {dictation.error}
                </p>
              ) : null}
              <div className="flex items-center justify-end px-2.5 pb-1">
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
      <CoachSheet
        title="Coach activity"
        open={showHistory}
        onClose={() => setShowHistory(false)}
      >
        <input
          value={historySearch}
          onChange={(event) => setHistorySearch(event.target.value)}
          placeholder="Search Coach changes"
          className="mb-3 min-h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-[12px] outline-none"
        />
        {(actionHistory ?? []).length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            Coach changes will appear here with an undo option.
          </p>
        ) : (
          <div className="divide-y divide-border/45">
            {(actionHistory ?? [])
              .filter((event) =>
                event.summary
                  .toLowerCase()
                  .includes(historySearch.trim().toLowerCase())
              )
              .map((event) => (
                <div key={event._id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      event.status === "undone"
                        ? "bg-muted text-muted-foreground"
                        : "bg-[var(--status-success)]/10 text-[var(--status-success)]"
                    )}
                  >
                    {event.status === "undone" ? (
                      <ClockCounterClockwise size={14} />
                    ) : (
                      <CheckCircle size={14} weight="fill" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold">{event.summary}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {event.status === "undone" ? "Undone" : "Applied"} ·{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {event.status === "applied" ? (
                    <button
                      type="button"
                      onClick={() => void undoAction(String(event._id))}
                      className="min-h-9 px-2 text-[10px] font-black"
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </CoachSheet>
      <CoachSheet
        title="Coach memory"
        open={showMemory}
        onClose={() => setShowMemory(false)}
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Coach uses these durable preferences when creating meals, workouts,
          and weekly plans. Say “remember…” in chat to add one.
        </p>
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-3">
          <div className="flex gap-2">
            <select
              value={newMemoryCategory}
              onChange={(event) => setNewMemoryCategory(event.target.value)}
              aria-label="Memory category"
              className="min-h-11 rounded-xl bg-muted px-2 text-[10px] font-bold"
            >
              <option value="preference">Preference</option>
              <option value="food">Food</option>
              <option value="equipment">Equipment</option>
              <option value="schedule">Schedule</option>
              <option value="constraint">Constraint</option>
              <option value="response_style">Response style</option>
            </select>
            <input
              value={newMemoryValue}
              onChange={(event) => setNewMemoryValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addManualMemory()
              }}
              maxLength={240}
              placeholder="What should Coach remember?"
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-muted px-3 text-[11px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void addManualMemory()}
            disabled={!newMemoryValue.trim() || savingMemory}
            className="mt-2 min-h-10 w-full rounded-full bg-foreground text-[10px] font-black text-background disabled:opacity-40"
          >
            {savingMemory ? "Adding…" : "Add memory"}
          </button>
        </div>
        {(memories ?? []).length === 0 ? (
          <div className="mt-5 rounded-2xl bg-muted/45 p-4 text-[11px] text-muted-foreground">
            Try: “Remember that I only have dumbbells,” “Remember I dislike
            mushrooms,” or “Keep answers concise.”
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border/45">
            {(memories ?? []).map((memory) => (
              <div key={memory._id} className="flex items-center gap-3 py-3">
                <Brain size={15} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black capitalize">
                    {memory.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground/70">
                    {memory.value}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void removeMemory({ id: memory._id }).then(() =>
                      toast.success("Coach forgot that preference")
                    )
                  }
                  aria-label={`Forget ${memory.value}`}
                  className="min-h-9 px-2 text-[9px] font-bold text-muted-foreground"
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </CoachSheet>
      {aiAccessModal}
    </main>
  )
}
