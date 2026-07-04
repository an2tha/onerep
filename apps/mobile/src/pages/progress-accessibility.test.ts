import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const PROGRESS_SOURCE = readFileSync(
  new URL("./Progress.tsx", import.meta.url),
  "utf8",
)

describe("Progress page accessibility contract", () => {
  test("body measurement fields expose stable names and labels", () => {
    expect(PROGRESS_SOURCE).toContain(
      'name={`body-measurement-${label.toLowerCase().replace(/\\s+/g, "-")}`}',
    )
    expect(PROGRESS_SOURCE).toContain(
      "aria-label={`${label} measurement in ${unit}`}",
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
    expect(PROGRESS_SOURCE).toContain("const [saving, setSaving] = useState(false)")
    expect(PROGRESS_SOURCE).toContain("const saveRef = React.useRef(false)")
    expect(PROGRESS_SOURCE).toContain("if (!canSave || saveRef.current) return")
    expect(PROGRESS_SOURCE).toContain("onClose={saving ? () => {} : onClose}")
    expect(PROGRESS_SOURCE).toContain("closeOnBackdrop={!saving}")
    expect(PROGRESS_SOURCE).toContain("showHandle={!saving}")
    expect(PROGRESS_SOURCE).toContain("disabled={!canSave}")
    expect(PROGRESS_SOURCE).toContain("aria-busy={saving}")
    expect(PROGRESS_SOURCE).toContain('{saving ? "Saving..." : "Save check-in"}')
  })

  test("metric library inputs expose mobile form metadata", () => {
    expect(PROGRESS_SOURCE).toContain('name="metric-library-search"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Search progress metrics"')
    expect(PROGRESS_SOURCE).toContain('name="metric-ai-prompt"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Describe a metric to generate"')
    expect(PROGRESS_SOURCE).toContain('name="custom-progress-metric"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Custom progress metric name"')
  })

  test("strength trend search is named", () => {
    expect(PROGRESS_SOURCE).toContain('name="strength-trend-exercise-search"')
    expect(PROGRESS_SOURCE).toContain(
      'aria-label="Search strength trend exercise"',
    )
  })

  test("progress recommendations expose tap-through actions", () => {
    expect(PROGRESS_SOURCE).toContain("actionLabel: \"Add check-in\"")
    expect(PROGRESS_SOURCE).toContain("onAction: () => setSheetOpen(true)")
    expect(PROGRESS_SOURCE).toContain("actionLabel: \"Log food\"")
    expect(PROGRESS_SOURCE).toContain('onAction: () => navigate("/foods/search")')
    expect(PROGRESS_SOURCE).toContain("actionLabel: \"Start workout\"")
    expect(PROGRESS_SOURCE).toContain('onAction: () => navigate("/workout/active")')
    expect(PROGRESS_SOURCE).toContain("askAiLabel: hasAiAccess ? \"Ask AI\" : \"Unlock AI\"")
    expect(PROGRESS_SOURCE).toContain("onAskAi={action.onAskAi}")
  })
})
