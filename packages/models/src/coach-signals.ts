/** Deterministic, inspectable signals from authenticated records. No model call or inferred activity. */
export type CoachSignal = {
  kind:
    | "recovery"
    | "restart"
    | "checkin"
    | "adjust"
    | "review"
    | "goal"
    | "revisit"
    | "activity"
    | "logging"
  key: string
  source: string
  title?: string
  detail?: string
  count?: number
  previous?: number
  scores?: { energy: number; sleepQuality: number; soreness: number }
  goalId?: string
}
type SignalInput = {
  today: string
  logs: { date: string }[]
  checkIns: {
    date: string
    kind?: string
    energy: number
    sleepQuality: number
    soreness: number
    updatedAt?: number
  }[]
  goals: {
    _id: string
    title: string
    startDate?: string
    endDate: string
    tasks: { _id: string; title: string; completed: boolean }[]
  }[]
  recovery?: { active?: unknown } | null
  restart?: {
    plan?: {
      status: string
      stage: number
      action?: string
      anchor?: string
    } | null
  } | null
  review?: {
    id: string
    createdAt: number
    headline: string
    summary: string
  } | null
}
export function coachSignals(input: SignalInput): CoachSignal[] {
  const { today, goals, checkIns, review, restart, recovery } = input
  const day = Date.parse(today + "T12:00:00Z")
  const ago = (n: number) =>
    new Date(day - n * 86400000).toISOString().slice(0, 10)
  const checkIn = checkIns.find(
    (c) => c.date === today && (!c.kind || c.kind === "daily"),
  )
  // A recovery episode takes precedence over training or goal prompts.
  if (recovery?.active)
    return [{ kind: "recovery", key: `recovery:${today}`, source: today }]
  const signals: CoachSignal[] = []
  if (restart?.plan?.status === "active")
    signals.push({
      kind: "restart",
      key: `restart:${today}:${restart.plan.stage}:${restart.plan.action}`,
      source: restart.plan.action ?? "",
      count: restart.plan.stage,
      detail: restart.plan.anchor,
    })
  if (
    checkIn &&
    (checkIn.energy <= 2 || checkIn.sleepQuality <= 2 || checkIn.soreness >= 4)
  )
    signals.push({
      kind: "adjust",
      key: `adjust:${today}:${checkIn.updatedAt ?? JSON.stringify(checkIn)}`,
      source: today,
      scores: {
        energy: checkIn.energy,
        sleepQuality: checkIn.sleepQuality,
        soreness: checkIn.soreness,
      },
    })
  if (
    review &&
    review.createdAt >= day - 7 * 86400000 &&
    review.createdAt < day + 86400000
  )
    signals.push({
      kind: "review",
      key: `review:${review.id}`,
      source: today,
      title: review.headline,
      detail: review.summary,
    })
  for (const goal of goals.filter(
    (g) => (!g.startDate || g.startDate <= today) && g.endDate >= today,
  )) {
    const task = goal.tasks.find((t) => !t.completed)
    if (task) {
      signals.push({
        kind: "goal",
        key: `goal:${goal._id}:${task._id}`,
        source: goal.title,
        title: task.title,
        goalId: goal._id,
      })
      break
    }
  }
  if (!checkIn)
    signals.push({ kind: "checkin", key: `checkin:${today}`, source: today })
  const logs = input.logs.filter(
    (l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.date <= today,
  )
  const current = logs.filter((l) => l.date >= ago(6)).length
  const previous = logs.filter(
    (l) => l.date >= ago(13) && l.date < ago(6),
  ).length
  if (current)
    signals.push({
      kind: "activity",
      key: `activity:${today}:${current}:${previous}`,
      source: ago(6),
      count: current,
      previous: input.logs.length < 120 ? previous : undefined,
    })
  const expired = goals.find(
    (g) => g.endDate < today && g.tasks.some((t) => !t.completed),
  )
  if (expired)
    signals.push({
      kind: "revisit",
      key: `revisit:${expired._id}:${expired.endDate}`,
      source: expired.endDate,
      title: expired.title,
      goalId: expired._id,
    })
  if (!current)
    signals.push({ kind: "logging", key: `logging:${today}`, source: today })
  return signals
}
