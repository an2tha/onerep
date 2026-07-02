/**
 * Pure helpers for dashboard widget layout.
 */

export type WidgetId = "water" | "workout" | "streak" | "food" | "progress"

export type WidgetSize = "full" | "small"

export interface WidgetConfig {
  id: WidgetId
  size: WidgetSize
}

/** Ordered list of all widget IDs for defaults. */
export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: "food", size: "small" },
  { id: "workout", size: "small" },
  { id: "water", size: "small" },
  { id: "progress", size: "full" },
  { id: "streak", size: "small" },
]

export const ALL_WIDGET_IDS: WidgetId[] = DEFAULT_LAYOUT.map(
  (widget) => widget.id
)

/**
 * Merge a stored layout (may be partial/stale) with the canonical default.
 * - Widgets in the stored layout come first, in stored order.
 * - New widgets not yet in the stored layout are appended at the end.
 * - Widgets removed from ALL_WIDGET_IDS are dropped.
 * - Sizes are fixed by the app: everything small except body progress.
 */
export function resolveLayout(
  stored: WidgetConfig[] | null | undefined
): WidgetConfig[] {
  if (!stored || stored.length === 0) return [...DEFAULT_LAYOUT]

  const defaultSizeById = new Map(
    DEFAULT_LAYOUT.map((widget) => [widget.id, widget.size])
  )
  const valid = stored
    .filter((w) => (ALL_WIDGET_IDS as string[]).includes(w.id))
    .map(
      (w): WidgetConfig => ({
        id: w.id,
        size: defaultSizeById.get(w.id) ?? "small",
      })
    )
  const seenIds = new Set(valid.map((w) => w.id))
  const appended = DEFAULT_LAYOUT.filter((widget) => !seenIds.has(widget.id))

  return [...valid, ...appended]
}

/**
 * A row in the rendered dashboard:
 * - type "full"  → one widget spanning the full width
 * - type "pair"  → two widgets side by side (both "small")
 * - type "solo-small" → one "small" widget with no partner (rendered full-width)
 */
export type LayoutRow =
  | { type: "full"; widget: WidgetConfig }
  | { type: "pair"; left: WidgetConfig; right: WidgetConfig }
  | { type: "solo-small"; widget: WidgetConfig }

/**
 * Convert a flat ordered WidgetConfig[] into renderable rows.
 * Consecutive "small" widgets are paired; an orphaned "small" gets solo-small.
 */
export function buildRows(layout: WidgetConfig[]): LayoutRow[] {
  const rows: LayoutRow[] = []
  let i = 0

  while (i < layout.length) {
    const current = layout[i]
    if (current.size === "full") {
      rows.push({ type: "full", widget: current })
      i++
    } else {
      // current is "small"
      const next = layout[i + 1]
      if (next?.size === "small") {
        rows.push({ type: "pair", left: current, right: next })
        i += 2
      } else {
        rows.push({ type: "solo-small", widget: current })
        i++
      }
    }
  }

  return rows
}

/**
 * Move a widget from `fromIndex` to `toIndex` in the layout array.
 */
export function reorderLayout(
  layout: WidgetConfig[],
  fromIndex: number,
  toIndex: number
): WidgetConfig[] {
  if (fromIndex === toIndex) return layout
  if (fromIndex < 0 || fromIndex >= layout.length) return layout
  if (toIndex < 0 || toIndex >= layout.length) return layout

  const next = [...layout]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function moveWidgetById(
  layout: WidgetConfig[],
  id: WidgetId,
  direction: "up" | "down"
): WidgetConfig[] {
  const fromIndex = layout.findIndex((widget) => widget.id === id)
  if (fromIndex === -1) return layout

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
  return reorderLayout(layout, fromIndex, toIndex)
}

export function isDefaultLayout(layout: WidgetConfig[]) {
  const resolved = resolveLayout(layout)
  return (
    resolved.length === DEFAULT_LAYOUT.length &&
    resolved.every((widget, index) => {
      const defaultWidget = DEFAULT_LAYOUT[index]
      return widget.id === defaultWidget.id && widget.size === defaultWidget.size
    })
  )
}
