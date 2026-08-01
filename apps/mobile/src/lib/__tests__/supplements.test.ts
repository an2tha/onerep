import { describe, expect, test } from "bun:test"
import {
  buildSupplementDayPlan,
  combineMacroTotals,
  combineMicronutrientTotals,
  completedSupplementCount,
  nutrientTotal,
  formatSupplementAmount,
  loggableSupplementPlanItems,
  mergeNutritionTotals,
  scaleSupplementNutrients,
  supplementDraftFromFoodDetail,
  supplementDraftFromFoodResult,
  supplementEntryLabel,
  supplementNutrientTotals,
  supplementTotals,
  type SupplementIntakeLog,
  type SupplementItem,
  type SupplementLogEntry,
} from "../supplements"

const entries: SupplementLogEntry[] = [
  {
    id: "creatine-1",
    kind: "creatine",
    amount: 5,
    unit: "g",
    loggedAt: "2026-06-25T08:00:00.000Z",
  },
  {
    id: "protein-1",
    kind: "protein",
    amount: 25,
    unit: "g",
    loggedAt: "2026-06-25T09:00:00.000Z",
  },
  {
    id: "protein-2",
    kind: "protein",
    amount: 20,
    unit: "g",
    loggedAt: "2026-06-25T14:00:00.000Z",
  },
  {
    id: "caffeine-1",
    kind: "caffeine",
    amount: 100,
    unit: "mg",
    loggedAt: "2026-06-25T07:30:00.000Z",
  },
]

describe("supplement helpers", () => {
  test("formats grams, milligrams, and servings", () => {
    expect(formatSupplementAmount(5, "g")).toBe("5 g")
    expect(formatSupplementAmount(87.5, "mg")).toBe("87.5 mg")
    expect(formatSupplementAmount(1, "serving")).toBe("1 serving")
    expect(formatSupplementAmount(2, "serving")).toBe("2 servings")
  })

  test("totals entries by supplement kind", () => {
    expect(supplementTotals(entries)).toEqual({
      creatine: 5,
      protein: 45,
      vitamins: 0,
      caffeine: 100,
    })
  })

  test("counts completed recurring supplement kinds", () => {
    expect(completedSupplementCount(entries)).toBe(3)
  })

  test("builds a readable entry label", () => {
    expect(supplementEntryLabel(entries[0])).toBe("Creatine 5 g")
  })

  test("scales supplement nutrients by serving multiplier", () => {
    expect(
      scaleSupplementNutrients(
        { creatine: 5, vitaminD: 20, magnesium: 120 },
        1.5
      )
    ).toEqual({ creatine: 7.5, magnesium: 180, vitaminD: 30 })
  })

  test("totals only taken supplement log nutrients", () => {
    const logs: Pick<SupplementIntakeLog, "status" | "nutrients">[] = [
      { status: "taken", nutrients: { magnesium: 100, creatine: 5 } },
      { status: "skipped", nutrients: { magnesium: 100 } },
      { status: "taken", nutrients: { magnesium: 50, caffeine: 80 } },
    ]

    expect(supplementNutrientTotals(logs)).toEqual({
      caffeine: 80,
      creatine: 5,
      magnesium: 150,
    })
  })

  test("merges food and supplement micronutrient contributions", () => {
    expect(
      mergeNutritionTotals(
        { sodium: 125, vitaminD: 5 },
        { sodium: 200, vitaminD: 10, creatine: 5 }
      )
    ).toEqual({ sodium: 325, vitaminD: 15, creatine: 5 })
  })

  test("builds scheduled, taken, and missed day states", () => {
    const item: SupplementItem = {
      _id: "supplement-1",
      name: "Magnesium",
      category: "vitamin_mineral",
      form: "capsule",
      servingLabel: "1 capsule",
      defaultServingQuantity: 1,
      active: true,
      schedule: { type: "weekdays", weekdays: [4], preferredTime: "21:00" },
      nutrientsPerServing: { magnesium: 120 },
      source: "manual",
    }
    const takenLog: SupplementIntakeLog = {
      _id: "log-1",
      supplementId: "supplement-1",
      date: "2026-06-25",
      status: "taken",
      loggedAt: "2026-06-25T08:00:00.000Z",
      servingMultiplier: 1,
      servingLabel: "1 capsule",
      name: "Magnesium",
      category: "vitamin_mineral",
      nutrients: { magnesium: 120 },
    }

    expect(
      buildSupplementDayPlan({
        items: [item],
        logs: [],
        date: "2026-06-25",
        today: "2026-06-25",
        isTrainingDay: false,
        now: new Date("2026-06-25T08:00:00"),
      })[0].state
    ).toBe("due")

    expect(
      buildSupplementDayPlan({
        items: [item],
        logs: [takenLog],
        date: "2026-06-25",
        today: "2026-06-25",
        isTrainingDay: false,
      })[0].state
    ).toBe("taken")

    expect(
      buildSupplementDayPlan({
        items: [item],
        logs: [],
        date: "2026-06-25",
        today: "2026-06-26",
        isTrainingDay: false,
      })[0].state
    ).toBe("missed")
  })

  test("selects only scheduled due or missed supplements for batch logging", () => {
    const items: SupplementItem[] = [
      {
        _id: "due-supplement",
        name: "Creatine",
        category: "creatine",
        form: "powder",
        servingLabel: "5 g",
        defaultServingQuantity: 5,
        active: true,
        schedule: { type: "daily", preferredTime: "20:00" },
        nutrientsPerServing: { creatine: 5 },
        source: "manual",
      },
      {
        _id: "missed-supplement",
        name: "Magnesium",
        category: "vitamin_mineral",
        form: "capsule",
        servingLabel: "1 capsule",
        defaultServingQuantity: 1,
        active: true,
        schedule: { type: "daily", preferredTime: "08:00" },
        nutrientsPerServing: { magnesium: 120 },
        source: "manual",
      },
      {
        _id: "taken-supplement",
        name: "Vitamin D",
        category: "vitamin_mineral",
        form: "capsule",
        servingLabel: "1 capsule",
        defaultServingQuantity: 1,
        active: true,
        schedule: { type: "daily", preferredTime: "07:00" },
        nutrientsPerServing: { vitaminD: 25 },
        source: "manual",
      },
      {
        _id: "optional-supplement",
        name: "Caffeine",
        category: "caffeine_pre_workout",
        form: "capsule",
        servingLabel: "1 capsule",
        defaultServingQuantity: 1,
        active: true,
        schedule: { type: "none" },
        nutrientsPerServing: { caffeine: 100 },
        source: "manual",
      },
    ]
    const logs: SupplementIntakeLog[] = [
      {
        _id: "taken-log",
        supplementId: "taken-supplement",
        date: "2026-06-25",
        status: "taken",
        loggedAt: "2026-06-25T07:00:00.000Z",
        servingMultiplier: 1,
        servingLabel: "1 capsule",
        name: "Vitamin D",
        category: "vitamin_mineral",
        nutrients: { vitaminD: 25 },
      },
    ]

    const plan = buildSupplementDayPlan({
      items,
      logs,
      date: "2026-06-25",
      today: "2026-06-25",
      isTrainingDay: false,
      now: new Date("2026-06-25T12:00:00"),
    })

    expect(loggableSupplementPlanItems(plan).map((entry) => entry.item._id))
      .toEqual(["missed-supplement", "due-supplement"])
  })

  test("normalizes OpenFoodFacts detail into an editable supplement draft", () => {
    const draft = supplementDraftFromFoodDetail({
      id: "omega",
      source: "openfoodfacts",
      code: "12345",
      name: "Omega 3 Fish Oil",
      brand: "Acme",
      serving: "2 softgels",
      servingLabel: "2 softgels",
      servingGrams: 2,
      calories: 10,
      protein: 0,
      carbs: 0,
      fat: 1,
      openFoodFacts: { code: "12345", product_name: "Omega 3 Fish Oil" },
      nutrients: [
        { key: "energy", name: "Calories", per100g: 500, unit: "kcal" },
        { key: "fat", name: "Total Fat", per100g: 50, unit: "g" },
      ],
      extraNutrients: [
        { key: "omega-3-fat", name: "Omega-3", per100g: 50000, unit: "mg" },
        { key: "eicosapentaenoic-acid", name: "EPA", per100g: 20000, unit: "mg" },
        { key: "docosahexaenoic-acid", name: "DHA", per100g: 10000, unit: "mg" },
        { key: "vitamin-d", name: "Vitamin D", per100g: 500, unit: "mcg" },
      ],
    })

    expect(draft).toMatchObject({
      name: "Omega 3 Fish Oil",
      brand: "Acme",
      category: "omega_3",
      form: "softgel",
      barcode: "12345",
      source: "openfoodfacts",
      defaultServingQuantity: 2,
      nutrientsPerServing: {
        calories: 10,
        dha: 200,
        epa: 400,
        fat: 1,
        omega3: 1000,
        vitaminD: 10,
      },
    })
  })

  test("normalizes an OpenFoodFacts search result into a supplement draft", () => {
    const draft = supplementDraftFromFoodResult({
      id: "whey-1",
      source: "openfoodfacts",
      code: "98765",
      name: "Whey Protein Powder",
      brand: "Acme",
      serving: "30 g",
      calories: 400,
      protein: 80,
      carbs: 8,
      fat: 6,
      openFoodFacts: { code: "98765", product_name: "Whey Protein Powder" },
    })

    expect(draft).toMatchObject({
      name: "Whey Protein Powder",
      brand: "Acme",
      category: "protein",
      form: "powder",
      barcode: "98765",
      source: "openfoodfacts",
      defaultServingQuantity: 30,
      nutrientsPerServing: {
        calories: 120,
        protein: 24,
        carbs: 2.4,
        fat: 1.8,
      },
    })
  })
})

describe("combining food and supplement totals", () => {
  const food = { calories: 1800, protein: 120, carbs: 200, fat: 60 }

  test("nutrientTotal treats missing and non-finite values as zero", () => {
    expect(nutrientTotal(undefined, "calories")).toBe(0)
    expect(nutrientTotal({}, "calories")).toBe(0)
    expect(nutrientTotal({ calories: Number.NaN }, "calories")).toBe(0)
    expect(nutrientTotal({ calories: 120 }, "calories")).toBe(120)
  })

  test("combineMacroTotals is the identity when there are no supplements", () => {
    expect(combineMacroTotals(food, undefined)).toEqual(food)
    expect(combineMacroTotals(food, {})).toEqual(food)
  })

  test("combineMacroTotals adds supplement macros onto food macros", () => {
    expect(
      combineMacroTotals(food, {
        calories: 130,
        protein: 25,
        carbs: 3,
        fat: 1.5,
      })
    ).toEqual({ calories: 1930, protein: 145, carbs: 203, fat: 61.5 })
  })

  test("combineMacroTotals tolerates a partial supplement record", () => {
    expect(combineMacroTotals(food, { protein: 25 })).toEqual({
      calories: 1800,
      protein: 145,
      carbs: 200,
      fat: 60,
    })
  })

  test("combineMicronutrientTotals sums and drops zeroes", () => {
    const combined = combineMicronutrientTotals(
      { fiber: 20, vitaminC: 0 },
      { vitaminC: 500, fiber: 5 }
    )
    expect(combined.fiber).toBe(25)
    expect(combined.vitaminC).toBe(500)
    expect(combined.sodium).toBeUndefined()
  })

  test("combineMicronutrientTotals returns an empty record for empty inputs", () => {
    expect(combineMicronutrientTotals({}, undefined)).toEqual({})
  })
})
