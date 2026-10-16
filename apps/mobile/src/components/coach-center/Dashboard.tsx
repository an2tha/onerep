import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { ArrowUpRight, Check, Target } from "@phosphor-icons/react"
import { Button } from "@repo/ui/components/ui/button"
import { Textarea } from "@repo/ui/components/ui/textarea"
import { DisclosureRow, GroupedList } from "@repo/ui/components/mobile-ui"
import { tr, uiLocale } from "@repo/ui/i18n"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { currentDateKey, detectTimeZone } from "@/lib/food-log"
import { resultTitle } from "./CenterResult"
import type { CoachCenterKind } from "../../../../../packages/models/src/coach-center"

type Discuss = (text?: string, kind?: CoachCenterKind) => void
const shortDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString(uiLocale(), {
    month: "short",
    day: "numeric",
  })

/** A small amount of recorded context, without turning missing data into advice. */
export function TodayContext({
  onProgress,
  onCheckIn,
  onGoal,
}: {
  onProgress: () => void
  onCheckIn: () => void
  onGoal: (id: string) => void
}) {
  const logs = useQuery(api.logs.workouts.getHistory, {})
  const checkIns = useQuery(api.ai.coachState.listCheckIns, { limit: 14 })
  const goals = useQuery(api.ai.coachGoals.listActive, { limit: 20 })
  const [today, setToday] = useState(() => currentDateKey(detectTimeZone()))
  useEffect(() => {
    const update = () => setToday(currentDateKey(detectTimeZone()))
    const timer = setInterval(update, 60000)
    document.addEventListener("visibilitychange", update)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today + "T12:00:00")
    date.setDate(date.getDate() - 6 + i)
    return currentDateKey(detectTimeZone(), date)
  })
  const recent = logs?.filter((log) => days.includes(log.date)) ?? []
  const counts = days.map(
    (day) => recent.filter((log) => log.date === day).length,
  )
  const minutes = Math.round(
    recent.reduce((sum, log) => sum + Math.max(0, log.durationSeconds), 0) / 60,
  )
  const checkIn = checkIns?.find(
    (entry) => entry.date === today && (!entry.kind || entry.kind === "daily"),
  )
  const goal = goals?.find(
    (entry) =>
      (!entry.startDate || entry.startDate <= today) &&
      entry.endDate >= today &&
      entry.tasks.some((task) => !task.completed),
  )
  if (!recent.length && !checkIn && !goal) return null
  return (
    <section
      className="center-today-context"
      aria-label={tr("Your coaching context")}
    >
      {recent.length > 0 && (
        <button className="center-context-row" onClick={onProgress}>
          <span className="center-context-copy">
            <span className="center-context-label">{tr("Last 7 days")}</span>
            <span>
              <strong>{recent.length}</strong> {tr("Recorded sessions")}
              <span className="center-context-separator"> · </span>
              {minutes} {tr("min")}
            </span>
          </span>
          <span className="center-context-week" aria-hidden="true">
            {days.map((day, index) => (
              <span
                key={day}
                title={`${shortDate(day)}: ${counts[index]}`}
                className={counts[index] ? "has-session" : ""}
                style={{
                  height: `${4 + (18 * counts[index]) / Math.max(1, ...counts)}px`,
                }}
              />
            ))}
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      )}
      {checkIn ? (
        <button className="center-context-row" onClick={onCheckIn}>
          <span className="center-context-copy">
            <span className="center-context-label">
              {tr("Checked in today")}
            </span>
            <span>
              {tr("Energy")} <strong>{checkIn.energy}/5</strong>
              <span className="center-context-separator"> · </span>
              {tr("Sleep quality")} <strong>{checkIn.sleepQuality}/5</strong>
            </span>
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ) : goal ? (
        <button className="center-context-row" onClick={() => onGoal(goal._id)}>
          <span className="center-context-copy">
            <span className="center-context-label">{tr("Your focus")}</span>
            <span>{goal.title}</span>
          </span>
          <span
            className="center-context-completion"
            aria-label={tr("{{completed}} of {{total}} steps complete", {
              completed: goal.tasks.filter((task) => task.completed).length,
              total: goal.tasks.length,
            })}
          >
            {goal.tasks.filter((task) => task.completed).length}/
            {goal.tasks.length}
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}

export function TrainingSnapshot() {
  const navigate = useNavigate()
  const logs = useQuery(api.logs.workouts.getHistory, {})
  const today = currentDateKey(detectTimeZone())
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today + "T12:00:00")
    date.setDate(date.getDate() - 6 + i)
    return currentDateKey(detectTimeZone(), date)
  })
  const counts = days.map(
    (date) => (logs ?? []).filter((log) => log.date === date).length,
  )
  const total = counts.reduce((a, b) => a + b, 0)
  const minutes = Math.round(
    (logs ?? [])
      .filter((log) => days.includes(log.date))
      .reduce((sum, log) => sum + Math.max(0, log.durationSeconds), 0) / 60,
  )
  return (
    <section
      className="center-panel center-training"
      aria-labelledby="training-heading"
    >
      <div className="center-section-heading">
        <h2 id="training-heading">{tr("Last 7 days")}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/coach/progress")}
        >
          {tr("Explore progress")}
          <ArrowUpRight size={15} />
        </Button>
      </div>
      {logs === undefined ? (
        <p role="status">{tr("Loading training…")}</p>
      ) : (
        <>
          <div className="center-training-totals">
            <div>
              <strong>{total}</strong>
              <span>{tr("Recorded sessions")}</span>
            </div>
            <div>
              <strong>
                {minutes}
                <small> {tr("min")}</small>
              </strong>
              <span>{tr("Training time")}</span>
            </div>
          </div>
          <div
            className="center-week"
            role="list"
            aria-label={tr("Recorded sessions")}
          >
            {days.map((date, i) => (
              <div
                role="listitem"
                key={date}
                aria-label={`${shortDate(date)}: ${counts[i]}`}
              >
                <span className="center-week-count">{counts[i] || "·"}</span>
                <div
                  aria-hidden="true"
                  className={counts[i] ? "has-session" : ""}
                  style={{
                    height: `${12 + (48 * counts[i]) / Math.max(1, ...counts)}px`,
                  }}
                />
                <span>
                  {new Date(date + "T12:00:00").toLocaleDateString(uiLocale(), {
                    weekday: "short",
                  })}
                </span>
                <small>{new Date(date + "T12:00:00").getDate()}</small>
              </div>
            ))}
          </div>
          <p className="center-caption">
            {total
              ? logs.length === 120
                ? tr("From your latest 120 workout records.")
                : tr("From your OneRep workout log.")
              : tr("No sessions logged")}
          </p>
        </>
      )}
    </section>
  )
}

type Scores = {
  energy: number
  soreness: number
  sleepQuality: number
  mood: number
}
const metrics = () => [
  {
    key: "energy" as const,
    label: tr("Energy"),
    low: tr("Low"),
    high: tr("High"),
  },
  {
    key: "sleepQuality" as const,
    label: tr("Sleep quality"),
    low: tr("Poor"),
    high: tr("Great"),
  },
  {
    key: "soreness" as const,
    label: tr("Soreness"),
    low: tr("None"),
    high: tr("High"),
  },
  {
    key: "mood" as const,
    label: tr("Mood"),
    low: tr("Low"),
    high: tr("Great"),
  },
]
export function DailyCheckIn({ onDiscuss }: { onDiscuss: Discuss }) {
  const today = currentDateKey(detectTimeZone())
  const checkIns = useQuery(api.ai.coachState.listCheckIns, { limit: 14 })
  const save = useMutation(api.ai.coachState.saveCheckIn)
  const existing = checkIns?.find(
    (item) => item.date === today && (!item.kind || item.kind === "daily"),
  )
  const [editing, setEditing] = useState(false)
  const [scores, setScores] = useState<Partial<Scores>>({})
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const complete = metrics().every((m) => scores[m.key] !== undefined)
  async function submit() {
    if (!complete || busy) return
    setBusy(true)
    setError("")
    try {
      await save({
        date: today,
        kind: "daily",
        ...(scores as Scores),
        note: note.trim(),
      })
      setSaved(true)
      setEditing(false)
    } catch {
      setError(
        tr(
          "Could not save your check-in. Your answers are still here. Try again.",
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="center-panel center-checkin"
      aria-labelledby="checkin-heading"
    >
      <div className="center-section-heading">
        <h2 id="checkin-heading">{tr("Daily check-in")}</h2>
        <span className="center-caption">{shortDate(today)}</span>
      </div>
      {checkIns === undefined ? (
        <p role="status">{tr("Loading check-in…")}</p>
      ) : existing && !editing ? (
        <>
          <p className="center-checkin-saved">
            <Check size={18} />
            {tr("Checked in today")}
          </p>
          <dl className="center-scores">
            {metrics().map((m) => (
              <div key={m.key}>
                <dt>{m.label}</dt>
                <dd>
                  {existing[m.key]}
                  <span>/5</span>
                </dd>
              </div>
            ))}
          </dl>
          {existing.note && <p className="center-caption">{existing.note}</p>}
          <div className="center-inline-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setScores({
                  energy: existing.energy,
                  soreness: existing.soreness,
                  sleepQuality: existing.sleepQuality,
                  mood: existing.mood,
                })
                setNote(existing.note ?? "")
                setEditing(true)
                setSaved(false)
              }}
            >
              {tr("Edit check-in")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onDiscuss(
                  tr("Help me adapt today's training to my latest check-in."),
                )
              }
            >
              {tr("Discuss with Coach")}
              <ArrowUpRight size={15} />
            </Button>
          </div>
        </>
      ) : (
        <details className="center-checkin-details" open={editing || undefined}>
          <summary>
            {tr("How are you arriving today?")}
            <span>{tr("Check in")}</span>
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {metrics().map((m) => (
              <fieldset className="center-rating" key={m.key} disabled={busy}>
                <legend>
                  {m.label}
                  <small>
                    {m.low} → {m.high}
                  </small>
                </legend>
                <div>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <label key={score}>
                      <input
                        type="radio"
                        name={m.key}
                        value={score}
                        checked={scores[m.key] === score}
                        onChange={() =>
                          setScores((s) => ({ ...s, [m.key]: score }))
                        }
                      />
                      <span>{score}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="center-note-label" htmlFor="center-checkin-note">
              {tr("Anything else? (optional)")}
            </label>
            <Textarea
              id="center-checkin-note"
              rows={2}
              maxLength={280}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
            {error && (
              <p role="alert" className="center-error">
                {error}
              </p>
            )}
            <div className="center-inline-actions">
              <Button type="submit" disabled={!complete || busy}>
                {busy ? tr("Saving…") : tr("Save check-in")}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  {tr("Cancel")}
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
      <span role="status" className="sr-only">
        {saved ? tr("Check-in saved") : ""}
      </span>
    </section>
  )
}

export function SavedResults() {
  const navigate = useNavigate()
  const review = useQuery(api.ai.coachCenterState.latest, { kind: "review" })
  const plan = useQuery(api.ai.coachCenterState.latest, { kind: "plan" })
  const progress = useQuery(api.ai.coachCenterState.latest, {
    kind: "progress",
  })
  const meals = useQuery(api.ai.coachCenterState.latest, { kind: "meals" })
  const results = [review, plan, progress, meals]
    .filter((r) => r != null)
    .sort((a, b) => b.createdAt - a.createdAt)
  return (
    <section className="center-saved" aria-labelledby="saved-heading">
      <div className="center-section-heading">
        <h2 id="saved-heading">{tr("Your Coach workspace")}</h2>
      </div>
      {[review, plan, progress, meals].some((r) => r === undefined) ? (
        <p role="status">{tr("Loading saved results…")}</p>
      ) : results.length ? (
        <div className="center-saved-list">
          {results.map((result) => (
            <button
              key={result.kind}
              className="center-saved-result"
              onClick={() => navigate(`/coach/${result.kind}`)}
            >
              <span className="center-saved-copy">
                <span className="center-result-kicker">
                  {resultTitle(result.kind)}
                </span>
                <span className="center-saved-title">
                  {result.content.title}
                </span>
              </span>
              <time dateTime={new Date(result.createdAt).toISOString()}>
                {new Date(result.createdAt).toLocaleDateString(uiLocale(), {
                  month: "short",
                  day: "numeric",
                })}
              </time>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className="center-workspace-empty">
          <Button variant="ghost" onClick={() => navigate("/coach/review")}>
            {tr("Create your first review")}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      )}
    </section>
  )
}

export function ActiveGoals({
  onDiscuss,
  focusGoal,
  onlyGoalId,
}: {
  onDiscuss: Discuss
  focusGoal?: { id: string; request: number }
  onlyGoalId?: string
}) {
  const goals = useQuery(api.ai.coachGoals.listActive, { limit: 20 })
  const toggle = useMutation(api.ai.coachGoals.setTaskCompleted)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [completed, setCompleted] = useState("")
  useEffect(() => {
    if (!focusGoal) return
    setShowAll(true)
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`coach-goal-${focusGoal.id}`)
      target?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusGoal, showAll])
  async function setTask(
    id: Id<"coachGoalTasks">,
    checked: boolean,
    title: string,
  ) {
    if (pending) return
    setPending(id)
    setError("")
    try {
      await toggle({ id, completed: checked })
      setCompleted(checked ? title : "")
    } catch {
      setError(tr("Could not update this task. Try again."))
    } finally {
      setPending(null)
    }
  }
  return (
    <section className="center-panel" aria-labelledby="goals-heading">
      <div className="center-section-heading">
        <h2 id="goals-heading">{tr("Your focus")}</h2>
        <Target size={20} />
      </div>
      {goals === undefined ? (
        <p role="status">{tr("Loading goals…")}</p>
      ) : goals.length ? (
        <>
          {(onlyGoalId
            ? goals.filter((goal) => goal._id === onlyGoalId)
            : showAll
              ? goals
              : goals.slice(0, 2)
          ).map((goal) => (
            <div
              key={goal._id}
              className="center-goal"
              id={`coach-goal-${goal._id}`}
              tabIndex={-1}
            >
              <h3>{goal.title}</h3>
              <p className="center-caption">
                {goal.tasks.filter((t) => t.completed).length}/
                {goal.tasks.length} ·{" "}
                {tr("Target: {{date}}", { date: shortDate(goal.endDate) })}
              </p>
              <progress
                value={goal.tasks.filter((t) => t.completed).length}
                max={goal.tasks.length || 1}
                aria-label={goal.title}
              />
              {goal.tasks.map((task) => (
                <label className="center-goal-task" key={task._id}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={pending !== null}
                    onChange={(e) =>
                      void setTask(task._id, e.target.checked, task.title)
                    }
                  />
                  <span>
                    {task.title}
                    {task.detail && <small>{task.detail}</small>}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {!onlyGoalId && goals.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? tr("Show less") : tr("Show all goals")}
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="center-caption">
            {tr(
              "Turn something you want to improve into small, trackable steps.",
            )}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              onDiscuss(
                tr(
                  "Help me set one practical goal with trackable steps. Ask me what I want to improve first.",
                ),
              )
            }
          >
            {tr("Set a goal with Coach")}
            <ArrowUpRight size={16} />
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="center-error">
          {error}
        </p>
      )}
      <p className="center-caption" role="status">
        {completed && tr("Completed: {{title}}", { title: completed })}
      </p>
    </section>
  )
}

export function FocusTools() {
  const navigate = useNavigate()
  return (
    <section aria-labelledby="tools-heading">
      <div className="center-section-heading">
        <h2 id="tools-heading">{tr("Work on something specific")}</h2>
      </div>
      <GroupedList>
        <DisclosureRow
          title={tr("Investigate a plateau")}
          onClick={() =>
            navigate("/coach/progress", {
              state: {
                preferences: tr(
                  "Review my recorded training for possible plateaus. Separate evidence from missing data and suggest one change to test.",
                ),
              },
            })
          }
        />
        <DisclosureRow
          title={tr("Plan a lighter week")}
          onClick={() =>
            navigate("/coach/plan", {
              state: {
                preferences: tr(
                  "Help me plan a lighter training week using my recent workouts and recovery check-ins. Explain what to reduce and what to keep.",
                ),
              },
            })
          }
        />
        <DisclosureRow
          title={tr("Make meal prep easier")}
          onClick={() =>
            navigate("/coach/meals", {
              state: {
                preferences: tr(
                  "Suggest simple meal-prep ideas with overlapping ingredients and minimal preparation. Respect my dietary preferences and include steps.",
                ),
              },
            })
          }
        />
      </GroupedList>
    </section>
  )
}

export function LearningShelf() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState<"training" | "nutrition" | "recovery">(
    "training",
  )
  const topics = [
    { id: "training" as const, label: tr("Training") },
    { id: "nutrition" as const, label: tr("Nutrition") },
    { id: "recovery" as const, label: tr("Recovery") },
  ]
  const items = {
    training: [
      {
        id: "progression",
        title: tr("Progress without adding weight"),
        detail: tr("Reps, load, and repeatable sessions"),
      },
      {
        id: "effort",
        title: tr("Find the right effort"),
        detail: tr("Use reps in reserve with context"),
      },
      {
        id: "plateau",
        title: tr("Understand a plateau"),
        detail: tr("What to check before changing everything"),
      },
    ],
    nutrition: [
      {
        id: "protein",
        title: tr("Make protein practical"),
        detail: tr("Build it into the meals you already eat"),
      },
      {
        id: "meals",
        title: tr("Build repeatable meals"),
        detail: tr("Flexible ingredients, less daily planning"),
      },
      {
        id: "labels",
        title: tr("Read a food label"),
        detail: tr("Match your serving to your log"),
      },
    ],
    recovery: [
      {
        id: "sleep",
        title: tr("Look at your sleep pattern"),
        detail: tr("Find context beyond a single night"),
      },
      {
        id: "soreness",
        title: tr("Make sense of soreness"),
        detail: tr("Separate soreness from workout quality"),
      },
      {
        id: "deload",
        title: tr("Know when to ease off"),
        detail: tr("Give a lighter week a clear purpose"),
      },
    ],
  }
  return (
    <section aria-labelledby="learn-heading">
      <div className="center-section-heading">
        <h2 id="learn-heading">{tr("Build your knowledge")}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/coach/guides")}
        >
          {tr("All guides")}
          <ArrowUpRight size={15} />
        </Button>
      </div>
      <div
        className="center-topics"
        role="group"
        aria-label={tr("Guide topics")}
      >
        {topics.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={topic === t.id ? "secondary" : "ghost"}
            aria-pressed={topic === t.id}
            onClick={() => setTopic(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <GroupedList>
        {items[topic].map((item, i) => (
          <DisclosureRow
            key={item.id}
            leading={
              <span className="center-guide-index">
                {String(i + 1).padStart(2, "0")}
              </span>
            }
            title={item.title}
            detail={item.detail}
            onClick={() => navigate(`/coach/guides/${item.id}`)}
          />
        ))}
      </GroupedList>
    </section>
  )
}
