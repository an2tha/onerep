import { describe, expect, test } from "bun:test"
import { inverseOf, inverseOfRun } from "@/dashboard/needle-undo"

const call = (
  name: string,
  args: Record<string, unknown> = {},
  output?: unknown,
  error?: string
) => ({
  name,
  arguments: args,
  ...(output ? { output } : {}),
  ...(error ? { error } : {}),
})

describe("taking a run back", () => {
  test("undoes water by its own tool", () => {
    expect(inverseOf(call("log_water", { ml: 500 }))).toEqual({
      name: "undo_last_water",
      arguments: {},
    })
    expect(
      inverseOf(call("log_water", { ml: 500, date: "2026-08-20" }))?.arguments
    ).toEqual({ date: "2026-08-20" })
  })

  test("undoes food by the name the diary matched, not the one typed", () => {
    const logged = call(
      "log_food",
      { food: "greek yog", grams: 200 },
      { logged: "Greek yoghurt, plain", meal: "breakfast" }
    )
    expect(inverseOf(logged)).toEqual({
      name: "remove_food_entry",
      arguments: { food: "Greek yoghurt, plain", meal: "breakfast" },
    })
  })

  test("offers nothing when the diary named nothing", () => {
    expect(inverseOf(call("log_food", { food: "toast" }))).toBeNull()
  })

  test("offers nothing for a call that failed", () => {
    const failed = call("log_water", { ml: 500 }, undefined, "offline")
    expect(inverseOf(failed)).toBeNull()
  })

  test("leaves alone the writes with no honest opposite", () => {
    for (const name of [
      "create_preset",
      "delete_preset",
      "add_grocery_item",
      "log_weight",
      "open_screen",
      "log_supplement",
    ]) {
      expect(inverseOf(call(name, { a: 1 }))).toBeNull()
    }
  })

  test("unwinds a multi-call run backwards", () => {
    const run = [
      call("log_food", { food: "eggs" }, { logged: "Eggs", meal: "breakfast" }),
      call("log_water", { ml: 250 }),
      call("start_fast", {}),
    ]
    expect(inverseOfRun(run).map((c) => c.name)).toEqual([
      "stop_fast",
      "undo_last_water",
      "remove_food_entry",
    ])
  })

  test("counts only what it can actually put back", () => {
    const run = [
      call("log_water", { ml: 250 }),
      call("create_preset", { name: "push" }),
    ]
    expect(inverseOfRun(run)).toHaveLength(1)
  })
})
