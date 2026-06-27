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
          className="h-full rounded-full"
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
    <header className="motion-item flex items-start justify-between gap-4 px-4 pt-[var(--app-safe-top)] pb-5 md:px-8 md:pt-10 md:pb-6 short-phone:pb-3">
      <div className="min-w-0">
        <h1 className="app-title mt-3 max-w-[14ch] text-[2rem] md:max-w-none short-phone:mt-2 short-phone:text-[1.58rem]">
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

  return (
    <section className="home-dashboard-card motion-card mx-4 overflow-hidden md:mx-8">
      <div className="p-3.5 md:p-4 short-phone:p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="app-eyebrow home-ledger-eyebrow">Daily budget</p>
            <div className="mt-2 flex items-end gap-1.5">
              <span className="home-ledger-number tabular-nums">
                {caloriesLeft >= 0
                  ? fmt(caloriesLeft)
                  : `+${fmt(Math.abs(caloriesLeft))}`}
              </span>
              <span className="pb-1 text-[10.5px] font-bold text-muted-foreground/60">
                kcal {caloriesLeft >= 0 ? "left" : "over"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={food.onClick}
            className="app-button app-button-quiet home-ledger-log-button shrink-0"
          >
            {food.label}
          </button>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.065]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${caloriesPct}%`,
              backgroundColor: overTarget
                ? "var(--status-danger)"
                : "var(--foreground)",
              opacity: overTarget ? 0.72 : 0.78,
            }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-muted-foreground/50 tabular-nums">
          <span>{fmt(consumed)} eaten</span>
          <span>{fmt(caloriesTarget)} target</span>
        </div>

        {macros.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {macros.map((macro) => (
              <MacroMeter key={macro.label} macro={macro} />
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={water.onClick}
            className="rounded-[0.8rem] border-0 bg-foreground/[0.045] px-2.5 py-2.5 text-left transition-colors active:bg-foreground/[0.08]"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/66">
              <PintGlass size={13} weight="bold" /> Water
            </span>
            <span className="mt-1 block text-[12px] font-extrabold tabular-nums">
              {fmt(waterMl)} / {fmt(waterGoalMl)} ml
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground/52">
              {waterPct}% complete · {water.detail}
            </span>
          </button>

          <button
            type="button"
            onClick={workout.onClick}
            className="rounded-[0.8rem] border-0 bg-foreground/[0.045] px-2.5 py-2.5 text-left transition-colors active:bg-foreground/[0.08]"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/66">
              <Barbell size={13} weight="bold" /> Workout
            </span>
            <span className="mt-1 block truncate text-[12px] font-extrabold">
              {workoutState}
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-muted-foreground/52">
              {workout.detail}
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
    <section className="mx-4 mt-5 md:mx-8 short-phone:mt-3">
      <SectionHeader
        title="Today’s ledger"
        action={
          <button
            type="button"
            onClick={onLogFood}
            className="app-button app-button-quiet"
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
              "flex min-h-[3.55rem] items-center justify-between gap-3 bg-card px-4 py-3",
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
                  className="app-button h-9 bg-foreground text-background"
                >
                  Log food
                </button>
                {onLogWater && (
                  <button
                    type="button"
                    onClick={onLogWater}
                    className="app-button app-button-quiet h-9"
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
    <section className="mx-4 mt-5 md:mx-8 short-phone:mt-3">
      <SectionHeader
        title="Stats preview"
        subtitle="Reorder the cards you care about."
        action={
          <button
            type="button"
            onClick={onToggleEdit}
            className={cn(
              "app-button shrink-0",
              editMode
                ? "bg-foreground text-background"
                : "bg-muted text-foreground"
            )}
          >
            {editMode ? "Done" : "Customize"}
          </button>
        }
      />
      {children}
    </section>
  )
}

export function DailySummaryStrip() {
  return null
}
