import { describe, expect, test } from "vitest";
import {
  filterAndRankFoodCandidates,
  isPlausibleFoodMatch,
  normalizeSelectedFoodCode,
} from "../logs/snapMatching";

function food(name: string, code = name.toLowerCase().replace(/\W+/g, "-")) {
  return {
    id: code,
    code,
    name,
    serving: "100 g",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    openFoodFacts: { product_name: name },
  };
}

describe("snap food matching relevance", () => {
  test("keeps plausible masala dosa ingredients and rejects unrelated products", () => {
    const detection = {
      name: "dosa batter",
      searchQueries: ["idli dosa batter", "fermented rice lentil batter"],
    };

    const ranked = filterAndRankFoodCandidates(detection, [
      food("DARK CHOCOLATE"),
      food("Idly & Dosa Batter"),
      food("Pesto Basilico Extra"),
    ]);

    expect(ranked.map((item) => item.name)).toEqual(["Idly & Dosa Batter"]);
  });

  test("rejects pesto as a coconut chutney match", () => {
    expect(
      isPlausibleFoodMatch(
        { name: "coconut chutney", searchQueries: ["coconut chutney"] },
        food("Pesto Basilico Extra"),
      ),
    ).toBe(false);
  });

  test("allows common Indian synonyms for potato masala", () => {
    expect(
      isPlausibleFoodMatch(
        { name: "spiced potato masala", searchQueries: ["aloo masala"] },
        food("Aloo Masala"),
      ),
    ).toBe(true);
  });

  test("does not turn multi-word ingredients into one-token fallback products", () => {
    expect(
      isPlausibleFoodMatch(
        {
          name: "spiced potato masala",
          searchQueries: ["potato filling"],
        },
        food("Potato Chips"),
      ),
    ).toBe(false);
  });

  test("normalizes null-like matcher selections", () => {
    expect(normalizeSelectedFoodCode(null)).toBeNull();
    expect(normalizeSelectedFoodCode("null")).toBeNull();
    expect(normalizeSelectedFoodCode("no_match")).toBeNull();
    expect(normalizeSelectedFoodCode(" 12345 ")).toBe("12345");
  });
});
