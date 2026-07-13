import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowRight,
  Barbell,
  ArrowClockwise,
  Brain,
  Carrot,
  ChartLineUp,
  ChatCircleDots,
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  CookingPot,
  ChefHat,
  Heartbeat,
  ImageSquare,
  ForkKnife,
  LightbulbFilament,
  Microphone,
  PaperPlaneTilt,
  Plus,
  PushPin,
  SneakerMove,
  StopCircle,
  Timer,
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

type CoachGoalTaskDraft = {
  title: string
  detail?: string
  completed?: boolean
}

type CoachWorkoutPresetDraft = {
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

type CoachOperation = CoachOperationMeta &
  (
    | {
        type: "save_recipe"
        recipeId?: string
        name: string
        description: string
        servings: number
        prepMinutes: number
        cookMinutes: number
        category: string
        notes: string
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
    | ({ type: "create_workout_preset" } & CoachWorkoutPresetDraft)
    | {
        type: "create_workout_plan"
        presets: CoachWorkoutPresetDraft[]
        assignments: Array<{ day: Day; presetName: string | null }>
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
        type: "save_goal"
        goalId?: string
        title: string
        detail: string
        startDate: string
        durationDays: number
        pinned: boolean
        tasks: CoachGoalTaskDraft[]
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
  | ({ type: "save_goal"; goalId: string; actionId?: string } & Extract<
      CoachOperation,
      { type: "save_goal" }
    >)
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
      type: "goal"
      title: string
      detail: string
      durationDays: number
      tasks: CoachGoalTaskDraft[]
    }
  | {
      type: "action_row"
      title: string
      actions: Array<{ label: string; action: CoachUiAction }>
    }

const COACH_CONVERSATION_KEY = "onerep:coach-conversation:v1"
const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
type CoachMode = "chat" | "chef" | "personal_trainer"

const COACH_MODES = [
  {
    id: "chat",
    label: "Chat",
    heading: "What do you want to work on?",
    placeholder: "Ask Coach anything…",
    icon: PaperPlaneTilt,
    centerArt: ChatCircleDots,
    leftArt: LightbulbFilament,
    rightArt: ChartLineUp,
    tabClass: "border-violet-400/35",
    artClass: "text-violet-500/[0.10]",
    centerArtClass: "bg-violet-500/[0.05] text-violet-600/55",
    messageClass: "border-violet-500/16",
    composerClass: "focus-within:border-violet-500/25",
    cardClass: "border-violet-200/15 bg-indigo-950/55",
    cardIconClass: "border-violet-200/20 text-violet-100/65",
  },
  {
    id: "chef",
    label: "Chef Coach",
    heading: "What are we cooking?",
    placeholder: "Ask about meals, recipes, or nutrition…",
    icon: ForkKnife,
    centerArt: ChefHat,
    leftArt: Carrot,
    rightArt: CookingPot,
    tabClass: "border-amber-400/35",
    artClass: "text-amber-600/[0.10]",
    centerArtClass: "bg-amber-500/[0.05] text-amber-700/55",
    messageClass: "border-amber-500/16",
    composerClass: "focus-within:border-amber-500/25",
    cardClass: "border-amber-200/20 bg-[#1d0d08]/60",
    cardIconClass: "border-amber-200/20 text-amber-100/65",
  },
  {
    id: "personal_trainer",
    label: "Personal Trainer",
    heading: "What are we training?",
    placeholder: "Ask about workouts, form, or recovery…",
    icon: Barbell,
    centerArt: Barbell,
    leftArt: SneakerMove,
    rightArt: Timer,
    tabClass: "border-sky-400/35",
    artClass: "text-sky-600/[0.10]",
    centerArtClass: "bg-sky-500/[0.05] text-sky-700/55",
    messageClass: "border-sky-500/16",
    composerClass: "focus-within:border-sky-500/25",
    cardClass: "border-cyan-200/20 bg-[#03141f]/62",
    cardIconClass: "border-cyan-200/20 text-cyan-100/65",
  },
] as const

const COACH_STARTERS = [
  {
    title: "Plan my day",
    prompt: "What should I focus on today based on my recent activity?",
    icon: Heartbeat,
  },
  {
    title: "Check progress",
    prompt: "How is my progress trending, and what should I watch next?",
    icon: ChartLineUp,
  },
  {
    title: "Explore a scenario",
    prompt:
      "Help me explore a change to my goals or routine without saving anything.",
    icon: LightbulbFilament,
  },
  {
    title: "Today’s check-in",
    prompt: null,
    icon: CheckCircle,
  },
] as const

const CHEF_STARTERS = [
  {
    title: "Review nutrition",
    prompt: "Review my recent nutrition and give me one thing to improve.",
    icon: ChartLineUp,
  },
  {
    title: "Create a recipe",
    prompt:
      "Create a practical recipe that fits my nutrition goals and saved preferences.",
    icon: CookingPot,
  },
  {
    title: "Plan my meals",
    prompt: "Help me plan simple meals for the next few days.",
    icon: ForkKnife,
  },
  {
    title: "Use what I have",
    prompt: "Help me make a meal from ingredients I already have.",
    icon: Carrot,
  },
] as const

const TRAINER_STARTERS = [
  {
    title: "Analyze training",
    prompt: "Analyze my training this week and suggest my next workout.",
    icon: ChartLineUp,
  },
  {
    title: "Plan a workout",
    prompt: "Build a workout for me based on my routine and recent training.",
    icon: Barbell,
  },
  {
    title: "Validate my routine",
    prompt:
      "Validate my current weekly routine for recovery, balance, duration, and volume.",
    icon: CheckCircle,
  },
  {
    title: "Adjust for recovery",
    prompt: "Adapt my next workout to my latest recovery and training data.",
    icon: Heartbeat,
  },
] as const

const BEGINNER_SETUP_STARTERS = [
  {
    title: "Build my workout plan",
    prompt:
      "Help me set up my first workout plan. Ask only the essential questions about my schedule, equipment, and limitations, then give me a simple plan I can save.",
    icon: Barbell,
  },
  {
    title: "Set up easy recipes",
    prompt:
      "Help me set up a few beginner-friendly recipes. Use what you already know about my safety needs, then ask only about food preferences, budget, and cooking access.",
    icon: ForkKnife,
  },
] as const

function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning."
  if (hour < 18) return "Good afternoon."
  return "Good evening."
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
    if (row.type === "goal") {
      return Boolean(
        row.title &&
        row.detail &&
        Array.isArray(row.tasks) &&
        row.tasks.length > 0
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
    if (row.type === "create_workout_plan")
      return Boolean(
        Array.isArray(row.presets) &&
        row.presets.length > 0 &&
        Array.isArray(row.assignments)
      )
    if (row.type === "update_routine") return Array.isArray(row.assignments)
    if (row.type === "remember") return Boolean(row.key && row.value)
    if (row.type === "forget_memory") return Boolean(row.key)
    if (row.type === "save_check_in") return Boolean(row.date)
    if (row.type === "save_weekly_plan")
      return Boolean(row.weekStart && Array.isArray(row.days))
    if (row.type === "save_goal")
      return Boolean(
        row.title &&
        row.startDate &&
        Array.isArray(row.tasks) &&
        row.tasks.length
      )
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
    if (operation.type === "save_goal") {
      if (operation.durationDays < 1 || operation.durationDays > 365)
        errors.push(`${operation.title} has an invalid duration.`)
      if (operation.tasks.length === 0)
        errors.push(`${operation.title} needs at least one task.`)
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

function expandWorkoutPlanOperations(
  operations: CoachOperation[]
): CoachOperation[] {
  return operations.flatMap((operation) => {
    if (operation.type !== "create_workout_plan") return [operation]
    const meta: CoachOperationMeta = {
      confirmation: operation.confirmation,
      summary: operation.summary,
      assumptions: operation.assumptions,
      warnings: operation.warnings,
    }
    return [
      ...operation.presets.map((preset): CoachOperation => ({
        ...meta,
        type: "create_workout_preset",
        ...preset,
      })),
      {
        ...meta,
        type: "update_routine",
        assignments: operation.assignments,
      },
    ]
  })
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

function RecipeBreakdown({
  recipe,
}: {
  recipe: Extract<CoachOperation, { type: "save_recipe" }>
}) {
  const totals = recipeTotals(recipe.ingredients, recipe.servings)
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes
  const ingredientNames = recipe.ingredients
    .slice(0, 3)
    .map((ingredient) => ingredient.name)
    .join(" · ")
  const extraIngredientCount = Math.max(0, recipe.ingredients.length - 3)
  const usefulTags = recipe.tags.slice(0, 3)

  return (
    <>
      <div className="mt-4 border-y border-border/45 py-4">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold tracking-[0.08em] text-foreground/50 uppercase">
              {recipe.category || "Recipe"}
            </p>
            <p className="mt-1.5 text-[13px] leading-5 font-medium text-foreground/80">
              {ingredientNames}
              {extraIngredientCount > 0
                ? ` + ${extraIngredientCount} more`
                : ""}
            </p>
          </div>
          <ForkKnife
            size={22}
            weight="regular"
            className="mt-0.5 shrink-0 text-foreground/45"
            aria-hidden
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-foreground/55">
          <span>{totalMinutes} min total</span>
          <span>
            {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
          </span>
          {usefulTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 divide-x divide-border/45 border-y border-border/45 py-3">
        {[
          ["Calories", `${totals.calories}`],
          ["Protein", `${totals.protein}g`],
          ["Carbs", `${totals.carbs}g`],
          ["Fat", `${totals.fat}g`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 px-1 text-center first:pl-0 last:pr-0"
          >
            <p className="text-[14px] font-bold tabular-nums">{value}</p>
            <p className="mt-0.5 truncate text-[8px] text-muted-foreground">
              {label}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-right text-[8px] text-muted-foreground/70">
        Estimated per serving
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-bold">Ingredients</h4>
          <ul className="mt-2 divide-y divide-border/35 text-[11px] text-foreground/70">
            {recipe.ingredients.map((ingredient, index) => (
              <li
                key={`${ingredient.name}-${index}`}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span>{ingredient.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {Math.round(ingredient.grams)}g
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[11px] font-bold">Method</h4>
          {recipe.steps.length > 0 ? (
            <ol className="mt-2 space-y-2 text-[11px] leading-relaxed text-foreground/70">
              {recipe.steps.map((step, index) => (
                <li key={`${step}-${index}`} className="flex gap-2.5">
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No method supplied.
            </p>
          )}
        </div>
      </div>
      {recipe.notes && (
        <p className="mt-4 border-t border-border/35 pt-3 text-[10px] leading-relaxed text-foreground/60">
          {recipe.notes}
        </p>
      )}
    </>
  )
}

function CoachOperationResults({
  results,
  onOpenRecipe,
  onOpenWorkouts,
  onOpenNutrition,
  onUndo,
  onLogRecipe,
  onPinGoal,
}: {
  results?: CoachOperationResult[]
  onOpenRecipe: (id: string) => void
  onOpenWorkouts: () => void
  onOpenNutrition: () => void
  onUndo: (id: string) => void
  onLogRecipe: (
    result: Extract<CoachOperationResult, { type: "save_recipe" }>
  ) => void
  onPinGoal: (goalId: string) => Promise<void>
}) {
  const [pinnedGoalIds, setPinnedGoalIds] = useState<Set<string>>(new Set())
  if (!results?.length) return null

  return (
    <div className="mt-4 space-y-3">
      {results.map((result, index) => {
        if (result.type === "save_goal") {
          const pinned = result.pinned || pinnedGoalIds.has(result.goalId)
          return (
            <article
              key={`${result.type}-${result.goalId}`}
              className="border-y border-border/55 py-5"
            >
              <p className="text-[10px] font-medium text-muted-foreground">
                Coach goal · {result.durationDays} days
              </p>
              <h3 className="mt-1 text-[18px] font-bold">{result.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/65">
                {result.detail}
              </p>
              <div className="mt-3 divide-y divide-border/35 border-y border-border/35">
                {result.tasks.map((task, taskIndex) => (
                  <div
                    key={`${task.title}-${taskIndex}`}
                    className="flex gap-2.5 py-2.5"
                  >
                    {task.completed ? (
                      <CheckCircle
                        size={15}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-[var(--status-success)]"
                      />
                    ) : (
                      <Circle
                        size={15}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <div>
                      <p className="text-[11px] font-semibold">{task.title}</p>
                      {task.detail ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {task.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pinned}
                  onClick={() => {
                    void onPinGoal(result.goalId).then(() =>
                      setPinnedGoalIds((current) =>
                        new Set(current).add(result.goalId)
                      )
                    )
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background disabled:opacity-55"
                >
                  <PushPin size={13} weight={pinned ? "fill" : "bold"} />
                  {pinned ? "Pinned to Today" : "Pin to Today"}
                </button>
                {result.actionId ? (
                  <button
                    type="button"
                    onClick={() => onUndo(result.actionId!)}
                    className="inline-flex min-h-10 items-center gap-1 px-2 text-[10px] font-medium text-muted-foreground"
                  >
                    <ClockCounterClockwise size={13} /> Undo goal
                  </button>
                ) : null}
              </div>
            </article>
          )
        }

        if (result.type === "save_recipe") {
          return (
            <article
              key={`${result.type}-${result.recipeId}`}
              className="border-y border-border/55 py-5"
            >
              <p className="text-[10px] font-medium text-muted-foreground">
                Saved to Recipes
              </p>
              <h3 className="mt-1 text-[20px] leading-tight font-bold tracking-tight">
                {result.name}
              </h3>
              {result.description ? (
                <p className="mt-2 text-[12px] leading-relaxed text-foreground/65">
                  {result.description}
                </p>
              ) : null}
              <RecipeBreakdown recipe={result} />
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenRecipe(result.recipeId)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background"
                >
                  Edit recipe <ArrowRight size={12} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => onLogRecipe(result)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border/70 px-4 text-[11px] font-bold"
                >
                  Log one serving
                </button>
                {result.actionId ? (
                  <button
                    type="button"
                    onClick={() => onUndo(result.actionId!)}
                    className="inline-flex min-h-10 items-center gap-1 px-2 text-[10px] font-medium text-muted-foreground"
                  >
                    <ClockCounterClockwise size={13} /> Undo save
                  </button>
                ) : null}
              </div>
            </article>
          )
        }

        if (result.type === "create_workout_preset") {
          return (
            <div
              key={`${result.type}-${result.presetId}`}
              className="flex w-full items-center gap-3 border-y border-border/50 py-3.5 text-left"
            >
              <Barbell
                size={18}
                weight="bold"
                className="shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">
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
                className="min-h-9 px-2 text-[10px] font-bold"
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
            className="flex items-center gap-2 border-y border-border/50 py-2.5 text-[11px] font-semibold"
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
    <div className="mt-5 divide-y divide-border/45 border-y border-border/45">
      {artifacts.map((artifact, index) => (
        <article key={`${artifact.type}-${index}`} className="py-4">
          <div className="flex items-center gap-2">
            {artifact.type === "recovery_adaptation" ? (
              <Heartbeat size={16} weight="fill" />
            ) : artifact.type === "validation" ? (
              <WarningCircle size={16} weight="fill" />
            ) : (
              <ChartLineUp size={16} weight="bold" />
            )}
            <p className="text-[10px] font-medium text-muted-foreground">
              {labels[artifact.type]}
            </p>
            {artifact.status ? (
              <span className="ml-auto text-[9px] text-muted-foreground">
                {artifact.status}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-[14px] font-bold">{artifact.title}</h3>
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
  const recipe =
    operations.length === 1 && operations[0]?.type === "save_recipe"
      ? operations[0]
      : null

  if (recipe) {
    const isEdit = Boolean(recipe.recipeId)
    return (
      <section className="mt-5 border-y border-border/55 py-5">
        <p className="text-[10px] font-medium text-muted-foreground">
          Recipe preview · nothing saved yet
        </p>
        <h3 className="mt-1 text-[18px] leading-tight font-bold tracking-tight">
          {recipe.name}
        </h3>
        {recipe.description ? (
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/65">
            {recipe.description}
          </p>
        ) : null}
        <RecipeBreakdown recipe={recipe} />
        {recipe.assumptions.length > 0 ? (
          <div className="mt-5 border-l border-border/70 pl-3">
            <p className="text-[10px] font-medium">Based on</p>
            {recipe.assumptions.map((item) => (
              <p key={item} className="mt-1 text-[10px] text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
        ) : null}
        {recipe.warnings.map((warning) => (
          <p
            key={warning}
            className="mt-3 flex gap-1.5 text-[10px] text-amber-700 dark:text-amber-300"
          >
            <WarningCircle size={13} className="shrink-0" /> {warning}
          </p>
        ))}
        {recipe.logMeal ? (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Saving will also log {recipe.servingsToLog ?? 1} serving
            {(recipe.servingsToLog ?? 1) === 1 ? "" : "s"} to {recipe.logMeal}.
          </p>
        ) : null}
        <div className="mt-5 border-t border-border/45 pt-4">
          <p className="text-[13px] font-semibold">
            {isEdit ? "Does this update look right?" : "Like this recipe?"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {isEdit
              ? "Your existing recipe changes only after you confirm."
              : "Add it to Recipes only if it fits what you wanted."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApply}
              disabled={applying}
              className="min-h-10 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background disabled:opacity-40"
            >
              {applying
                ? "Saving…"
                : isEdit
                  ? "Update recipe"
                  : "Save to Recipes"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={applying}
              className="min-h-10 px-3 text-[11px] font-medium text-muted-foreground"
            >
              Not for me
            </button>
          </div>
        </div>
      </section>
    )
  }

  const assumptions = [
    ...new Set(operations.flatMap((item) => item.assumptions)),
  ]
  const warnings = [...new Set(operations.flatMap((item) => item.warnings))]
  return (
    <section className="mt-5 border-y border-border/55 py-4">
      <p className="text-[10px] font-medium text-muted-foreground">
        Review changes
      </p>
      <div className="mt-3 space-y-2">
        {operations.map((operation, index) => (
          <div
            key={`${operation.type}-${index}`}
            className="flex gap-2 text-[12px] font-semibold"
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
        <div className="mt-3 border-l border-border/70 pl-3">
          <p className="text-[10px] font-medium">Assumptions</p>
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
          className="min-h-10 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background disabled:opacity-40"
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
  onPinGoal,
}: {
  blocks?: CoachUiBlock[]
  onAction: (action: CoachUiAction) => void
  onPinGoal: (goal: {
    title: string
    detail: string
    durationDays: number
    tasks: CoachGoalTaskDraft[]
  }) => Promise<void>
}) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  const [pinningGoalKey, setPinningGoalKey] = useState<string | null>(null)
  const [pinnedGoalKeys, setPinnedGoalKeys] = useState<Set<string>>(new Set())
  if (!blocks?.length) return null

  async function pinGoal(
    key: string,
    goal: {
      title: string
      detail: string
      durationDays: number
      tasks: CoachGoalTaskDraft[]
    }
  ) {
    if (pinningGoalKey || pinnedGoalKeys.has(key)) return
    setPinningGoalKey(key)
    try {
      await onPinGoal(goal)
      setPinnedGoalKeys((current) => new Set(current).add(key))
    } finally {
      setPinningGoalKey(null)
    }
  }

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
          const goalKey = `${index}-${block.title}`
          const pinned = pinnedGoalKeys.has(goalKey)
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
              <button
                type="button"
                disabled={pinned || pinningGoalKey !== null}
                onClick={() =>
                  void pinGoal(goalKey, {
                    title: block.title,
                    detail: `Complete this Coach plan consistently for the next 7 days.`,
                    durationDays: 7,
                    tasks: block.items.map((item) => ({
                      title: item.label,
                      ...(item.detail ? { detail: item.detail } : {}),
                      completed: Boolean(
                        item.done ||
                        completedItems.has(`${index}-${item.label}`)
                      ),
                    })),
                  })
                }
                className="motion-tactile mt-3 inline-flex min-h-10 items-center gap-1.5 border-b border-foreground/30 text-[11px] font-semibold disabled:opacity-50"
              >
                <PushPin size={13} weight={pinned ? "fill" : "bold"} />
                {pinned
                  ? "Pinned to Today"
                  : pinningGoalKey === goalKey
                    ? "Pinning…"
                    : "Pin as a 7-day goal"}
              </button>
            </div>
          )
        }

        if (block.type === "goal") {
          const goalKey = `${index}-${block.title}`
          const pinned = pinnedGoalKeys.has(goalKey)
          return (
            <div key={`${block.type}-${index}`} className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Coach goal · {block.durationDays} days
                  </p>
                  <h3 className="mt-1 text-[15px] font-bold">{block.title}</h3>
                </div>
                <PushPin
                  size={16}
                  weight="bold"
                  className="mt-1 shrink-0 text-muted-foreground"
                />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/68">
                {block.detail}
              </p>
              <div className="mt-3 divide-y divide-border/35 border-y border-border/35">
                {block.tasks.map((task, taskIndex) => (
                  <div key={`${task.title}-${taskIndex}`} className="py-2.5">
                    <p className="text-[12px] font-semibold">{task.title}</p>
                    {task.detail ? (
                      <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                        {task.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={pinned || pinningGoalKey !== null}
                onClick={() => void pinGoal(goalKey, block)}
                className="motion-tactile mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background disabled:opacity-50"
              >
                <PushPin size={13} weight={pinned ? "fill" : "bold"} />
                {pinned
                  ? "Pinned to Today"
                  : pinningGoalKey === goalKey
                    ? "Pinning…"
                    : "Pin to Today"}
              </button>
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

function coachConversationKey(mode: CoachMode) {
  return mode === "chat"
    ? COACH_CONVERSATION_KEY
    : `${COACH_CONVERSATION_KEY}:${mode}`
}

function loadCoachConversation(mode: CoachMode): CoachMessage[] {
  const stored = safeLocalStorageGet(coachConversationKey(mode))
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

function CoachLoadingState() {
  return (
    <div
      className="m-auto flex items-center gap-3 text-muted-foreground"
      role="status"
      aria-label="Loading Coach"
    >
      <span className="size-2 animate-pulse rounded-full bg-current" />
      <span className="text-[12px] font-medium">Connecting your data…</span>
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
  const location = useLocation()
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
  const goals = useQuery(api.ai.coachGoals.listActive, { limit: 20 })
  const actionHistory = useQuery(api.ai.coachState.listActionHistory, {
    limit: 30,
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
  const [activeMode, setActiveMode] = useState<CoachMode>("chat")
  const [messages, setMessages] = useState<CoachMessage[]>(() =>
    loadCoachConversation("chat")
  )
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<CoachAttachment | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRequestRef = useRef(0)
  const attachmentRef = useRef<CoachAttachment | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recipeHandoffHandled = useRef(false)
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

  useEffect(() => {
    if (recipeHandoffHandled.current) return
    const state = location.state as {
      coachMode?: CoachMode
      recipeRequest?: string
    } | null
    if (state?.coachMode !== "chef" || !state.recipeRequest) return
    recipeHandoffHandled.current = true
    setActiveMode("chef")
    setMessages(loadCoachConversation("chef"))
    setInput(state.recipeRequest)
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [location.state])
  const registerCoachUpload = useMutation(api.ai.coachState.registerUpload)
  const removeCoachUpload = useMutation(api.ai.coachState.removeUpload)
  const saveCheckIn = useMutation(api.ai.coachState.saveCheckIn)
  const saveWeeklyPlan = useMutation(api.ai.coachState.saveWeeklyPlan)
  const saveCoachGoal = useMutation(api.ai.coachGoals.save)
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const dictation = useCoachDictation({
    value: input,
    onChange: updateComposer,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [busy, messages.length])

  useEffect(() => {
    safeLocalStorageSet(
      coachConversationKey(activeMode),
      JSON.stringify(messages)
    )
  }, [activeMode, messages])

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
      goals: (goals ?? []).map((goal) => ({
        id: String(goal._id),
        title: goal.title,
        ...(goal.description ? { detail: goal.description } : {}),
        startDate: goal.startDate,
        endDate: goal.endDate,
        durationDays: goal.durationDays,
        pinned: goal.pinned,
        status: goal.status,
        tasks: goal.tasks.map((task) => ({
          title: task.title,
          ...(task.detail ? { detail: task.detail } : {}),
          completed: task.completed,
        })),
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
    goals,
    memories,
    presets,
    recentFoodDays,
    recentWorkouts,
    recipes,
    schedule,
    todayKey,
  ])

  async function executeOperations(operations: CoachOperation[]) {
    const expandedOperations = expandWorkoutPlanOperations(operations)
    const validationErrors = validateCoachOperations(expandedOperations)
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

    const orderedOperations = [...expandedOperations].sort((left, right) => {
      const priority = (operation: CoachOperation) =>
        operation.type === "create_workout_preset"
          ? 0
          : operation.type === "update_routine"
            ? 2
            : 1
      return priority(left) - priority(right)
    })

    for (const operation of orderedOperations) {
      if (operation.type === "save_goal") {
        const existing = operation.goalId
          ? (goals ?? []).find((goal) => String(goal._id) === operation.goalId)
          : null
        if (operation.goalId && !existing) {
          throw new Error("That Coach goal no longer exists.")
        }
        const saved = await saveCoachGoal({
          ...(existing ? { id: existing._id } : {}),
          title: operation.title,
          description: operation.detail,
          startDate: operation.startDate,
          durationDays: operation.durationDays,
          pinned: operation.pinned,
          sourceMode: activeMode,
          tasks: operation.tasks,
        })
        const goalId = String(saved.goalId)
        const actionId = await recordAction({
          kind: existing ? "edit_goal" : "create_goal",
          summary: operation.summary,
          targetType: "coach_goal",
          targetId: goalId,
          undoPayload: existing
            ? {
                kind: "restore_goal",
                id: goalId,
                body: {
                  title: existing.title,
                  ...(existing.description
                    ? { description: existing.description }
                    : {}),
                  startDate: existing.startDate,
                  endDate: existing.endDate,
                  durationDays: existing.durationDays,
                  status: existing.status,
                  pinned: existing.pinned,
                  ...(existing.sourceMode
                    ? { sourceMode: existing.sourceMode }
                    : {}),
                  tasks: existing.tasks.map((task) => ({
                    title: task.title,
                    ...(task.detail ? { detail: task.detail } : {}),
                    completed: task.completed,
                  })),
                },
              }
            : { kind: "delete_goal", id: goalId },
        })
        results.push({
          ...operation,
          goalId,
          actionId: String(actionId),
        })
        continue
      }

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
          cookMinutes: operation.cookMinutes,
          category: operation.category,
          notes: operation.notes,
          recipeType: "detailed",
          placeholderImage: "coach-kitchen",
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
                  ...(existing.cookMinutes
                    ? { cookMinutes: existing.cookMinutes }
                    : {}),
                  ...(existing.category ? { category: existing.category } : {}),
                  ...(existing.notes ? { notes: existing.notes } : {}),
                  ...(existing.recipeType
                    ? { recipeType: existing.recipeType }
                    : {}),
                  ...(existing.placeholderImage
                    ? { placeholderImage: existing.placeholderImage }
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

      if (operation.type === "create_workout_plan") {
        throw new Error("Workout plan was not expanded before execution.")
      }

      if (operation.type !== "update_routine") {
        throw new Error("Unsupported Coach operation")
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
      results.push({ type: "update_routine", assignments: applied })
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

  async function pinGoalFromCoachBlock(goal: {
    title: string
    detail: string
    durationDays: number
    tasks: CoachGoalTaskDraft[]
  }) {
    try {
      const saved = await saveCoachGoal({
        title: goal.title,
        description: goal.detail,
        startDate: todayKey,
        durationDays: goal.durationDays,
        pinned: true,
        sourceMode: activeMode,
        tasks: goal.tasks,
      })
      await recordAction({
        kind: "create_goal",
        summary: `Pinned ${goal.title} to Today`,
        targetType: "coach_goal",
        targetId: String(saved.goalId),
        undoPayload: { kind: "delete_goal", id: String(saved.goalId) },
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not pin this goal"
      )
      throw error
    }
  }

  async function pinSavedGoal(goalId: string) {
    try {
      await setCoachGoalPinned({
        id: goalId as Id<"coachGoals">,
        pinned: true,
      })
      hapticTap()
      toast.success("Goal pinned to Today")
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not pin this goal"
      )
      throw error
    }
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
    hapticSelection()
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
        coachMode: activeMode,
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
          operation.type === "save_recipe" ||
          operation.confirmation === "confirm" ||
          operation.warnings.length > 0
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

  function switchCoachMode(nextMode: CoachMode) {
    if (busy || nextMode === activeMode) return
    hapticSelection()
    dictation.cancel()
    clearAttachment()
    setActiveMode(nextMode)
    setMessages(loadCoachConversation(nextMode))
    updateComposer("")
    setLastFailedPrompt(null)
  }

  const mode = COACH_MODES.find((item) => item.id === activeMode)!
  const CenterArt = mode.centerArt
  const LeftArt = mode.leftArt
  const RightArt = mode.rightArt
  const starters =
    activeMode === "chef"
      ? context.experienceLevel === "beginner"
        ? [BEGINNER_SETUP_STARTERS[1], ...CHEF_STARTERS]
        : CHEF_STARTERS
      : activeMode === "personal_trainer"
        ? context.experienceLevel === "beginner"
          ? [BEGINNER_SETUP_STARTERS[0], ...TRAINER_STARTERS]
          : TRAINER_STARTERS
        : COACH_STARTERS

  return (
    <main
      className="coach-mobile-immersive desktop-canvas relative isolate h-svh overflow-hidden bg-background lg:pl-64"
      data-coach-mode={activeMode}
    >
      <div
        key={`mobile-flow-${activeMode}`}
        className="coach-swoosh-backdrop coach-swoosh-backdrop--mobile"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col px-[var(--app-page-x)] pt-[var(--app-safe-top)] md:px-8 lg:pt-0">
        <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border/45 bg-transparent lg:bg-background/95">
          <h1 className="text-[18px] leading-tight font-bold tracking-tight">
            Coach
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                hapticSelection()
                setShowMemory(true)
              }}
              aria-label="Coach memory"
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <Brain size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => {
                hapticSelection()
                setShowHistory(true)
              }}
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

        <nav
          className="grid shrink-0 grid-cols-3 gap-1 border-b border-border/45 py-2"
          role="tablist"
          aria-label="Coach modes"
        >
          {COACH_MODES.map((item) => {
            const active = item.id === activeMode
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="coach-workspace"
                disabled={busy}
                onClick={() => switchCoachMode(item.id)}
                className={cn(
                  "motion-tactile flex min-h-11 min-w-0 items-center justify-center gap-1 border-b-2 px-0.5 text-[10px] font-semibold transition-colors disabled:opacity-45 sm:gap-1.5 sm:text-[11px]",
                  active
                    ? cn(item.tabClass, "text-foreground")
                    : "border-transparent text-muted-foreground active:text-foreground"
                )}
              >
                <Icon className="shrink-0" size={13} weight="bold" />
                <span className="min-w-0 whitespace-nowrap">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <section
          key={activeMode}
          id="coach-workspace"
          role="tabpanel"
          aria-label={mode.label}
          className="coach-mode-stage coach-swoosh-surface relative isolate flex min-h-0 flex-1 flex-col overflow-hidden lg:my-3 lg:rounded-2xl lg:border lg:border-white/10"
          data-coach-mode={activeMode}
        >
          <div
            key={`panel-flow-${activeMode}`}
            className="coach-swoosh-backdrop coach-swoosh-backdrop--panel"
            aria-hidden="true"
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-5">
            {loading ? (
              <CoachLoadingState />
            ) : messages.length === 0 ? (
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4 sm:py-6">
                <div className="px-1 text-left">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {timeGreeting()}
                  </p>
                  <h2 className="mt-1 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-[27px]">
                    {mode.heading}
                  </h2>
                </div>

                <div
                  className="relative flex min-h-32 flex-1 items-center justify-center"
                  aria-hidden="true"
                >
                  <LeftArt
                    size={68}
                    weight="thin"
                    className={cn(
                      "absolute left-[5%] -rotate-6 sm:left-[13%]",
                      mode.artClass
                    )}
                  />
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full border border-border/35 bg-background/45 backdrop-blur-sm",
                      mode.centerArtClass
                    )}
                  >
                    <CenterArt size={21} weight="regular" />
                  </span>
                  <RightArt
                    size={68}
                    weight="thin"
                    className={cn(
                      "absolute right-[5%] rotate-6 sm:right-[13%]",
                      mode.artClass
                    )}
                  />
                </div>

                <AppTooltip
                  id={APP_TOOLTIP_IDS.coachStarters}
                  content="Choose a focused coaching task."
                  targetClassName="block w-full"
                  side="top"
                  enabled
                >
                  <div className="-mx-3 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden">
                    {starters.map((starter) => {
                      const StarterIcon = starter.icon
                      return (
                        <button
                          key={starter.title}
                          type="button"
                          onClick={() => {
                            if (starter.prompt === null) {
                              hapticTap()
                              navigate("/progress?checkIn=1", {
                                motion: "switch",
                              })
                              return
                            }
                            void submit(starter.prompt)
                          }}
                          className={cn(
                            "motion-tactile flex min-h-24 w-[9.25rem] min-w-[9.25rem] snap-start flex-col items-start justify-between rounded-2xl border p-3 text-left shadow-[0_18px_42px_-24px_rgba(0,0,0,0.85)] active:bg-muted",
                            mode.cardClass
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full border bg-black/15",
                              mode.cardIconClass
                            )}
                          >
                            <StarterIcon size={13} weight="bold" />
                          </span>
                          <span className="text-[11px] leading-[1.3] font-semibold text-foreground/85">
                            {starter.title}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </AppTooltip>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
                <div className="flex flex-1 flex-col gap-5" aria-live="polite">
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
                          {mode.label}
                        </p>
                        <div
                          className={cn(
                            "min-w-0 border-l-2 pl-4 text-[14px] leading-6",
                            message.error
                              ? "border-destructive/35 text-foreground"
                              : cn(mode.messageClass, "text-foreground")
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
                                onPinGoal={pinGoalFromCoachBlock}
                              />
                              <CoachArtifacts artifacts={message.artifacts} />
                              <CoachProposal
                                operations={message.pendingOperations}
                                applying={applyingMessageIndex === index}
                                onApply={() =>
                                  void applyPendingOperations(index)
                                }
                                onDismiss={() =>
                                  dismissPendingOperations(index)
                                }
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
                                onPinGoal={pinSavedGoal}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )}
                  {busy && <ThinkingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>
        </section>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="z-20 mx-auto w-full max-w-3xl min-w-0 shrink-0 border-t border-border/45 bg-transparent pt-3 pb-[calc(var(--app-safe-bottom)+5.75rem)] lg:bg-background/95 lg:pb-4"
        >
          <AppTooltip
            id={APP_TOOLTIP_IDS.coachMessage}
            content="Ask Coach about today’s workout, food choices, recovery, or what changed in your progress."
            targetClassName="block w-full min-w-0 max-w-full"
            side="top"
            enabled
          >
            <div
              className={cn(
                "w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card p-2",
                mode.composerClass
              )}
            >
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
              <div className="flex min-w-0 items-end gap-1 sm:gap-2">
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
                    loading ? "Connecting your data…" : mode.placeholder
                  }
                  disabled={loading || busy}
                  className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-3 text-[14px] leading-5 outline-none placeholder:text-muted-foreground/45 disabled:opacity-55 sm:px-2.5"
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
