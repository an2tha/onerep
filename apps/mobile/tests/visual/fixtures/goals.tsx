import { buildGoalAssessment } from "../../../../../convex/lib/goalAssessment"
import { assessmentFixture } from "../../goals/assessment-fixture"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { GoalsHubView } from "../../../src/components/goals-hub"
import type { GoalPlan } from "../../../src/lib/goal-plan"
import "../../../src/styles/index.css"

document.documentElement.classList.toggle(
  "dark",
  window.matchMedia("(prefers-color-scheme: dark)").matches
)

function Fixture() {
  const mode = new URLSearchParams(window.location.search).get("mode")
  const data = assessmentFixture()
  if (mode === "poor")
    data.health.slice(0, 3).forEach((r) => {
      r.sleepMinutes = 280
      r.hrvMs = 35
      r.restingHeartRateBpm = 65
    })
  if (mode === "empty") {
    data.health = []
    data.workouts = []
  }

  const [preferences, setPreferences] = useState<{
    goalsIntroducedAt?: number
    goalPlan?: GoalPlan
  }>(
    mode === "poor" || mode === "empty"
      ? { goalsIntroducedAt: 1, goalPlan: data.plan }
      : {}
  )
  const [failSave, setFailSave] = useState(false)
  return (
    <MemoryRouter>
      <main style={{ maxWidth: 760, padding: "24px 20px", margin: "auto" }}>
        <h1 className="app-title">Goals</h1>
        <label>
          <input
            type="checkbox"
            checked={failSave}
            onChange={(event) => setFailSave(event.target.checked)}
          />{" "}
          Simulate saving failure
        </label>
        <GoalsHubView
          assessment={
            preferences.goalPlan
              ? buildGoalAssessment({ ...data, plan: preferences.goalPlan })
              : null
          }
          preferences={preferences}
          history={[]}
          today="2026-09-25"
          save={async ({ plan }) => {
            if (failSave) throw new Error("Offline")
            setPreferences((previous) => ({
              ...previous,
              goalsIntroducedAt: 1,
              ...(plan ? { goalPlan: plan } : {}),
            }))
          }}
        />
      </main>
    </MemoryRouter>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
