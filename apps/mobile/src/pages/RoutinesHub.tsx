import { Message, tr } from "@repo/ui/i18n"
import { ArrowLeft, Barbell, Clock } from "@phosphor-icons/react"
import { NavigationBar, ToolbarButton } from "@repo/ui"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"

const EXAMPLE_ROUTINES = [
  {
    name: tr("Three-day foundation"),
    frequency: tr("3 days / week"),
    duration: tr("45–55 min"),
    focus: tr("Strength"),
    sessions: [tr("Full body A"), tr("Full body B"), tr("Full body A")],
  },
  {
    name: tr("Upper / lower"),
    frequency: tr("4 days / week"),
    duration: tr("50–65 min"),
    focus: tr("Strength"),
    sessions: [tr("Upper"), tr("Lower"), tr("Upper"), tr("Lower")],
  },
  {
    name: tr("Strength and conditioning"),
    frequency: tr("3 days / week"),
    duration: tr("40–55 min"),
    focus: tr("Mixed"),
    sessions: [tr("Strength"), tr("Intervals"), tr("Strength")],
  },
  {
    name: tr("Daily mobility reset"),
    frequency: tr("6 days / week"),
    duration: tr("12 min"),
    focus: tr("Mobility"),
    sessions: [tr("Hips"), tr("Spine"), tr("Shoulders")],
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
          title={tr("Routines")}
          leading={
            <ToolbarButton onClick={goBack} aria-label={tr("Back to training")}>
              <ArrowLeft size={20} weight="bold" />
            </ToolbarButton>
          }
        />

        <div className="px-[var(--app-page-x)]">
          <p className="max-w-xl text-[15px] leading-6 text-muted-foreground">
            {tr(
              "Starter structures to preview how saved training routines will feel."
            )}
          </p>

          <section
            className="mt-7 grid gap-x-8 md:grid-cols-2"
            aria-label={tr("Example routines")}
          >
            {EXAMPLE_ROUTINES.map((routine, index) => (
              <article
                key={routine.name}
                className="border-t border-border py-6 first:border-t-foreground/70 md:[&:nth-child(2)]:border-t-foreground/70"
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      <Message
                        text={"Routine {{value0}}"}
                        values={{ value0: String(index + 1).padStart(2, "0") }}
                      />
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
                    <dt className="sr-only">{tr("Session duration")}</dt>
                    <dd>{routine.duration}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{tr("Frequency")}</dt>
                    <dd>{routine.frequency}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{tr("Focus")}</dt>
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
