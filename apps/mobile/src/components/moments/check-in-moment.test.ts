/**
 * Contract tests for the check-in moment's answers.
 *
 * Each answer is a promise about what happens next. The ones that say they
 * finish the job here must not quietly become links to another page, and the
 * one that hands off to the coach must arrive with the question already asked.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const CHECK_IN = read("./check-in-moment.tsx")
const COACH_PAGE = read("../../pages/Coach.tsx")

describe("the coach answer asks rather than deposits you", () => {
  test("it opens a second list instead of navigating straight out", () => {
    expect(CHECK_IN).toContain('setStep("coach")')
    // The old behaviour: tap, land on an empty coach screen, type it yourself.
    expect(CHECK_IN).not.toContain('navigate("/coach", { motion: "forward" })')
  })

  test("both nudges offer their own questions, in the user's words", () => {
    expect(CHECK_IN).toContain('"training-lapse": [')
    expect(CHECK_IN).toContain('"missed-log": [')
    // Four each is a list; more is a survey.
    const prompts = CHECK_IN.match(/^\s{4}"[A-Z][^"]{30,}\?*",$/gm) ?? []
    expect(prompts.length).toBeGreaterThanOrEqual(8)
  })

  test("a chosen question is sent, not left sitting in the composer", () => {
    expect(CHECK_IN).toContain("autoSend: true")
    expect(CHECK_IN).toContain('coachMode: "personal_trainer"')
  })

  test("anything the four do not cover still gets a way through", () => {
    expect(CHECK_IN).toContain("Another reason")
    // No prompt means an empty composer rather than a wrong question.
    expect(CHECK_IN).toContain("askCoach()")
  })
})

describe("the coach page honours the handoff", () => {
  test("accepts a question on its own, not only a recipe or guided intent", () => {
    expect(COACH_PAGE).toContain("!state.initialInput")
    expect(COACH_PAGE).toContain("autoSend?: boolean")
  })

  /**
   * Sending inside the handoff effect would post the question against the
   * previous render's conversation, which is a different bug every time.
   */
  test("sends on the render after the conversation has loaded", () => {
    expect(COACH_PAGE).toContain("setPendingAutoSend(state.initialInput)")
    expect(COACH_PAGE).toContain("void submit(pendingAutoSend)")
  })

  test("the send still passes through the AI access gate", () => {
    expect(COACH_PAGE).toContain('requireAiAccess(1, "coach_chat")')
  })
})

describe("the food answer logs here rather than opening the diary", () => {
  const FOOD_STEP = read("./quick-food-step.tsx")

  test("it opens the rapid log instead of navigating to Nutrition", () => {
    expect(CHECK_IN).toContain('setStep("food")')
    expect(CHECK_IN).not.toContain("/nutrition?date=")
  })

  test("the list is built from what this account actually eats", () => {
    expect(FOOD_STEP).toContain("buildQuickRepeatFoods(")
    expect(FOOD_STEP).toContain("api.logs.recipes.list")
    expect(FOOD_STEP).toContain("api.logs.mealPresets.list")
  })

  /** A filter that waits on the network is a search box, which is the friction. */
  test("the filter runs over data already in memory", () => {
    expect(FOOD_STEP).toContain("choice.name.toLowerCase().includes(needle)")
    expect(FOOD_STEP).not.toMatch(/useAction|datasource/)
  })

  test("anything unusual still reaches the real search, carrying the query", () => {
    expect(FOOD_STEP).toContain("/foods/search?q=")
  })

  test("it stays open, because a missed day is rarely one item", () => {
    expect(FOOD_STEP).toContain("setLogged((count) => count + 1)")
    expect(FOOD_STEP).toContain("logged > 0 ? `Done · ${logged} logged`")
  })

  test("a saved meal writes all of its entries, and undo takes them all back", () => {
    expect(FOOD_STEP).toContain("foodLogEntriesFromMealPreset(")
    expect(FOOD_STEP).toContain("entries.map((entry) =>")
  })

  /** The same three foods offered twice invites logging one of them twice. */
  test("the ask screen no longer repeats the food chips", () => {
    expect(CHECK_IN).not.toContain("repeatFoods")
    expect(CHECK_IN).toContain("WATER_CHIPS_ML")
  })
})

describe("the rapid log searches for real", () => {
  const FOOD_STEP = read("./quick-food-step.tsx")

  test("queries the food database, debounced, from the panel itself", () => {
    expect(FOOD_STEP).toContain("searchFoodsAccurate(")
    expect(FOOD_STEP).toContain("SEARCH_DEBOUNCE_MS")
    // A stale response must not overwrite a newer one.
    expect(FOOD_STEP).toContain("if (id !== requestRef.current) return")
  })

  test("a result opens the same detail sheet the search page opens", () => {
    expect(FOOD_STEP).toContain("<FoodDetailSheet")
    expect(FOOD_STEP).toContain("foodLogEntryFromFoodResult(")
  })

  /**
   * The moment sits above everything, including the sheet it just opened.
   * Without yielding, tapping a result appears to do nothing at all.
   */
  test("the moment drops below the sheet while one is open", () => {
    expect(FOOD_STEP).toContain("yielded={detailItem !== null}")
    const UI = read(
      "../../../../../packages/ui/src/components/moment-screen.tsx"
    )
    expect(UI).toContain("data-yielded")
    const CSS = read("../../../../../packages/ui/src/index.css")
    expect(CSS).toContain('.moment-layer[data-yielded="true"]')
  })

  test("your own foods stay above the database results", () => {
    expect(FOOD_STEP.indexOf("filtered.map(")).toBeLessThan(
      FOOD_STEP.indexOf("results.map(")
    )
  })

  test("a search that fails says so without hiding your own foods", () => {
    expect(FOOD_STEP).toContain("Search is not answering")
  })
})

describe("the answer lists stay short", () => {
  test("the lapse nudge offers three, and none of them is a bare link", () => {
    expect(CHECK_IN).not.toContain("I've lost the thread")
    expect(CHECK_IN).not.toContain('"routines"')
    expect(CHECK_IN).not.toContain('navigate("/routines"')
  })
})
