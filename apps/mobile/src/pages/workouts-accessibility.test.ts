import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const WORKOUTS_SOURCE = readFileSync(
  new URL("./Workouts.tsx", import.meta.url),
  "utf8"
)

describe("Workouts page production contract", () => {
  test("preset deletion waits for offline persistence before closing", () => {
    expect(WORKOUTS_SOURCE).toContain("onConfirm: () => Promise<void>")
    expect(WORKOUTS_SOURCE).toContain("const [deleting, setDeleting]")
    expect(WORKOUTS_SOURCE).toContain("await onConfirm()")
    expect(WORKOUTS_SOURCE).toContain(
      "onClick={deleting ? undefined : onCancel}"
    )
    expect(WORKOUTS_SOURCE).toContain("aria-busy={deleting}")
    // The sheet takes its labels as props now that workout logs reuse it.
    expect(WORKOUTS_SOURCE).toContain("{deleting ? busyLabel : confirmLabel}")
    expect(WORKOUTS_SOURCE).toContain('confirmLabel="Delete preset"')
    expect(WORKOUTS_SOURCE).toContain('busyLabel="Deleting..."')
    expect(WORKOUTS_SOURCE).toContain(
      "await persist(nextPresets, nextRoutine, nextRoutine2)"
    )
    expect(WORKOUTS_SOURCE).toContain("await removePresetMutation({")
    expect(WORKOUTS_SOURCE).toContain("setConfirmDeleteId(null)")
  })

  test("preset duplication is single-flight and announced", () => {
    expect(WORKOUTS_SOURCE).toContain(
      "const [duplicatingPresetId, setDuplicatingPresetId]"
    )
    expect(WORKOUTS_SOURCE).toContain(
      "if (duplicatingPresetId !== null) return"
    )
    expect(WORKOUTS_SOURCE).toContain("setDuplicatingPresetId(preset.id)")
    expect(WORKOUTS_SOURCE).toContain("await createPresetMutation({")
    expect(WORKOUTS_SOURCE).toContain("setDuplicatingPresetId(null)")
    expect(WORKOUTS_SOURCE).toContain("const duplicatingThis =")
    expect(WORKOUTS_SOURCE).toContain("duplicatingPresetId === preset.id")
    expect(WORKOUTS_SOURCE).toContain("disabled={duplicatingPresetId !== null}")
    expect(WORKOUTS_SOURCE).toContain("aria-busy={duplicatingThis}")
    expect(WORKOUTS_SOURCE).toContain("animate-spin")
  })
})
