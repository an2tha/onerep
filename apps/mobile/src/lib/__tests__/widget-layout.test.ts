import { describe, test, expect } from "bun:test"
import {
  resolveLayout,
  buildRows,
  reorderLayout,
  DEFAULT_LAYOUT,
  ALL_WIDGET_IDS,
  type WidgetConfig,
} from "../widget-layout"

// ─── resolveLayout ────────────────────────────────────────────────────────────

describe("resolveLayout", () => {
  test("null returns the default layout", () => {
    expect(resolveLayout(null)).toEqual(DEFAULT_LAYOUT)
  })

  test("undefined returns the default layout", () => {
    expect(resolveLayout(undefined)).toEqual(DEFAULT_LAYOUT)
  })

  test("empty array returns the default layout", () => {
    expect(resolveLayout([])).toEqual(DEFAULT_LAYOUT)
  })

  test("stored layout order is preserved when all IDs are valid", () => {
    const stored: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "water", size: "small" },
      { id: "workout", size: "full" },
      { id: "food", size: "full" },
      { id: "progress", size: "full" },
    ]
    const result = resolveLayout(stored)
    expect(result.map((widget) => widget.id)).toEqual([
      "streak",
      "water",
      "workout",
      "food",
      "progress",
    ])
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
  })

  test("new widgets not in stored layout are appended with default sizes", () => {
    const stored: WidgetConfig[] = [
      { id: "water", size: "full" },
      { id: "workout", size: "full" },
    ]
    const result = resolveLayout(stored)
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
    expect(result[0].id).toBe("water")
    expect(result[1].id).toBe("workout")
    expect(result.slice(2)).toEqual([
      { id: "food", size: "small" },
      { id: "progress", size: "full" },
      { id: "streak", size: "small" },
    ])
  })

  test("unknown and removed widget IDs in stored layout are dropped", () => {
    const stored = [
      { id: "calories", size: "full" }, // removed duplicate macro widget
      { id: "supplements", size: "small" }, // merged into daily goals
      { id: "unknown_widget", size: "small" },
      { id: "water", size: "small" },
    ] as WidgetConfig[]
    const result = resolveLayout(stored)
    expect(result.map((w) => w.id)).not.toContain("calories")
    expect(result.map((w) => w.id)).not.toContain("supplements")
    expect(result.map((w) => w.id)).not.toContain("unknown_widget")
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
  })

  test("stored order is preserved but sizes use the fixed dashboard defaults", () => {
    const stored: WidgetConfig[] = [
      { id: "streak", size: "full" },
      { id: "progress", size: "small" },
      { id: "water", size: "full" },
      { id: "workout", size: "full" },
      { id: "food", size: "full" },
    ]
    const result = resolveLayout(stored)
    expect(result).toEqual([
      { id: "streak", size: "small" },
      { id: "progress", size: "full" },
      { id: "water", size: "small" },
      { id: "workout", size: "small" },
      { id: "food", size: "small" },
    ])
  })
})

// ─── buildRows ────────────────────────────────────────────────────────────────

describe("buildRows", () => {
  test("all full → each widget gets its own full row", () => {
    const layout: WidgetConfig[] = [
      { id: "food", size: "full" },
      { id: "water", size: "full" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: "full", widget: { id: "food" } })
    expect(rows[1]).toMatchObject({ type: "full", widget: { id: "water" } })
  })

  test("two consecutive small widgets → one pair row", () => {
    const layout: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "water", size: "small" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("pair")
    if (rows[0].type === "pair") {
      expect(rows[0].left.id).toBe("streak")
      expect(rows[0].right.id).toBe("water")
    }
  })

  test("three consecutive small widgets → one pair + one solo-small", () => {
    const layout: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "water", size: "small" },
      { id: "food", size: "small" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("pair")
    expect(rows[1].type).toBe("solo-small")
    if (rows[1].type === "solo-small") {
      expect(rows[1].widget.id).toBe("food")
    }
  })

  test("small followed by full → solo-small then full", () => {
    const layout: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "food", size: "full" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("solo-small")
    expect(rows[1].type).toBe("full")
  })

  test("full between two smalls → full row + pair", () => {
    const layout: WidgetConfig[] = [
      { id: "food", size: "full" },
      { id: "streak", size: "small" },
      { id: "water", size: "small" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("full")
    expect(rows[1].type).toBe("pair")
  })

  test("empty layout → empty rows", () => {
    expect(buildRows([])).toHaveLength(0)
  })

  test("single full widget", () => {
    const rows = buildRows([{ id: "food", size: "full" }])
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("full")
  })

  test("single small widget → solo-small", () => {
    const rows = buildRows([{ id: "streak", size: "small" }])
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("solo-small")
  })
})

// ─── reorderLayout ────────────────────────────────────────────────────────────

describe("reorderLayout", () => {
  const base: WidgetConfig[] = [
    { id: "food", size: "full" },
    { id: "water", size: "full" },
    { id: "workout", size: "full" },
  ]

  test("moves item from index 0 to index 2", () => {
    const result = reorderLayout(base, 0, 2)
    expect(result.map((w) => w.id)).toEqual(["water", "workout", "food"])
  })

  test("moves item from index 2 to index 0", () => {
    const result = reorderLayout(base, 2, 0)
    expect(result.map((w) => w.id)).toEqual(["workout", "food", "water"])
  })

  test("same index returns original layout unchanged", () => {
    const result = reorderLayout(base, 1, 1)
    expect(result.map((w) => w.id)).toEqual(["food", "water", "workout"])
  })

  test("does not mutate the original array", () => {
    const original = [...base]
    reorderLayout(base, 0, 2)
    expect(base.map((w) => w.id)).toEqual(original.map((w) => w.id))
  })

  test("out-of-bounds fromIndex returns original layout", () => {
    const result = reorderLayout(base, -1, 0)
    expect(result).toEqual(base)
  })

  test("out-of-bounds toIndex returns original layout", () => {
    const result = reorderLayout(base, 0, 99)
    expect(result).toEqual(base)
  })
})
