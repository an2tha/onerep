import { ArrowUpRight } from "@phosphor-icons/react"
import { Link } from "react-router"
import { tr } from "@repo/ui/i18n"

/** A persistent doorway shared by Home, Goals, and the nutrition diary. */
export function ProgrammeEntry({
  track,
}: {
  track?: "nutrition" | "training"
}) {
  return (
    <Link
      to={track ? `/programmes?track=${track}` : "/programmes"}
      className="group flex min-h-14 items-center justify-between gap-4 rounded-lg py-2 text-left text-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-current"
    >
      <span>
        <span className="block text-sm font-medium">
          {track === "nutrition"
            ? tr("Nutrition programmes")
            : track === "training"
              ? tr("Workout programmes")
              : tr("Programmes")}
        </span>
        <span className="block text-xs leading-5 text-muted-foreground">
          {track === "nutrition"
            ? tr("Meal plans, recipes, and your next step")
            : track === "training"
              ? tr("Training blocks and your next workout")
              : tr("Your guided nutrition and training plans")}
        </span>
      </span>
      <ArrowUpRight
        size={18}
        aria-hidden="true"
        className="shrink-0 opacity-65 group-hover:opacity-100"
      />
    </Link>
  )
}
