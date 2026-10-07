import { tr } from "@repo/ui/i18n"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  BookOpen,
  Path,
  Heartbeat,
  RocketLaunch,
  UserCircle,
  CaretRight,
} from "@phosphor-icons/react"

export default function More() {
  const navigate = useSmoothNavigate()
  const destinations = [
    { path: "/programmes", label: tr("Programmes"), description: tr("Guided nutrition and training, built around you"), Icon: Path },
    {
      path: "/journal",
      label: tr("Journal"),
      description: tr("Your notes and daily check-ins"),
      Icon: BookOpen,
    },
    {
      path: "/health",
      label: tr("Health"),
      description: tr("Sleep, recovery, and health readings"),
      Icon: Heartbeat,
    },
    {
      path: "/coach",
      label: tr("Coach"),
      description: tr("Ask questions and plan your next step"),
      Icon: RocketLaunch,
    },
    {
      path: "/settings",
      label: tr("Settings"),
      description: tr("Profile, preferences, and connections"),
      Icon: UserCircle,
    },
  ]
  return (
    <main className="desktop-canvas min-h-svh px-[var(--app-page-x)] pt-[var(--app-safe-top)] pb-28 lg:pl-72">
      <h1 className="py-6 text-3xl font-semibold">{tr("More")}</h1>
      <nav
        aria-label={tr("More destinations")}
        className="max-w-xl divide-y divide-border"
      >
        {destinations.map(({ path, label, description, Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path, { motion: "forward" })}
            className="flex min-h-20 w-full items-center gap-3 py-3 text-left"
          >
            <Icon size={24} />
            <span className="flex-1">
              <span className="block font-semibold">{label}</span>
              <span className="text-sm text-muted-foreground">
                {description}
              </span>
            </span>
            <CaretRight size={18} />
          </button>
        ))}
      </nav>
    </main>
  )
}
