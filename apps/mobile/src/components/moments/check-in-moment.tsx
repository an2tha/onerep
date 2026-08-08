import { useState } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticSelection } from "@/lib/haptics"
import { DayStrip, fullDateLabel } from "@/components/log-past-workout-sheet"
import {
  MomentPrimaryAction,
  MomentScreen,
  MomentSecondaryAction,
} from "@/components/moments/moment-screen"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

export type CheckInVariant = "missed-log" | "training-lapse"

type Answer = {
  id: string
  label: string
  detail: string
  /** `retro` swaps to the day picker; everything else closes the screen. */
  action: "retro" | "nutrition" | "coach" | "routines" | "close"
  outcome: FullScreenEventOutcome
}

const MISSED_LOG_ANSWERS: Answer[] = [
  {
    id: "ate-unlogged",
    label: "I ate, I just didn't write it down",
    detail: "Open today's diary and fill in what you remember.",
    action: "nutrition",
    outcome: "resolved",
  },
  {
    id: "trained-unlogged",
    label: "I trained and forgot to log that too",
    detail: "Pick the day and log the session in a few taps.",
    action: "retro",
    outcome: "resolved",
  },
  {
    id: "off-day",
    label: "Today got away from me",
    detail: "Noted. Tomorrow is a separate argument.",
    action: "close",
    outcome: "dismissed",
  },
  {
    id: "help",
    label: "Something's not working for me",
    detail: "Tell your coach what's in the way.",
    action: "coach",
    outcome: "resolved",
  },
]

const LAPSE_ANSWERS: Answer[] = [
  {
    id: "trained-unlogged",
    label: "I trained, it just never got logged",
    detail: "Pick the day and put the session in.",
    action: "retro",
    outcome: "resolved",
  },
  {
    id: "resting",
    label: "I'm resting on purpose",
    detail: "Fine. That's a plan, not a lapse.",
    action: "close",
    outcome: "resolved",
  },
  {
    id: "sore",
    label: "Sore, tired, or hurt",
    detail: "Your coach can work around it.",
    action: "coach",
    outcome: "resolved",
  },
  {
    id: "lost-it",
    label: "I've lost the thread",
    detail: "Start from a shorter routine and rebuild.",
    action: "routines",
    outcome: "resolved",
  },
]

function copyFor(variant: CheckInVariant, daysSince: number) {
  if (variant === "missed-log") {
    return {
      title: "Nothing logged today.",
      subtitle:
        "You're usually done by now, so either the day went sideways or the app did. Which one?",
    }
  }
  return {
    title:
      daysSince > 0
        ? `${daysSince} days since your last session.`
        : "No training logged lately.",
    subtitle:
      "Not a crisis, and not nothing. Tell us what happened and we'll pick it up from there.",
  }
}

/**
 * The "what's up" screen behind both nudges.
 *
 * It asks before it suggests. Every answer routes somewhere useful, including
 * the ones that amount to "leave me alone" — those close cleanly rather than
 * arguing, which is the only reason a screen like this survives contact with
 * a real week.
 */
export function CheckInMoment({
  variant,
  todayKey,
  daysSince = 0,
  onClose,
}: {
  variant: CheckInVariant
  todayKey: string
  daysSince?: number
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const [step, setStep] = useState<"ask" | "day">("ask")
  // Today, on both paths: a session logged days late is rarer than one that
  // happened this morning and never got written down.
  const [date, setDate] = useState(todayKey)

  const answers = variant === "missed-log" ? MISSED_LOG_ANSWERS : LAPSE_ANSWERS
  const { title, subtitle } = copyFor(variant, daysSince)

  function choose(answer: Answer) {
    hapticSelection()
    if (answer.action === "retro") {
      setStep("day")
      return
    }

    onClose(answer.outcome)
    if (answer.action === "nutrition") {
      navigate(`/nutrition?date=${todayKey}`, { motion: "forward" })
    } else if (answer.action === "coach") {
      navigate("/coach", { motion: "forward" })
    } else if (answer.action === "routines") {
      navigate("/routines", { motion: "forward" })
    }
  }

  /**
   * Hands off to the existing retro funnel rather than growing a second one:
   * `?logPast=` opens the same sheet the Workouts page uses, already on the
   * chosen day, with both ways in — describe it, or start from a preset.
   */
  function logDay() {
    hapticSelection()
    onClose("resolved")
    navigate(`/workouts?logPast=${date}`, { motion: "forward" })
  }

  if (step === "day") {
    return (
      <MomentScreen
        title="Which day?"
        subtitle="Pick it, then describe the session or start from a preset — whichever is fewer taps."
        onClose={() => onClose("dismissed")}
        actions={
          <>
            <MomentPrimaryAction onClick={logDay}>
              Log {fullDateLabel(date, todayKey)}
            </MomentPrimaryAction>
            <MomentSecondaryAction
              onClick={() => {
                hapticSelection()
                setStep("ask")
              }}
              className="bg-transparent text-muted-foreground active:bg-muted/40"
            >
              <CaretLeft size={13} weight="bold" className="mr-1.5" />
              Back
            </MomentSecondaryAction>
          </>
        }
      >
        <DayStrip
          todayKey={todayKey}
          value={date}
          onChange={setDate}
          days={7}
        />
        <p className="mt-3 text-[13px] text-muted-foreground">
          {fullDateLabel(date, todayKey)}
        </p>
      </MomentScreen>
    )
  }

  return (
    <MomentScreen
      title={title}
      subtitle={subtitle}
      onClose={() => onClose("dismissed")}
      showClose={false}
      actions={
        <MomentSecondaryAction
          onClick={() => onClose("dismissed")}
          className="bg-transparent text-muted-foreground active:bg-muted/40"
        >
          Not now
        </MomentSecondaryAction>
      }
    >
      <div className="app-surface overflow-hidden">
        {answers.map((answer, index) => (
          <div key={answer.id}>
            {index > 0 && <div className="mx-4 h-px bg-border/50" />}
            <button
              type="button"
              onClick={() => choose(answer)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">
                  {answer.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                  {answer.detail}
                </span>
              </span>
              <CaretRight
                size={11}
                className="shrink-0 text-muted-foreground"
              />
            </button>
          </div>
        ))}
      </div>
    </MomentScreen>
  )
}
