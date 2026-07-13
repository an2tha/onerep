import type { ReactNode } from "react"
import {
  ArrowRight,
  Barbell,
  Fire,
  ForkKnife,
  Lightning,
  Pill,
  PintGlass,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import {
  GroupedList,
  PrimaryButton,
  SectionHeader,
  StatRow,
  SummaryBlock,
} from "@/components/mobile-ui"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import type { DashboardBriefing } from "@/lib/dashboard-briefing"

type PrimaryAction = {
  label: string
  detail: string
  onClick: () => void
  tooltip?: (children: ReactNode) => ReactNode
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

export function DailyLedgerHero({
  caloriesLeft,
  caloriesTarget,
  waterMl,
  waterGoalMl,
  workoutState,
  workout,
  workoutProgress,
  mealSlots: _mealSlots = [],
  onMealSlotClick: _onMealSlotClick,
  recovery: _recovery,
  onRecoveryClick: _onRecoveryClick,
  water,
  briefing,
  onBriefingAction,
  proteinLeft,
  streak,
  workoutsThisWeek,
  macros = [],
  className,
}: {
  caloriesLeft: number
  caloriesTarget: number
  waterMl: number
  waterGoalMl: number
  workoutState: string
  workout: PrimaryAction
  workoutProgress?: {
    completedSets: number
    totalSets: number
    elapsedMinutes: number
  } | null
  mealSlots?: MealCadenceSlot[]
  onMealSlotClick?: (slot: MealCadenceSlot) => void
  recovery?: RecoveryProgress | null
  onRecoveryClick?: () => void
  water: PrimaryAction
  briefing: DashboardBriefing
  onBriefingAction: () => void
  proteinLeft: number
  streak: number
  workoutsThisWeek: number
  macros?: MacroProgress[]
  className?: string
}) {
  const consumed = Math.max(0, caloriesTarget - caloriesLeft)
  const caloriesPct = pct(consumed, caloriesTarget)
  const waterPct = pct(waterMl, waterGoalMl)
  const overTarget = caloriesLeft < 0
  const workoutValue =
    workoutProgress && workoutProgress.totalSets > 0
      ? `${workoutProgress.completedSets}/${workoutProgress.totalSets} sets`
      : workoutProgress && workoutProgress.elapsedMinutes > 0
        ? `${workoutProgress.elapsedMinutes} min`
        : workoutState

  const renderAction = (
    action: PrimaryAction,
    icon: ReactNode,
    className?: string
  ) => {
    const button = (
      <button
        type="button"
        onClick={action.onClick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted/40",
          className
        )}
      >
        <span className="text-muted-foreground" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="native-row-title block">{action.label}</span>
          <span className="native-row-detail block">{action.detail}</span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-muted-foreground" />
      </button>
    )
    return action.tooltip ? action.tooltip(button) : button
  }

  return (
    <SummaryBlock
      title="Energy remaining"
      value={`${caloriesLeft >= 0 ? "" : "+"}${fmt(Math.abs(caloriesLeft))} kcal`}
      detail={`${fmt(consumed)} of ${fmt(caloriesTarget)} kcal · ${caloriesPct}%`}
      tone="food"
      className={className}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${caloriesPct}%`,
            backgroundColor: overTarget
              ? "var(--status-danger)"
              : "var(--accent-food)",
          }}
        />
      </div>
      <div className="mt-3">
        {macros.map((macro) => (
          <StatRow
            key={macro.label}
            label={macro.label}
            value={`${fmt(macro.value)} / ${fmt(macro.target)} ${macro.unit ?? "g"}`}
            color={macro.color}
          />
        ))}
        <StatRow
          label="Water"
          value={`${fmt(waterMl)} / ${fmt(waterGoalMl)} ml`}
          detail={`${waterPct}%`}
          color="var(--accent-water)"
        />
        <StatRow
          label="Protein remaining"
          value={proteinLeft > 0 ? `${fmt(proteinLeft)} g` : "Target met"}
          color="var(--accent-food)"
        />
        <StatRow
          label="Training"
          value={workoutValue}
          detail={`${workoutsThisWeek} this week · ${streak} day streak`}
          color="var(--accent-workout)"
        />
      </div>
      <div className="mt-3 divide-y divide-border border-y border-border">
        {renderAction(water, <PintGlass size={19} weight="bold" />)}
        {renderAction(workout, <Barbell size={19} weight="bold" />)}
      </div>
      <PrimaryButton
        onClick={onBriefingAction}
        className="mt-4 w-full justify-between"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Lightning size={18} weight="fill" />
          {briefing.title}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {briefing.actionLabel}
          <ArrowRight size={16} />
        </span>
      </PrimaryButton>
    </SummaryBlock>
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
}: {
  events: TimelineEvent[]
  onLogFood: () => void
  onLogWater?: () => void
  onStartWorkout?: () => void
  onDeleteEvent?: (event: TimelineEvent) => void
}) {
  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8 md:mt-6 short-phone:mt-4">
      <SectionHeader title="Recent" className="px-0 pt-0 pb-2" />

      <GroupedList className="mt-3">
        {events.length > 0 ? (
          events.slice(0, 4).map((event, index) => {
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
                <span className="native-row-detail shrink-0 tabular-nums">
                  {ledgerTime(event.loggedAt)}
                </span>
              </>
            )

            if (!onDeleteEvent) {
              return (
                <div key={event.id} className={cn("motion-item", rowClassName)}>
                  {content}
                </div>
              )
            }

            return (
              <SlideToDeleteRow
                key={event.id}
                deleteLabel={event.deleteLabel ?? `Delete ${event.title}`}
                onDelete={() => onDeleteEvent(event)}
                className="motion-item"
                rowClassName={rowClassName}
              >
                {content}
              </SlideToDeleteRow>
            )
          })
        ) : (
          <div className="px-4 py-4">
            <div className="flex items-start gap-3">
              <Fire
                size={18}
                className="mt-0.5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0">
                <p className="native-row-title">Your day is ready to log</p>
                <p className="native-row-detail mt-0.5">
                  Food, water, workouts, and supplements will appear here in
                  time order.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-[1.875rem]">
              <button
                type="button"
                onClick={onLogFood}
                className="native-toolbar-button border border-border bg-card"
              >
                <ForkKnife size={17} weight="bold" />
                Log food
              </button>
              {onLogWater && (
                <button
                  type="button"
                  onClick={onLogWater}
                  className="native-toolbar-button border border-border bg-card"
                >
                  <PintGlass size={17} weight="bold" />
                  Add 250 ml
                </button>
              )}
            </div>
          </div>
        )}
      </GroupedList>
    </section>
  )
}

export function DailySummaryStrip() {
  return null
}
