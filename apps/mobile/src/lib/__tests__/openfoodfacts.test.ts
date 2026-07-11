import { beforeEach, describe, expect, mock, test } from "bun:test"

const actionMock = mock(async () => ({}))

mock.module("@/lib/convex", () => ({
  convexClient: {
    action: actionMock,
  },
}))

const {
  __clearOpenFoodFactsCacheForTests,
  getFoodByBarcode,
  getFoodDetail,
  searchFoods,
} =
  await import("../openfoodfacts")

function lastActionArgs() {
  const calls = actionMock.mock.calls as unknown as Array<
    [
      unknown,
      {
        path: string
        params: Array<{ key: string; value: string }>
      },
    ]
  >
  return calls.at(-1)![1]
}

describe("Open Food Facts client", () => {
  beforeEach(() => {
    actionMock.mockReset()
    __clearOpenFoodFactsCacheForTests()
  })

  test("searchFoods ignores queries shorter than two non-space characters", async () => {
    await expect(searchFoods(" a ")).resolves.toEqual([])
    expect(actionMock).not.toHaveBeenCalled()
  })

  test("searchFoods sends normalized search parameters and clamps page size", async () => {
    actionMock.mockResolvedValueOnce({ products: [] })

    await searchFoods("  greek yogurt  ", 250)

    const args = lastActionArgs()
    expect(args.path).toBe("/cgi/search.pl")
    expect(args.params).toContainEqual({
      key: "search_terms",
      value: "greek yogurt",
    })
    expect(args.params).toContainEqual({ key: "page_size", value: "100" })
    const requestedFields = args.params.find(({ key }) => key === "fields")
      ?.value
    expect(requestedFields).toContain("image_front_small_url")
    expect(requestedFields).toContain("nutriments")
    expect(requestedFields).not.toContain("selected_images")
  })

  test("searchFoods filters invalid products and normalizes names, brands, serving, and macros", async () => {
    actionMock.mockResolvedValueOnce({
      products: [
        {
          code: "123",
          product_name_en: "Protein Bar",
          product_name: "Barre",
          brands: "Unknown",
          serving_size: "1 bar (50 g)",
          nutriments: {
            "energy-kcal_100g": "210.4 kcal",
            proteins_100g: "20,25 g",
            carbohydrates_100g: "18.05",
            fat_100g: 7.06,
          },
          nutriments_estimated: {
            calcium_100g: 0.004,
            iron_100g: 0.001,
          },
        },
        { product_name: "Missing code" },
      ],
    })

    const results = await searchFoods("bar")

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: "123",
      source: "openfoodfacts",
      code: "123",
      name: "Protein Bar",
      brand: undefined,
      serving: "1 bar (50 g)",
      calories: 210,
      protein: 20.3,
      carbs: 18.1,
      fat: 7.1,
      nutrients: expect.any(Array),
      extraNutrients: expect.arrayContaining([
        { key: "calcium", name: "Calcium", per100g: 0.004, unit: "mg" },
        { key: "iron", name: "Iron", per100g: 0.001, unit: "mg" },
      ]),
    })
  })

  test("searchFoods keeps localized nutrition values instead of dropping them", async () => {
    actionMock.mockResolvedValueOnce({
      products: [
        {
          code: "localized-1",
          product_name: "Localized Granola",
          nutriments: {
            "energy-kcal_100g": "1.234,5 kcal",
            proteins_100g: "20,25 g",
            carbohydrates_100g: "18.05 g",
            fat_100g: "7,1 g",
          },
        },
      ],
    })

    const [result] = await searchFoods("granola")

    expect(result).toMatchObject({
      calories: 1235,
      protein: 20.3,
      carbs: 18.1,
      fat: 7.1,
    })
  })

  test("searchFoods reuses identical in-flight and cached searches", async () => {
    actionMock.mockResolvedValue({
      products: [
        {
          code: "123",
          product_name_en: "Protein Bar",
          serving_size: "1 bar",
        },
      ],
    })

    const [first, second] = await Promise.all([
      searchFoods("protein bar", 25, "en"),
      searchFoods(" protein   bar ", 25, "EN"),
    ])
    const third = await searchFoods("protein bar", 25, "en")

    expect(actionMock).toHaveBeenCalledTimes(1)
    expect(first).toHaveLength(1)
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  test("getFoodDetail encodes ids and builds nutrition detail rows", async () => {
    actionMock.mockResolvedValueOnce({
      product: {
        code: "abc/123",
        product_name: "Sparkling Water",
        brands: "Acme",
        quantity: "330 g",
        serving_quantity: "250",
        nutriscore_grade: "A",
        nova_group: "2",
        nutriments: {
          "energy-kcal_100g": 1,
          sodium_100g: "0.02",
          sodium_unit: "g",
          calcium_100g: "12",
          calcium_unit: "mg",
          magnesium_100g: "8",
          magnesium_unit: "mg",
          "vitamin-d_100g": "1.5",
          "vitamin-d_unit": "mcg",
          caffeine_100g: "3",
          caffeine_unit: "mg",
        },
      },
    })

    const detail = await getFoodDetail("abc/123")
    const args = lastActionArgs()

    expect(args.path).toBe("/api/v2/product/abc%2F123.json")
    expect(args.params.find(({ key }) => key === "fields")?.value).toContain(
      "selected_images"
    )
    expect(detail).toMatchObject({
      id: "abc/123",
      name: "Sparkling Water",
      brand: "Acme",
      servingGrams: 250,
      servingLabel: "330 g",
      nutriscoreGrade: "a",
      novaGroup: 2,
    })
    expect(detail!.nutrients).toContainEqual({
      key: "sodium",
      name: "Sodium",
      per100g: 0.02,
      unit: "g",
    })
    expect(detail!.extraNutrients).toEqual([
      { key: "calcium", name: "Calcium", per100g: 12, unit: "mg" },
      { key: "magnesium", name: "Magnesium", per100g: 8, unit: "mg" },
      { key: "vitamin-d", name: "Vitamin D", per100g: 1.5, unit: "mcg" },
      { key: "caffeine", name: "Caffeine", per100g: 3, unit: "mg" },
    ])
  })

  test("getFoodDetail parses serving grams from serving_size when serving_quantity is absent", async () => {
    actionMock.mockResolvedValueOnce({
      product: {
        code: "456",
        generic_name: "Oats",
        serving_size: "1 bowl 42,5 g",
        nutriments: {},
      },
    })

    const detail = await getFoodDetail("456")

    expect(detail!.servingGrams).toBe(42.5)
    expect(detail!.name).toBe("Oats")
  })

  test("getFoodDetail treats milliliter servings as backing grams", async () => {
    actionMock.mockResolvedValueOnce({
      product: {
        code: "oj",
        product_name: "Orange Juice",
        serving_size: "250 ml",
        nutriments: {},
      },
    })

    const detail = await getFoodDetail("oj")

    expect(detail!.servingGrams).toBe(250)
    expect(detail!.servingLabel).toBe("250 ml")
  })

  test("getFoodDetail returns null when the proxy response has no valid product", async () => {
    actionMock.mockResolvedValueOnce({ status: 0 })

    await expect(getFoodDetail("missing")).resolves.toBeNull()
  })

  test("getFoodDetail returns null for legacy proxy 404 errors", async () => {
    actionMock.mockRejectedValueOnce(new Error("Open Food Facts request failed: 404"))

    await expect(getFoodDetail("missing")).resolves.toBeNull()
  })

  test("getFoodByBarcode returns the compact food result shape", async () => {
    actionMock.mockResolvedValueOnce({
      product: {
        code: "789",
        product_name: "Milk",
        brands: "Dairy Co",
        serving_size: "100 g",
        nutriments: { "energy-kcal_100g": 64, proteins_100g: 3.4 },
      },
    })

    const result = await getFoodByBarcode("789")

    expect(result).toMatchObject({
      id: "789",
      name: "Milk",
      brand: "Dairy Co",
      serving: "100 g",
      calories: 64,
      protein: 3.4,
    })
    expect(result).not.toHaveProperty("nutrients")
  })
})
