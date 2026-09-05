import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const source = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")

describe("backdated food navigation", () => {
  test("Nutrition retains the date in the URL when visiting another screen", () => {
    const nutrition = source("./Nutrition.tsx")
    expect(nutrition).toContain(
      'const requestedDate = searchParams.get("date")'
    )
    expect(nutrition).toContain('next.set("date", date)')
    expect(nutrition).not.toContain('next.delete("date")')
    expect(nutrition).toContain("navigate(`/foods/custom?date=${dateKey}`)")
  })

  test("search forwards the logging context to both review and My foods", () => {
    const search = source("./SearchFoods.tsx")
    expect(search).toContain(
      'foodLogContextParams(date, searchParams.get("time"))'
    )
    expect(search).toContain("/foods/custom?new=1&log=1&${foodLogContextParams")
    expect(search).toContain("/foods/custom?${foodLogContextParams")
    expect(source("./FoodReview.tsx")).toContain(
      'foodLogTimestamp(date, reviewParams.get("time"))'
    )
  })

  test("custom food logging and undo use the form's chosen date", () => {
    const custom = source("./CustomFoods.tsx")
    expect(custom).toContain(
      "loggedAt: foodLogTimestamp(options.date, options.time)"
    )
    expect(custom).toContain("addFoodEntry({ date: options.date, entry })")
    expect(custom).toMatch(/removeFoodEntry\(\{\s*date: options.date,/)
    expect(custom).toContain('type="date"')
    expect(custom).toContain('type="time"')
  })
})
