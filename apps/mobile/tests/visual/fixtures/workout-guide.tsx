import { createRoot } from "react-dom/client"
import { useState } from "react"
import { WorkoutGuide } from "../../../src/pages/workout-guide/WorkoutGuide"
import "../../../src/styles/index.css"
const scenario = new URLSearchParams(location.search).get("scenario")
function Fixture() {
  const [open, setOpen] = useState(true)
  const [applied, setApplied] = useState(false)
  const [requests, setRequests] = useState(0)
  return open ? (
    <WorkoutGuide
      editing={scenario === "edit"}
      existingName="Upper body A"
      storageKey="test-workout-guide"
      onClose={() => setOpen(false)}
      onPlan={async () => {
        sessionStorage.setItem("test-guide-planning-calls", String(Number(sessionStorage.getItem("test-guide-planning-calls") ?? 0) + 1))
        return ["effort", "pace"]
      }}
      onGenerate={async (answers, notes) => {
        sessionStorage.setItem(
          "test-guide-payload",
          JSON.stringify({ answers, notes })
        )
        setRequests((value) => value + 1)
        await new Promise((resolve) =>
          setTimeout(resolve, scenario === "loading" ? 2400 : 150)
        )
        if (scenario === "server-error" && requests === 0)
          throw new Error("[CONVEX A(logs/presetAgent:createGuidedDraft)] [Request ID: secret] Server Error Uncaught Error: failed at convex/private.ts:123")
        if (scenario === "failure" && requests === 0)
          throw new Error("Connection lost. Your answers are kept. Try again.")
        return {
          name: "Full body foundations",
          notes:
            "A balanced session with familiar movements. Warm up with lighter sets before your working sets.",
          exercises: ["Barbell Squat", "Bench Press", "Bent Over Row"].map(
            (name) => ({
              name,
              sets: Array.from({ length: 3 }, () => ({
                type: "working" as const,
                weight: "",
                reps: "8",
                restSeconds: 90,
              })),
            })
          ),
        }
      }}
      onApply={async () => {
        setApplied(true)
        setOpen(false)
      }}
    />
  ) : (
    <main>
      <h1>{applied ? "Workout editor" : "Workout"}</h1>
      <button onClick={() => setOpen(true)}>Resume guide</button>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
