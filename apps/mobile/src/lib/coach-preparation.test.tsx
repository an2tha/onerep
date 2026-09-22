import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import CoachPreparationPreview, {
  coachPreparationSpec,
} from "./coach-preparation"
import type { CoachPreparation } from "../../../../packages/models/src/coachPreparation"

const preparation: CoachPreparation = {
  id: "nutrition_targets",
  title: "Your nutrition targets",
  detail: "Current daily targets",
  rows: [{ label: "Daily protein target", value: "130 g" }],
}

describe("Jev preparation UI", () => {
  test("renders a labeled saved-data snapshot through json-render", () => {
    const html = renderToStaticMarkup(
      <CoachPreparationPreview preparation={preparation} />
    )
    expect(html).toContain("Your nutrition targets")
    expect(html).toContain("Daily protein target")
    expect(html).toContain("130 g")
    expect(html).toContain("Coach is preparing your answer")
    expect(html).toContain("<dl")
    expect(html).toContain("<dt")
    expect(html).not.toContain("<button")
  })
  test("saved text is escaped and cannot add components or actions", () => {
    const unsafe = {
      ...preparation,
      rows: [
        { label: "<script>alert(1)</script>", value: "<button>Save</button>" },
      ],
    }
    const html = renderToStaticMarkup(
      <CoachPreparationPreview preparation={unsafe} />
    )
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<button>")
    const spec = coachPreparationSpec(unsafe)
    expect(Object.values(spec.elements).map((element) => element.type)).toEqual(
      ["Preparation", "Fact"]
    )
  })
})
