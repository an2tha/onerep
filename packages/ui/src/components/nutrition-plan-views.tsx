import { cn } from "../lib/utils"

export type CalibrationStatus =
  | "protected"
  | "collect_more_data"
  | "increase_calories"
  | "decrease_calories"
  | "improve_fueling"
  | "simplify_tracking"
  | "keep_targets"

export type CalibrationTargets = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type MacroRow = {
  key: keyof CalibrationTargets
  label: string
  unit: string
}

const MACRO_ROWS: MacroRow[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
]

function formatDelta(delta: number, unit: string) {
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${unit}`
}

/**
 * Renders the adaptive-target recommendation from `buildNutritionPlan`.
 *
 * Returns `null` for `keep_targets` — a card that says "nothing to do" is noise.
 * Statuses without `targets` render as an informational row with no primary
 * action, because the backend has explicitly marked them `canApply: false`.
 */
export function NutritionCalibrationCard({
  status,
  title,
  detail,
  current,
  proposed,
  applying = false,
  onApply,
  onDismiss,
  className,
}: {
  status: CalibrationStatus
  title: string
  detail: string
  current: CalibrationTargets
  proposed?: CalibrationTargets
  applying?: boolean
  onApply?: () => void
  onDismiss: () => void
  className?: string
}) {
  if (status === "keep_targets") return null

  // `calibration()` spreads the current targets, so most macros come back
  // unchanged. Only the rows that actually move are worth showing.
  const changed = proposed
    ? MACRO_ROWS.map((row) => ({
        ...row,
        from: current[row.key],
        to: proposed[row.key],
        delta: proposed[row.key] - current[row.key],
      })).filter((row) => row.delta !== 0)
    : []

  const canApply = proposed != null && changed.length > 0 && onApply != null

  return (
    <section
      className={cn("native-summary", className)}
      aria-label="Target adjustment"
    >
      <h2 className="native-row-title">{title}</h2>
      <p className="native-row-detail mt-1.5">{detail}</p>

      {changed.length > 0 && (
        <dl className="mt-3 divide-y divide-border border-y border-border">
          {changed.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <dt className="native-row-title">{row.label}</dt>
              <dd className="flex items-baseline gap-2 text-[14px] tabular-nums">
                <span className="text-muted-foreground line-through">
                  {row.from}
                </span>
                <span className="font-bold">
                  {row.to} {row.unit}
                </span>
                <span
                  className="text-[12px] font-semibold"
                  style={{
                    color:
                      row.delta > 0
                        ? "var(--status-success)"
                        : "var(--status-caution)",
                  }}
                >
                  {formatDelta(row.delta, row.unit)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 flex items-center gap-2">
        {canApply && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="native-primary-button min-h-11 flex-1"
          >
            {applying ? "Applying…" : "Apply targets"}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "min-h-11 px-3 text-[14px] font-semibold text-muted-foreground",
            !canApply && "flex-1 text-left px-0"
          )}
        >
          {canApply ? "Not now" : "Dismiss"}
        </button>
      </div>
    </section>
  )
}
