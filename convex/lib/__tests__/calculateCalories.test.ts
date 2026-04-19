import { describe, test, expect } from "bun:test";
import { calculateCalories } from "../calculateCalories";

describe("calculateCalories", () => {
  const base = {
    sex: "male" as const,
    age: 30,
    weightKg: 80,
    heightCm: 175,
    activityLevel: "moderately_active",
    goal: "maintain",
  };

  describe("BMR calculation (Mifflin-St Jeor)", () => {
    test("calculates male BMR correctly", () => {
      // male: 10*80 + 6.25*175 - 5*30 + 5 = 800 + 1093.75 - 150 + 5 = 1748.75
      const result = calculateCalories(base);
      expect(result.bmr).toBe(1749);
    });

    test("calculates female BMR correctly", () => {
      // female: 10*80 + 6.25*175 - 5*30 - 161 = 800 + 1093.75 - 150 - 161 = 1582.75
      const result = calculateCalories({ ...base, sex: "female" });
      expect(result.bmr).toBe(1583);
    });

    test("BMR decreases with age", () => {
      const young = calculateCalories({ ...base, age: 20 });
      const old = calculateCalories({ ...base, age: 50 });
      expect(young.bmr).toBeGreaterThan(old.bmr);
    });

    test("BMR increases with height", () => {
      const short = calculateCalories({ ...base, heightCm: 160 });
      const tall = calculateCalories({ ...base, heightCm: 190 });
      expect(tall.bmr).toBeGreaterThan(short.bmr);
    });

    test("BMR increases with weight", () => {
      const light = calculateCalories({ ...base, weightKg: 60 });
      const heavy = calculateCalories({ ...base, weightKg: 100 });
      expect(heavy.bmr).toBeGreaterThan(light.bmr);
    });
  });

  describe("TDEE calculation", () => {
    test("sedentary multiplier (1.2)", () => {
      const result = calculateCalories({ ...base, activityLevel: "sedentary" });
      expect(result.tdee).toBe(Math.round(result.bmr * 1.2));
    });

    test("lightly_active multiplier (1.375)", () => {
      const result = calculateCalories({ ...base, activityLevel: "lightly_active" });
      expect(result.tdee).toBe(Math.round(result.bmr * 1.375));
    });

    test("moderately_active multiplier (1.55)", () => {
      const result = calculateCalories({ ...base, activityLevel: "moderately_active" });
      expect(result.tdee).toBe(Math.round(result.bmr * 1.55));
    });

    test("very_active multiplier (1.725)", () => {
      const result = calculateCalories({ ...base, activityLevel: "very_active" });
      expect(result.tdee).toBe(Math.round(result.bmr * 1.725));
    });

    test("extra_active multiplier (1.9)", () => {
      const result = calculateCalories({ ...base, activityLevel: "extra_active" });
      expect(result.tdee).toBe(Math.round(result.bmr * 1.9));
    });

    test("unknown activity level falls back to moderately_active (1.55)", () => {
      const knownResult = calculateCalories({ ...base, activityLevel: "moderately_active" });
      const unknownResult = calculateCalories({ ...base, activityLevel: "unknown_level" });
      expect(unknownResult.tdee).toBe(knownResult.tdee);
    });

    test("TDEE is always greater than BMR", () => {
      const result = calculateCalories(base);
      expect(result.tdee).toBeGreaterThan(result.bmr);
    });
  });

  describe("target calories by goal", () => {
    test("maintain goal: targetCalories equals TDEE", () => {
      const result = calculateCalories({ ...base, goal: "maintain" });
      expect(result.targetCalories).toBe(result.tdee);
    });

    test("lose goal: targetCalories is 500 below TDEE", () => {
      const result = calculateCalories({ ...base, goal: "lose" });
      expect(result.targetCalories).toBe(result.tdee - 500);
    });

    test("gain goal: targetCalories is 500 above TDEE", () => {
      const result = calculateCalories({ ...base, goal: "gain" });
      expect(result.targetCalories).toBe(result.tdee + 500);
    });

    test("unknown goal falls back to maintain (0 delta)", () => {
      const maintainResult = calculateCalories({ ...base, goal: "maintain" });
      const unknownResult = calculateCalories({ ...base, goal: "unknown_goal" });
      expect(unknownResult.targetCalories).toBe(maintainResult.targetCalories);
    });
  });

  describe("macro calculations", () => {
    test("protein is 30% of targetCalories / 4 kcal per gram", () => {
      const result = calculateCalories(base);
      expect(result.protein).toBe(Math.round((result.targetCalories * 0.3) / 4));
    });

    test("carbs is 40% of targetCalories / 4 kcal per gram", () => {
      const result = calculateCalories(base);
      expect(result.carbs).toBe(Math.round((result.targetCalories * 0.4) / 4));
    });

    test("fat is 30% of targetCalories / 9 kcal per gram", () => {
      const result = calculateCalories(base);
      expect(result.fat).toBe(Math.round((result.targetCalories * 0.3) / 9));
    });

    test("macros scale proportionally with target calories", () => {
      const low = calculateCalories({ ...base, goal: "lose" });
      const high = calculateCalories({ ...base, goal: "gain" });
      expect(high.protein).toBeGreaterThan(low.protein);
      expect(high.carbs).toBeGreaterThan(low.carbs);
      expect(high.fat).toBeGreaterThan(low.fat);
    });
  });

  describe("return shape", () => {
    test("returns all required fields", () => {
      const result = calculateCalories(base);
      expect(result).toHaveProperty("bmr");
      expect(result).toHaveProperty("tdee");
      expect(result).toHaveProperty("targetCalories");
      expect(result).toHaveProperty("protein");
      expect(result).toHaveProperty("carbs");
      expect(result).toHaveProperty("fat");
    });

    test("all values are integers (rounded)", () => {
      const result = calculateCalories(base);
      expect(Number.isInteger(result.bmr)).toBe(true);
      expect(Number.isInteger(result.tdee)).toBe(true);
      expect(Number.isInteger(result.targetCalories)).toBe(true);
      expect(Number.isInteger(result.protein)).toBe(true);
      expect(Number.isInteger(result.carbs)).toBe(true);
      expect(Number.isInteger(result.fat)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("very low weight (40 kg)", () => {
      const result = calculateCalories({ ...base, weightKg: 40 });
      expect(result.bmr).toBeGreaterThan(0);
      expect(result.tdee).toBeGreaterThan(0);
    });

    test("very high weight (200 kg)", () => {
      const result = calculateCalories({ ...base, weightKg: 200 });
      expect(result.bmr).toBeGreaterThan(0);
    });

    test("very young person (18)", () => {
      const result = calculateCalories({ ...base, age: 18 });
      expect(result.bmr).toBeGreaterThan(0);
    });

    test("elderly person (80)", () => {
      const result = calculateCalories({ ...base, age: 80 });
      expect(result.bmr).toBeGreaterThan(0);
    });
  });
});
