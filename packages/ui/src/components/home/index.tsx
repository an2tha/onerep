import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowRight,
  Barbell,
  CheckCircle,
  Circle,
  Fire,
  ForkKnife,
  Lightning,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  PencilSimple,
  Pill,
  PintGlass,
  PushPin,
  X,
} from "@phosphor-icons/react"
import { useAnimatedNumber } from "../../hooks/use-animated-number"
import { cn } from "../../lib/utils"
import { GroupedList, SectionHeader } from "../mobile-ui"
import { SlideToDeleteRow } from "../slide-to-delete-row"

export * from "./dashboard-intelligence"
export * from "./coach-dashboard-widgets"

export type DashboardBriefingView = {
  action: string
  title: string
  detail: string
  actionLabel: string
}

export type MacroProgress = {
  label: string
  shortLabel: string
  value: number
  target: number
  color: string
  unit?: string
}

export type DashboardQuickAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  tone?: "food" | "water" | "workout" | "default"
  badge?: string
}

export type WorkoutWeekDay = {
  date: string
  label: string
  hasWorkout: boolean
  isToday: boolean
}

export type MealCadenceSlot = {
  id: string
  label: string
  logged: boolean
}

export type RecoveryProgress = {
  score: number
  proteinPercent: number
  waterPercent: number
}

export type PinnedCoachGoal = {
  _id: string
  title: string
  description?: string
  startDate: string
  endDate: string
  durationDays: number
  status: "active" | "completed"
  tasks: Array<{
    _id: string
    title: string
    detail?: string
    completed: boolean
  }>
}

function pct(current: number, target: number) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n))
}

export function TodayHeader({
  dateLabel,
  salutation,
  firstName,
  action,
}: {
  dateLabel: string
  salutation: string
  firstName: string
  action?: ReactNode
}) {
  return (
    <header className="motion-item app-header flex items-start justify-between gap-3 px-[var(--app-page-x)] md:px-8">
      <div className="min-w-0">
        <p className="app-eyebrow truncate">{dateLabel}</p>
        <h1 className="app-title max-w-[18ch] md:max-w-none">
          {salutation}, {firstName}.
        </h1>
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </header>
  )
}

function quickActionTone(tone: DashboardQuickAction["tone"]) {
  if (tone === "food")
    return "bg-[var(--accent-food-bg)] text-[var(--accent-food)]"
  if (tone === "water")
    return "bg-[var(--accent-water-bg)] text-[var(--accent-water)]"
  if (tone === "workout") return "bg-muted text-foreground"
  return "bg-muted/55 text-muted-foreground"
}

export function DashboardQuickActions({
  actions,
}: {
  actions: DashboardQuickAction[]
}) {
  return (
    <nav
      aria-label="Quick actions"
      className="mx-[var(--app-page-x)] mt-4 flex gap-2 overflow-x-auto pb-1 md:mx-8"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          className="native-toolbar-button min-w-max border border-border bg-card"
        >
          <span className={quickActionTone(action.tone)}>{action.icon}</span>
          <span>{action.label}</span>
          {action.badge && (
            <span className="native-row-detail">{action.badge}</span>
          )}
        </button>
      ))}
    </nav>
  )
}

export function NextStepCard({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <section className="mx-[var(--app-page-x)] mt-4 rounded-2xl bg-foreground p-4 text-background md:mx-8">
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase opacity-60">
        Next step
      </p>
      <h2 className="mt-1 text-[20px] font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed opacity-70">{detail}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 flex min-h-12 w-full items-center justify-between rounded-xl bg-background px-4 text-[15px] font-bold text-foreground active:opacity-85"
      >
        {actionLabel}
        <ArrowRight size={18} weight="bold" />
      </button>
    </section>
  )
}

export type TodayChecklistItem = {
  id: string
  label: string
  detail: string
  completed: boolean
  onClick: () => void
}

export function TodayChecklist({ items }: { items: TodayChecklistItem[] }) {
  const remaining = items.filter((item) => !item.completed)
  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8">
      <SectionHeader title="Still to do today" className="px-0 pt-0 pb-2" />
      <GroupedList className="mt-2">
        {(remaining.length > 0 ? remaining : items.slice(0, 1)).map(
          (item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 bg-card px-3.5 text-left",
                index > 0 && "border-t border-border/40"
              )}
            >
              <CheckCircle
                size={20}
                weight={item.completed ? "fill" : "regular"}
                className={
                  item.completed
                    ? "text-[var(--status-success)]"
                    : "text-muted-foreground"
                }
              />
              <span className="min-w-0 flex-1">
                <span className="native-row-title block">
                  {item.completed ? "You're all caught up" : item.label}
                </span>
                <span className="native-row-detail block">
                  {item.completed
                    ? "Nothing important is waiting"
                    : item.detail}
                </span>
              </span>
              {!item.completed && (
                <ArrowRight size={17} className="text-muted-foreground" />
              )}
            </button>
          )
        )}
      </GroupedList>
    </section>
  )
}

export function WorkoutWeekStrip({
  days,
  onClick,
}: {
  days: WorkoutWeekDay[]
  onClick: () => void
}) {
  const workoutCount = days.filter((day) => day.hasWorkout).length

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Training this week: ${workoutCount} completed workout${workoutCount === 1 ? "" : "s"}. Open training history.`}
      className="mx-[var(--app-page-x)] mt-5 block w-[calc(100%-2*var(--app-page-x))] border-y border-border py-4 text-left active:bg-muted md:mx-8 md:w-[calc(100%-4rem)]"
    >
      <span className="flex items-center justify-between gap-4">
        <span>
          <span className="native-section-title block">Training this week</span>
          <span className="native-row-detail mt-0.5 block">
            {workoutCount > 0
              ? `${workoutCount} completed session${workoutCount === 1 ? "" : "s"}`
              : "No sessions completed yet"}
          </span>
        </span>
        <ArrowRight size={19} className="shrink-0 text-muted-foreground" />
      </span>

      <span className="mt-4 grid grid-cols-7 gap-2" aria-hidden="true">
        {days.map((day) => (
          <span
            key={day.date}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1.5 text-center",
              day.isToday ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="text-[13px] font-semibold">{day.label}</span>
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold tabular-nums",
                day.hasWorkout
                  ? "border-[var(--accent-workout)] bg-[var(--accent-workout)] text-background"
                  : "border-border bg-muted/40 text-muted-foreground",
                day.isToday &&
                  !day.hasWorkout &&
                  "border-foreground text-foreground"
              )}
            >
              {day.hasWorkout ? (
                <Barbell size={15} weight="bold" />
              ) : (
                Number(day.date.slice(-2))
              )}
            </span>
          </span>
        ))}
      </span>
    </button>
  )
}

function calendarDayDistance(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

export function CoachGoalCards({
  goals,
  today,
  onToggleTask,
  onRequestUnpin,
}: {
  goals: PinnedCoachGoal[]
  today: string
  onToggleTask: (taskId: string, completed: boolean) => void
  onRequestUnpin: (goalId: string) => void
}) {
  if (goals.length === 0) return null

  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8 md:mt-6">
      <p className="native-section-title mb-2">Coach goals</p>
      <div className={cn("grid gap-3", goals.length > 1 && "md:grid-cols-2")}>
        {goals.map((goal) => {
          const completed = goal.tasks.filter((task) => task.completed).length
          const progress =
            goal.tasks.length > 0
              ? Math.round((completed / goal.tasks.length) * 100)
              : 0
          const remaining = Math.max(
            0,
            calendarDayDistance(today, goal.endDate) + 1
          )
          const timing =
            goal.status === "completed"
              ? "Complete"
              : remaining === 0
                ? "Ends today"
                : `${remaining} day${remaining === 1 ? "" : "s"} left`

          return (
            <article
              key={goal._id}
              className="coach-goal-card"
              data-layout={goals.length === 1 ? "wide" : "compact"}
            >
              <div className="coach-goal-card-content relative z-10">
                <div className="coach-goal-summary">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[18px] leading-tight font-bold tracking-tight text-white">
                        {goal.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRequestUnpin(goal._id)}
                      aria-label={`Unpin ${goal.title} from Today`}
                      className="motion-tactile flex size-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/65 active:bg-white/12"
                    >
                      <PushPin size={15} weight="fill" />
                    </button>
                  </div>
                  {goal.description ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-white/60">
                      {goal.description}
                    </p>
                  ) : null}
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-white/88">
                        {completed} of {goal.tasks.length} done
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/45">
                        {timing}
                      </p>
                    </div>
                    <span className="text-[16px] font-bold text-white tabular-nums">
                      {progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white/75 transition-[width] duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="coach-goal-task-list mt-4 divide-y divide-white/10 border-y border-white/10">
                  {goal.tasks.map((task) => (
                    <button
                      key={task._id}
                      type="button"
                      aria-pressed={task.completed}
                      onClick={() => onToggleTask(task._id, !task.completed)}
                      className="motion-tactile flex min-h-12 w-full items-start gap-2.5 py-2.5 text-left active:bg-white/[0.04]"
                    >
                      {task.completed ? (
                        <CheckCircle
                          size={17}
                          weight="fill"
                          className="mt-0.5 shrink-0 text-white/88"
                        />
                      ) : (
                        <Circle
                          size={17}
                          className="mt-0.5 shrink-0 text-white/35"
                        />
                      )}
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-[13px] leading-snug font-semibold text-white/88",
                            task.completed && "text-white/45 line-through"
                          )}
                        >
                          {task.title}
                        </span>
                        {task.detail ? (
                          <span className="mt-0.5 block text-[11px] leading-snug text-white/44">
                            {task.detail}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CalorieRing({
  caloriesLeft,
  caloriesPct,
  overTarget,
}: {
  caloriesLeft: number
  caloriesPct: number
  overTarget: boolean
}) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const swept = circumference * Math.min(1, caloriesPct / 100)
  const animatedLeft = useAnimatedNumber(caloriesLeft)

  // One pulse on the upward crossing only — Nutrition already owns the
  // full-screen calorie takeover, so a second celebration here is duplication.
  const reachedGoal = caloriesPct >= 100 && !overTarget
  const previouslyReached = useRef(reachedGoal)
  const [completePulse, setCompletePulse] = useState(false)
  useEffect(() => {
    if (reachedGoal && !previouslyReached.current) setCompletePulse(true)
    previouslyReached.current = reachedGoal
  }, [reachedGoal])

  return (
    <div className="relative h-[128px] w-[128px] shrink-0">
      <svg
        viewBox="0 0 128 128"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="11"
          className="stroke-foreground/[0.09]"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - swept}
          className={cn(
            "motion-ring-progress",
            completePulse && "motion-ring-complete"
          )}
          onAnimationEnd={() => setCompletePulse(false)}
          style={{
            stroke: overTarget
              ? "var(--status-danger)"
              : "color-mix(in srgb, var(--foreground) 52%, transparent)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {fmt(Math.abs(animatedLeft))}
        </span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">
          kcal {overTarget ? "over" : "left"}
        </span>
      </div>
    </div>
  )
}

export function DailyLedgerHero({
  caloriesLeft,
  caloriesTarget,
  macros = [],
  supplementCalories = 0,
  briefing,
  onBriefingAction,
  onBriefingDismiss,
  showBriefingAction = true,
  className,
}: {
  caloriesLeft: number
  caloriesTarget: number
  macros?: MacroProgress[]
  /** Folded into the totals above; shown so the figures reconcile with the meal list. */
  supplementCalories?: number
  briefing: DashboardBriefingView
  onBriefingAction: () => void
  onBriefingDismiss?: () => void
  showBriefingAction?: boolean
  className?: string
}) {
  const consumed = Math.max(0, caloriesTarget - caloriesLeft)
  const caloriesPct = pct(consumed, caloriesTarget)
  const overTarget = caloriesLeft < 0

  return (
    <div className={cn("mx-[var(--app-page-x)] md:mx-8", className)}>
      <section className="dashboard-ledger-card rounded-[22px] border border-border/70 px-4 py-5">
        {/* Calories + macros */}
        <div className="flex items-center gap-5">
          <CalorieRing
            caloriesLeft={caloriesLeft}
            caloriesPct={caloriesPct}
            overTarget={overTarget}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            {macros.map((macro) => {
              const macroPct = pct(macro.value, macro.target)
              return (
                <div key={macro.label} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {macro.shortLabel}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {fmt(macro.value)}
                      <span className="font-medium text-muted-foreground">
                        {" "}
                        / {fmt(macro.target)}
                        {macro.unit ?? "g"}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-foreground/[0.08]">
                    <div
                      className="motion-bar-fill h-full w-full rounded-full"
                      style={{
                        transform: `scaleX(${macroPct / 100})`,
                        backgroundColor: macro.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {/* Without this, the totals disagree with the sum of the visible meal
            entries and read as a bug. */}
        {supplementCalories > 0 && (
          <p className="mt-3.5 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground tabular-nums">
            Includes {fmt(Math.round(supplementCalories))} kcal from supplements
          </p>
        )}
      </section>

      {/* Briefing banner */}
      {showBriefingAction && (
        <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-foreground py-2.5 pr-2.5 pl-4">
          <Lightning
            size={16}
            weight="fill"
            className="shrink-0 text-background/80"
          />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-background">
            {briefing.title}
          </p>
          <button
            type="button"
            onClick={onBriefingAction}
            className="shrink-0 rounded-full bg-background px-3.5 py-2 text-[12px] font-semibold text-foreground transition-transform active:scale-95"
          >
            {briefing.actionLabel}
          </button>
          {onBriefingDismiss && (
            <button
              type="button"
              onClick={onBriefingDismiss}
              aria-label="Dismiss suggestion"
              className="grid size-9 shrink-0 place-items-center rounded-full text-background/50 active:text-background"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export type WeeklyPlanDayView = {
  day: string
  workoutPresetId?: string
  workoutLabel?: string
  meals: Array<{ label: string; recipeId?: string; note?: string }>
  recoveryNote?: string
}

/**
 * The Coach's weekly plan, as read back on Today.
 *
 * Today's row is expanded because that is the only day being acted on; the rest
 * collapse to a single line so a seven-day plan doesn't dominate the dashboard.
 */
export function WeeklyPlanCard({
  title,
  today,
  days,
  assumptions,
  onOpenPreset,
  onOpenRecipe,
  onAskCoach,
  className,
}: {
  title: string
  /** Three-letter day key for today, matching the `day` field on each row. */
  today: string
  days: WeeklyPlanDayView[]
  assumptions: string[]
  onOpenPreset?: (presetId: string) => void
  onOpenRecipe?: (recipeId: string) => void
  onAskCoach: () => void
  className?: string
}) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const todayKey = today.slice(0, 3).toLowerCase()

  return (
    <section className={cn("mx-[var(--app-page-x)] md:mx-8", className)}>
      <SectionHeader title={title} className="px-0 pt-0 pb-2" />
      <GroupedList>
        {days.map((day, index) => {
          const isToday = day.day.slice(0, 3).toLowerCase() === todayKey
          const mealCount = day.meals.length

          if (!isToday) {
            return (
              <div
                key={`${day.day}-${index}`}
                className={cn(
                  "flex min-h-12 items-center gap-3 bg-card px-3.5",
                  index > 0 && "border-t border-border/40"
                )}
              >
                <span className="w-9 shrink-0 text-[12px] font-semibold text-muted-foreground uppercase">
                  {day.day}
                </span>
                <span className="native-row-detail min-w-0 flex-1 truncate">
                  {day.workoutLabel ?? "Rest"}
                  {mealCount > 0 &&
                    ` · ${mealCount} meal${mealCount === 1 ? "" : "s"}`}
                </span>
              </div>
            )
          }

          return (
            <div
              key={`${day.day}-${index}`}
              className={cn(
                "bg-card px-3.5 py-3",
                index > 0 && "border-t border-border/40"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[12px] font-bold uppercase">
                  {day.day}
                </span>
                {day.workoutPresetId && onOpenPreset ? (
                  <button
                    type="button"
                    onClick={() => onOpenPreset(day.workoutPresetId!)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Barbell size={15} className="shrink-0" />
                    <span className="native-row-title truncate">
                      {day.workoutLabel ?? "Training"}
                    </span>
                    <ArrowRight
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ) : (
                  <span className="native-row-title min-w-0 flex-1 truncate">
                    {day.workoutLabel ?? "Rest day"}
                  </span>
                )}
              </div>

              {day.meals.length > 0 && (
                <ul className="mt-2 ml-12 space-y-1">
                  {day.meals.slice(0, 3).map((meal, mealIndex) => (
                    <li key={`${meal.label}-${mealIndex}`}>
                      {meal.recipeId && onOpenRecipe ? (
                        <button
                          type="button"
                          onClick={() => onOpenRecipe(meal.recipeId!)}
                          className="native-row-detail flex items-center gap-1.5 text-left"
                        >
                          <ForkKnife size={13} className="shrink-0" />
                          <span className="truncate underline-offset-2">
                            {meal.label}
                          </span>
                        </button>
                      ) : (
                        <span className="native-row-detail flex items-center gap-1.5">
                          <ForkKnife size={13} className="shrink-0" />
                          <span className="truncate">{meal.label}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {day.recoveryNote && (
                <p className="native-row-detail mt-2 ml-12">
                  {day.recoveryNote}
                </p>
              )}
            </div>
          )
        })}
      </GroupedList>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onAskCoach}
          className="min-h-11 text-[13px] font-semibold"
        >
          Adjust with Coach
        </button>
        {assumptions.length > 0 && (
          <button
            type="button"
            onClick={() => setAssumptionsOpen((open) => !open)}
            aria-expanded={assumptionsOpen}
            className="ml-auto min-h-11 text-[13px] text-muted-foreground"
          >
            {assumptionsOpen ? "Hide notes" : "Why this plan"}
          </button>
        )}
      </div>

      {assumptionsOpen && assumptions.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {assumptions.map((assumption, index) => (
            <li key={index} className="native-row-detail">
              {assumption}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export type TrainingWeekDay = {
  label: string
  sets: number
  isToday?: boolean
  planned?: boolean
}

export type ConsistencyDay = {
  date: string
  level: "full" | "partial" | "none"
}

export function TrainingWeekCard({
  sessions,
  sets,
  records,
  days,
  consistency,
  onOpen,
}: {
  sessions: number
  sets: number
  records: number
  days: TrainingWeekDay[]
  consistency?: {
    days: ConsistencyDay[]
    fullCount: number
    windowSize: number
  }
  onOpen?: () => void
}) {
  const [zoomedOut, setZoomedOut] = useState(false)
  const maxSets = Math.max(1, ...days.map((day) => day.sets))
  const canZoom = Boolean(consistency && consistency.days.length > 0)
  const showConsistency = canZoom && zoomedOut

  return (
    <section className="mx-[var(--app-page-x)] mt-6 md:mx-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="app-section-title">
            {showConsistency ? "Consistency" : "Training this week"}
          </p>
          {showConsistency && consistency ? (
            <p className="mt-1 text-[15px] tabular-nums">
              <span className="text-[1.5rem] leading-none font-bold tracking-tight">
                {consistency.fullCount}
              </span>{" "}
              <span className="font-medium text-muted-foreground">
                of last {consistency.windowSize} days
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[15px] tabular-nums">
              <span className="text-[1.5rem] leading-none font-bold tracking-tight">
                {sessions}
              </span>{" "}
              <span className="font-medium text-muted-foreground">
                session{sessions === 1 ? "" : "s"} · {sets} set
                {sets === 1 ? "" : "s"}
                {records > 0 && ` · ${records} PR${records === 1 ? "" : "s"}`}
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canZoom && (
            <button
              type="button"
              onClick={() => setZoomedOut((value) => !value)}
              aria-expanded={showConsistency}
              aria-label={
                showConsistency
                  ? "Zoom in to this week"
                  : "Zoom out to last 28 days"
              }
              className="native-toolbar-button px-0 text-muted-foreground"
            >
              {showConsistency ? (
                <MagnifyingGlassPlus size={18} />
              ) : (
                <MagnifyingGlassMinus size={18} />
              )}
            </button>
          )}
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              aria-label="Open training history"
              className="native-toolbar-button px-0 text-muted-foreground"
            >
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-5">
        {/* Week bars */}
        <div
          className={cn(
            "dashboard-zoom-pane grid",
            showConsistency
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
          data-collapsed={showConsistency ? "true" : "false"}
          aria-hidden={showConsistency}
          {...(showConsistency ? { inert: true } : {})}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-end gap-2">
              {days.map((day, index) => {
                const height = day.sets > 0 ? (day.sets / maxSets) * 72 : 6
                return (
                  <div
                    key={`${day.label}-${index}`}
                    className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  >
                    <span
                      className={cn(
                        "w-full rounded-[4px] transition-[height] duration-300 ease-out",
                        day.planned
                          ? "dashboard-week-bar-planned"
                          : day.sets > 0
                            ? "bg-foreground/55"
                            : "bg-foreground/[0.09]"
                      )}
                      style={{ height: `${Math.max(6, height)}px` }}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "text-[12px] tabular-nums",
                        day.isToday
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {day.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 28-day consistency grid */}
        <div
          className={cn(
            "dashboard-zoom-pane grid",
            showConsistency
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          )}
          data-collapsed={showConsistency ? "false" : "true"}
          aria-hidden={!showConsistency}
          {...(showConsistency ? {} : { inert: true })}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="dashboard-consistency-grid">
              {consistency?.days.map((day, index) => (
                <span
                  key={day.date}
                  className={cn(
                    "aspect-square rounded-[6px]",
                    day.level === "full"
                      ? "bg-foreground/55"
                      : day.level === "partial"
                        ? "bg-foreground/25"
                        : "bg-foreground/[0.09]"
                  )}
                  style={{
                    transitionDelay: `${Math.min(index, 27) * 8}ms`,
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/55" />
                Full day
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/25" />
                Partial
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 border-b border-border" />
    </section>
  )
}

export type TimelineEvent = {
  id: string
  title: string
  detail: string
  kind: "food" | "water" | "workout" | "supplement"
  loggedAt?: string
  deleteLabel?: string
  deleteSlot?: 1 | 2
}

function ledgerTime(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function TimelineIcon({ kind }: { kind: TimelineEvent["kind"] }) {
  if (kind === "water") return <PintGlass size={14} weight="bold" />
  if (kind === "workout") return <Barbell size={14} weight="bold" />
  if (kind === "supplement") return <Pill size={14} weight="bold" />
  return <ForkKnife size={14} weight="bold" />
}

function timelineIconTone(kind: TimelineEvent["kind"]) {
  if (kind === "water")
    return "bg-[var(--accent-water-bg)] text-[var(--accent-water)]"
  if (kind === "food")
    return "bg-[var(--accent-food-bg)] text-[var(--accent-food)]"
  return "bg-muted/45 text-muted-foreground/72"
}

export function TodayTimeline({
  events,
  onLogFood,
  onLogWater,
  onDeleteEvent,
  onEditEvent,
}: {
  events: TimelineEvent[]
  onLogFood: () => void
  onLogWater?: () => void
  onStartWorkout?: () => void
  onDeleteEvent?: (event: TimelineEvent) => void
  onEditEvent?: (event: TimelineEvent) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const knownEventIds = useRef(new Set(events.map((event) => event.id)))
  const newEventIds = new Set(
    events
      .filter((event) => !knownEventIds.current.has(event.id))
      .map((event) => event.id)
  )
  const visibleEvents = showAll ? events : events.slice(0, 3)

  useEffect(() => {
    for (const event of events) knownEventIds.current.add(event.id)
  }, [events])
  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8 md:mt-6 md:max-w-5xl short-phone:mt-4">
      <SectionHeader title="Recent" className="px-0 pt-0 pb-2" />

      <GroupedList className="mt-3">
        {events.length > 0 ? (
          visibleEvents.map((event, index) => {
            const rowClassName = cn(
              "flex min-h-14 items-center justify-between gap-3 bg-card px-3.5 py-2 md:px-4",
              index > 0 && "border-t border-border/40"
            )
            const content = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  {event.kind === "food" || event.kind === "water" ? (
                    <button
                      type="button"
                      onClick={
                        event.kind === "food"
                          ? onLogFood
                          : (onLogWater ?? (() => {}))
                      }
                      onPointerDown={(pointerEvent) =>
                        pointerEvent.stopPropagation()
                      }
                      className={cn(
                        "native-toolbar-button shrink-0 px-0",
                        timelineIconTone(event.kind)
                      )}
                      aria-label={
                        event.kind === "food"
                          ? "Open food selector"
                          : "Add 250 ml water"
                      }
                    >
                      <TimelineIcon kind={event.kind} />
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "native-row-leading shrink-0",
                        timelineIconTone(event.kind)
                      )}
                    >
                      <TimelineIcon kind={event.kind} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="native-row-title block truncate">
                      {event.title}
                      <span className="font-medium text-muted-foreground">
                        {" · "}
                        {event.detail}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="native-row-detail tabular-nums">
                    {ledgerTime(event.loggedAt)}
                  </span>
                  {onEditEvent && (
                    <button
                      type="button"
                      onClick={() => onEditEvent(event)}
                      className="native-toolbar-button h-10 px-2 text-muted-foreground"
                      aria-label={`Edit ${event.title}`}
                    >
                      <PencilSimple size={15} />
                    </button>
                  )}
                </span>
              </>
            )

            if (!onDeleteEvent) {
              return (
                <div
                  key={event.id}
                  className={cn(
                    "motion-item",
                    newEventIds.has(event.id) && "recent-entry-in",
                    rowClassName
                  )}
                >
                  {content}
                </div>
              )
            }

            return (
              <SlideToDeleteRow
                key={event.id}
                deleteLabel={event.deleteLabel ?? `Delete ${event.title}`}
                onDelete={() => onDeleteEvent(event)}
                className={cn(
                  "motion-item",
                  newEventIds.has(event.id) && "recent-entry-in"
                )}
                rowClassName={rowClassName}
              >
                {content}
              </SlideToDeleteRow>
            )
          })
        ) : (
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
            <span className="flex min-w-0 items-center gap-3">
              <Fire size={18} className="shrink-0 text-muted-foreground" />
              <p className="native-row-title">Nothing logged yet</p>
            </span>
            {onLogWater && (
              <button
                type="button"
                onClick={onLogWater}
                className="group flex min-h-11 shrink-0 items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition-colors active:text-foreground"
              >
                <PintGlass
                  size={15}
                  weight="bold"
                  className="text-[var(--accent-water)] transition-transform group-active:scale-90"
                />
                Add 250 ml
              </button>
            )}
          </div>
        )}
      </GroupedList>
      {events.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 min-h-11 w-full text-center text-[13px] font-semibold text-muted-foreground"
        >
          {showAll ? "Show recent only" : "View all activity"}
        </button>
      )}
    </section>
  )
}

export function DailySummaryStrip() {
  return null
}
