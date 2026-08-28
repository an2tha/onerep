import { describe, expect, test } from "bun:test"
import { getFunctionName } from "convex/server"
import type { FunctionReference } from "convex/server"
import { NeedleToolbox } from "@repo/needle"
import type { FoodDetail } from "@repo/models"
import {
  buildQuickActionTools,
  destructiveToolNames,
  resolveDate,
  shiftDate,
} from ".."
import type { QuickActionDeps } from "../deps"

/**
 * The quick actions, without a Convex server.
 *
 * `QuickActionDeps` exists for exactly this: every tool is a function over that
 * object, so the whole catalogue can be driven against a recorder and asserted
 * on by the Convex function name it tried to call. That name is the real thing
 * worth pinning — a tool that writes to the wrong mutation typechecks fine and
 * loses somebody's dinner.
 */

type Call = { name: string; args: Record<string, unknown>; offlineAs?: string }

function harness(overrides: Partial<QuickActionDeps> = {}) {
  const mutations: Call[] = []
  const queries: Call[] = []
  const navigations: string[] = []
  let counter = 0

  const responses = new Map<string, unknown>()

  const deps: QuickActionDeps = {
    async query(reference, args) {
      const name = getFunctionName(reference as FunctionReference<"query">)
      queries.push({ name, args })
      return responses.get(name)
    },
    async mutate(reference, args, offlineAs) {
      const name = getFunctionName(reference)
      mutations.push({ name, args, offlineAs })
      return responses.get(`mutation:${name}`) ?? { ok: true }
    },
    today: () => "2026-08-26",
    now: () => "2026-08-26T14:30:00.000Z",
    id: () => `id-${++counter}`,
    searchFoods: async () => [],
    foodByCode: async () => null,
    foodByBarcode: async () => null,
    navigate: (path) => navigations.push(path),
    ...overrides,
  }

  const tools = new NeedleToolbox(buildQuickActionTools(deps))
  const run = (
    name: string,
    args: Record<string, unknown> = {},
    confirmed = false
  ) => tools.execute({ name, arguments: args }, { confirmed })

  return { deps, tools, run, mutations, queries, navigations, responses }
}

const food: FoodDetail = {
  id: "off:123",
  source: "openfoodfacts",
  code: "123",
  name: "Greek Yoghurt",
  brand: "Fage",
  serving: "170 g",
  servingGrams: 170,
  servingLabel: "1 pot (170 g)",
  calories: 97,
  protein: 9,
  carbs: 4,
  fat: 5,
  nutrients: [],
  extraNutrients: [],
  openFoodFacts: {} as FoodDetail["openFoodFacts"],
}

describe("the catalogue", () => {
  test("is large, and every tool is uniquely and legally named", () => {
    const { tools } = harness()
    const names = tools.names()

    // Past five tools Needle switches to retrieval and only the five
    // best-scoring schemas enter the grammar, so breadth is free where context
    // is not. A shrinking catalogue is the regression worth catching.
    expect(names.length).toBeGreaterThanOrEqual(35)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  test("every tool describes itself in prose retrieval can score", () => {
    const { tools } = harness()
    for (const schema of tools.schemas()) {
      expect(schema.description.length).toBeGreaterThan(20)
      expect(schema.parameters.type).toBe("object")
    }
  })

  test("the destructive set is exactly the irreversible ones", () => {
    const { deps } = harness()
    expect(destructiveToolNames(deps).sort()).toEqual([
      "abort_workout",
      "clear_checked_groceries",
      "delete_meal_preset",
      "delete_preset",
      "delete_repeat_meal",
      "remove_food_entry",
    ])
  })

  test("a destructive tool will not run unconfirmed, whoever asks", async () => {
    const { run, mutations } = harness()

    expect(run("delete_preset", { preset: "Push" })).rejects.toThrow(
      /destructive and was not confirmed/
    )
    expect(mutations).toEqual([])
  })
})

describe("dates", () => {
  test("takes what people say, not only what the diary stores", () => {
    expect(resolveDate(undefined, "2026-08-26")).toBe("2026-08-26")
    expect(resolveDate("yesterday", "2026-08-26")).toBe("2026-08-25")
    expect(resolveDate("Tomorrow", "2026-08-26")).toBe("2026-08-27")
    expect(resolveDate("2026-01-02", "2026-08-26")).toBe("2026-01-02")
  })

  test("crosses a month boundary without a timezone getting a vote", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28")
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01")
  })

  test("refuses a phrase it cannot resolve rather than logging on the wrong day", () => {
    expect(() => resolveDate("last Tuesday", "2026-08-26")).toThrow(
      /not a date I can use/
    )
  })
})

describe("food", () => {
  test("search trims the Open Food Facts payload away", async () => {
    const { run } = harness({ searchFoods: async () => [food] })
    const result = (await run("search_food", { query: "greek yoghurt" })) as {
      results: Array<Record<string, unknown>>
    }

    expect(result.results[0]).toEqual({
      name: "Greek Yoghurt",
      brand: "Fage",
      serving: "1 pot (170 g)",
      per100g: { calories: 97, protein: 9, carbs: 4, fat: 5 },
    })
    // The raw detail is ~40 KB of nutriments and image URLs and this string is
    // the next turn's prompt, in a 2048-token context.
    expect(JSON.stringify(result)).not.toContain("openFoodFacts")
  })

  test("logging searches by name, scales to the portion and says what it matched", async () => {
    const { run, mutations } = harness({ searchFoods: async () => [food] })
    const result = (await run("log_food", {
      food: "greek yoghurt",
      grams: 200,
      meal: "breakfast",
    })) as { calories: number; protein: number; matched: string }

    expect(result.calories).toBe(194)
    expect(result.protein).toBe(18)
    // The user asked for yoghurt and got a specific brand's yoghurt. This is
    // the only place that says which.
    expect(result.matched).toBe("Greek Yoghurt")
    expect(mutations[0]?.name).toBe("logs/foodLogs:addEntry")
    expect(mutations[0]?.offlineAs).toBe("logs.foodLogs.addEntry")
    expect(mutations[0]?.args.date).toBe("2026-08-26")
  })

  test("a food nothing matches is a message, not a wrong entry", async () => {
    const { run, mutations } = harness({ searchFoods: async () => [] })

    expect(run("log_food", { food: "zzzz", grams: 100 })).rejects.toThrow(
      /Use log_quick_food/
    )
    expect(mutations).toEqual([])
  })

  test("no tool takes an opaque id, because the model cannot produce one", () => {
    // Measured, not assumed: as `delete_preset({ presetId })` the real engine
    // answered "delete my push day preset" with the empty call, because
    // arguments may only carry values evidenced by the input and the user never
    // says `k57d8...`. Names are evidence; ids are not.
    const { tools } = harness()
    for (const schema of tools.schemas()) {
      for (const argument of Object.keys(schema.parameters.properties ?? {})) {
        expect(argument).not.toMatch(/Id$/)
      }
    }
  })

  test("copying a meal gives every entry a fresh id", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/foodLogs:getDay", [
      {
        id: "a",
        name: "Eggs",
        meal: "breakfast",
        calories: 150,
        protein: 12,
        carbs: 1,
        fat: 10,
      },
      {
        id: "b",
        name: "Toast",
        meal: "breakfast",
        calories: 90,
        protein: 3,
        carbs: 17,
        fat: 1,
      },
      {
        id: "c",
        name: "Curry",
        meal: "dinner",
        calories: 600,
        protein: 30,
        carbs: 60,
        fat: 20,
      },
    ])
    const result = (await run("repeat_meal_from_day", {
      meal: "breakfast",
    })) as {
      copied: number
      from: string
    }

    expect(result).toMatchObject({ copied: 2, from: "2026-08-25" })
    // addEntry de-duplicates on id, which is what makes an offline retry safe —
    // and what would make a naive copy overwrite the original instead.
    const ids = mutations.map((call) => (call.args.entry as { id: string }).id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).not.toContain("a")
  })

  test("saving a meal preset refuses when the meal is empty", async () => {
    const { run, responses } = harness()
    responses.set("logs/foodLogs:getDay", [])

    expect(
      run("save_meal_preset", { name: "usual", meal: "breakfast" })
    ).rejects.toThrow(/nothing to save/)
  })
})

describe("presets", () => {
  const presets = [
    { id: "p1", name: "Push", items: [{}, {}] },
    { id: "p2", name: "Pull", items: [{}] },
    { id: "p3", name: "Legs", items: [{}] },
  ]

  function presetHarness() {
    const kit = harness()
    kit.responses.set("logs/presets:list", presets)
    kit.responses.set("users/schedules:get", {
      routine: { Mon: "p1", Wed: "p2" },
      presetOrder: ["p3", "p1", "p2"],
    })
    return kit
  }

  test("lists in the user's dragged order, not by updatedAt", async () => {
    const { run } = presetHarness()
    const result = (await run("list_presets")) as {
      presets: Array<{ position: number; name: string }>
    }

    expect(result.presets.map((preset) => preset.name)).toEqual([
      "Legs",
      "Push",
      "Pull",
    ])
  })

  test("reorder keeps presets the model left out instead of dropping them", async () => {
    const { run, mutations } = presetHarness()
    // The model happily answers "put Legs first" with a one-element array.
    // Reading that as the whole order would delete two presets from the week.
    await run("reorder_presets", { presets: ["Pull"] })

    expect(mutations[0]?.name).toBe("users/schedules:set")
    expect(mutations[0]?.args.presetOrder).toEqual(["p2", "p1", "p3"])
  })

  test("reorder rejects ids that are not presets", async () => {
    const { run, mutations } = presetHarness()

    expect(
      run("reorder_presets", { presets: ["Push", "ghost"] })
    ).rejects.toThrow(/No workout preset called "ghost"/)
    expect(mutations).toEqual([])
  })

  test("moving one preset does not require listing the rest", async () => {
    const { run, mutations } = presetHarness()
    const result = (await run("move_preset_to_position", {
      preset: "Pull",
      position: 1,
    })) as { moved: string; from: number; to: number }

    expect(result).toEqual({ moved: "Pull", from: 3, to: 1 })
    expect(mutations[0]?.args.presetOrder).toEqual(["p2", "p3", "p1"])
  })

  test("a position past the end clamps rather than losing the preset", async () => {
    const { run, mutations } = presetHarness()
    await run("move_preset_to_position", { preset: "Legs", position: 99 })

    expect(mutations[0]?.args.presetOrder).toEqual(["p1", "p2", "p3"])
  })

  test("deleting, once confirmed, also clears the day it was scheduled on", async () => {
    const { run, mutations } = presetHarness()
    const result = (await run("delete_preset", { preset: "Push" }, true)) as {
      deleted: string
    }

    expect(result.deleted).toBe("Push")
    expect(mutations[0]?.name).toBe("logs/presets:remove")
    // A dangling id in `routine` renders as an empty slot with no way to clear
    // it, which is how a deleted preset haunts a Monday forever.
    expect(mutations[1]?.args.routine).toEqual({ Mon: null, Wed: "p2" })
    expect(mutations[1]?.args.presetOrder).toEqual(["p3", "p2"])
  })

  test("create builds the empty set state the workout screen expects", async () => {
    const { run, mutations } = harness()
    await run("create_preset", {
      name: "Push A",
      exercises: [{ name: "Bench", sets: 4, reps: 8 }, { name: "Dips" }],
    })

    const args = mutations[0]?.args as {
      items: Array<{ id: string; sets: number }>
      exerciseData: Record<string, { sets: unknown[] }>
    }
    expect(args.items.map((item) => item.sets)).toEqual([4, 3])
    expect(args.exerciseData[args.items[0]!.id]?.sets).toHaveLength(4)
  })

  test("the weekly routine reads back with rest days named", async () => {
    const { run } = presetHarness()
    const result = (await run("show_weekly_routine")) as {
      week: Array<{ day: string; workout: string }>
    }

    expect(result.week[0]).toEqual({ day: "Mon", workout: "Push" })
    expect(result.week[1]).toEqual({ day: "Tue", workout: "rest" })
  })
})

describe("training", () => {
  test("finishing writes the log as well as clearing the live session", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/activeWorkout:getActive", {
      slot: 1,
      startedAt: 0,
      elapsedSeconds: 3600,
      items: [{}],
    })
    responses.set("mutation:logs/activeWorkout:finishActive", {
      exercises: [{ name: "Bench" }],
    })
    const result = (await run("finish_workout")) as { minutes: number }

    expect(result.minutes).toBe(60)
    // Finishing without the write loses the session; writing without finishing
    // leaves a ghost timer on the dashboard.
    expect(mutations.map((call) => call.name)).toEqual([
      "logs/activeWorkout:finishActive",
      "logs/workouts:completion",
    ])
    expect(mutations[1]?.args.durationSeconds).toBe(3600)
  })

  test("finishing nothing says so instead of writing an empty session", async () => {
    const { run, mutations } = harness()

    expect(run("finish_workout")).rejects.toThrow(/No workout is running/)
    expect(mutations).toEqual([])
  })

  test("aborting is destructive and needs the confirmation", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/activeWorkout:getActive", {
      slot: 1,
      startedAt: 0,
      items: [{}, {}],
    })

    expect(run("abort_workout", {})).rejects.toThrow(/not confirmed/)
    expect(await run("abort_workout", {}, true)).toMatchObject({
      aborted: true,
      exercises: 2,
    })
    expect(mutations.map((call) => call.name)).toEqual([
      "logs/activeWorkout:abortActive",
    ])
  })

  test("live-session writes are never handed to the offline queue", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/presets:list", [{ id: "p1", name: "Push", items: [] }])
    responses.set("mutation:logs/activeWorkout:createActive", { id: "w1" })
    await run("start_workout", { preset: "Push" })

    // Replaying "start the workout" out of a queue twenty minutes later starts
    // a workout the user has walked away from.
    expect(mutations[0]?.offlineAs).toBeUndefined()
  })
})

describe("wellbeing", () => {
  test("a named size becomes millilitres", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/water:getDay", [{ amountMl: 250 }, { amountMl: 500 }])
    const result = (await run("log_water", { size: "bottle" })) as {
      totalMl: number
    }

    expect((mutations[0]?.args.entry as { amountMl: number }).amountMl).toBe(
      500
    )
    expect(result.totalMl).toBe(750)
  })

  test("water with neither an amount nor a size asks rather than guessing", async () => {
    const { run } = harness()
    expect(run("log_water", {})).rejects.toThrow(/Say how much water/)
  })

  test("undo removes the most recent entry, not the first", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/water:getDay", [
      { id: "w1", amountMl: 250 },
      { id: "w2", amountMl: 500 },
    ])
    await run("undo_last_water")

    expect(mutations[0]?.args.entryId).toBe("w2")
  })

  test("measurements refuse an empty check-in", async () => {
    const { run } = harness()
    expect(run("log_body_measurements", {})).rejects.toThrow(
      /at least one measurement/
    )
  })

  test("weight goes through bodyProgress with a client id for idempotency", async () => {
    const { run, mutations } = harness()
    await run("log_weight", { weightKg: 82.4 })

    expect(mutations[0]?.name).toBe("bodyProgress:save")
    expect(mutations[0]?.args).toMatchObject({
      clientId: "id-1",
      loggedAt: "2026-08-26",
      weightKg: 82.4,
    })
  })
})

describe("planning", () => {
  test("groceries land on the newest list that is still open", async () => {
    const { run, mutations, responses } = harness()
    responses.set("logs/groceryLists:list", [
      { _id: "old", name: "Last week", archivedAt: 1, items: [] },
      { _id: "now", name: "This week", items: [] },
    ])
    await run("add_grocery_item", { name: "Oat Milk" })

    expect(mutations[0]?.args.id).toBe("now")
    // The key de-duplicates two spellings of one thing, so it is normalised
    // while the display name keeps the user's capitals.
    expect(mutations[0]?.args.item).toMatchObject({
      name: "Oat Milk",
      key: "oat milk",
    })
  })

  test("no list at all is a sentence, not a crash", async () => {
    const { run, responses } = harness()
    responses.set("logs/groceryLists:list", [])

    expect(run("add_grocery_item", { name: "milk" })).rejects.toThrow(
      /no grocery list yet/
    )
  })

  test("navigation writes nothing and opens a real route", async () => {
    const { run, navigations, mutations } = harness()
    const result = (await run("open_screen", { screen: "groceries" })) as {
      path: string
    }

    expect(result.path).toBe("/nutrition/groceries")
    expect(navigations).toEqual(["/nutrition/groceries"])
    expect(mutations).toEqual([])
  })
})
