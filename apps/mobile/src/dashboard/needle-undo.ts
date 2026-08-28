/**
 * Taking it back.
 *
 * There is no general undo here and there cannot be: the tools write through
 * Convex mutations, and a mutation is not a transaction anybody kept a receipt
 * for. What there is instead is a short table of writes whose opposite already
 * exists as another tool — the diary has `remove_food_entry`, water has
 * `undo_last_water`, a fast has `stop_fast` — and this file is that table.
 *
 * Anything not in it gets no undo button, which is the honest answer. A button
 * that silently did nothing, or did something adjacent, would be worse than no
 * button on a screen where the thing pressing the tools is a 45M-parameter
 * model.
 *
 * The inverse is built from the call's *result*, not its arguments, wherever
 * the result is what names the thing. `log_food("greek yoghurt")` logs
 * whatever the catalogue matched, and the diary knows that entry by the
 * matched name — undoing by what the user typed would miss.
 */

import type { NeedleCall, NeedleCallResult } from "@repo/needle"

/** The shape `summarize()` gives back for anything that lands in the diary. */
type Logged = { logged?: unknown; meal?: unknown }

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

/**
 * The opposite of one call, or null when there is not one.
 *
 * Every branch here is a write with an existing inverse tool. Deliberately
 * absent: presets, groceries, measurements, and the whole planning family —
 * their inverses either do not exist or would destroy something the model was
 * not asked to touch.
 */
export function inverseOf(call: NeedleCallResult): NeedleCall | null {
  if (call.error) return null
  const date = text(call.arguments.date)

  switch (call.name) {
    case "log_water":
      return { name: "undo_last_water", arguments: date ? { date } : {} }

    case "log_food":
    case "log_quick_food":
    case "log_food_by_barcode":
    case "log_recipe":
    case "log_meal_preset": {
      // The diary matched a name of its own; that is the one it answers to.
      const output = (call.output ?? {}) as Logged
      const food = text(output.logged)
      if (!food) return null
      const meal = text(output.meal)
      return {
        name: "remove_food_entry",
        arguments: {
          food,
          ...(meal ? { meal } : {}),
          ...(date ? { date } : {}),
        },
      }
    }

    case "start_fast":
      return { name: "stop_fast", arguments: {} }

    case "start_workout":
      return {
        name: "abort_workout",
        arguments:
          typeof call.arguments.slot === "number"
            ? { slot: call.arguments.slot }
            : {},
      }

    default:
      return null
  }
}

/**
 * The inverses for a whole run, newest first.
 *
 * Reversed because undoing is unwinding: two foods logged in one turn come
 * off in the order they went on, backwards, and `undo_last_water` in
 * particular only ever means the last one.
 */
export function inverseOfRun(calls: readonly NeedleCallResult[]): NeedleCall[] {
  return calls
    .map(inverseOf)
    .filter((call): call is NeedleCall => call !== null)
    .reverse()
}
