import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ProgrammeSetupView } from "../../../src/components/nutrition-programme"
import {
  goalNutritionDefaults,
  type GoalFocus,
} from "../../../../../convex/lib/goalNutrition"
import type { Id } from "../../../../../convex/_generated/dataModel"
import "../../../src/styles/index.css"

document.documentElement.classList.toggle(
  "dark",
  matchMedia("(prefers-color-scheme: dark)").matches
)
const params = new URLSearchParams(location.search)
const focus = (params.get("focus") || "hypertrophy") as GoalFocus
function Fixture() {
  const [open, setOpen] = useState(false)
  const [fail, setFail] = useState(false)
  const [result, setResult] = useState("")
  return (
    <main style={{ padding: 24 }}>
      <h1>Nutrition programme</h1>
      <label>
        <input
          type="checkbox"
          checked={fail}
          onChange={(event) => setFail(event.target.checked)}
        />{" "}
        Simulate save failure
      </label>
      <button onClick={() => setOpen(true)}>Open setup</button>
      <output>{result}</output>
      {open && (
        <ProgrammeSetupView
          baseline={1800}
          protein={150}
          fat={65}
          recommendation={goalNutritionDefaults(
            focus,
            params.has("missing") ? null : { maintenance: 2600, weightKg: 80 }
          )}
          replacing={
            params.has("replace")
              ? {
                  id: "fixture-programme" as Id<"nutritionProgrammes">,
                  timezone: "Europe/Berlin",
                  calories: 2200,
                }
              : undefined
          }
          eligibility={{
            eligible: !params.has("protected"),
            reason: params.has("protected")
              ? "This profile needs individual nutrition guidance."
              : null,
          }}
          onClose={() => setOpen(false)}
          start={async (args) => {
            if (fail) {
              setFail(false)
              throw new Error("Offline")
            }
            setResult(JSON.stringify(args))
          }}
        />
      )}
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
