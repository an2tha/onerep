import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CaretLeft, ChatCircleDots, Drop } from "@phosphor-icons/react"
import { MomentRow, MomentScreen, MomentSecondaryAction, toast } from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import { fmtMl } from "@/lib/water-amounts"
import type { FoodLogEntry } from "@/lib/food-log"
import type { SourceWorkoutLog } from "@/lib/moment-quick-log"
import { QuickFoodStep } from "@/components/moments/quick-food-step"
import { QuickLogStep } from "@/components/moments/quick-log-step"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

export type CheckInVariant = "missed-log" | "training-lapse"

/** The two amounts worth a chip. Anything finer belongs on the water screen. */
const WATER_CHIPS_ML = [250, 500]

type Answer = {
  id: string
  label: string
  detail: string
  /**
   * Every answer but `close` opens something: the rapid food log, the day
   * picker, the questions the coach gets asked. Nothing here is a bare link
   * to a page.
   */
  action: "retro" | "rest" | "coach" | "nutrition" | "close"
  outcome: FullScreenEventOutcome
}

/**
 * Questions worth asking a coach about a stalled week, phrased the way the
 * user would phrase them.
 *
 * Tapping one sends it — the point of a shortcut is not having to type, and a
 * prompt sitting in a composer waiting to be pressed is still typing's
 * problem. "Another reason" opens the coach with an empty composer for
 * everything these four do not cover.
 */
const COACH_PROMPTS: Record<CheckInVariant, string[]> = {
  "training-lapse": [
    "I'm too sore to train the way my plan wants. What should I change this week?",
    "Something hurts when I train. How do I work around it without losing progress?",
    "I'm exhausted and my sessions keep slipping. Is this recovery or motivation?",
    "I've missed a stretch of training. Where should I restart without overdoing it?",
  ],
  "missed-log": [
    "I keep forgetting to log my food. How do I make it stick?",
    "Logging every meal is taking too long. What is the least I can track and still make progress?",
    "I stopped logging because the numbers were stressing me out. What now?",
    "My eating has drifted off plan. Help me get back to it without starting over.",
  ],
}

const MISSED_LOG_ANSWERS: Answer[] = [
  {
    id: "ate-unlogged",
    label: "I ate, I just didn't write it down",
    detail: "Your usual foods and recipes, one tap each.",
    action: "nutrition",
    outcome: "resolved",
  },
  {
    id: "trained-unlogged",
    label: "I trained and forgot to log that too",
    detail: "Repeat a recent session onto the right day.",
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
    detail: "Ask your coach, without typing it out.",
    action: "coach",
    outcome: "resolved",
  },
]

const LAPSE_ANSWERS: Answer[] = [
  {
    id: "trained-unlogged",
    label: "I trained, it just never got logged",
    detail: "Repeat a recent session onto the right day.",
    action: "retro",
    outcome: "resolved",
  },
  {
    id: "resting",
    label: "I'm resting on purpose",
    detail: "Marks those days as rest so this stops asking.",
    action: "rest",
    outcome: "resolved",
  },
  {
    id: "sore",
    label: "Sore, tired, or hurt",
    detail: "Ask your coach to work around it.",
    action: "coach",
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
 * It asks before it suggests, and where it can, it finishes the job in place:
 * a rest week, a glass of water, a meal you have eaten forty times before all
 * complete here and close on a write rather than on a promise to go somewhere
 * else and do it. Talking to the coach is one step removed rather than two:
 * pick the question here and it arrives already asked.
 */
export function CheckInMoment({
  variant,
  todayKey,
  daysSince = 0,
  idleDates = [],
  workoutLogs = [],
  onClose,
}: {
  variant: CheckInVariant
  todayKey: string
  daysSince?: number
  /** The unrested gap, marked wholesale when the user says it was planned. */
  idleDates?: string[]
  workoutLogs?: SourceWorkoutLog[]
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const [step, setStep] = useState<"ask" | "day" | "coach" | "food">("ask")
  const [busy, setBusy] = useState(false)

  const markRestDays = useMutation(api.logs.restDays.mark)
  const unmarkRestDays = useMutation(api.logs.restDays.unmark)
  const addWater = useMutation(api.logs.water.addEntry)
  const removeWater = useMutation(api.logs.water.removeEntry)

  // Only the missed-log nudge offers food and water, and only it pays for the
  // history query behind them.
  const recentFood = useQuery(
    api.logs.foodLogs.getRecent,
    variant === "missed-log" ? { beforeOrOn: todayKey, limit: 14 } : "skip"
  ) as Array<{ date: string; entries: FoodLogEntry[] }> | undefined

  const answers = variant === "missed-log" ? MISSED_LOG_ANSWERS : LAPSE_ANSWERS
  const { title, subtitle } = copyFor(variant, daysSince)

  /** Marks the whole unrested stretch, with one undo covering all of it. */
  async function markRest() {
    const dates = idleDates.length > 0 ? idleDates : [todayKey]
    setBusy(true)
    try {
      await markRestDays({ dates, source: "moment" })
      hapticMedium()
      onClose("resolved")
      toast.success(
        dates.length === 1
          ? "Marked as rest"
          : `${dates.length} days off, noted`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              void unmarkRestDays({ dates }).catch(() => {
                toast.error("Couldn't undo that")
              })
            },
          },
        }
      )
    } catch (error) {
      logDevWarn("Failed to mark rest days", error)
      toast.error("Couldn't save that. Try again.")
      setBusy(false)
    }
  }

  /**
   * The screen stays open for these two.
   *
   * A glass of water is not an answer to "what happened today" — it is
   * something to do while deciding, and closing the screen on it would lose
   * the question the user has not answered yet.
   */
  async function logWater(amountMl: number) {
    if (busy) return
    const id = createClientId()
    setBusy(true)
    try {
      await addWater({
        date: todayKey,
        entry: { id, amountMl, loggedAt: new Date().toISOString() },
      })
      hapticMedium()
      toast.success(`${fmtMl(amountMl)} logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            void removeWater({ date: todayKey, id }).catch(() => {
              toast.error("Couldn't undo that")
            })
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log water from a moment", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  function choose(answer: Answer) {
    hapticSelection()
    if (answer.action === "retro") {
      setStep("day")
      return
    }
    if (answer.action === "rest") {
      void markRest()
      return
    }
    if (answer.action === "coach") {
      setStep("coach")
      return
    }
    if (answer.action === "nutrition") {
      setStep("food")
      return
    }
    onClose(answer.outcome)
  }

  /** Hands the question to the coach and lets it answer on arrival. */
  function askCoach(prompt?: string) {
    hapticSelection()
    onClose("resolved")
    navigate("/coach", {
      motion: "forward",
      state: prompt
        ? {
            coachMode: "personal_trainer",
            initialInput: prompt,
            autoSend: true,
          }
        : undefined,
    })
  }

  if (step === "food") {
    return (
      <QuickFoodStep
        todayKey={todayKey}
        recentFood={recentFood}
        onBack={() => setStep("ask")}
        onClose={onClose}
      />
    )
  }

  if (step === "coach") {
    return (
      <MomentScreen
        title="What should it know?"
        subtitle="Pick the closest one and your coach answers it with your last twelve weeks already in front of it."
        onClose={() => {
          hapticSelection()
          onClose("dismissed")
        }}
        actions={
          <>
            <MomentSecondaryAction onClick={() => askCoach()}>
              Another reason
            </MomentSecondaryAction>
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
        <div className="app-surface overflow-hidden">
          {COACH_PROMPTS[variant].map((prompt, index) => (
            <div key={prompt}>
              {index > 0 && <div className="mx-4 h-px bg-border/50" />}
              <button
                type="button"
                onClick={() => askCoach(prompt)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40"
              >
                <span className="app-icon-button pointer-events-none h-9 w-9 shrink-0 bg-muted/55 text-muted-foreground/70">
                  <ChatCircleDots size={16} weight="bold" />
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug font-medium">
                  {prompt}
                </span>
              </button>
            </div>
          ))}
        </div>
      </MomentScreen>
    )
  }

  if (step === "day") {
    return (
      <QuickLogStep
        todayKey={todayKey}
        workoutLogs={workoutLogs}
        onBack={() => setStep("ask")}
        onClose={onClose}
      />
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
            <MomentRow
              title={answer.label}
              detail={answer.detail}
              disabled={busy}
              onClick={() => choose(answer)}
            />
          </div>
        ))}
      </div>

      {/*
        Water only. The foods that used to sit here are the whole of the
        rapid-log step now, and offering the same three in two places invites
        the user to log one of them twice.
      */}
      {variant === "missed-log" && (
        <div className="mt-5">
          <p className="mb-2 px-1 text-[13px] text-muted-foreground">
            Or drink something, while you are here
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WATER_CHIPS_ML.map((amountMl) => (
              <Chip
                key={amountMl}
                icon={<Drop size={13} weight="bold" />}
                label={fmtMl(amountMl)}
                disabled={busy}
                onClick={() => void logWater(amountMl)}
              />
            ))}
          </div>
        </div>
      )}
    </MomentScreen>
  )
}

function Chip({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="motion-tactile flex max-w-full items-center gap-1.5 rounded-full bg-muted/50 py-2.5 pr-3.5 pl-3 text-[13px] font-semibold transition-colors active:bg-muted disabled:opacity-45"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
