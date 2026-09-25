import { Message, tr, translateError } from "@repo/ui/i18n"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { ArrowLeft, DownloadSimple, Printer } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { NavigationBar, ToolbarButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
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

// Decorative bar widths for the receipt footer. It scans as a barcode and
// encodes nothing.
const RECEIPT_BARCODE = [
  3, 1, 2, 1, 1, 3, 1, 2, 4, 1, 1, 2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 1, 3, 1, 2, 1,
  4, 1, 1, 3,
]

export default function NutritionReport() {
  const energyUnit = useEnergyUnit()
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
      toast.error(
        translateError(tr("Printing is not available on this device"))
      )
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
        toast.error(translateError(tr("Could not export this report")))
      }
    }
  }

  const microRows = FOOD_MICRONUTRIENT_KEYS.filter(
    (key) => (report.micros[key] ?? 0) > 0
  )

  const goalPercent = report.goals?.calories
    ? Math.round(
        (report.averagesPerLoggedDay.calories / report.goals.calories) * 100
      )
    : null

  return (
    <div className="native-page print-sheet mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <div className="print-hidden">
        <NavigationBar
          title={tr("Nutrition report")}
          subtitle={tr("Share with a coach or clinician")}
          leading={
            <ToolbarButton
              onClick={() => navigate(-1)}
              aria-label={tr("Back to nutrition")}
              className="-ml-2 px-0 text-muted-foreground"
            >
              <ArrowLeft size={19} weight="bold" />
            </ToolbarButton>
          }
          trailing={
            <div className="flex items-center gap-1">
              <ToolbarButton
                onClick={handleDownload}
                aria-label={tr("Download report data")}
              >
                <DownloadSimple size={19} weight="bold" />
              </ToolbarButton>
              <ToolbarButton
                onClick={handlePrint}
                aria-label={tr("Print report")}
              >
                <Printer size={19} weight="bold" />
              </ToolbarButton>
            </div>
          }
        />

        <div className="px-[var(--app-page-x)] pt-1 pb-3">
          <div
            role="group"
            aria-label={tr("Report period")}
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
            <span className="native-row-title">
              {tr("Include every food entry")}
            </span>
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
            <Message
              text={"{{value0}}Print or save as PDF"}
              values={{
                value0: <Printer size={17} weight="bold" aria-hidden />,
              }}
            />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-[var(--app-page-x)] pt-6 text-[15px] text-muted-foreground">
          {tr("Building your report…")}
        </p>
      ) : (
        <article className="nutrition-receipt motion-content-in mx-[var(--app-page-x)] mb-8 rounded-[3px] px-5 py-8 shadow-lg">
          <header className="print-block text-center">
            <p className="text-[11px] tracking-[0.3em]">{tr("OneRep")}</p>
            <h1 className="receipt-title mt-5">{tr("Nutrition receipt")}</h1>
            <p className="mt-5">
              <Message
                text={
                  "{{value0}}{{value1}}{{value2}} of {{value3}} days logged ({{value4}}%)"
                }
                values={{
                  value0: formatReportRangeLabel(report.start, report.end),
                  value1: <br />,
                  value2: report.daysLogged,
                  value3: report.daysInRange,
                  value4: Math.round(report.loggingRate * 100),
                }}
              />
            </p>
          </header>

          <section className="print-block mt-5" aria-label={tr("Daily totals")}>
            <hr className="receipt-rule" aria-hidden />
            <table className="print-table my-2">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="font-bold">
                    {tr("Day")}
                  </th>
                  <th scope="col" className="text-right font-bold">
                    {energyUnit}
                  </th>
                  <th scope="col" className="w-10 text-right font-bold">
                    {tr("P")}
                  </th>
                  <th scope="col" className="w-10 text-right font-bold">
                    {tr("C")}
                  </th>
                  <th scope="col" className="w-10 text-right font-bold">
                    {tr("F")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date}>
                    <th scope="row" className="text-left font-normal">
                      {formatReportDate(day.date)}
                    </th>
                    <td className="text-right">
                      {day.logged ? Math.round(day.totals.calories) : "—"}
                    </td>
                    <td className="text-right">
                      {day.logged ? Math.round(day.totals.protein) : "—"}
                    </td>
                    <td className="text-right">
                      {day.logged
                        ? Math.round(
                            carbMode === "net"
                              ? day.totals.netCarbs
                              : day.totals.carbs
                          )
                        : "—"}
                    </td>
                    <td className="text-right">
                      {day.logged ? Math.round(day.totals.fat) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr className="receipt-rule" aria-hidden />
          </section>

          <section
            className="print-block mt-4"
            aria-label={tr("Daily averages")}
          >
            <div className="receipt-row font-bold">
              <span>
                <Message
                  text={"Avg {{value0}}"}
                  values={{ value0: energyUnit }}
                />
              </span>
              <span>
                {report.averagesPerLoggedDay.calories}
                {report.goals?.calories
                  ? tr(" / {{value0}}", { value0: report.goals.calories })
                  : ""}
              </span>
            </div>
            <div className="receipt-row font-bold">
              <span>{tr("Protein")}</span>
              <span>
                <Message
                  text={"{{value0}}g{{value1}}"}
                  values={{
                    value0: report.averagesPerLoggedDay.protein,
                    value1: report.goals?.protein
                      ? tr(" / {{value0}}g", { value0: report.goals.protein })
                      : "",
                  }}
                />
              </span>
            </div>
            <div className="receipt-row font-bold">
              <span>{carbLabel(carbMode)}</span>
              <span>
                <Message
                  text={"{{value0}}g{{value1}}"}
                  values={{
                    value0:
                      carbMode === "net"
                        ? report.averagesPerLoggedDay.netCarbs
                        : report.averagesPerLoggedDay.carbs,
                    value1: report.goals?.carbs
                      ? tr(" / {{value0}}g", {
                          value0: displayCarbGoal(
                            report.goals.carbs,
                            goals?.health?.fiber,
                            carbMode
                          ),
                        })
                      : "",
                  }}
                />
              </span>
            </div>
            <div className="receipt-row font-bold">
              <span>{tr("Fat")}</span>
              <span>
                <Message
                  text={"{{value0}}g{{value1}}"}
                  values={{
                    value0: report.averagesPerLoggedDay.fat,
                    value1: report.goals?.fat
                      ? tr(" / {{value0}}g", { value0: report.goals.fat })
                      : "",
                  }}
                />
              </span>
            </div>
            <p className="mt-2">
              <Message
                text={
                  "Energy split: protein {{value0}}% · carbs {{value1}}% · fat {{value2}}%"
                }
                values={{
                  value0: report.macroSplit.protein,
                  value1: report.macroSplit.carbs,
                  value2: report.macroSplit.fat,
                }}
              />
            </p>
            {report.goalAdherence && (
              <p>
                <Message
                  text={
                    "{{value0}} day{{value1}} within 10% of target · {{value2}} under · {{value3}} over · avg deviation {{value4}}%"
                  }
                  values={{
                    value0: report.goalAdherence.daysOnTarget,
                    value1: report.goalAdherence.daysOnTarget === 1 ? "" : "s",
                    value2: report.goalAdherence.daysUnder,
                    value3: report.goalAdherence.daysOver,
                    value4: report.goalAdherence.averageDeviation,
                  }}
                />
              </p>
            )}
          </section>

          {goalPercent !== null && (
            <p
              className="print-block mt-5 text-center font-bold"
              aria-label={tr("Goal adherence")}
            >
              <Message
                text={"— {{value0}}% of daily goal —"}
                values={{ value0: goalPercent }}
              />
            </p>
          )}

          {report.meals.length > 0 && (
            <section
              className="print-block mt-4"
              aria-label={tr("Meal breakdown")}
            >
              <hr className="receipt-rule mb-3" aria-hidden />
              <h2 className="font-bold">{tr("By meal")}</h2>
              {report.meals.map((meal) => (
                <div key={meal.meal} className="receipt-row">
                  <span>{meal.label}</span>
                  <span>
                    {energyDisplay(meal.totals.calories, energyUnit)}{" "}
                    {energyUnit} · {meal.shareOfCalories}%
                    {/* Planned vs actual: the daily budget times the number
                        of logged days is the fair comparison for a range. */}
                    {mealTargetByMeal.has(meal.meal)
                      ? tr(" · plan {{value0}}", {
                          value0: Math.round(
                            (mealTargetByMeal.get(meal.meal) ?? 0) *
                              report.daysLogged
                          ),
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </section>
          )}

          {microRows.length > 0 && (
            <section
              className="print-block mt-4"
              aria-label={tr("Micronutrient averages")}
            >
              <h2 className="font-bold">{tr("Micros / logged day")}</h2>
              {microRows.map((key) => {
                const meta = CUSTOM_FOOD_NUTRIENT_LABELS[key]
                return (
                  <div key={key} className="receipt-row">
                    <span>{meta.label}</span>
                    <span>
                      {report.microAverages[key]} {meta.unit}
                    </span>
                  </div>
                )
              })}
            </section>
          )}

          {report.topFoods.length > 0 && (
            <section
              className="print-block mt-4"
              aria-label={tr("Most logged foods")}
            >
              <h2 className="font-bold">{tr("Most logged")}</h2>
              {report.topFoods.map((food) => (
                <div key={food.name} className="receipt-row">
                  <span className="min-w-0 truncate">{food.name}</span>
                  <span className="shrink-0">
                    ×{food.count} · {energyDisplay(food.calories, energyUnit)}{" "}
                    {energyUnit}
                  </span>
                </div>
              ))}
            </section>
          )}

          {includeEntries && (
            <section
              className="print-break-before mt-4"
              aria-label={tr("Full food diary")}
            >
              <hr className="receipt-rule mb-3" aria-hidden />
              <h2 className="font-bold">{tr("Full diary")}</h2>
              {report.days
                .filter((day) => day.logged)
                .map((day) => (
                  <div key={day.date} className="print-block mt-2">
                    <h3 className="receipt-row font-bold">
                      <span>{formatReportDate(day.date)}</span>
                      <span>
                        {energyDisplay(day.totals.calories, energyUnit)}{" "}
                        {energyUnit}
                      </span>
                    </h3>
                    {day.entries.map((entry, index) => (
                      <div
                        key={entry.id ?? `${day.date}-${index}`}
                        className="receipt-row"
                      >
                        <span className="min-w-0 truncate">
                          {entry.name}
                          {entry.servingLabel
                            ? tr(" ({{value0}})", {
                                value0: entry.servingLabel,
                              })
                            : ""}
                        </span>
                        <span className="shrink-0">
                          {Math.round(entry.calories)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </section>
          )}

          <footer className="print-block mt-6 text-center">
            <hr className="receipt-rule mb-5" aria-hidden />
            <div className="receipt-barcode" aria-hidden>
              {RECEIPT_BARCODE.map((width, index) => (
                <span
                  key={index}
                  style={{
                    width: `${width}px`,
                    marginRight: index === RECEIPT_BARCODE.length - 1 ? 0 : 2,
                  }}
                />
              ))}
            </div>
            <p className="mt-5 text-[11px] tracking-[0.3em]">{tr("OneRep")}</p>
            {/* 11px, not 10: the receipt's own body is 12px, and this line is
                the caveat on every number above it. Small enough to read as
                fine print, large enough to actually be fine print. */}
            <p className="mt-3 text-[11px] normal-case">
              <Message
                text={
                  "Generated on {{value0}}. Figures come from self-reported logs and are estimates."
                }
                values={{ value0: formatReportDate(today) }}
              />
            </p>
          </footer>
        </article>
      )}
    </div>
  )
}
