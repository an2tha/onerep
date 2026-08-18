import { expect, test } from "bun:test"

import {
  expandedFoodImageUrl,
  foodSource,
  foodSources,
} from "@/lib/openfoodfacts"

/**
 * The attribution line used to be hard-coded to USDA, so a Swedish kebab from
 * Open Food Facts was credited to a US government database. Open Food Facts is
 * ODbL, which requires credit, so getting this right is a licence obligation
 * rather than a nicety.
 */

test("credits the catalog a food actually came from", () => {
  expect(foodSource("off:3017620422003")?.name).toBe("Open Food Facts")
  expect(foodSource("usda:2646170")?.name).toBe("USDA FoodData Central")
})

test("credits nobody when the source cannot be known", () => {
  // A bare id predates provider-qualified codes. Naming a database we cannot
  // verify would be a false claim about where the numbers came from.
  expect(foodSource("2646170")).toBeNull()
  expect(foodSource(undefined)).toBeNull()
  expect(foodSource("")).toBeNull()
  expect(foodSource("somethingelse:1")).toBeNull()
})

test("names every catalog behind a mixed result set, once each", () => {
  // One search can return results from more than one provider.
  const sources = foodSources(["usda:1", "off:2", "off:3", "usda:4", undefined])
  expect(sources.map((source) => source.id)).toEqual(["usda", "off"])
})

test("carries the licence ODbL requires be shown, and only where it applies", () => {
  expect(foodSource("off:1")?.license?.name).toBe("ODbL")
  // USDA FoodData Central is public domain; there is no licence to name.
  expect(foodSource("usda:1")?.license).toBeUndefined()
})

test("links each catalog to its own site", () => {
  expect(foodSource("off:1")?.url).toContain("openfoodfacts.org")
  expect(foodSource("usda:1")?.url).toContain("fdc.nal.usda.gov")
})

test("asks for a larger photo when one exists, and leaves anything else alone", () => {
  // Open Food Facts serves each revision at several widths under one path; the
  // datasource stores the 200 px file because that is what a list row wants.
  expect(
    expandedFoodImageUrl(
      "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.924.200.jpg"
    )
  ).toBe(
    "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.924.400.jpg"
  )
  // A URL that is not in that shape is returned untouched rather than mangled.
  expect(expandedFoodImageUrl("https://example.test/photo.png")).toBe(
    "https://example.test/photo.png"
  )
  expect(expandedFoodImageUrl(undefined)).toBeUndefined()
})
