import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const NEW_PRESET_SOURCE = [
  "./NewPreset.tsx",
  "../../../../packages/ui/src/components/workout-controls.tsx",
  "../../../../packages/ui/src/components/apple-fitness-set-row.tsx",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n")

describe("New preset accessibility contract", () => {
  test("rest timer controls expose names and selected state", () => {
    expect(NEW_PRESET_SOURCE).toContain('aria-label="Close rest timer"')
    expect(NEW_PRESET_SOURCE).toContain("aria-pressed={option === current}")
    expect(NEW_PRESET_SOURCE).toContain(
      "aria-label={`Set rest to ${formatRestDuration(option)}`}"
    )
    expect(NEW_PRESET_SOURCE).toContain(
      'aria-label={`Custom rest ${label === "Min" ? "minutes" : "seconds"}`}'
    )
  })

  test("set row numeric fields expose stable mobile form metadata", () => {
    expect(NEW_PRESET_SOURCE).toContain('name={`set-${index + 1}-weight`}')
    expect(NEW_PRESET_SOURCE).toContain(
      "aria-label={`Set ${index + 1} weight in ${unit}`}",
    )
    expect(NEW_PRESET_SOURCE).toContain('name={`set-${index + 1}-reps`}')
    expect(NEW_PRESET_SOURCE).not.toContain("left-reps")
    expect(NEW_PRESET_SOURCE).not.toContain("right-reps")
    expect(NEW_PRESET_SOURCE).not.toContain('name={`set-${index + 1}-rpe`}')
    expect(NEW_PRESET_SOURCE).toContain(
      "aria-label={`Set ${index + 1} rest time`}",
    )
  })

  test("exercise picker and preset title fields are named", () => {
    expect(NEW_PRESET_SOURCE).toContain('name="preset-exercise-search"')
    expect(NEW_PRESET_SOURCE).toContain('aria-label="Search exercises"')
    expect(NEW_PRESET_SOURCE).toContain('aria-label="Clear exercise search"')
    expect(NEW_PRESET_SOURCE).toContain('name="preset-name"')
    expect(NEW_PRESET_SOURCE).toContain('aria-label="Preset name"')
  })

  test("paste plan import exposes textarea metadata", () => {
    expect(NEW_PRESET_SOURCE).toContain('name="preset-import-text"')
    expect(NEW_PRESET_SOURCE).toContain('aria-label="Workout plan text"')
  })

  test("preset save and text import are single-flight actions", () => {
    expect(NEW_PRESET_SOURCE).toContain("const savingRef = useRef(false)")
    expect(NEW_PRESET_SOURCE).toContain(
      "const generatingPresetRef = useRef(false)",
    )
    expect(NEW_PRESET_SOURCE).toContain("if (")
    expect(NEW_PRESET_SOURCE).toContain("savingRef.current ||")
    expect(NEW_PRESET_SOURCE).toContain("savingRef.current = true")
    expect(NEW_PRESET_SOURCE).toContain("savingRef.current = false")
    expect(NEW_PRESET_SOURCE).toContain(
      "if (generatingPresetRef.current || generatingPreset) return",
    )
    expect(NEW_PRESET_SOURCE).toContain("generatingPresetRef.current = true")
    expect(NEW_PRESET_SOURCE).toContain("generatingPresetRef.current = false")
    expect(NEW_PRESET_SOURCE).toContain("aria-busy={saving}")
    expect(NEW_PRESET_SOURCE).toContain("aria-busy={generatingPreset}")
    expect(NEW_PRESET_SOURCE).toContain("aria-busy={loading}")
  })
})
