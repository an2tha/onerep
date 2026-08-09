import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CaretRight, Drop, ForkKnife } from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import { fmtMl } from "@/lib/water-amounts"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import type { FoodLogEntry } from "@/lib/food-log"
import type { SourceWorkoutLog } from "@/lib/moment-quick-log"
import {
  MomentScreen,
  MomentSecondaryAction,
} from "@/components/moments/moment-screen"
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
   * `retro` and `rest` finish the job here. The rest hand off, because
   * describing a meal or talking to a coach is not a one-tap thing and
   * pretending otherwise would just add a step.
   */
  action: "retro" | "rest" | "nutrition" | "coach" | "routines" | "close"
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
    detail: "Tell your coach what's in the way.",
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
 * It asks before it suggests, and where it can, it finishes the job in place:
 * a rest week, a glass of water, a meal you have eaten forty times before all
 * complete here and close on a write rather than on a promise to go somewhere
 * else and do it. The answers that genuinely need another screen — describing
 * a session out loud, talking to the coach — still hand off, because faking
 * those into one tap would only add a step.
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
  const [step, setStep] = useState<"ask" | "day">("ask")
  const [busy, setBusy] = useState(false)

  const markRestDays = useMutation(api.logs.restDays.mark)
  const unmarkRestDays = useMutation(api.logs.restDays.unmark)
  const addWater = useMutation(api.logs.water.addEntry)
  const removeWater = useMutation(api.logs.water.removeEntry)
  const addFood = useMutation(api.logs.foodLogs.addEntry)
  const removeFood = useMutation(api.logs.foodLogs.removeEntry)

  // Only the missed-log nudge offers food and water, and only it pays for the
  // history query behind them.
  const recentFood = useQuery(
    api.logs.foodLogs.getRecent,
    variant === "missed-log" ? { beforeOrOn: todayKey, limit: 14 } : "skip"
  ) as Array<{ date: string; entries: FoodLogEntry[] }> | undefined

  const answers = variant === "missed-log" ? MISSED_LOG_ANSWERS : LAPSE_ANSWERS
  const { title, subtitle } = copyFor(variant, daysSince)

  /** The handful of foods this user logs over and over, newest portion first. */
  const repeatFoods = useMemo(() => {
    if (!recentFood) return []
    return buildQuickRepeatFoods(
      recentFood.filter((day) => day.date !== todayKey),
      3
    )
  }, [recentFood, todayKey])

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

  async function logFood(entry: FoodLogEntry) {
    if (busy) return
    const id = createClientId()
    setBusy(true)
    try {
      await addFood({
        date: todayKey,
        entry: { ...entry, id, loggedAt: new Date().toISOString() },
      })
      hapticMedium()
      toast.success(`${entry.name} logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            void removeFood({ date: todayKey, entryId: id }).catch(() => {
              toast.error("Couldn't undo that")
            })
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to repeat a food from a moment", error)
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

    onClose(answer.outcome)
    if (answer.action === "nutrition") {
      navigate(`/nutrition?date=${todayKey}`, { motion: "forward" })
    } else if (answer.action === "coach") {
      navigate("/coach", { motion: "forward" })
    } else if (answer.action === "routines") {
      navigate("/routines", { motion: "forward" })
    }
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
            <button
              type="button"
              disabled={busy}
              onClick={() => choose(answer)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40 disabled:opacity-45"
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

      {variant === "missed-log" && (
        <div className="mt-5">
          <p className="mb-2 px-1 text-[13px] text-muted-foreground">
            Or salvage something from today
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
            {repeatFoods.map((food) => (
              <Chip
                key={food.key}
                icon={<ForkKnife size={13} weight="bold" />}
                label={food.entry.name}
                disabled={busy}
                onClick={() => void logFood(food.entry)}
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
