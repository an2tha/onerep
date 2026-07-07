import type { ReactNode } from "react"
import {
  Barbell,
  Fire,
  ForkKnife,
  Pill,
  PintGlass,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/mobile-ui"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"

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

export function DailyLedgerHero({
  caloriesLeft,
  caloriesTarget,
  waterMl,
  waterGoalMl,
  workoutState,
  food,
  workout,
  water,
  macros = [],
}: {
  caloriesLeft: number
  caloriesTarget: number
  waterMl: number
  waterGoalMl: number
  workoutState: string
  food: PrimaryAction
  workout: PrimaryAction
  water: PrimaryAction
  macros?: MacroProgress[]
}) {
  const consumed = Math.max(0, caloriesTarget - caloriesLeft)
  const caloriesPct = pct(consumed, caloriesTarget)
  const waterPct = pct(waterMl, waterGoalMl)
  const overTarget = caloriesLeft < 0
  const calorieStatus = caloriesLeft >= 0 ? "left" : "over"
  const foodButton = (
    <button
      type="button"
      onClick={food.onClick}
      className="app-button app-button-primary motion-tactile shrink-0"
    >
      {food.label}
    </button>
  )

  return (
    <section className="app-rail-surface motion-card mx-[var(--app-page-x)] overflow-hidden md:mx-8">
      <div className="p-4 short-phone:p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
          {food.tooltip ? food.tooltip(foodButton) : foodButton}
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

        <div className="mt-4 divide-y divide-border/45 border-t border-border/45">
          <button
            type="button"
            onClick={water.onClick}
            className="motion-tactile flex min-h-13 w-full items-center justify-between gap-3 py-3 text-left active:opacity-70"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground/72">
                <PintGlass size={14} weight="bold" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">Water</span>
                <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-muted-foreground/58">
                  {waterPct}% complete · {water.detail}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-bold text-muted-foreground/70 tabular-nums">
              {fmt(waterMl)} / {fmt(waterGoalMl)} ml
            </span>
          </button>

          <button
            type="button"
            onClick={workout.onClick}
            className="motion-tactile flex min-h-13 w-full items-center justify-between gap-3 py-3 text-left active:opacity-70"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground/72">
                <Barbell size={14} weight="bold" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">Workout</span>
                <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-muted-foreground/58">
                  {workout.detail}
                </span>
              </span>
            </span>
            <span className="max-w-[42%] min-w-0 shrink-0 truncate text-right text-[12px] font-bold text-muted-foreground/70">
              {workoutState}
            </span>
          </button>
        </div>
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
      <SectionHeader
        title="Today’s ledger"
        action={
          <button
            type="button"
            onClick={onLogFood}
            className="app-button app-button-quiet motion-tactile"
          >
            Full log
          </button>
        }
      />

      <div
        className="app-rail-surface mt-3 overflow-hidden"
        data-motion-stagger
      >
        {events.length > 0 ? (
          events.slice(0, 6).map((event, index) => {
            const rowClassName = cn(
              "motion-list-row flex min-h-[3.35rem] items-center justify-between gap-3 bg-card px-3.5 py-2.5 md:min-h-[3.55rem] md:px-4 md:py-3",
              index > 0 && "border-t border-border/40"
            )
            const content = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/45 text-muted-foreground/72">
                    <TimelineIcon kind={event.kind} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold md:text-[13px]">
                      {event.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground/62">
                      {event.detail}
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
          <div className="app-empty m-3">
            <Fire size={16} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-5 text-muted-foreground">
                Nothing logged yet.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onLogFood}
                  className="app-button motion-tactile h-9 bg-foreground text-background"
                >
                  Log food
                </button>
                {onLogWater && (
                  <button
                    type="button"
                    onClick={onLogWater}
                    className="app-button app-button-quiet motion-tactile h-9"
                  >
                    + Water
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export function InsightWidgets({
  editMode,
  children,
  onToggleEdit,
}: {
  editMode: boolean
  children: ReactNode
  onToggleEdit: () => void
}) {
  return (
    <section className="mx-[var(--app-page-x)] mt-5 md:mx-8 md:mt-6 short-phone:mt-4">
      <div className="motion-item app-section-header">
        <div className="min-w-0">
          <h2 className="app-section-title">Stats preview</h2>
          <p className="app-section-subtitle md:hidden">
            Swipe sideways to see every card.
          </p>
          <p className="app-section-subtitle hidden md:block">
            Reorder the cards you care about.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleEdit}
          className={cn(
            "app-button hidden shrink-0 md:inline-flex",
            editMode
              ? "bg-foreground text-background"
              : "bg-muted text-foreground"
          )}
        >
          {editMode ? "Done" : "Customize"}
        </button>
      </div>
      {children}
    </section>
  )
}

export function DailySummaryStrip() {
  return null
}
