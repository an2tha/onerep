import { ArrowLeft, Barbell, Clock } from "@phosphor-icons/react"
import { NavigationBar, ToolbarButton } from "@/components/mobile-ui"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"

const EXAMPLE_ROUTINES = [
  {
    name: "Three-day foundation",
    frequency: "3 days / week",
    duration: "45–55 min",
    focus: "Strength",
    sessions: ["Full body A", "Full body B", "Full body A"],
  },
  {
    name: "Upper / lower",
    frequency: "4 days / week",
    duration: "50–65 min",
    focus: "Strength",
    sessions: ["Upper", "Lower", "Upper", "Lower"],
  },
  {
    name: "Strength and conditioning",
    frequency: "3 days / week",
    duration: "40–55 min",
    focus: "Mixed",
    sessions: ["Strength", "Intervals", "Strength"],
  },
  {
    name: "Daily mobility reset",
    frequency: "6 days / week",
    duration: "12 min",
    focus: "Mobility",
    sessions: ["Hips", "Spine", "Shoulders"],
  },
] as const

export default function RoutinesHub() {
  const navigate = useSmoothNavigate()

  function goBack() {
    hapticSelection()
    navigate("/workouts", { motion: "back" })
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background text-foreground lg:pr-8 lg:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-5xl pb-[calc(var(--app-safe-bottom-lg)+2rem)]">
        <NavigationBar
          title="Routines"
          leading={
            <ToolbarButton onClick={goBack} aria-label="Back to training">
              <ArrowLeft size={20} weight="bold" />
            </ToolbarButton>
          }
        />

        <div className="px-[var(--app-page-x)]">
          <p className="max-w-xl text-[15px] leading-6 text-muted-foreground">
            Starter structures to preview how saved training routines will feel.
          </p>

          <section
            className="mt-7 grid gap-x-8 md:grid-cols-2"
            aria-label="Example routines"
          >
            {EXAMPLE_ROUTINES.map((routine, index) => (
              <article
                key={routine.name}
                className="border-t border-border py-6 first:border-t-foreground/70 md:[&:nth-child(2)]:border-t-foreground/70"
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      Routine {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2 className="mt-2 text-[1.3rem] leading-tight font-semibold tracking-[-0.025em]">
                      {routine.name}
                    </h2>
                  </div>
                  <Barbell
                    size={24}
                    weight="regular"
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </div>

                <dl className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3 text-[13px]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock size={15} aria-hidden />
                    <dt className="sr-only">Session duration</dt>
                    <dd>{routine.duration}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Frequency</dt>
                    <dd>{routine.frequency}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Focus</dt>
                    <dd>{routine.focus}</dd>
                  </div>
                </dl>

                <ol className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[14px] sm:grid-cols-3">
                  {routine.sessions.map((session, sessionIndex) => (
                    <li
                      key={`${session}-${sessionIndex}`}
                      className="flex gap-2"
                    >
                      <span className="text-muted-foreground">
                        {String(sessionIndex + 1).padStart(2, "0")}
                      </span>
                      <span>{session}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
