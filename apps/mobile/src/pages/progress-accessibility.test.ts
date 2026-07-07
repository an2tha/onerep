import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const PROGRESS_SOURCE = readFileSync(
  new URL("./Progress.tsx", import.meta.url),
  "utf8"
)

describe("Progress page accessibility contract", () => {
  test("body measurement fields expose stable names and labels", () => {
    expect(PROGRESS_SOURCE).toContain(
      'name={`body-measurement-${label.toLowerCase().replace(/\\s+/g, "-")}`}'
    )
    expect(PROGRESS_SOURCE).toContain(
      "aria-label={`${label} measurement in ${unit}`}"
    )
    expect(PROGRESS_SOURCE).toContain('name="body-measurement-date"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Body measurement date"')
  })

  test("progress photo actions are named", () => {
    expect(PROGRESS_SOURCE).toContain('name="progress-photo"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Progress photo"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Remove progress photo"')
  })

  test("check-in save prevents duplicate submissions and exposes busy state", () => {
    expect(PROGRESS_SOURCE).toContain(
      "const [saving, setSaving] = useState(false)"
    )
    expect(PROGRESS_SOURCE).toContain("const saveRef = React.useRef(false)")
    expect(PROGRESS_SOURCE).toContain("if (!canSave || saveRef.current) return")
    expect(PROGRESS_SOURCE).toContain("onClose={saving ? () => {} : onClose}")
    expect(PROGRESS_SOURCE).toContain("closeOnBackdrop={!saving}")
    expect(PROGRESS_SOURCE).toContain("showHandle={!saving}")
    expect(PROGRESS_SOURCE).toContain("disabled={!canSave}")
    expect(PROGRESS_SOURCE).toContain("aria-busy={saving}")
    expect(PROGRESS_SOURCE).toContain(
      '{saving ? "Saving..." : "Save check-in"}'
    )
  })

  test("progress recommendations expose tap-through actions", () => {
    expect(PROGRESS_SOURCE).toContain('actionLabel: "Add check-in"')
    expect(PROGRESS_SOURCE).toContain("onAction: () => setSheetOpen(true)")
    expect(PROGRESS_SOURCE).toContain('actionLabel: "Log food"')
    expect(PROGRESS_SOURCE).toContain(
      'navigate(protectedNutritionMode ? "/nutrition" : "/foods/search")'
    )
    expect(PROGRESS_SOURCE).toContain('"Review adjustment"')
    expect(PROGRESS_SOURCE).toContain("nutritionPlanAction")
    expect(PROGRESS_SOURCE).toContain('actionLabel: "Start workout"')
    expect(PROGRESS_SOURCE).toContain(
      'onAction: () => navigate("/workout/active")'
    )
  })

  test("progress page stays stripped of AI coach and metric-library UI", () => {
    expect(PROGRESS_SOURCE).toContain("api.users.users.getNutritionPlan")
    expect(PROGRESS_SOURCE).toContain("protectedNutritionMode")
    expect(PROGRESS_SOURCE).not.toContain("useAiFeatureGate")
    expect(PROGRESS_SOURCE).not.toContain("generateCoachAdvice")
    expect(PROGRESS_SOURCE).not.toContain("generateCoachChatMessage")
    expect(PROGRESS_SOURCE).not.toContain("AiCoach")
    expect(PROGRESS_SOURCE).not.toContain("Ask AI")
    expect(PROGRESS_SOURCE).not.toContain("metric-ai-prompt")
    expect(PROGRESS_SOURCE).not.toContain("Metric library")
    expect(PROGRESS_SOURCE).not.toContain("strength-trend-exercise-search")
  })
})
