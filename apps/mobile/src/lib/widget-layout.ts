/**
 * Pure helpers for dashboard widget layout.
 */

export type WidgetId =
  | "calories"
  | "water"
  | "workout"
  | "streak"
  | "food"
  | "progress"

export type WidgetSize = "full" | "small"

export interface WidgetConfig {
  id: WidgetId
  size: WidgetSize
}

/** Ordered list of all widget IDs for defaults. */
export const ALL_WIDGET_IDS: WidgetId[] = [
  "calories",
  "water",
  "workout",
  "streak",
  "food",
  "progress",
]

export const DEFAULT_LAYOUT: WidgetConfig[] = ALL_WIDGET_IDS.map((id) => ({
  id,
  size: "full",
}))

/**
 * Merge a stored layout (may be partial/stale) with the canonical default.
 * - Widgets in the stored layout come first, in stored order.
 * - New widgets not yet in the stored layout are appended at the end as "full".
 * - Widgets removed from ALL_WIDGET_IDS are dropped.
 */
export function resolveLayout(stored: WidgetConfig[] | null | undefined): WidgetConfig[] {
  if (!stored || stored.length === 0) return [...DEFAULT_LAYOUT]

  const valid = stored.filter((w) => (ALL_WIDGET_IDS as string[]).includes(w.id))
  const seenIds = new Set(valid.map((w) => w.id))
  const appended = ALL_WIDGET_IDS
    .filter((id) => !seenIds.has(id))
    .map((id): WidgetConfig => ({ id, size: "full" }))

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
  toIndex: number,
): WidgetConfig[] {
  if (fromIndex === toIndex) return layout
  if (fromIndex < 0 || fromIndex >= layout.length) return layout
  if (toIndex < 0 || toIndex >= layout.length) return layout

  const next = [...layout]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

/**
 * Toggle a widget's size between "full" and "small".
 */
export function toggleWidgetSize(
  layout: WidgetConfig[],
  id: WidgetId,
): WidgetConfig[] {
  return layout.map((w) =>
    w.id === id ? { ...w, size: w.size === "full" ? "small" : "full" } : w
  )
}
