import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { blendOpacity } from "./form-coach-card"

const here = import.meta.dir
const card = readFileSync(join(here, "form-coach-card.tsx"), "utf8")
const viewer = readFileSync(join(here, "pose-viewer.tsx"), "utf8")

describe("blendOpacity", () => {
  // The middle is the default position, and it is the one that has to show the
  // difference between the two skeletons — so neither is dimmed there.
  it("shows both skeletons fully at the midpoint", () => {
    expect(blendOpacity(0.5)).toEqual({ corrected: 1, yours: 1 })
  })

  it("hides the other one entirely at each end", () => {
    expect(blendOpacity(0)).toEqual({ corrected: 0, yours: 1 })
    expect(blendOpacity(1)).toEqual({ corrected: 1, yours: 0 })
  })

  it("never leaves both faint at once", () => {
    for (let blend = 0; blend <= 1.0001; blend += 0.05) {
      const { corrected, yours } = blendOpacity(blend)
      expect(Math.max(corrected, yours)).toBeCloseTo(1, 5)
    }
  })
})

describe("the corrected pose", () => {
  // It was rendered in the same blue family as the plain pose and read as
  // invisible against the ghost.
  it("is green, and the legend swatch matches the skeleton", () => {
    expect(viewer).toContain("POSE_CORRECTED_COLOR = 0x3ddc84")
    expect(card).toContain('CORRECTED_HEX = "#3ddc84"')
  })

  it("only takes the corrected colour when there is a ghost to contrast with", () => {
    expect(viewer).toContain(
      "boneColor ?? (hasGhost ? POSE_CORRECTED_COLOR : POSE_PLAIN_COLOR)"
    )
  })

  // Rebuilding the scene on every slider step would drop the WebGL context.
  it("changes opacity by mutating materials, not by remounting", () => {
    expect(viewer).toContain("boneMaterial.opacity = boneOpacity")
    expect(viewer).toContain("ghostMaterial.opacity = ghostOpacity")
  })
})

describe("the expanded pose view", () => {
  it("is reachable from the card, the detail sheet and the chat block", () => {
    expect(card.match(/<ExpandPoseButton/g)).toHaveLength(2)
    const chat = readFileSync(join(here, "..", "lib", "coach-chat.tsx"), "utf8")
    expect(chat).toContain("<ExpandPoseButton")
  })

  // A backdrop-filter or transform on any ancestor makes that ancestor the
  // containing block for `position: fixed`, so an in-place sheet pins itself to
  // the card rather than the viewport.
  it("portals to the body, along with every other overlay here", () => {
    expect(card).toContain("createPortal(children, document.body)")
    // The pose view, the detail sheet and the history sheet.
    expect(card.match(/<SheetPortal>/g)).toHaveLength(3)
    // Nothing may render a fixed overlay outside the portal.
    const fixedOverlays = card.match(/sheet-overlay fixed inset-0/g) ?? []
    expect(fixedOverlays).toHaveLength(3)
  })

  it("closes only the topmost overlay on Escape", () => {
    expect(card).toContain("overlayStack.at(-1) !== token")
  })

  it("gives the scene the screen rather than a fixed height", () => {
    expect(card).toContain("min-h-0 w-full flex-1")
    // The viewer's own mount is `relative`, which Tailwind emits after
    // `absolute` — so filling the parent has to be done with sizing.
    expect(card).not.toContain('className="absolute inset-0"')
  })

  it("keeps the header and slider off the edges of a wide screen", () => {
    expect(card).toContain("mx-auto flex w-full max-w-5xl")
    expect(card).toContain("mx-auto w-full max-w-md shrink-0")
  })

  it("closes on Escape and locks the page behind it", () => {
    expect(card).toContain('event.key !== "Escape"')
    expect(card).toContain('document.body.style.overflow = "hidden"')
  })

  it("labels the slider for screen readers", () => {
    expect(card).toContain(
      'aria-label="Fade between your rep and the corrected one"'
    )
  })
})

describe("the next-set checklist", () => {
  it("is rendered above the findings, being read before the set not after", () => {
    const checklist = card.indexOf("Next set")
    const findings = card.indexOf("detail.findings.map")
    expect(checklist).toBeGreaterThan(-1)
    expect(checklist).toBeLessThan(findings)
  })

  it("opens the detail sheet even when there is nothing else to show", () => {
    expect(card).toContain("(detail.checklist ?? []).length > 0)")
  })
})
