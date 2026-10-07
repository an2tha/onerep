import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { MemoryRouter } from "react-router"
import { SwapExerciseSheet } from "../../../src/components/swap-exercise-sheet"
import { swapExercisePlan } from "../../../src/lib/exercise-swap"
import { EXERCISES } from "../../../src/lib/exercise-catalog"
import {
  makeDefaultExerciseState,
  makeSet,
  type WorkoutItem,
} from "../../../src/lib/workout-logging"
import { convexClient } from "../../../src/lib/convex"
import type { Id } from "../../../../../convex/_generated/dataModel"
import "../../../src/styles/index.css"

const catalog = EXERCISES.map((exercise) => ({
  ...exercise,
  equipment: exercise.name.includes("Dumbbell") ? "Dumbbell" : "Barbell",
}))
const original = catalog.find((exercise) => exercise.id === "e1")!
const source = makeDefaultExerciseState(original)
source.sets = [
  { ...makeSet(), id: "performed", completed: true, weight: "100", reps: "5" },
  { ...makeSet(), id: "pending", weight: "100", reps: "5" },
]
let attempts = 0
const results: Record<string, unknown> = {
  "users/users:getPreferences": {
    aiSharingConsent: { granted: true, version: 4 },
  },
  "ai/usage:getMonthlyUsage": {
    unlimited: true,
    remaining: 100,
    serverAiConfigured: true,
  },
}
const client = {
  watchQuery(reference: Parameters<typeof getFunctionName>[0]) {
    return {
      onUpdate() {
        return () => {}
      },
      localQueryResult() {
        return results[getFunctionName(reference)] ?? null
      },
      journal() {},
    }
  },
  async query(
    reference: Parameters<typeof getFunctionName>[0],
    args: { query?: string }
  ) {
    if (getFunctionName(reference) === "exercises:search")
      return catalog.filter((exercise) =>
        exercise.name.toLowerCase().includes((args.query ?? "").toLowerCase())
      )
    return results[getFunctionName(reference)] ?? null
  },
  async mutation(
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown
  ) {
    sessionStorage.setItem(
      "swap-mutation",
      JSON.stringify({ name: getFunctionName(reference), args })
    )
    return null
  },
  async action() {
    attempts += 1
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (attempts === 1) throw new Error("Coach couldn't connect. Try again.")
    return [
      {
        exerciseId: "e3",
        explanation:
          "Keeps lower-body training with more emphasis on the hip hinge. Start with a fresh load.",
        sets: 3,
        reps: "6-8",
        restSeconds: 120,
      },
    ]
  },
}
convexClient.query = client.query as typeof convexClient.query
function Fixture() {
  const [open, setOpen] = useState(true)
  const [plan, setPlan] = useState({
    items: [{ kind: "solo", exerciseId: original.id }] as WorkoutItem[],
    exerciseData: { [original.id]: source },
  })
  return (
    <main className="min-h-svh bg-background p-6 text-foreground">
      <button onClick={() => setOpen(true)}>Swap exercise</button>
      <output className="sr-only" aria-label="Workout plan">
        {JSON.stringify(plan)}
      </output>
      {open && (
        <SwapExerciseSheet
          exercise={original}
          excludedIds={[original.id]}
          sessionNames={[original.name]}
          currentPrescription={{ sets: 1, reps: "5", restSeconds: 90 }}
          completedSets={1}
          preset={{
            _id: "fixture-preset" as Id<"presets">,
            updatedAt: 1,
            guidedProgrammeId: "fixture-programme" as Id<"guidedProgrammes">,
          }}
          onApply={(exercise, prescription) => {
            const state = makeDefaultExerciseState(exercise)
            state.barWeight = ""
            state.sets = Array.from({ length: prescription.sets }, () => ({
              ...makeSet(),
              reps: prescription.reps,
              restSeconds: prescription.restSeconds,
              weight: "",
            }))
            setPlan(
              swapExercisePlan(
                plan.items,
                plan.exerciseData,
                original.id,
                exercise.id,
                state
              )
            )
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  )
}
document.documentElement.classList.add("dark")
createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={client as unknown as ConvexReactClient}>
    <MemoryRouter>
      <Fixture />
    </MemoryRouter>
  </ConvexProvider>
)
