import { useQuery } from "convex/react"
import { Link } from "react-router"
import { ArrowUpRight } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import { ProgrammeEntry } from "./programme-entry"

export function HomeProgrammes() {
  const programmes = useQuery(api.guidedProgrammes.list, {})
  const active =
    programmes?.filter(
      (programme) =>
        programme.status === "active" || programme.status === "paused",
    ) ?? []
  if (active.length === 0) return <ProgrammeEntry />
  return (
    <section className="py-2" aria-label={tr("Your programmes")}>
      <Link
        to="/programmes"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium outline-offset-4 focus-visible:outline-2"
      >
        {tr("Programmes")}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {active.map((programme) => (
          <Link
            key={programme._id}
            to={`/programmes?programme=${programme._id}`}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-sm outline-offset-4 focus-visible:outline-2"
          >
            <span className="text-xs text-muted-foreground">
              {programme.track === "nutrition"
                ? tr("Nutrition")
                : tr("Training")}{" "}
              ·{" "}
              {programme.status === "paused"
                ? tr("Paused")
                : tr("View today's plan")}
            </span>
            <span className="line-clamp-1">{programme.settings.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
