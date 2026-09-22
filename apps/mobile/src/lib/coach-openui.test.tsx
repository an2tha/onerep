import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Renderer } from "@openuidev/react-lang"
import {
  coachOpenUILibrary,
  CoachOpenUIContext,
  type CoachOpenUIActions,
} from "./coach-openui-library"
import { normalizeCoachOpenUI } from "../../../../convex/ai/coachOpenUI"

const actions: CoachOpenUIActions = {
  onAction: () => {
    throw new Error("Rendering must not navigate")
  },
  onContinue: () => {
    throw new Error("Rendering must not send a message")
  },
  onSubmitInteractive: async () => {
    throw new Error("Rendering must not log food")
  },
  onPinGoal: async () => {
    throw new Error("Rendering must not pin a goal")
  },
}

function render(source: string) {
  return renderToStaticMarkup(
    <CoachOpenUIContext.Provider value={actions}>
      <Renderer
        library={coachOpenUILibrary}
        response={normalizeCoachOpenUI(source)}
        isStreaming={false}
      />
    </CoachOpenUIContext.Provider>,
  )
}

describe("Coach OpenUI", () => {
  test("parses and renders standard OpenUI components and forward references", () => {
    const html = render(
      'root = Stack([intro, detail])\nintro = TextContent("Today’s training")\ndetail = TextContent("Keep two reps in reserve")',
    )
    expect(html).toContain("Today’s training")
    expect(html).toContain("Keep two reps in reserve")
  })
  test("renders meal adjustment and goal pinning without performing writes", () => {
    const html = render(
      'root = Stack([meal, goal])\nmeal = MealLog("Rice bowl", "Lunch", 520, 35, 58, 16, ["Estimated portions"])\ngoal = CoachGoal("Walk daily", "Build consistency", 7, [{title: "Walk", detail: "Ten minutes daily"}])',
    )
    for (const label of [
      "Rice bowl",
      "520",
      "Servings",
      "Log meal",
      "Walk daily",
      "Pin goal",
    ])
      expect(html).toContain(label)
  })
  test("rejects invalid components, incomplete output and unresolved references", () => {
    for (const source of [
      'root = InventedComponent("Hi")',
      "root = Stack([missing])",
      'root = Stack([TextContent("Hi")',
      'root = Stack([MealLog("Incomplete")])',
    ]) {
      expect(() => normalizeCoachOpenUI(source)).toThrow()
    }
  })
  test("rejects tool execution and oversized or non-string payloads", () => {
    for (const source of [
      'root = Stack([TextContent("Hi")])\ndata = Query("read_data", {})',
      'root = Stack([TextContent("Hi")])\nsave = Mutation("save_data", {})',
      "a".repeat(48001),
      { type: "card" },
    ]) {
      expect(() => normalizeCoachOpenUI(source)).toThrow()
    }
  })
  test("allows plain conversation without generated UI", () => {
    expect(normalizeCoachOpenUI("")).toBe("")
    expect(normalizeCoachOpenUI(undefined)).toBe("")
  })
})
