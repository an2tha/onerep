/**
 * Shared Coach chat surface.
 *
 * Types, response normalizers, operation validation, and the block/proposal
 * renderers used by both the Coach page and the onboarding Coach setup stage.
 * Extracted from Coach.tsx so onboarding renders the same interactive cards,
 * proposals, and applied-operation summaries instead of plain text bubbles.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Barbell,
  ChartLineUp,
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  ForkKnife,
  Heartbeat,
  ImageSquare,
  Minus,
  Pill,
  Plus,
  PushPin,
  Sparkle,
  TrendDown,
  TrendUp,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { toast } from "@repo/ui"
import { cn } from "@/lib/utils"
import {
  ExpandPoseButton,
  FormCoachCard,
  FormCoachPoseScene,
  PoseExpandModal,
} from "@/components/form-coach-card"
import type { PoseCorrection } from "@/lib/pose-correction"
import type { Day } from "@/lib/workout-sync"
import type { Exercise } from "@/lib/exercise-catalog"
import { SUPPLEMENT_SCHEDULES } from "@/lib/supplements"
import { prepareCoachImage } from "@/lib/coach-media"
import { uploadOwnedFile } from "@/lib/owned-upload"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import {
  normalizeCoachOperations as normalizeSharedCoachOperations,
  validateCoachOperations as validateSharedCoachOperations,
} from "@repo/models"
import type {
  SupplementCategory,
  SupplementForm,
  SupplementNutrients,
  SupplementSchedule,
} from "@repo/models"

export type CoachMessage = {
  role: "user" | "assistant"
  content: string
  uiBlocks?: CoachUiBlock[]
  operationResults?: CoachOperationResult[]
  pendingOperations?: CoachOperation[]
  artifacts?: CoachArtifact[]
  error?: boolean
}

export type GuidedCoachIntent = {
  kind:
    | "create_recipe"
    | "suggest_meal"
    | "modify_workout"
    | "explain_plateau"
    | "plan_recovery"
    | "plan_week"
  title: string
  detail: string
  examples: string[]
}

export type RecipeCustomization = {
  name: string
  description: string
  image: string
  time: number
  calories: number
  protein: number
  ingredients: string[]
}

export type CoachAttachment = {
  id?: Id<"fileUploads">
  fileName: string
  previewUrl: string
  status: "preparing" | "uploading" | "ready" | "error"
  error?: string
}

export type CoachRecipeIngredient = {
  id?: string
  name: string
  grams: number
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
}

export type CoachOperationMeta = {
  confirmation: "auto" | "confirm"
  summary: string
  assumptions: string[]
  warnings: string[]
}

export type CoachGoalTaskDraft = {
  title: string
  detail?: string
  completed?: boolean
}

export type CoachWorkoutPresetDraft = {
  presetId?: string
  reason?: "user_edit" | "progression" | "recovery" | "substitution"
  name: string
  focus: "strength" | "cardio" | "mobility"
  exercises: Array<{
    name: string
    supersetGroup?: string
    sets: Array<{
      type: "working" | "warmup" | "failure" | "myoreps" | "drop"
      weight: string
      reps: string
      restSeconds: number
    }>
  }>
  scheduleDays: Day[]
}

export type CoachOperation = CoachOperationMeta &
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
          meals: Array<{
            label: string
            recipeId?: string
            note?: string
            calories?: number
            protein?: number
            carbs?: number
            fat?: number
          }>
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
        type: "save_progress_metric"
        title: string
        description: string
        tab: "body" | "nutrition" | "training"
        kind: "counter" | "number" | "toggle"
        unit: string
        step: number
        target?: number
        accent: "food" | "water" | "workout" | "progress"
      }
    | {
        type: "save_dashboard_widget"
        title: string
        description: string
        kind: "stat" | "counter" | "progress" | "sparkline" | "decay"
        sourceMetricId?: string
        sourceMetricTitle: string
        unit: string
        accent: "food" | "water" | "workout" | "progress"
        target?: number
        windowDays?: number
        halfLifeHours?: number
        parentWidgetId?: string
        followUpTitle?: string
        followUpKind?: "stat" | "counter" | "progress" | "sparkline" | "decay"
      }
    | {
        type: "save_supplement"
        supplementId?: string
        name: string
        brand?: string
        category: SupplementCategory
        form: SupplementForm
        servingLabel: string
        defaultServingQuantity: number
        notes?: string
        active: boolean
        schedule: SupplementSchedule
        nutrientsPerServing: SupplementNutrients
      }
    | {
        type: "set_nutrition_targets"
        calories?: number
        protein?: number
        carbs?: number
        fat?: number
        waterMl?: number
      }
  | {
        type: "undo_action"
        actionId: string
        actionSummary: string
      }
  )

export type CoachArtifact = {
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

export type CoachOperationResult =
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
  | ({
      type: "save_progress_metric"
      metricId: string
      actionId?: string
    } & Extract<CoachOperation, { type: "save_progress_metric" }>)
  | ({
      type: "save_supplement"
      supplementId: string
      actionId?: string
    } & Extract<CoachOperation, { type: "save_supplement" }>)
  | ({
      type: "save_dashboard_widget"
      widgetId: string
      pinned: boolean
      actionId?: string
    } & Extract<CoachOperation, { type: "save_dashboard_widget" }>)
  | {
      type:
        | "remember"
        | "forget_memory"
        | "save_check_in"
        | "save_weekly_plan"
        | "set_nutrition_targets"
        | "undo_action"
      label: string
      actionId?: string
    }

export type CoachUiAction =
  | "open_nutrition"
  | "open_workouts"
  | "open_progress"
  | "open_settings"
  | "open_workout_builder"
  | "open_recipe_builder"
  | "open_supplements"
  | "log_food"

export type CoachInteractiveElement =
  | { type: "text"; text: string; emphasis?: "quiet" | "strong" }
  | { type: "section"; title: string; detail?: string }
  | { type: "divider"; label?: string }
  | {
      type: "key_value"
      items: Array<{ label: string; value: string; detail?: string }>
    }
  | {
      type: "progress"
      label: string
      value: number
      max: number
      unit?: string
      detail?: string
    }
  | {
      type: "list"
      style: "bullet" | "number" | "timeline"
      items: Array<{ title: string; detail?: string }>
    }
  | {
      type: "metric_group"
      metrics: Array<{
        label: string
        value: number
        unit?: string
        detail?: string
        scaleWith?: string
      }>
    }
  | {
      type: "stepper"
      id: string
      label: string
      value: number
      min: number
      max: number
      step: number
      unit?: string
    }
  | {
      type: "range"
      id: string
      label: string
      value: number
      min: number
      max: number
      step: number
      unit?: string
      lowLabel?: string
      highLabel?: string
    }
  | {
      type: "choice"
      id: string
      label: string
      value: string
      options: string[]
    }
  | {
      type: "rating"
      id: string
      label: string
      value: number
      max: number
      lowLabel?: string
      highLabel?: string
    }
  | {
      type: "toggle"
      id: string
      label: string
      detail?: string
      value: boolean
    }

/**
 * Where the coach keeps its conversation. Lives here rather than in the page so
 * anything writing into the thread uses the same key the page reads.
 */
export const COACH_CONVERSATION_KEY = "onerep:coach-conversation:v1"

export type CoachPoseFrame = {
  timeMs: number
  worldLandmarks: Array<{
    x: number
    y: number
    z: number
    visibility?: number
  }>
}

export type CoachUiBlock =
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
  | {
      /**
       * A 3D pose the coach captured, shown in the conversation.
       *
       * Carries the lifter's own body rather than a diagram, and optionally the
       * same body in the position being asked for, so the correction is
       * something you can look at instead of a sentence about degrees.
       */
      type: "pose"
      title: string
      detail?: string
      /** Canonical rep, body-framed and phase-normalised. */
      frames: CoachPoseFrame[]
      /** Joint targets, applied to `frames` to draw the corrected body. */
      corrections?: Array<{
        joint: "knee" | "hip" | "elbow" | "shoulder"
        side: "left" | "right" | "both"
        phase: string
        targetDegrees: number
      }>
      /** Set when the report was saved, which makes the card pinnable. */
      reportId?: string
      /** Everything else the coach said, shown when the card is expanded. */
      notes?: {
        findings: Array<{
          title: string
          detail: string
          severity: string
          confidence: string
          evidence: { measurement: string; value: string; phase?: string }
          cue?: string
        }>
        drills: Array<{ name: string; reason: string }>
        notMeasured: string[]
        checklist?: string[]
      }
      caption?: string
    }
  | {
      type: "interactive_card"
      label: string
      title: string
      detail?: string
      accent: "nutrition" | "training" | "progress" | "neutral"
      elements: CoachInteractiveElement[]
      submit?: {
        type: "log_nutrition"
        label: string
        name: string
        meal: string
        date?: string
        calories: number
        protein: number
        carbs: number
        fat: number
        quantityControlId?: string
        baseQuantity?: number
        mealControlId?: string
        assumptions: string[]
      }
      actions?: Array<{ label: string; action: CoachUiAction }>
    }

export function normalizeCoachUiBlocks(value: unknown): CoachUiBlock[] {
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
    if (row.type === "pose") {
      return Boolean(
        row.title && Array.isArray(row.frames) && row.frames.length > 0
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
    if (row.type === "interactive_card") {
      return Boolean(
        row.label &&
        row.title &&
        Array.isArray(row.elements) &&
        row.elements.length > 0
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

export function normalizeCoachOperations(value: unknown): CoachOperation[] {
  return normalizeSharedCoachOperations(value) as CoachOperation[]
  /* Legacy guards retained temporarily for persisted pre-refactor messages.
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
  }) */
}

export function normalizeCoachArtifacts(value: unknown): CoachArtifact[] {
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

export function validateCoachOperations(operations: CoachOperation[]) {
  return validateSharedCoachOperations(
    operations as Parameters<typeof validateSharedCoachOperations>[0]
  )
  /* Legacy validation retained temporarily for persisted pre-refactor messages.
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
      const supersetCounts = new Map<string, number>()
      for (const exercise of operation.exercises) {
        if (!exercise.supersetGroup) continue
        supersetCounts.set(
          exercise.supersetGroup,
          (supersetCounts.get(exercise.supersetGroup) ?? 0) + 1
        )
      }
      for (const [group, count] of supersetCounts) {
        if (count < 2 || count > 3) {
          errors.push(
            `${operation.name} superset ${group} must contain 2 or 3 exercises.`
          )
        }
      }
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
  return errors */
}

export function expandWorkoutPlanOperations(
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

export function normalizedExerciseName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function bestExerciseMatch(query: string, candidates: Exercise[]) {
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

export function recipeTotals(
  ingredients: CoachRecipeIngredient[],
  servings: number
) {
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

export function RecipeBreakdown({
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

export function CoachOperationResults({
  results,
  onOpenRecipe,
  onOpenWorkouts,
  onStartWorkout,
  onOpenNutrition,
  onOpenProgress,
  onOpenSupplements,
  onUndo,
  onLogRecipe,
  onPinGoal,
  onPinWidget,
  onCreateWidgetFollowUp,
}: {
  results?: CoachOperationResult[]
  onOpenRecipe: (id: string) => void
  onOpenWorkouts: () => void
  onStartWorkout: (presetId: string) => void
  onOpenNutrition: () => void
  onOpenProgress: () => void
  onOpenSupplements: () => void
  onUndo: (id: string) => void
  onLogRecipe: (
    result: Extract<CoachOperationResult, { type: "save_recipe" }>
  ) => void
  onPinGoal: (goalId: string) => Promise<void>
  onPinWidget: (widgetId: string) => Promise<void>
  onCreateWidgetFollowUp: (
    widget: Extract<CoachOperationResult, { type: "save_dashboard_widget" }>
  ) => void
}) {
  const [pinnedGoalIds, setPinnedGoalIds] = useState<Set<string>>(new Set())
  const [pinningWidgetId, setPinningWidgetId] = useState<string | null>(null)
  const [pinnedWidgetIds, setPinnedWidgetIds] = useState<Set<string>>(new Set())
  if (!results?.length) return null

  return (
    <div className="coach-generated-content mt-4 space-y-3">
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

        if (result.type === "save_dashboard_widget") {
          const pinned = result.pinned || pinnedWidgetIds.has(result.widgetId)
          const pinning = pinningWidgetId === result.widgetId
          return (
            <article
              key={`${result.type}-${result.widgetId}`}
              className="border-l-2 border-l-[var(--accent-progress)] bg-foreground/[0.025] px-4 py-4"
            >
              <p className="text-[9px] font-bold tracking-[0.14em] text-muted-foreground/55 uppercase">
                Widget ready · {result.kind}
              </p>
              <div className="mt-1 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[14px] font-bold">{result.title}</h3>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/65">
                    {result.description}
                  </p>
                </div>
                <ChartLineUp
                  size={18}
                  weight="bold"
                  className="shrink-0 text-muted-foreground/45"
                />
              </div>
              <div className="mt-3 border-y border-border/40 py-2.5">
                <p className="text-[11px] font-semibold">
                  Include this compact widget in your dashboard?
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={pinned || pinning}
                    onClick={async () => {
                      setPinningWidgetId(result.widgetId)
                      try {
                        await onPinWidget(result.widgetId)
                        setPinnedWidgetIds((current) =>
                          new Set(current).add(result.widgetId)
                        )
                      } finally {
                        setPinningWidgetId(null)
                      }
                    }}
                    className="motion-tactile min-h-10 bg-foreground px-3 text-[10px] font-bold text-background disabled:opacity-50"
                  >
                    {pinned
                      ? "Added to dashboard"
                      : pinning
                        ? "Adding…"
                        : "Add to dashboard"}
                  </button>
                  <span className="text-[9px] text-muted-foreground">
                    You can remove it from the dashboard anytime.
                  </span>
                </div>
              </div>
              {result.followUpTitle && result.followUpKind ? (
                <button
                  type="button"
                  onClick={() => onCreateWidgetFollowUp(result)}
                  className="motion-tactile mt-3 flex min-h-10 w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-[9px] font-bold tracking-wide text-muted-foreground/55 uppercase">
                      Suggested follow-up
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold">
                      {result.followUpTitle}
                    </span>
                  </span>
                  <ArrowRight size={14} weight="bold" />
                </button>
              ) : null}
              {result.actionId ? (
                <button
                  type="button"
                  onClick={() => onUndo(result.actionId!)}
                  className="mt-2 inline-flex min-h-9 items-center gap-1 text-[9px] text-muted-foreground"
                >
                  <ClockCounterClockwise size={12} /> Remove widget
                </button>
              ) : null}
            </article>
          )
        }

        if (result.type === "save_supplement") {
          const cadence =
            SUPPLEMENT_SCHEDULES.find(
              (option) => option.id === result.schedule.type
            )?.label ?? "No schedule"
          return (
            <div
              key={`${result.type}-${result.supplementId}`}
              className="flex items-center gap-3 border-y border-border/50 py-3.5"
            >
              <Pill
                size={18}
                weight="bold"
                className="shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">
                  {result.brand
                    ? `${result.brand} ${result.name}`
                    : result.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {result.defaultServingQuantity === 1
                    ? result.servingLabel
                    : `${result.defaultServingQuantity} × ${result.servingLabel}`}{" "}
                  · {cadence}
                </span>
              </span>
              <button
                type="button"
                onClick={onOpenSupplements}
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

        if (result.type === "save_progress_metric") {
          return (
            <div
              key={`${result.type}-${result.metricId}`}
              className="coach-generated-content flex items-center gap-3 border-y border-border/50 py-3.5"
            >
              <CheckCircle
                size={18}
                weight="fill"
                className="shrink-0 text-[var(--status-success)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">
                  {result.title} added
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {result.tab} · {result.step} {result.unit} controls
                </span>
              </span>
              <button
                type="button"
                onClick={onOpenProgress}
                className="min-h-9 px-2 text-[10px] font-bold"
              >
                Open Progress
              </button>
              {result.actionId && (
                <button
                  type="button"
                  onClick={() => onUndo(result.actionId!)}
                  aria-label={`Undo ${result.title}`}
                >
                  <ClockCounterClockwise size={17} />
                </button>
              )}
            </div>
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
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {result.scheduledDays.length > 0
                    ? `Every ${result.scheduledDays.join(", ")}`
                    : "Not on your routine — start it whenever"}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  result.scheduledDays.length > 0
                    ? onOpenWorkouts()
                    : onStartWorkout(result.presetId)
                }
                className="min-h-9 px-2 text-[10px] font-bold"
              >
                {result.scheduledDays.length > 0 ? "Open" : "Start"}
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

export function CoachArtifacts({ artifacts }: { artifacts?: CoachArtifact[] }) {
  if (!artifacts?.length) return null
  const labels: Record<CoachArtifact["type"], string> = {
    today_briefing: "Today",
    progress_explanation: "Progress explanation",
    simulation: "Scenario",
    validation: "Plan check",
    recovery_adaptation: "Recovery",
  }
  return (
    <div className="coach-generated-content mt-5 divide-y divide-border/45 border-y border-border/45">
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

export function CoachProposal({
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
  // A Sunday of batch cooking arrives as several recipes at once, and they are
  // approved together — so the preview shows every one of them in full rather
  // than four lines of summary the user has to take on trust.
  const recipes = operations.filter(
    (operation): operation is Extract<CoachOperation, { type: "save_recipe" }> =>
      operation.type === "save_recipe"
  )

  if (recipes.length > 0 && recipes.length === operations.length) {
    const single = recipes.length === 1 ? recipes[0] : null
    const isEdit = Boolean(single?.recipeId)
    const assumptions = [...new Set(recipes.flatMap((item) => item.assumptions))]
    const warnings = [...new Set(recipes.flatMap((item) => item.warnings))]
    return (
      <section className="coach-generated-content mt-5 border-y border-border/55 py-5">
        <p className="text-[10px] font-medium text-muted-foreground">
          {single
            ? "Recipe preview · nothing saved yet"
            : `${recipes.length} recipes · nothing saved yet`}
        </p>
        {recipes.map((recipe, index) => (
          <div
            key={`${recipe.name}-${index}`}
            className={index > 0 ? "mt-6" : undefined}
          >
            <h3 className="mt-1 text-[18px] leading-tight font-bold tracking-tight">
              {recipe.name}
            </h3>
            {recipe.description ? (
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/65">
                {recipe.description}
              </p>
            ) : null}
            <RecipeBreakdown recipe={recipe} />
            {recipe.logMeal ? (
              <p className="mt-3 text-[10px] text-muted-foreground">
                Saving will also log {recipe.servingsToLog ?? 1} serving
                {(recipe.servingsToLog ?? 1) === 1 ? "" : "s"} to{" "}
                {recipe.logMeal}.
              </p>
            ) : null}
          </div>
        ))}
        {assumptions.length > 0 ? (
          <div className="mt-5 border-l border-border/70 pl-3">
            <p className="text-[10px] font-medium">Based on</p>
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
            className="mt-3 flex gap-1.5 text-[10px] text-amber-700 dark:text-amber-300"
          >
            <WarningCircle size={13} className="shrink-0" /> {warning}
          </p>
        ))}
        <div className="mt-5 border-t border-border/45 pt-4">
          <p className="text-[13px] font-semibold">
            {single
              ? isEdit
                ? "Does this update look right?"
                : "Like this recipe?"
              : "Cook this set?"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {single
              ? isEdit
                ? "Your existing recipe changes only after you confirm."
                : "Add it to Recipes only if it fits what you wanted."
              : "They save together. Ask for changes instead if one of them is wrong."}
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
                : single
                  ? isEdit
                    ? "Update recipe"
                    : "Save to Recipes"
                  : `Save ${recipes.length} recipes`}
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

  // Plans are expanded server-side before they run; preview them the same way so a
  // week of training shows its actual presets instead of one line of prose.
  const previewOperations = expandWorkoutPlanOperations(operations)
  const assumptions = [
    ...new Set(operations.flatMap((item) => item.assumptions)),
  ]
  const warnings = [...new Set(operations.flatMap((item) => item.warnings))]
  return (
    <section className="coach-generated-content mt-5 border-y border-border/55 py-4">
      <p className="text-[10px] font-medium text-muted-foreground">
        Review changes
      </p>
      <div className="mt-3 space-y-2">
        {previewOperations.map((operation, index) => {
          if (operation.type === "create_workout_preset") {
            const setCount = operation.exercises.reduce(
              (total, exercise) => total + exercise.sets.length,
              0
            )
            return (
              <div
                key={`${operation.type}-${index}`}
                className="flex gap-2 text-[12px]"
              >
                <Barbell
                  size={15}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{operation.name}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {operation.exercises.length} exercise
                    {operation.exercises.length === 1 ? "" : "s"} · {setCount}{" "}
                    set{setCount === 1 ? "" : "s"} ·{" "}
                    {operation.scheduleDays.length > 0
                      ? `every ${operation.scheduleDays.join(", ")}`
                      : "one-off, not scheduled"}
                  </span>
                  {operation.exercises.map((exercise) => (
                    <span
                      key={exercise.name}
                      className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground"
                    >
                      <span className="truncate">{exercise.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {exercise.sets.length} × {exercise.sets[0]?.reps || "—"}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            )
          }
          // A plan turn carries its recipes alongside the targets and the
          // week. Summarising them here would ask for approval on four
          // recipes nobody has read.
          if (operation.type === "save_recipe") {
            return (
              <div key={`${operation.type}-${index}`} className="pt-1">
                <p className="text-[13px] font-bold">{operation.name}</p>
                <RecipeBreakdown recipe={operation} />
              </div>
            )
          }
          return (
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
          )
        })}
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

export function CoachInteractiveCard({
  block,
  onAction,
  onSubmit,
}: {
  block: Extract<CoachUiBlock, { type: "interactive_card" }>
  onAction: (action: CoachUiAction) => void
  onSubmit: (
    operation: Extract<CoachOperation, { type: "log_nutrition" }>
  ) => Promise<void>
}) {
  const initialValues = useMemo(
    () =>
      Object.fromEntries(
        block.elements.flatMap((element) =>
          element.type === "stepper" ||
          element.type === "range" ||
          element.type === "choice" ||
          element.type === "rating" ||
          element.type === "toggle"
            ? [[element.id, element.value]]
            : []
        )
      ) as Record<string, number | string | boolean>,
    [block.elements]
  )
  const [values, setValues] = useState(initialValues)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const accentClass = {
    nutrition: "border-l-amber-500/70",
    training: "border-l-sky-500/70",
    progress: "border-l-emerald-500/70",
    neutral: "border-l-foreground/35",
  }[block.accent]

  function scaleFor(controlId?: string, baseQuantity?: number) {
    if (!controlId) return 1
    const current = values[controlId]
    const initial = initialValues[controlId]
    if (typeof current !== "number") return 1
    const base =
      typeof baseQuantity === "number"
        ? baseQuantity
        : typeof initial === "number" && initial > 0
          ? initial
          : 1
    return Math.max(0, current / base)
  }

  function displayNumber(value: number) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: value < 10 ? 1 : 0,
    }).format(value)
  }

  async function submit() {
    if (!block.submit || submitting || submitted) return
    setSubmitting(true)
    const factor = scaleFor(
      block.submit.quantityControlId,
      block.submit.baseQuantity
    )
    const selectedMeal = block.submit.mealControlId
      ? values[block.submit.mealControlId]
      : undefined
    try {
      await onSubmit({
        type: "log_nutrition",
        confirmation: "auto",
        summary: `Log ${block.submit.name}`,
        assumptions: block.submit.assumptions,
        warnings: [],
        name: block.submit.name,
        meal:
          typeof selectedMeal === "string" ? selectedMeal : block.submit.meal,
        ...(block.submit.date ? { date: block.submit.date } : {}),
        calories: Math.round(block.submit.calories * factor),
        protein: Math.round(block.submit.protein * factor * 10) / 10,
        carbs: Math.round(block.submit.carbs * factor * 10) / 10,
        fat: Math.round(block.submit.fat * factor * 10) / 10,
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      className={cn(
        "my-4 border-l-2 bg-foreground/[0.025] px-4 py-4",
        accentClass
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-bold tracking-[0.16em] text-muted-foreground/60 uppercase">
            {block.label}
          </p>
          <h3 className="mt-1 text-[15px] leading-tight font-bold">
            {block.title}
          </h3>
          {block.detail ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
              {block.detail}
            </p>
          ) : null}
        </div>
        <Sparkle
          size={17}
          weight="fill"
          className="mt-0.5 shrink-0 text-muted-foreground/35"
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 divide-y divide-border/35 border-y border-border/35">
        {block.elements.map((element, elementIndex) => {
          if (element.type === "text") {
            return (
              <p
                key={`${element.type}-${elementIndex}`}
                className={cn(
                  "py-3 text-[11px] leading-relaxed",
                  element.emphasis === "strong"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground/70"
                )}
              >
                {element.text}
              </p>
            )
          }

          if (element.type === "section") {
            return (
              <header
                key={`${element.type}-${elementIndex}`}
                className="py-3.5"
              >
                <h4 className="text-[12px] font-bold">{element.title}</h4>
                {element.detail ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/65">
                    {element.detail}
                  </p>
                ) : null}
              </header>
            )
          }

          if (element.type === "divider") {
            return (
              <div
                key={`${element.type}-${elementIndex}`}
                className="flex items-center gap-2 py-2"
                aria-hidden={!element.label}
              >
                <span className="h-px flex-1 bg-border/55" />
                {element.label ? (
                  <span className="text-[8px] font-bold tracking-[0.14em] text-muted-foreground/50 uppercase">
                    {element.label}
                  </span>
                ) : null}
                <span className="h-px flex-1 bg-border/55" />
              </div>
            )
          }

          if (element.type === "key_value") {
            return (
              <dl
                key={`${element.type}-${elementIndex}`}
                className="divide-y divide-border/30 py-1"
              >
                {element.items.map((item) => (
                  <div
                    key={`${item.label}-${item.value}`}
                    className="flex items-start justify-between gap-5 py-2.5"
                  >
                    <dt>
                      <span className="block text-[10px] font-semibold text-muted-foreground">
                        {item.label}
                      </span>
                      {item.detail ? (
                        <span className="mt-0.5 block text-[9px] text-muted-foreground/50">
                          {item.detail}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="text-right text-[11px] font-bold tabular-nums">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )
          }

          if (element.type === "progress") {
            const percentage = Math.min(
              100,
              Math.max(0, (element.value / element.max) * 100)
            )
            return (
              <div key={`${element.type}-${elementIndex}`} className="py-3.5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold">{element.label}</p>
                    {element.detail ? (
                      <p className="mt-0.5 text-[9px] text-muted-foreground/55">
                        {element.detail}
                      </p>
                    ) : null}
                  </div>
                  <output className="text-[11px] font-bold tabular-nums">
                    {displayNumber(element.value)} /{" "}
                    {displayNumber(element.max)} {element.unit ?? ""}
                  </output>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden bg-foreground/10"
                  role="progressbar"
                  aria-label={element.label}
                  aria-valuenow={element.value}
                  aria-valuemin={0}
                  aria-valuemax={element.max}
                >
                  <span
                    className="block h-full bg-foreground transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          }

          if (element.type === "list") {
            return (
              <ol
                key={`${element.type}-${elementIndex}`}
                className="divide-y divide-border/30 py-1"
              >
                {element.items.map((item, itemIndex) => (
                  <li
                    key={`${item.title}-${itemIndex}`}
                    className="relative flex gap-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center text-[8px] font-bold",
                        element.style === "timeline"
                          ? "rounded-full border border-foreground/35"
                          : "text-muted-foreground"
                      )}
                    >
                      {element.style === "number"
                        ? itemIndex + 1
                        : element.style === "timeline"
                          ? ""
                          : "•"}
                    </span>
                    <span>
                      <span className="block text-[11px] font-semibold">
                        {item.title}
                      </span>
                      {item.detail ? (
                        <span className="mt-0.5 block text-[9px] leading-relaxed text-muted-foreground/60">
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )
          }

          if (element.type === "metric_group") {
            return (
              <div
                key={`${element.type}-${elementIndex}`}
                className="grid grid-cols-2 gap-x-5 gap-y-3 py-3.5 sm:grid-cols-4"
              >
                {element.metrics.map((metric) => {
                  const value =
                    metric.value * scaleFor(metric.scaleWith, undefined)
                  return (
                    <div key={`${metric.label}-${metric.unit ?? ""}`}>
                      <p className="text-[9px] font-semibold tracking-wide text-muted-foreground/60 uppercase">
                        {metric.label}
                      </p>
                      <p className="mt-1 text-[17px] leading-none font-bold tabular-nums">
                        {displayNumber(value)}
                        {metric.unit ? (
                          <span className="ml-0.5 text-[9px] font-semibold text-muted-foreground">
                            {metric.unit}
                          </span>
                        ) : null}
                      </p>
                      {metric.detail ? (
                        <p className="mt-1 text-[9px] text-muted-foreground/55">
                          {metric.detail}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          }

          if (element.type === "stepper") {
            const current =
              typeof values[element.id] === "number"
                ? (values[element.id] as number)
                : element.value
            const update = (direction: -1 | 1) => {
              hapticSelection()
              setValues((existing) => ({
                ...existing,
                [element.id]: Math.max(
                  element.min,
                  Math.min(
                    element.max,
                    Math.round((current + direction * element.step) * 1000) /
                      1000
                  )
                ),
              }))
            }
            return (
              <div
                key={element.id}
                className="flex min-h-14 items-center justify-between gap-4 py-2.5"
              >
                <p className="text-[11px] font-semibold">{element.label}</p>
                <div className="flex items-center border border-border/60 bg-background/55">
                  <button
                    type="button"
                    onClick={() => update(-1)}
                    disabled={current <= element.min || submitted}
                    className="motion-tactile grid size-9 place-items-center disabled:opacity-25"
                    aria-label={`Decrease ${element.label}`}
                  >
                    <Minus size={13} weight="bold" />
                  </button>
                  <output
                    aria-live="polite"
                    className="min-w-16 border-x border-border/45 px-2 text-center text-[12px] font-bold tabular-nums"
                  >
                    {displayNumber(current)} {element.unit ?? ""}
                  </output>
                  <button
                    type="button"
                    onClick={() => update(1)}
                    disabled={current >= element.max || submitted}
                    className="motion-tactile grid size-9 place-items-center disabled:opacity-25"
                    aria-label={`Increase ${element.label}`}
                  >
                    <Plus size={13} weight="bold" />
                  </button>
                </div>
              </div>
            )
          }

          if (element.type === "range") {
            const current =
              typeof values[element.id] === "number"
                ? (values[element.id] as number)
                : element.value
            return (
              <div key={element.id} className="py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor={`coach-range-${element.id}`}
                    className="text-[10px] font-semibold"
                  >
                    {element.label}
                  </label>
                  <output className="text-[12px] font-bold tabular-nums">
                    {displayNumber(current)} {element.unit ?? ""}
                  </output>
                </div>
                <input
                  id={`coach-range-${element.id}`}
                  type="range"
                  min={element.min}
                  max={element.max}
                  step={element.step}
                  value={current}
                  disabled={submitted}
                  onChange={(event) => {
                    hapticSelection()
                    setValues((existing) => ({
                      ...existing,
                      [element.id]: Number(event.target.value),
                    }))
                  }}
                  className="mt-3 h-8 w-full cursor-pointer accent-foreground disabled:opacity-40"
                />
                {(element.lowLabel || element.highLabel) && (
                  <div className="-mt-1 flex justify-between text-[8px] font-medium text-muted-foreground/55">
                    <span>{element.lowLabel}</span>
                    <span>{element.highLabel}</span>
                  </div>
                )}
              </div>
            )
          }

          if (element.type === "choice") {
            return (
              <fieldset key={element.id} className="py-3">
                <legend className="text-[10px] font-semibold text-muted-foreground">
                  {element.label}
                </legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {element.options.map((option) => {
                    const selected = values[element.id] === option
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={submitted}
                        aria-pressed={selected}
                        onClick={() => {
                          hapticSelection()
                          setValues((existing) => ({
                            ...existing,
                            [element.id]: option,
                          }))
                        }}
                        className={cn(
                          "motion-tactile min-h-9 border px-3 text-[10px] font-bold transition-colors",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/60 text-muted-foreground"
                        )}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )
          }

          if (element.type === "rating") {
            const current =
              typeof values[element.id] === "number"
                ? (values[element.id] as number)
                : element.value
            return (
              <fieldset key={element.id} className="py-3.5">
                <legend className="text-[10px] font-semibold">
                  {element.label}
                </legend>
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  {Array.from(
                    { length: element.max },
                    (_, index) => index + 1
                  ).map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      disabled={submitted}
                      aria-label={`${element.label}: ${rating} of ${element.max}`}
                      aria-pressed={current === rating}
                      onClick={() => {
                        hapticSelection()
                        setValues((existing) => ({
                          ...existing,
                          [element.id]: rating,
                        }))
                      }}
                      className={cn(
                        "motion-tactile grid min-h-9 flex-1 place-items-center border text-[10px] font-bold",
                        rating <= current
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 text-muted-foreground"
                      )}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                {(element.lowLabel || element.highLabel) && (
                  <div className="mt-1.5 flex justify-between text-[8px] text-muted-foreground/55">
                    <span>{element.lowLabel}</span>
                    <span>{element.highLabel}</span>
                  </div>
                )}
              </fieldset>
            )
          }

          const enabled = Boolean(values[element.id])
          return (
            <button
              key={element.id}
              type="button"
              disabled={submitted}
              aria-pressed={enabled}
              onClick={() => {
                hapticSelection()
                setValues((existing) => ({
                  ...existing,
                  [element.id]: !enabled,
                }))
              }}
              className="flex min-h-14 w-full items-center justify-between gap-4 py-2.5 text-left"
            >
              <span>
                <span className="block text-[11px] font-semibold">
                  {element.label}
                </span>
                {element.detail ? (
                  <span className="mt-0.5 block text-[9px] text-muted-foreground">
                    {element.detail}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 border transition-colors",
                  enabled
                    ? "border-foreground bg-foreground"
                    : "border-border bg-background"
                )}
                aria-hidden="true"
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-3.5 bg-background transition-transform",
                    enabled ? "translate-x-[17px]" : "translate-x-0.5"
                  )}
                />
              </span>
            </button>
          )
        })}
      </div>

      {(block.submit || block.actions?.length) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {block.submit ? (
            <button
              type="button"
              disabled={submitting || submitted}
              onClick={() => void submit()}
              className="motion-tactile min-h-11 bg-foreground px-4 text-[11px] font-bold text-background disabled:opacity-55"
            >
              {submitted
                ? "Logged"
                : submitting
                  ? "Logging…"
                  : block.submit.label}
            </button>
          ) : null}
          {block.actions?.map((action) => (
            <button
              key={`${action.action}-${action.label}`}
              type="button"
              onClick={() => onAction(action.action)}
              className="motion-tactile min-h-10 border-b border-foreground/30 text-[10px] font-bold"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {block.submit?.assumptions.length ? (
        <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground/55">
          Estimate: {block.submit.assumptions.join(" · ")}
        </p>
      ) : null}
    </section>
  )
}

function CoachPoseBlock({
  block,
}: {
  block: Extract<CoachUiBlock, { type: "pose" }>
}) {
  const [expanded, setExpanded] = useState(false)
  const pose = block.frames.map((frame) => ({
    timeMs: frame.timeMs,
    worldLandmarks: frame.worldLandmarks.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility ?? 1,
    })),
  }))
  const corrections = (block.corrections ?? []) as PoseCorrection[]

  // Without a saved report there is nothing to pin to, so the scene stands on
  // its own rather than offering an action that cannot work.
  if (!block.reportId) {
    return (
      <div className="py-4">
        <p className="text-[12px] font-bold text-foreground">{block.title}</p>
        {block.detail && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground/75">
            {block.detail}
          </p>
        )}
        <div className="relative mt-3 overflow-hidden rounded-[18px] bg-[#0c0c0c]">
          <FormCoachPoseScene
            pose={pose}
            corrections={corrections}
            className="h-[220px] w-full"
          />
          <ExpandPoseButton onExpand={() => setExpanded(true)} />
        </div>
        {expanded && (
          <PoseExpandModal
            exerciseName={block.title}
            pose={pose}
            corrections={corrections}
            onClose={() => setExpanded(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="py-4">
      <FormCoachCard
        reportId={block.reportId as Id<"formCoachReports">}
        exerciseName={block.title}
        summary={block.detail ?? ""}
        pose={pose}
        corrections={corrections}
        detail={block.notes}
      />
    </div>
  )
}

export function CoachUiBlocks({
  blocks,
  onAction,
  onPinGoal,
  onSubmitInteractive,
}: {
  blocks?: CoachUiBlock[]
  onAction: (action: CoachUiAction) => void
  onSubmitInteractive: (
    operation: Extract<CoachOperation, { type: "log_nutrition" }>
  ) => Promise<void>
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
    <div className="coach-generated-content mt-5 divide-y divide-border/45 border-y border-border/45">
      {blocks.map((block, index) => {
        if (block.type === "pose") {
          return <CoachPoseBlock key={`${block.type}-${index}`} block={block} />
        }

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
          // A checklist can be pinned for today or for the week. Both write the
          // same tasks, so pinning either one closes off the other.
          const todayKey = `${goalKey}:today`
          const weekKey = `${goalKey}:7d`
          const pinned =
            pinnedGoalKeys.has(todayKey) || pinnedGoalKeys.has(weekKey)
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
              {pinned ? (
                <p className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <PushPin size={13} weight="fill" />
                  Pinned to Today
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                  {[
                    {
                      key: todayKey,
                      label: "Pin for today",
                      detail: "Complete this Coach plan today.",
                      durationDays: 1,
                    },
                    {
                      key: weekKey,
                      label: "Pin as a 7-day goal",
                      detail:
                        "Complete this Coach plan consistently for the next 7 days.",
                      durationDays: 7,
                    },
                  ].map((variant) => (
                    <button
                      key={variant.key}
                      type="button"
                      disabled={pinningGoalKey !== null}
                      onClick={() =>
                        void pinGoal(variant.key, {
                          title: block.title,
                          detail: variant.detail,
                          durationDays: variant.durationDays,
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
                      className="motion-tactile inline-flex min-h-10 items-center gap-1.5 border-b border-foreground/30 text-[11px] font-semibold disabled:opacity-50"
                    >
                      <PushPin size={13} weight="bold" />
                      {pinningGoalKey === variant.key
                        ? "Pinning…"
                        : variant.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }

        if (block.type === "interactive_card") {
          return (
            <CoachInteractiveCard
              key={`${block.type}-${index}-${block.title}`}
              block={block}
              onAction={onAction}
              onSubmit={onSubmitInteractive}
            />
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
export const COACH_THINKING_MESSAGES = [
  "Reviewing recent signals…",
  "Checking your recent patterns…",
  "Comparing the options against your goals…",
  "Connecting the useful details…",
  "Looking for the clearest next step…",
  "Pressure-testing the recommendation…",
  "Preparing a practical response…",
] as const

export function ThinkingIndicator() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % COACH_THINKING_MESSAGES.length)
      if (document.visibilityState === "visible") hapticSelection()
    }, 2400)

    return () => window.clearInterval(interval)
  }, [])

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
        <p className="text-[11px] font-medium" aria-hidden="true">
          {COACH_THINKING_MESSAGES[messageIndex]}
        </p>
      </div>
    </div>
  )
}

/**
 * Owns the Coach image attachment lifecycle: local preview, downscale, upload
 * to Convex storage, and registration. Shared by the Coach page and the
 * onboarding Coach setup stage so both get identical upload semantics.
 *
 * `attachmentRef` mirrors state so a send handler can read the current
 * attachment synchronously without waiting for a re-render.
 */
export function useCoachAttachment() {
  const discardCoachUpload = useMutation(api.uploads.discard)
  const [attachment, setAttachment] = useState<CoachAttachment | null>(null)
  const attachmentRef = useRef<CoachAttachment | null>(null)
  const uploadRequestRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      void discardCoachUpload({ uploadId: current.id }).catch(() => undefined)
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
      const uploadId = await uploadOwnedFile(
        prepared,
        "coach_image",
        prepared.name
      )
      if (requestId !== uploadRequestRef.current) {
        await discardCoachUpload({ uploadId }).catch(() => undefined)
        return
      }
      setActiveAttachment({
        id: uploadId,
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

  return {
    attachment,
    attachmentRef,
    fileInputRef,
    attachImage,
    clearAttachment,
    openImagePicker: () => fileInputRef.current?.click(),
  }
}

export function CoachAttachmentInput({
  inputRef,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (file: File) => void
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        if (file) onSelect(file)
      }}
    />
  )
}

export function CoachAttachmentPreview({
  attachment,
  onRemove,
  className,
}: {
  attachment: CoachAttachment | null
  onRemove: () => void
  className?: string
}) {
  if (!attachment) return null
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-3 rounded-xl bg-muted/55 p-2",
        className
      )}
    >
      <img
        src={attachment.previewUrl}
        alt="Selected Coach attachment"
        className="size-12 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-black">{attachment.fileName}</p>
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
        onClick={onRemove}
        aria-label="Remove attached image"
        className="motion-tactile flex size-9 shrink-0 items-center justify-center rounded-full bg-background"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  )
}

export function CoachAttachButton({
  onClick,
  disabled,
  className,
  /** Set when the button sits in a menu and has room to say what it does. */
  label,
}: {
  onClick: () => void
  disabled?: boolean
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Attach a picture"
      className={cn(
        "motion-tactile flex shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-35",
        label ? "min-h-10" : "size-11",
        className
      )}
    >
      <ImageSquare size={label ? 16 : 18} weight="bold" />
      {label}
    </button>
  )
}
