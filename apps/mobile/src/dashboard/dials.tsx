import { tr } from "@repo/ui/i18n"
import { Barbell, ForkKnife, Heartbeat } from "@phosphor-icons/react"

export function DashboardDials({
  nutritionPercent,
  showNutritionMetric = true,
  recoveryStatus,
  loading,
  onStartWorkout,
  onOpenNutrition,
  onOpenRecovery,
  layout = "crown",
}: {
  showNutritionMetric?: boolean
  nutritionPercent: number | null
  recoveryStatus: "ready" | "steady" | "compromised" | "unknown" | null
  loading?: boolean
  onStartWorkout: () => void
  onStartWorkoutTip?: () => void
  onOpenNutrition?: () => void
  onOpenRecovery?: () => void
  layout?: "crown" | "row"
}) {
  const status =
    recoveryStatus === "ready"
      ? tr("Ready")
      : recoveryStatus === "steady"
        ? tr("Steady")
        : recoveryStatus === "compromised"
          ? tr("Take it easy")
          : tr("No reading")
  return (
    <div
      className={`mx-auto grid w-full grid-cols-3 gap-2 py-2 ${layout === "crown" ? "min-w-80" : "max-w-sm"}`}
    >
      <button
        type="button"
        onClick={onStartWorkout}
        className="motion-tactile flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-foreground px-2 text-background"
      >
        <Barbell size={22} />
        <span className="text-center text-xs font-semibold">
          {tr("Start workout")}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenNutrition}
        className="motion-tactile flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2"
      >
        <ForkKnife size={20} />
        <span className="text-sm font-semibold tabular-nums">
          {loading
            ? tr("Loading…")
            : !showNutritionMetric
              ? tr("Log food")
              : nutritionPercent === null
                ? tr("No target")
                : `${Math.round(nutritionPercent)}%`}
        </span>
        <span className="text-center text-xs text-muted-foreground">
          {showNutritionMetric ? tr("Daily energy") : tr("Food diary")}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenRecovery}
        className="motion-tactile flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2"
      >
        <Heartbeat size={20} />
        <span className="text-center text-sm font-semibold">
          {loading ? tr("Loading…") : status}
        </span>
        <span className="text-xs text-muted-foreground">{tr("Recovery")}</span>
      </button>
    </div>
  )
}
