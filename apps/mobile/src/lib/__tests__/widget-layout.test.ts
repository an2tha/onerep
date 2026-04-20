import { describe, test, expect } from "bun:test"
import {
  resolveLayout,
  buildRows,
  reorderLayout,
  toggleWidgetSize,
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

  test("stored layout is preserved as-is when all IDs are valid", () => {
    const stored: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "calories", size: "full" },
      { id: "water", size: "small" },
      { id: "workout", size: "full" },
      { id: "food", size: "full" },
      { id: "progress", size: "full" },
    ]
    const result = resolveLayout(stored)
    expect(result[0]).toEqual({ id: "streak", size: "small" })
    expect(result[1]).toEqual({ id: "calories", size: "full" })
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
  })

  test("new widgets not in stored layout are appended as full", () => {
    const stored: WidgetConfig[] = [
      { id: "calories", size: "full" },
      { id: "water", size: "full" },
      // missing: workout, streak, food, progress
    ]
    const result = resolveLayout(stored)
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
    expect(result[0].id).toBe("calories")
    expect(result[1].id).toBe("water")
    // appended in ALL_WIDGET_IDS order
    const appended = result.slice(2).map((w) => w.id)
    expect(appended).toContain("workout")
    expect(appended).toContain("streak")
    expect(appended).toContain("food")
    expect(appended).toContain("progress")
    // all appended are full size
    result.slice(2).forEach((w) => expect(w.size).toBe("full"))
  })

  test("unknown widget IDs in stored layout are dropped", () => {
    const stored = [
      { id: "calories", size: "full" },
      { id: "unknown_widget", size: "small" }, // stale/removed widget
      { id: "water", size: "small" },
    ] as WidgetConfig[]
    const result = resolveLayout(stored)
    expect(result.map((w) => w.id)).not.toContain("unknown_widget")
    expect(result.length).toBe(ALL_WIDGET_IDS.length)
  })

  test("stored sizes are preserved", () => {
    const stored: WidgetConfig[] = ALL_WIDGET_IDS.map((id) => ({ id, size: "small" }))
    const result = resolveLayout(stored)
    result.forEach((w) => expect(w.size).toBe("small"))
  })
})

// ─── buildRows ────────────────────────────────────────────────────────────────

describe("buildRows", () => {
  test("all full → each widget gets its own full row", () => {
    const layout: WidgetConfig[] = [
      { id: "calories", size: "full" },
      { id: "water", size: "full" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: "full", widget: { id: "calories" } })
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
      { id: "calories", size: "small" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("pair")
    expect(rows[1].type).toBe("solo-small")
    if (rows[1].type === "solo-small") {
      expect(rows[1].widget.id).toBe("calories")
    }
  })

  test("small followed by full → solo-small then full", () => {
    const layout: WidgetConfig[] = [
      { id: "streak", size: "small" },
      { id: "calories", size: "full" },
    ]
    const rows = buildRows(layout)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe("solo-small")
    expect(rows[1].type).toBe("full")
  })

  test("full between two smalls → full row + pair", () => {
    const layout: WidgetConfig[] = [
      { id: "calories", size: "full" },
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
    const rows = buildRows([{ id: "calories", size: "full" }])
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
    { id: "calories", size: "full" },
    { id: "water", size: "full" },
    { id: "workout", size: "full" },
  ]

  test("moves item from index 0 to index 2", () => {
    const result = reorderLayout(base, 0, 2)
    expect(result.map((w) => w.id)).toEqual(["water", "workout", "calories"])
  })

  test("moves item from index 2 to index 0", () => {
    const result = reorderLayout(base, 2, 0)
    expect(result.map((w) => w.id)).toEqual(["workout", "calories", "water"])
  })

  test("same index returns original layout unchanged", () => {
    const result = reorderLayout(base, 1, 1)
    expect(result.map((w) => w.id)).toEqual(["calories", "water", "workout"])
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

// ─── toggleWidgetSize ─────────────────────────────────────────────────────────

describe("toggleWidgetSize", () => {
  const layout: WidgetConfig[] = [
    { id: "calories", size: "full" },
    { id: "water", size: "small" },
    { id: "workout", size: "full" },
  ]

  test("full → small", () => {
    const result = toggleWidgetSize(layout, "calories")
    expect(result[0]).toEqual({ id: "calories", size: "small" })
  })

  test("small → full", () => {
    const result = toggleWidgetSize(layout, "water")
    expect(result[1]).toEqual({ id: "water", size: "full" })
  })

  test("only the targeted widget changes", () => {
    const result = toggleWidgetSize(layout, "calories")
    expect(result[1]).toEqual(layout[1])
    expect(result[2]).toEqual(layout[2])
  })

  test("does not mutate the original array", () => {
    toggleWidgetSize(layout, "calories")
    expect(layout[0].size).toBe("full")
  })

  test("unknown id leaves layout unchanged", () => {
    const result = toggleWidgetSize(layout, "unknown_widget" as any)
    expect(result).toEqual(layout)
  })

  test("toggle twice returns to original size", () => {
    const once = toggleWidgetSize(layout, "calories")
    const twice = toggleWidgetSize(once, "calories")
    expect(twice[0].size).toBe("full")
  })
})
