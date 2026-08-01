import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { ArrowLeft, DownloadSimple, Printer } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { NavigationBar, ToolbarButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import {
  currentDateKey,
  FOOD_MICRONUTRIENT_KEYS,
  type FoodLogEntry,
} from "@/lib/food-log"
import { CUSTOM_FOOD_NUTRIENT_LABELS } from "@/lib/custom-foods"
import { carbLabel, carbLabelLower, displayCarbGoal } from "@/lib/carb-display"
import { useCarbDisplayMode } from "@/lib/use-carb-display"
import {
  NUTRITION_REPORT_RANGES,
  buildNutritionReport,
  formatReportDate,
  formatReportRangeLabel,
  reportFilename,
  reportRangeBounds,
  type NutritionReportRange,
} from "@/lib/nutrition-report"
import {
  isShareCancelledError,
  oneRepExportDocument,
  shareOrDownloadJsonExport,
} from "@/lib/data-export"

export default function NutritionReport() {
  const navigate = useSmoothNavigate()
  const today = currentDateKey()

  const [searchParams] = useSearchParams()
  const carbMode = useCarbDisplayMode()
  const [range, setRange] = useState<NutritionReportRange>("7d")
  const [includeEntries, setIncludeEntries] = useState(true)

  const bounds = useMemo(() => reportRangeBounds(today, range), [today, range])

  // A coach opening a shared report reads the same range through the gated
  // sharing query instead. All the report maths and print CSS is reused.
  const ownerUserId = searchParams.get("ownerUserId")
  const ownLogs = useQuery(
    api.logs.foodLogs.getRange,
    ownerUserId ? "skip" : { start: bounds.start, end: bounds.end }
  )
  const sharedLogs = useQuery(
    api.sharing.sharedDiary.getSharedRange,
    ownerUserId ? { ownerUserId, start: bounds.start, end: bounds.end } : "skip"
  )
  const logs = ownerUserId ? sharedLogs : ownLogs

  const ownGoals = useQuery(
    api.users.users.getEffectiveGoals,
    ownerUserId ? "skip" : { date: today }
  )
  const sharedGoals = useQuery(
    api.sharing.sharedDiary.getSharedGoals,
    ownerUserId ? { ownerUserId } : "skip"
  )
  const goals = useMemo(
    () =>
      ownerUserId
        ? sharedGoals
          ? {
              effective: sharedGoals,
              health: undefined,
              mealTargetsEnabled: false,
              mealTargets: [] as { meal: string; calories: number }[],
            }
          : undefined
        : ownGoals,
    [ownerUserId, sharedGoals, ownGoals]
  )

  const report = useMemo(
    () =>
      buildNutritionReport({
        start: bounds.start,
        end: bounds.end,
        logs: ((logs ?? []) as { date: string; entries: FoodLogEntry[] }[]).map(
          (log) => ({ date: log.date, entries: log.entries ?? [] })
        ),
        goals: goals?.effective
          ? {
              calories: goals.effective.calories,
              protein: goals.effective.protein,
              carbs: goals.effective.carbs,
              fat: goals.effective.fat,
            }
          : undefined,
      }),
    [bounds.start, bounds.end, logs, goals]
  )

  const mealTargetByMeal = useMemo(
    () =>
      new Map<string, number>(
        goals?.mealTargetsEnabled
          ? (goals.mealTargets ?? []).map(
              (target) => [target.meal, target.calories] as const
            )
          : []
      ),
    [goals]
  )

  const loading = logs === undefined

  function handlePrint() {
    if (typeof window === "undefined") return
    if (typeof window.print !== "function") {
      toast.error("Printing is not available on this device")
      return
    }
    window.print()
  }

  /**
   * The computed report as JSON, for a coach who wants the numbers rather
   * than a printout. Printing already covers PDF via the browser.
   */
  async function handleDownload() {
    try {
      await shareOrDownloadJsonExport(
        await oneRepExportDocument({ report, carbMode }),
        `${reportFilename(bounds.start, bounds.end)}.json`
      )
    } catch (error) {
      if (!isShareCancelledError(error)) {
        toast.error("Could not export this report")
      }
    }
  }

  const microRows = FOOD_MICRONUTRIENT_KEYS.filter(
    (key) => (report.micros[key] ?? 0) > 0
  )

  return (
    <div className="native-page print-sheet mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <div className="print-hidden">
        <NavigationBar
          title="Nutrition report"
          subtitle="Share with a coach or clinician"
          leading={
            <ToolbarButton
              onClick={() => navigate(-1)}
              aria-label="Back to nutrition"
              className="-ml-2 px-0 text-muted-foreground"
            >
              <ArrowLeft size={19} weight="bold" />
            </ToolbarButton>
          }
          trailing={
            <div className="flex items-center gap-1">
              <ToolbarButton
                onClick={handleDownload}
                aria-label="Download report data"
              >
                <DownloadSimple size={19} weight="bold" />
              </ToolbarButton>
              <ToolbarButton onClick={handlePrint} aria-label="Print report">
                <Printer size={19} weight="bold" />
              </ToolbarButton>
            </div>
          }
        />

        <div className="px-[var(--app-page-x)] pt-1 pb-3">
          <div
            role="group"
            aria-label="Report period"
            className="flex gap-2 overflow-x-auto"
          >
            {NUTRITION_REPORT_RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
                className={cn(
                  "native-secondary-button h-10 flex-1 text-[14px]",
                  range === option.id &&
                    "border-[var(--accent-food)] text-[var(--accent-food)]"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <span className="native-row-title">Include every food entry</span>
            <input
              type="checkbox"
              checked={includeEntries}
              onChange={(event) => setIncludeEntries(event.target.checked)}
              className="h-5 w-5 accent-[var(--accent-food)]"
            />
          </label>

          <button
            type="button"
            onClick={handlePrint}
            className="native-primary-button mt-2 w-full"
          >
            <Printer size={17} weight="bold" aria-hidden />
            Print or save as PDF
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-[var(--app-page-x)] pt-6 text-[15px] text-muted-foreground">
          Building your report…
        </p>
      ) : (
        <article className="motion-content-in px-[var(--app-page-x)] pb-8">
          <header className="print-block border-b border-border pb-3">
            <h1 className="text-[22px] font-semibold">Nutrition report</h1>
            <p className="native-row-detail mt-1">
              {formatReportRangeLabel(report.start, report.end)} ·{" "}
              {report.daysLogged} of {report.daysInRange} days logged (
              {Math.round(report.loggingRate * 100)}%)
            </p>
          </header>

          <section className="print-block pt-4" aria-label="Daily averages">
            <h2 className="native-section-title">Daily averages</h2>
            <p className="native-row-detail mt-1">
              Across the {report.daysLogged} logged day
              {report.daysLogged === 1 ? "" : "s"}.
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
              {(
                [
                  ["Calories", `${report.averagesPerLoggedDay.calories} kcal`],
                  ["Protein", `${report.averagesPerLoggedDay.protein} g`],
                  [
                    carbLabel(carbMode),
                    `${
                      carbMode === "net"
                        ? report.averagesPerLoggedDay.netCarbs
                        : report.averagesPerLoggedDay.carbs
                    } g`,
                  ],
                  ["Fat", `${report.averagesPerLoggedDay.fat} g`],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="native-row-detail">{label}</dt>
                  <dd className="native-row-title">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="native-row-detail mt-2">
              Energy split — protein {report.macroSplit.protein}%, carbs{" "}
              {report.macroSplit.carbs}%, fat {report.macroSplit.fat}%.
            </p>
          </section>

          {report.goals?.calories ? (
            <section className="print-block pt-5" aria-label="Goal adherence">
              <h2 className="native-section-title">Against goal</h2>
              <p className="native-row-detail mt-1 tabular-nums">
                Goal {report.goals.calories} kcal · {report.goals.protein} g
                protein ·{" "}
                {displayCarbGoal(
                  report.goals.carbs ?? 0,
                  goals?.health?.fiber,
                  carbMode
                )}{" "}
                g {carbLabelLower(carbMode)} · {report.goals.fat} g fat
              </p>
              {report.goalAdherence && (
                <p className="native-row-detail mt-1 tabular-nums">
                  {report.goalAdherence.daysOnTarget} day
                  {report.goalAdherence.daysOnTarget === 1 ? "" : "s"} within
                  10% of target · {report.goalAdherence.daysUnder} under ·{" "}
                  {report.goalAdherence.daysOver} over · average deviation{" "}
                  {report.goalAdherence.averageDeviation}%
                </p>
              )}
            </section>
          ) : null}

          <section className="print-block pt-5" aria-label="Daily totals">
            <h2 className="native-section-title">Day by day</h2>
            <table className="print-table mt-2 w-full text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-1 font-semibold">
                    Date
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    kcal
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    P
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    C
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    F
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date} className="border-b border-border/60">
                    <th scope="row" className="py-1 font-normal">
                      {formatReportDate(day.date)}
                    </th>
                    <td className="py-1 text-right">
                      {day.logged ? Math.round(day.totals.calories) : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {day.logged ? Math.round(day.totals.protein) : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {day.logged
                        ? Math.round(
                            carbMode === "net"
                              ? day.totals.netCarbs
                              : day.totals.carbs
                          )
                        : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {day.logged ? Math.round(day.totals.fat) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {report.meals.length > 0 && (
            <section className="print-block pt-5" aria-label="Meal breakdown">
              <h2 className="native-section-title">
                Where the calories came from
              </h2>
              <ul className="mt-2 space-y-1 tabular-nums">
                {report.meals.map((meal) => (
                  <li
                    key={meal.meal}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="native-row-title">{meal.label}</span>
                    <span className="native-row-detail">
                      {meal.totals.calories} kcal · {meal.shareOfCalories}%
                      {/* Planned vs actual: the daily budget times the number
                          of logged days is the fair comparison for a range. */}
                      {mealTargetByMeal.has(meal.meal)
                        ? ` · planned ${Math.round(
                            (mealTargetByMeal.get(meal.meal) ?? 0) *
                              report.daysLogged
                          )} kcal`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {microRows.length > 0 && (
            <section
              className="print-block pt-5"
              aria-label="Micronutrient averages"
            >
              <h2 className="native-section-title">
                Micronutrients per logged day
              </h2>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                {microRows.map((key) => {
                  const meta = CUSTOM_FOOD_NUTRIENT_LABELS[key]
                  return (
                    <li
                      key={key}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="native-row-detail">{meta.label}</span>
                      <span className="native-row-title">
                        {report.microAverages[key]} {meta.unit}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {report.topFoods.length > 0 && (
            <section
              className="print-block pt-5"
              aria-label="Most logged foods"
            >
              <h2 className="native-section-title">Most logged foods</h2>
              <ul className="mt-2 space-y-1 tabular-nums">
                {report.topFoods.map((food) => (
                  <li
                    key={food.name}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="native-row-title truncate">
                      {food.name}
                    </span>
                    <span className="native-row-detail shrink-0">
                      ×{food.count} · {food.calories} kcal
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {includeEntries && (
            <section
              className="print-break-before pt-5"
              aria-label="Full food diary"
            >
              <h2 className="native-section-title">Full diary</h2>
              {report.days
                .filter((day) => day.logged)
                .map((day) => (
                  <div key={day.date} className="print-block mt-3">
                    <h3 className="native-row-title border-b border-border pb-1">
                      {formatReportDate(day.date)} —{" "}
                      {Math.round(day.totals.calories)} kcal
                    </h3>
                    <ul className="mt-1 space-y-0.5">
                      {day.entries.map((entry, index) => (
                        <li
                          key={entry.id ?? `${day.date}-${index}`}
                          className="flex items-baseline justify-between gap-3 text-[13px]"
                        >
                          <span className="min-w-0 truncate">
                            {entry.name}
                            {entry.servingLabel
                              ? ` (${entry.servingLabel})`
                              : ""}
                          </span>
                          <span className="native-row-detail shrink-0 tabular-nums">
                            {Math.round(entry.calories)} kcal
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </section>
          )}

          <footer className="print-block mt-6 border-t border-border pt-3">
            <p className="native-row-detail">
              Generated by OneRep on {formatReportDate(today)}. Figures come
              from self-reported logs and are estimates.
            </p>
          </footer>
        </article>
      )}
    </div>
  )
}
