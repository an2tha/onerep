import { Component, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { tr } from "@repo/ui/i18n"
import { energyDisplay } from "@repo/ui"
import type { EnergyUnit } from "@/lib/use-energy-unit"
import { formatWater, type WaterUnit } from "@/lib/measurement-system"
import { logDevWarn } from "@/lib/utils"
import {
  externalHeadlineRows,
  externalNoun,
  externalNutrients,
  externalSourceLabel,
} from "@/lib/external-intake"

type Props = {
  /** The local day being looked at, so browsing back shows that day's imports. */
  date: string
  energyUnit: EnergyUnit
  waterUnit: WaterUnit
}

function rounded(value: number): string {
  return Math.round(value).toLocaleString()
}

/**
 * What other apps logged, said plainly and kept out of the day's totals.
 *
 * Read-only on purpose. These figures were written in another app and this one
 * cannot edit or delete them, so folding them into the diary would put meals on
 * the screen that have no source here to correct — and every day somebody logs
 * the same lunch in both apps would count twice. Shown beside the totals with
 * the split named, the number is still there when it is wanted and cannot
 * quietly inflate a ring the app scores against.
 *
 * Renders nothing at all when no other app has logged that day: an empty card
 * saying "0 kcal from other apps" is a claim about the store, not a fact about
 * the person.
 */
/**
 * Hides the card rather than the page.
 *
 * The query is only as new as the deployment behind it. A build that asks a
 * backend which has never heard of it gets an error thrown from render, and
 * without a boundary of its own that error reaches the diary's and replaces the
 * whole Nutrition screen — during a rollout, on every phone that updated
 * first. An optional, read-only figure is not worth that; it disappears here
 * and the numbers the person can actually log stay on screen.
 */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    logDevWarn("Hid the other-apps nutrition card: this server has no such query", error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function ExternalIntakeCard(props: Props) {
  return (
    <SilentBoundary>
      <ExternalIntakeCardBody {...props} />
    </SilentBoundary>
  )
}

function ExternalIntakeCardBody({ date, energyUnit, waterUnit }: Props) {
  const intake = useQuery(api.logs.externalIntake.forDate, { date })
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo(
    () => externalNutrients(intake?.nutrients),
    [intake?.nutrients]
  )
  const headline = useMemo(() => externalHeadlineRows(rows), [rows])
  const rest = useMemo(() => rows.filter((row) => !row.headline), [rows])

  if (!intake || rows.length === 0) return null

  function display(row: (typeof rows)[number]): string {
    if (row.key === "dietaryEnergyKcal") {
      return `${rounded(energyDisplay(row.value, energyUnit))} ${energyUnit}`
    }
    if (row.key === "hydrationMl") {
      return formatWater(row.value, waterUnit)
    }
    const noun = externalNoun(row.key)
    return `${rounded(row.value)} ${row.unit}${noun ? ` ${noun}` : ""}`
  }

  const sources = externalSourceLabel(intake.sources, tr("another app"))

  return (
    <div className="mt-4 border-t border-border/35 pt-3 text-left">
      <p className="text-[13px] font-semibold">
        {tr("Logged in other apps")}
      </p>
      <p className="mt-1 text-[13px] leading-5 tabular-nums">
        {headline.map(display).join(" · ")}
      </p>
      <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
        {tr("From {{value0}}. Not counted in your totals.", { value0: sources })}
      </p>
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-1.5 text-[12px] font-semibold text-muted-foreground underline underline-offset-4"
          >
            {expanded ? tr("Show less") : tr("Show every nutrient")}
          </button>
          {expanded && (
            <dl className="mt-2 space-y-1 text-[12px]">
              {rest.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="tabular-nums">
                    {rounded(row.value)} {row.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  )
}
