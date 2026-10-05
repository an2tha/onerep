import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { MemoryRouter, Route, Routes } from "react-router"
import ActiveWorkout from "../../../src/pages/ActiveWorkout"
import { EXERCISES } from "../../../src/lib/exercise-catalog"
import {
  makeDefaultExerciseState,
  writeActiveWorkoutDraft,
} from "../../../src/lib/workout-logging"
import { convexClient } from "../../../src/lib/convex"
import "../../../src/styles/index.css"

// Exercise queries and all mutations use this in-memory backend. These tests
// run the actual route and its handlers without touching an account or server.
const catalog = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise])
)
const strength = EXERCISES.find((exercise) => exercise.category === "strength")!
const cardio = EXERCISES.find((exercise) => exercise.category === "cardio")!
const scenario = new URLSearchParams(window.location.search).get("scenario")
const exercise = scenario === "cardio" ? cardio : strength
const exerciseData = { [exercise.id]: makeDefaultExerciseState(exercise) }
exerciseData[exercise.id]!.sets = exerciseData[exercise.id]!.sets.map(
  (set) => ({ ...set, weight: "60", reps: "8", restSeconds: 0 })
)
const items = [{ kind: "solo", exerciseId: exercise.id }]
const listeners = new Set<() => void>()
let active: Record<string, unknown> | null = null
let completed = false
function WorkoutList() {
  return (
    <main>
      <h1>{completed ? "Workout saved" : "Workouts"}</h1>
    </main>
  )
}
const notify = () => listeners.forEach((listener) => listener())
const results: Record<string, unknown> = {
  "logs/presets:list": [
    { id: "fixture", name: "Workout test", items, exerciseData },
  ],
  "logs/workouts:getHistory": [],
  "logs/foodLogs:getRecent": [],
  "bodyProgress:list": [],
  "ai/formCoach:listSupported": [],
  "users/users:getPreferences": {
    weightUnit: "kg",
    liveWorkoutStatusEnabled: false,
  },
  "ai/usage:getMonthlyUsage": { unlimited: true, remaining: 100 },
  "exercises:resolve": catalog,
}
const client = {
  watchQuery(reference: Parameters<typeof getFunctionName>[0]) {
    const name = getFunctionName(reference)
    return {
      onUpdate(callback: () => void) {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
      localQueryResult() {
        return name === "logs/activeWorkout:getActive"
          ? active
          : (results[name] ?? null)
      },
      journal() {
        return undefined
      },
    }
  },
  async query(reference: Parameters<typeof getFunctionName>[0]) {
    return results[getFunctionName(reference)] ?? null
  },
  async mutation(
    reference: Parameters<typeof getFunctionName>[0],
    args: Record<string, unknown>
  ) {
    const name = getFunctionName(reference)
    if (name === "logs/activeWorkout:createActive") {
      if (scenario === "slow-create") {
        document.documentElement.dataset.createPending = "true"
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      active = {
        ...args,
        _id: "fixture-workout",
        _creationTime: Date.now(),
        startedAt: Date.now(),
        elapsedSeconds: 0,
      }
      document.documentElement.dataset.createdStartedAt = String(
        active.startedAt
      )
      notify()
      return { id: "fixture-workout", startedAt: active.startedAt }
    }
    if (name === "logs/activeWorkout:updateActive") {
      active = { ...active, ...args }
      notify()
    }
    if (name === "logs/activeWorkout:finishActive") {
      completed = true
      active = null
      notify()
    }
    if (name === "logs/activeWorkout:abortActive") {
      active = null
      notify()
    }
    return { ok: true }
  },
  async action() {
    throw new Error("Coach is intentionally unavailable in this fixture")
  },
  connectionState() {
    return {
      isWebSocketConnected: true,
      hasInflightRequests: false,
      timeOfOldestInflightRequest: null,
      webSocketConnectionCount: 1,
      webSocketConnectionRetries: 0,
    }
  },
  subscribeToConnectionState() {
    return () => {}
  },
}
convexClient.query = client.query as typeof convexClient.query
localStorage.removeItem("onerep:active-workout-draft:v1:1")
localStorage.removeItem("onerep:active-rest-timer:v1:1")
if (scenario === "resume" || scenario === "resume-clean") {
  const startedAt = Date.now() - 60_000
  active = {
    slot: 1,
    items,
    exerciseData,
    startedAt,
    elapsedSeconds: 60,
    _id: "fixture-workout",
  }
  const localData = structuredClone(exerciseData)
  localData[exercise.id]!.sets[0]!.reps = "12"
  writeActiveWorkoutDraft({
    slot: 1,
    items: items as [{ kind: "solo"; exerciseId: string }],
    exerciseData: localData,
    elapsedSeconds: 60,
    startedAt,
    savedAt: Date.now(),
    hasUnsyncedChanges: scenario === "resume",
  })
}
localStorage.setItem("onerep:active-workout-simple-view", "true")
localStorage.setItem("onerep:active-superset-tip-hidden", "1")
document.documentElement.classList.toggle(
  "dark",
  window.matchMedia("(prefers-color-scheme: dark)").matches
)
createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={client as unknown as ConvexReactClient}>
    <MemoryRouter
      initialEntries={["/workouts", "/workout/active?preset=fixture"]}
    >
      <Routes>
        <Route path="/workout/active" element={<ActiveWorkout />} />
        <Route path="/workouts" element={<WorkoutList />} />
      </Routes>
    </MemoryRouter>
  </ConvexProvider>
)
