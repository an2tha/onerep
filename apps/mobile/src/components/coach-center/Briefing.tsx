import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { useNavigate } from "react-router"
import { ArrowRight } from "@phosphor-icons/react"
import { Button } from "@repo/ui/components/ui/button"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { currentDateKey } from "@/lib/food-log"
import { actions } from "@/components/restart/restart-content"
import { Orb } from "@repo/ui/coach"
import { coachSignals, type CoachSignal } from "@repo/models/coach-signals"

type Review = {
  id: string
  createdAt: number
  headline: string
  summary: string
}
export function Briefing({
  preview = false,
  review,
  onReview,
  onCheckIn,
  onGoal,
  onDiscuss,
}: {
  preview?: boolean
  review: Review | null | undefined
  onReview: () => void
  onCheckIn: () => void
  onGoal: (id: string) => void
  onDiscuss: (text: string) => void
}) {
  const navigate = useNavigate()
  const { userId } = useAppAuth()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = setInterval(update, 60000)
    document.addEventListener("visibilitychange", update)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  const today = currentDateKey(undefined, now)
  const logs = useQuery(api.logs.workouts.getHistory, {})
  const checkIns = useQuery(api.ai.coachState.listCheckIns, { limit: 14 })
  const goals = useQuery(api.ai.coachGoals.listActive, { limit: 20 })
  const recovery = useQuery(api.recovery.get, {})
  const restart = useQuery(api.restart.get, {
    clockKey: String(Math.floor(now.getTime() / 300000)),
  })
  const [dismissed, setDismissed] = useState<string[]>([])
  const storageKey =
    userId && !preview ? `onerep:coach-signals:${userId}` : null
  useEffect(() => {
    try {
      const stored = JSON.parse(
        storageKey ? (localStorage.getItem(storageKey) ?? "null") : "null",
      )
      setDismissed(
        stored?.date === today && Array.isArray(stored.keys)
          ? stored.keys.filter((k: unknown) => typeof k === "string").slice(-20)
          : [],
      )
    } catch {
      setDismissed([])
    }
  }, [storageKey, today])
  const loading = [logs, checkIns, goals, recovery, restart, review].some(
    (value) => value === undefined,
  )
  const signals = loading
    ? []
    : coachSignals({
        today,
        logs: logs ?? [],
        checkIns: checkIns ?? [],
        goals: goals ?? [],
        recovery,
        restart,
        review,
      })
  const available = signals.filter(
    (s) =>
      s.kind !== "activity" &&
      s.kind !== "logging" &&
      (s.kind === "recovery" || !dismissed.includes(s.key)),
  )
  const current = available[0]
  function dismiss(signal: CoachSignal) {
    const keys = [...dismissed, signal.key].slice(-20)
    setDismissed(keys)
    if (storageKey)
      try {
        localStorage.setItem(storageKey, JSON.stringify({ date: today, keys }))
      } catch {
        /* Suggestions still dismiss for this visit. */
      }
  }
  function restore() {
    setDismissed([])
    if (storageKey)
      try {
        localStorage.removeItem(storageKey)
      } catch {
        /* Keep the current session usable. */
      }
  }
  return (
    <section
      className="coach-overture"
      aria-labelledby="briefing-heading"
      aria-busy={loading}
    >
      <div className="overture-orb">
        <Orb />
      </div>
      <div className="overture-copy">
        <h2 id="briefing-heading">
          {loading
            ? tr("Loading…")
            : current
              ? describe(current).title
              : tr("Ask Coach…")}
        </h2>
        {!loading && current && (
          <>
            <div className="overture-actions">
              <Button variant="secondary" onClick={() => act(current)}>
                {describe(current).action}
                <ArrowRight size={16} />
              </Button>
              {current.kind !== "recovery" && (
                <Button variant="ghost" onClick={() => dismiss(current)}>
                  {tr("Not now")}
                </Button>
              )}
            </div>
            <details className="overture-evidence" key={current.key}>
              <summary>{tr("Why this suggestion?")}</summary>
              {describe(current).detail && <p>{describe(current).detail}</p>}
              <p>{describe(current).evidence}</p>
            </details>
          </>
        )}
        {!loading && dismissed.length > 0 && (
          <button className="overture-restore" onClick={restore}>
            {tr("Show suggestions again")}
          </button>
        )}
      </div>
    </section>
  )
  function act(signal: CoachSignal) {
    switch (signal.kind) {
      case "recovery":
        navigate("/recovery")
        break
      case "restart":
        navigate("/restart")
        break
      case "checkin":
        onCheckIn()
        break
      case "adjust":
        navigate("/coach/plan", {
          state: {
            preferences: tr(
              "Review today's recovery check-in before suggesting training. Help me decide what to adjust, without assuming a diagnosis or changing my plan automatically.",
            ),
          },
        })
        break
      case "review":
        onReview()
        break
      case "goal":
        if (signal.goalId) onGoal(signal.goalId)
        break
      case "revisit":
        onDiscuss(
          tr(
            "Help me revisit this goal whose target date has passed: {{goal}}. Ask whether I want to continue, change, or close it before making changes.",
            { goal: signal.title ?? "" },
          ),
        )
        break
      case "activity":
        navigate("/coach/progress", {
          state: {
            preferences: tr(
              "Compare my recent recorded sessions with the previous week. Distinguish changes in logging from changes in training and suggest one useful next step.",
            ),
          },
        })
        break
      case "logging":
        navigate("/coach/guides/logging")
        break
    }
  }
}
function describe(s: CoachSignal) {
  const common = { title: "", detail: "", action: "", evidence: "", label: "" }
  switch (s.kind) {
    case "recovery":
      return {
        ...common,
        title: tr("Recovery comes first."),
        detail: tr(
          "Your recovery mode is active. Start with the plan you've already chosen.",
        ),
        action: tr("Open recovery plan"),
        evidence: tr(
          "An active recovery episode takes priority over training and goal suggestions.",
        ),
        label: tr("Recovery"),
      }
    case "restart": {
      const action = actions().find((a) => a.id === s.source)
      return {
        ...common,
        title: action
          ? s.count === 0
            ? action.prep
            : action.task
          : tr("Pick up your small plan."),
        detail: s.detail
          ? tr("Your chosen moment: {{anchor}}.", { anchor: s.detail })
          : tr("One manageable step from the restart plan you chose."),
        action: tr("Continue my restart"),
        evidence: tr(
          "You have an active restart plan. This is its next step, rather than a new commitment.",
        ),
        label: tr("Your restart"),
      }
    }
    case "adjust":
      return {
        ...common,
        title: tr("Today's check-in"),
        detail: tr(
          "Today's check-in is worth reviewing before your next session.",
        ),
        action: tr("Adapt today's plan"),
        evidence: tr(
          "Today's scores: energy {{energy}}/5, sleep {{sleep}}/5, soreness {{soreness}}/5. This is a prompt to review your plan, not a readiness score.",
          {
            energy: s.scores?.energy ?? 0,
            sleep: s.scores?.sleepQuality ?? 0,
            soreness: s.scores?.soreness ?? 0,
          },
        ),
        label: tr("Today's check-in"),
      }
    case "review":
      return {
        ...common,
        title: s.title ?? "",
        detail: s.detail ?? "",
        action: tr("Open your review"),
        evidence: tr(
          "A recent AI weekly review is waiting for you. Review its suggestions before applying any changes.",
        ),
        label: tr("AI weekly review"),
      }
    case "goal":
      return {
        ...common,
        title: s.title ?? "",
        detail: tr("The next unfinished step in {{goal}}.", { goal: s.source }),
        action: tr("See my goal steps"),
        evidence: tr(
          "This step belongs to your active goal, {{goal}}. Its target date has not passed.",
          { goal: s.source },
        ),
        label: tr("Your goal"),
      }
    case "revisit":
      return {
        ...common,
        title: tr("Revisit this goal"),
        detail: s.title ?? "",
        action: tr("Revisit this goal"),
        evidence: tr(
          "The target date for this goal has passed and it still has unfinished steps. Coach won't treat those old steps as today's instructions.",
        ),
        label: tr("Goal review"),
      }
    case "checkin":
      return {
        ...common,
        title: tr("Daily check-in"),
        detail: tr("A quick check-in gives your next decision some context."),
        action: tr("Check in now"),
        evidence: tr(
          "There is no daily check-in recorded for today. Coach won't guess your energy or recovery.",
        ),
        label: tr("Daily check-in"),
      }
    case "activity":
      return {
        ...common,
        title: tr("{{count}} sessions this week", {
          count: s.count ?? 0,
        }),
        detail: tr(
          "Your last seven days of recorded training are ready to explore.",
        ),
        action: tr("Explore my progress"),
        evidence:
          s.previous === undefined
            ? tr(
                "Based on the latest 120 workout records. Missing logs are not treated as rest days.",
              )
            : tr(
                "{{current}} sessions recorded in the last seven days; {{previous}} in the seven days before that. This describes your log, not a performance rating.",
                { current: s.count ?? 0, previous: s.previous },
              ),
        label: tr("Training pattern"),
      }
    case "logging":
      return {
        ...common,
        title: tr("Workout log"),
        detail: tr(
          "There are no workout entries in the last seven days. If you've trained, a log will help Coach understand it.",
        ),
        action: tr("Make my logs useful"),
        evidence: tr(
          "An empty log doesn't tell us whether you trained. Coach needs records before drawing a trend.",
        ),
        label: tr("Training context"),
      }
  }
}
