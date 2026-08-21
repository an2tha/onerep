import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const MOBILE_SHEET = read(
  "../../../../packages/ui/src/components/mobile-sheet.tsx"
)
const BACKDROP = read("../../../../packages/ui/src/lib/backdrop-dismiss.ts")
const WEIGHT_SHEET = read("./active-workout/weight-selector-sheet.tsx")
const COACH = read("./Coach.tsx")
const APP_CSS = read("../../../../packages/ui/src/index.css")

/**
 * Sheets that hold an input have to survive a re-render.
 *
 * Both reported symptoms — a weight sheet that closed on the first tap, a
 * keyboard that shut mid-word in the metric builder — were the sheet
 * reacting to something that was not a user action.
 */
describe("sheets keep their focus and stay open", () => {
  test("the focus trap runs on mount, not on every parent re-render", () => {
    // Depending on `dismiss` meant every fresh inline onClose re-ran the trap,
    // which restored focus to the opener and closed the keyboard.
    expect(MOBILE_SHEET).toContain("const dismissRef = React.useRef(dismiss)")
    expect(MOBILE_SHEET).toContain("dismissRef.current()")
    // The trap's own effect takes no dependencies; only the ref sync does.
    expect(MOBILE_SHEET).toContain(
      "// Mount and unmount only. See `dismissRef` above."
    )
    expect(MOBILE_SHEET).not.toContain(
      "previousFocus?.focus({ preventScroll: true })\n    }\n  }, [dismiss])"
    )
  })

  test("an autofocused field keeps the caret it already has", () => {
    expect(MOBILE_SHEET).toContain(
      "if (panel.contains(document.activeElement)) return"
    )
  })

  test("focus only returns to the opener if it is still inside the sheet", () => {
    expect(MOBILE_SHEET).toContain(
      "if (panel.contains(document.activeElement)) {"
    )
  })

  test("a backdrop only dismisses on a press that started there", () => {
    expect(BACKDROP).toContain("pressedOnBackdrop")
    expect(BACKDROP).toContain("event.target === event.currentTarget")
    expect(WEIGHT_SHEET).toContain("useBackdropDismiss(dismiss)")
    expect(WEIGHT_SHEET).not.toContain("onClick={dismiss}\n    >")
  })
})

describe("Coach mode switching on a phone", () => {
  test("touch devices skip the fade, the clone carousel and the long transition", () => {
    expect(COACH).toContain('window.matchMedia?.("(pointer: coarse)").matches')
    expect(COACH).toContain("prefers-reduced-motion: reduce")
    expect(COACH).toContain(
      'document.documentElement.dataset.coachQuick = "true"'
    )
    expect(COACH).toContain("if (quick) {")
  })

  test("the quick pass has a phone-sized duration", () => {
    expect(APP_CSS).toContain(
      ':root[data-coach-quick="true"]::view-transition-group(coach-page)'
    )
    expect(APP_CSS).toContain("animation-duration: 280ms")
  })
})
