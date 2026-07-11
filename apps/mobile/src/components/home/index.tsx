import type { ReactNode } from "react"
import {
  ArrowRight,
  Barbell,
  Coffee,
  Fire,
  ForkKnife,
  Heart,
  Lightning,
  Pill,
  PintGlass,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/mobile-ui"
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

function MacroMeter({ macro }: { macro: MacroProgress }) {
  const progress = pct(macro.value, macro.target)
  const over = macro.target > 0 && macro.value > macro.target
  const unit = macro.unit ?? "g"

  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline justify-between gap-1.5">
        <span className="text-[9.5px] font-bold text-muted-foreground/66">
          {macro.shortLabel}
        </span>
        <span
          className={cn(
            "text-[9.5px] font-semibold text-muted-foreground/52 tabular-nums",
            over && "text-destructive/72"
          )}
        >
          {fmt(macro.value)}/{fmt(macro.target)}
          {unit}
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="motion-progress-fill h-full rounded-full"
          style={{
            width: `${progress}%`,
            backgroundColor: over ? "var(--status-danger)" : macro.color,
          }}
        />
      </div>
    </div>
  )
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
      className="app-rail-surface mx-[var(--app-page-x)] mt-3 grid grid-cols-5 overflow-hidden md:mx-8"
    >
      {actions.map((action, index) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          className={cn(
            "motion-tactile flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 px-2 py-2 text-center active:opacity-70",
            index > 0 && "border-l border-border/40"
          )}
        >
          <span className="relative">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                quickActionTone(action.tone)
              )}
            >
              {action.icon}
            </span>
            {action.badge && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[8px] font-bold text-background tabular-nums">
                {action.badge}
              </span>
            )}
          </span>
          <span className="text-[9.5px] font-bold text-muted-foreground/64">
            {action.label}
          </span>
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open weekly workout history"
      className="motion-tactile app-rail-surface mx-[var(--app-page-x)] mt-3 flex min-h-[4.1rem] w-[calc(100%-2*var(--app-page-x))] items-center justify-between gap-2 px-3 py-2 active:opacity-70 md:mx-8 md:w-[calc(100%-4rem)]"
    >
      {days.map((day) => (
        <span
          key={day.date}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold",
              day.hasWorkout
                ? "border-foreground bg-foreground text-background"
                : "border-border/55 bg-muted/30 text-muted-foreground/48",
              day.isToday && !day.hasWorkout && "border-foreground/55"
            )}
          >
            {day.hasWorkout ? <Barbell size={11} weight="bold" /> : day.label}
          </span>
          <span
            className={cn(
              "text-[9px] font-bold",
              day.isToday ? "text-foreground" : "text-muted-foreground/45"
            )}
          >
            {day.label}
          </span>
        </span>
      ))}
    </button>
  )
}

function MealCadence({
  slots,
  onClick,
}: {
  slots: MealCadenceSlot[]
  onClick: (slot: MealCadenceSlot) => void
}) {
  return (
    <div
      aria-label="Meal cadence"
      className="mt-3 grid grid-cols-4 gap-2 border-t border-border/40 pt-3"
    >
      {slots.map((slot) => (
        <button
          key={slot.id}
          type="button"
          onClick={() => onClick(slot)}
          aria-label={`${slot.label}: ${slot.logged ? "logged" : "add meal"}`}
          className="motion-tactile flex min-h-11 items-center justify-center rounded-xl bg-muted/28 px-2 active:opacity-70"
        >
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full",
              slot.logged
                ? "bg-[var(--accent-food)] text-background"
                : "bg-background text-muted-foreground/45 ring-1 ring-border/45"
            )}
          >
            {slot.id === "breakfast" ? (
              <Coffee size={12} weight="bold" />
            ) : (
              <ForkKnife size={12} weight="bold" />
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

function RecoveryMeter({
  recovery,
  onClick,
}: {
  recovery: RecoveryProgress
  onClick: () => void
}) {
  const score = Math.max(0, Math.min(100, Math.round(recovery.score)))
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Recovery progress ${score} percent. Protein ${Math.round(recovery.proteinPercent)} percent, water ${Math.round(recovery.waterPercent)} percent.`}
      className="motion-tactile mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl bg-muted/28 px-3 active:opacity-70"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--accent-progress) ${score}%, var(--background) 0)`,
        }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card">
          <Heart
            size={12}
            weight="fill"
            className="text-[var(--accent-progress)]"
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <ForkKnife
            size={13}
            weight="bold"
            className="text-[var(--accent-food)]"
          />
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-background">
            <span
              className="block h-full rounded-full bg-[var(--accent-food)]"
              style={{
                width: `${Math.max(0, Math.min(100, recovery.proteinPercent))}%`,
              }}
            />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <PintGlass
            size={13}
            weight="bold"
            className="text-[var(--accent-water)]"
          />
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-background">
            <span
              className="block h-full rounded-full bg-[var(--accent-water)]"
              style={{
                width: `${Math.max(0, Math.min(100, recovery.waterPercent))}%`,
              }}
            />
          </span>
        </span>
      </span>
      <span className="shrink-0 text-[12px] font-extrabold tabular-nums">
        {score}%
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
  mealSlots = [],
  onMealSlotClick,
  recovery,
  onRecoveryClick,
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
  const calorieStatus = caloriesLeft >= 0 ? "left" : "over"
  const waterButton = (
    <button
      type="button"
      onClick={water.onClick}
      aria-label={`${water.label}: ${water.detail}`}
      className="motion-tactile flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted/32 px-2 py-2.5 text-center active:opacity-70"
    >
      <PintGlass
        size={17}
        weight="bold"
        className="text-[var(--accent-water)]"
      />
      <span className="text-[14px] leading-none font-extrabold tabular-nums">
        {waterPct}%
      </span>
      <span className="text-[9.5px] font-bold text-muted-foreground/52 uppercase">
        Water
      </span>
    </button>
  )
  const workoutButton = (
    <button
      type="button"
      onClick={workout.onClick}
      aria-label={`${workout.label}: ${workout.detail}`}
      className="motion-tactile flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted/32 px-2 py-2.5 text-center active:opacity-70"
    >
      <Barbell size={17} weight="bold" />
      <span className="truncate text-[14px] leading-none font-extrabold">
        {workoutProgress && workoutProgress.totalSets > 0
          ? `${workoutProgress.completedSets}/${workoutProgress.totalSets}`
          : workoutProgress && workoutProgress.elapsedMinutes > 0
            ? `${workoutProgress.elapsedMinutes}m`
            : workoutState}
      </span>
      <span className="text-[9.5px] font-bold text-muted-foreground/52 uppercase">
        {workoutProgress ? "Active" : `${workoutsThisWeek}/wk`}
      </span>
    </button>
  )

  return (
    <section
      className={cn(
        "app-rail-surface motion-card mx-[var(--app-page-x)] overflow-hidden md:mx-8",
        className
      )}
    >
      <div className="p-4 short-phone:p-3.5">
        <div>
          <div className="min-w-0">
            <p className="app-eyebrow">Today</p>
            <div className="mt-2 flex min-w-0 items-baseline gap-2">
              <span className="app-display text-[2.35rem] tabular-nums short-phone:text-[2rem]">
                {caloriesLeft >= 0
                  ? fmt(caloriesLeft)
                  : `+${fmt(Math.abs(caloriesLeft))}`}
              </span>
              <span
                className={cn(
                  "text-[12px] font-bold text-muted-foreground/62",
                  overTarget && "text-destructive/75"
                )}
              >
                kcal {calorieStatus}
              </span>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-muted-foreground/62 tabular-nums">
              {fmt(consumed)} eaten of {fmt(caloriesTarget)}
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.065]">
          <div
            className="motion-progress-fill h-full rounded-full"
            style={{
              width: `${caloriesPct}%`,
              backgroundColor: overTarget
                ? "var(--status-danger)"
                : "var(--foreground)",
              opacity: overTarget ? 0.72 : 0.78,
            }}
          />
        </div>

        {macros.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 short-phone:gap-1.5">
            {macros.map((macro) => (
              <MacroMeter key={macro.label} macro={macro} />
            ))}
          </div>
        )}

        {mealSlots.length > 0 && onMealSlotClick && (
          <MealCadence slots={mealSlots} onClick={onMealSlotClick} />
        )}

        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/40 pt-4 short-phone:gap-1.5">
          {workout.tooltip ? workout.tooltip(workoutButton) : workoutButton}
          {water.tooltip ? water.tooltip(waterButton) : waterButton}
          <div className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-muted/32 px-2 py-2.5 text-center">
            <ForkKnife
              size={17}
              weight="bold"
              className="text-[var(--accent-food)]"
            />
            <span className="text-[14px] leading-none font-extrabold tabular-nums">
              {proteinLeft > 0 ? `${fmt(proteinLeft)}g` : "Hit"}
            </span>
            <span className="text-[9.5px] font-bold text-muted-foreground/52 uppercase">
              Protein
            </span>
          </div>
          <div className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-muted/32 px-2 py-2.5 text-center">
            <Fire
              size={17}
              weight="fill"
              className="text-[var(--status-caution)]"
            />
            <span className="text-[14px] leading-none font-extrabold tabular-nums">
              {streak}d
            </span>
            <span className="text-[9.5px] font-bold text-muted-foreground/52 uppercase">
              Streak
            </span>
          </div>
        </div>

        {recovery && onRecoveryClick && (
          <RecoveryMeter recovery={recovery} onClick={onRecoveryClick} />
        )}

        <button
          type="button"
          onClick={onBriefingAction}
          className="motion-tactile mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-foreground px-3.5 text-left text-background active:opacity-75"
        >
          <Lightning size={15} weight="fill" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">
            {briefing.title}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-background/65">
            {briefing.actionLabel}
          </span>
          <ArrowRight size={13} weight="bold" className="shrink-0" />
        </button>
      </div>
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
}: {
  events: TimelineEvent[]
  onLogFood: () => void
  onLogWater?: () => void
  onStartWorkout?: () => void
  onDeleteEvent?: (event: TimelineEvent) => void
}) {
  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8 md:mt-6 short-phone:mt-4">
      <SectionHeader title="Recent" />

      <div
        className="app-rail-surface mt-3 overflow-hidden"
        data-motion-stagger
      >
        {events.length > 0 ? (
          events.slice(0, 4).map((event, index) => {
            const rowClassName = cn(
              "motion-list-row flex min-h-12 items-center justify-between gap-3 bg-card px-3.5 py-2 md:px-4",
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
                        "motion-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
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
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        timelineIconTone(event.kind)
                      )}
                    >
                      <TimelineIcon kind={event.kind} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold md:text-[13px]">
                      {event.title}
                      <span className="font-medium text-muted-foreground/58">
                        {" · "}
                        {event.detail}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-bold text-muted-foreground/50 tabular-nums">
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
          <div className="m-2.5 flex min-h-14 items-center gap-2 rounded-[14px] border border-dashed border-border/55 bg-card/35 px-3 py-2.5 md:m-3 md:min-h-16 md:px-3.5">
            <Fire size={14} className="shrink-0 text-muted-foreground/65" />
            <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-muted-foreground/65">
              Nothing logged yet.
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={onLogFood}
                className="app-icon-button motion-tactile h-8 w-8 bg-foreground text-background"
                aria-label="Open food selector"
              >
                <ForkKnife size={14} weight="bold" />
              </button>
              {onLogWater && (
                <button
                  type="button"
                  onClick={onLogWater}
                  className="app-icon-button motion-tactile h-8 w-8 bg-muted text-muted-foreground"
                  aria-label="Add water"
                >
                  <PintGlass size={13} weight="bold" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export function DailySummaryStrip() {
  return null
}
