import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const PROVIDER = readFileSync(
  new URL("./tour-provider.tsx", import.meta.url),
  "utf8"
)
const POPOVER = readFileSync(
  new URL(
    "../../../../../packages/ui/src/components/ui/tour-popover.tsx",
    import.meta.url
  ),
  "utf8"
)
const SPOTLIGHT = readFileSync(
  new URL(
    "../../../../../packages/ui/src/components/ui/spotlight.tsx",
    import.meta.url
  ),
  "utf8"
)

describe("walkthrough accessibility", () => {
  test("the step card is a labelled modal dialog", () => {
    expect(POPOVER).toContain('role="dialog"')
    expect(POPOVER).toContain('aria-modal="true"')
    expect(POPOVER).toContain("aria-labelledby={titleId}")
    expect(POPOVER).toContain("aria-describedby={bodyId}")
  })

  test("step changes are announced and focus moves to the card", () => {
    // The dialog node persists across steps, so screen readers need a live
    // region; focusing the card (not the button) reads title -> body -> controls.
    expect(PROVIDER).toContain('aria-live="polite"')
    expect(PROVIDER).toContain("Step ${tour.index + 1} of ${tour.steps.length}")
    expect(POPOVER).toContain("cardRef.current?.focus")
    expect(POPOVER).toContain("[stepNumber]")
  })

  test("progress is exposed, not just drawn", () => {
    expect(POPOVER).toContain('role="progressbar"')
    expect(POPOVER).toContain("aria-valuenow={stepNumber}")
    expect(POPOVER).toContain("aria-valuemax={stepCount}")
  })

  test("keyboard controls match the guided tooltip contract", () => {
    expect(PROVIDER).toContain('event.key === "Escape"')
    expect(POPOVER).toContain('"ArrowRight"')
    expect(POPOVER).toContain('"ArrowLeft"')
  })

  test("motion is gated on the reduced-motion preference", () => {
    expect(PROVIDER).toContain("prefersReducedMotion()")
    expect(POPOVER).toContain("motion-reduce:animate-none")
  })

  test("the dim overlay announces once, not four times", () => {
    expect(SPOTLIGHT).toContain("index === 0 ? dismissLabel : undefined")
    expect(SPOTLIGHT).toContain("aria-hidden={index === 0 ? undefined : true}")
    expect(PROVIDER).toContain('dismissLabel="Skip walkthrough"')
  })

  test("only one overlay system can be active at a time", () => {
    expect(PROVIDER).toContain("setGuidedTooltipsSuppressed")
    expect(PROVIDER).toContain("useLayoutEffect")
  })
})
