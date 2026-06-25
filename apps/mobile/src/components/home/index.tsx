import type { ReactNode } from "react"
import { Barbell, Fire, ForkKnife, PintGlass } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { MetricTile, SectionHeader } from "@/components/mobile-ui"

type PrimaryAction = {
  label: string
  detail: string
  onClick: () => void
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
  action: ReactNode
}) {
  return (
    <header className="flex items-center justify-between px-4 pt-[var(--app-safe-top)] pb-2.5 md:px-6 md:pt-10 short-phone:pb-1.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/65 uppercase">
          {dateLabel}
        </p>
        <h1 className="mt-0.5 text-[1.32rem] leading-snug font-semibold tracking-tight md:text-[1.45rem] short-phone:text-[1.18rem]">
          {salutation}, {firstName}.
        </h1>
      </div>
      <div className="shrink-0">{action}</div>
    </header>
  )
}

export function PrimaryActionGrid({
  food,
  workout,
  water,
}: {
  food: PrimaryAction
  workout: PrimaryAction
  water: PrimaryAction
}) {
  const actions = [
    {
      key: "food",
      Icon: ForkKnife,
      tone: "food",
      ...food,
    },
    {
      key: "workout",
      Icon: Barbell,
      tone: "workout",
      ...workout,
    },
    {
      key: "water",
      Icon: PintGlass,
      tone: "water",
      ...water,
    },
  ]

  return (
    <section
      className="grid grid-cols-3 gap-2 px-4 md:px-6 short-phone:gap-1.5"
      aria-label="Primary actions"
    >
      {actions.map(({ key, Icon, label, detail, tone, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className={cn(
            "min-h-[88px] rounded-[18px] border border-border/55 bg-card p-3 text-left transition-transform active:scale-[0.985] md:min-h-[104px] md:rounded-[20px] short-phone:min-h-[74px] short-phone:p-2.5",
            key === "food" && "bg-foreground text-background"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-current ring-1 ring-current/8 md:h-9 md:w-9 short-phone:h-7 short-phone:w-7",
              key === "food"
                ? "bg-background/12"
                : "bg-[var(--tone-bg)] text-[var(--tone)]",
              tone === "food" &&
                "[--tone-bg:var(--accent-food-bg)] [--tone:var(--accent-food)]",
              tone === "workout" &&
                "[--tone-bg:var(--accent-workout-bg)] [--tone:var(--accent-workout)]",
              tone === "water" &&
                "[--tone-bg:var(--accent-water-bg)] [--tone:var(--accent-water)]"
            )}
          >
            <Icon size={18} weight="bold" />
          </span>
          <span className="mt-2.5 block text-[12.5px] leading-tight font-bold md:mt-3 md:text-[13px] short-phone:mt-2">
            {label}
          </span>
          <span
            className={cn(
              "mt-1 block text-[11px] leading-4 md:text-[11.5px] short-phone:text-[10.5px] short-phone:leading-[0.9rem]",
              key === "food" ? "text-background/65" : "text-muted-foreground"
            )}
          >
            {detail}
          </span>
        </button>
      ))}
    </section>
  )
}

export function DailySummaryStrip({
  caloriesLeft,
  caloriesTarget,
  waterMl,
  waterGoalMl,
  workoutState,
  targetSource,
}: {
  caloriesLeft: number
  caloriesTarget: number
  waterMl: number
  waterGoalMl: number
  workoutState: string
  targetSource: "healthProfile" | "onboarding" | "default"
}) {
  const waterPct =
    waterGoalMl > 0
      ? Math.min(100, Math.round((waterMl / waterGoalMl) * 100))
      : 0
  const sourceLabel =
    targetSource === "healthProfile"
      ? "profile"
      : targetSource === "onboarding"
        ? "estimated"
        : "default"

  return (
    <section
      className="mx-4 mt-2.5 grid grid-cols-3 gap-2 md:mx-6 md:mt-3 short-phone:mt-2 short-phone:gap-1.5"
      aria-label="Daily summary"
    >
      <MetricTile
        label="Calories left"
        value={
          caloriesLeft >= 0
            ? String(caloriesLeft)
            : `+${Math.abs(caloriesLeft)}`
        }
        detail={`${caloriesTarget} ${sourceLabel}`}
        icon={ForkKnife}
        tone="food"
        className="short-phone:min-h-[60px] short-phone:px-2.5 short-phone:py-2"
      />
      <MetricTile
        label="Water"
        value={`${waterPct}%`}
        detail={`${Math.round(waterMl)} / ${waterGoalMl} ml`}
        icon={PintGlass}
        tone="water"
        className="short-phone:min-h-[60px] short-phone:px-2.5 short-phone:py-2"
      />
      <MetricTile
        label="Workout"
        value={workoutState}
        detail="today"
        icon={Barbell}
        tone="workout"
        className="short-phone:min-h-[60px] short-phone:px-2.5 short-phone:py-2"
      />
    </section>
  )
}

export type TimelineEvent = {
  id: string
  title: string
  detail: string
  kind: "food" | "water" | "workout"
}

export function TodayTimeline({
  events,
  onLogFood,
}: {
  events: TimelineEvent[]
  onLogFood: () => void
}) {
  return (
    <section className="mx-4 mt-3 rounded-[20px] border border-border/60 bg-card px-4 py-3 md:mx-6 md:rounded-[22px] short-phone:mt-2.5 short-phone:px-3.5">
      <SectionHeader
        title="Today so far"
        subtitle="Recent food, water, and workout events"
        action={
          <button
            type="button"
            onClick={onLogFood}
            className="min-h-10 rounded-full bg-muted px-3 text-[12px] font-semibold"
          >
            Add
          </button>
        }
      />

      <div className="mt-3 max-h-[13rem] space-y-2 overflow-y-auto overscroll-contain pr-1 md:grid md:max-h-[14rem] md:grid-cols-2 md:gap-x-6 md:gap-y-3 md:space-y-0 xl:grid-cols-3 short-phone:mt-2 short-phone:max-h-[9.5rem]">
        {events.length > 0 ? (
          events.map((event) => (
            <div key={event.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full md:h-8 md:w-8",
                  event.kind === "food" && "bg-orange-500/10 text-orange-500",
                  event.kind === "water" && "bg-sky-500/10 text-sky-500",
                  event.kind === "workout" && "bg-green-500/10 text-green-500"
                )}
              >
                {event.kind === "food" ? (
                  <ForkKnife size={14} weight="bold" />
                ) : event.kind === "water" ? (
                  <PintGlass size={14} weight="bold" />
                ) : (
                  <Barbell size={14} weight="bold" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold md:text-[13px]">
                  {event.title}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {event.detail}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-3 rounded-[16px] bg-muted/45 px-3 py-3">
            <Fire size={16} className="shrink-0 text-muted-foreground" />
            <p className="text-[12.5px] leading-5 text-muted-foreground">
              Nothing logged yet. Start with food, water, or a workout.
            </p>
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
    <section className="mx-4 mt-4 md:mx-6 short-phone:mt-3">
      <SectionHeader
        title="Insights"
        subtitle="Trends, widgets, and deeper dashboard views"
        action={
          <button
            type="button"
            onClick={onToggleEdit}
            className={cn(
              "min-h-10 shrink-0 rounded-full px-4 text-[12px] font-semibold",
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
