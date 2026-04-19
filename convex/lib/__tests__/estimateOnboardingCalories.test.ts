import { describe, test, expect } from "bun:test";
import { estimateOnboardingCalories } from "../estimateOnboardingCalories";

describe("estimateOnboardingCalories", () => {
  const base = {
    age: 25,
    heightCm: 170,
    goal: "health",
  };

  describe("goal mapping to calorie delta", () => {
    test("'lose' goal produces lower targetCalories than 'health'", () => {
      const lose = estimateOnboardingCalories({ ...base, goal: "lose" });
      const health = estimateOnboardingCalories({ ...base, goal: "health" });
      expect(lose.targetCalories).toBeLessThan(health.targetCalories);
    });

    test("'build' goal produces higher targetCalories than 'health'", () => {
      const build = estimateOnboardingCalories({ ...base, goal: "build" });
      const health = estimateOnboardingCalories({ ...base, goal: "health" });
      expect(build.targetCalories).toBeGreaterThan(health.targetCalories);
    });

    test("'performance' goal produces higher targetCalories than 'health'", () => {
      const perf = estimateOnboardingCalories({ ...base, goal: "performance" });
      const health = estimateOnboardingCalories({ ...base, goal: "health" });
      expect(perf.targetCalories).toBeGreaterThan(health.targetCalories);
    });

    test("'performance' and 'build' goals produce same calorie delta", () => {
      const build = estimateOnboardingCalories({ ...base, goal: "build" });
      const perf = estimateOnboardingCalories({ ...base, goal: "performance" });
      expect(build.targetCalories).toBe(perf.targetCalories);
    });

    test("unknown goal maps to 'maintain' (health-like)", () => {
      const health = estimateOnboardingCalories({ ...base, goal: "health" });
      const unknown = estimateOnboardingCalories({ ...base, goal: "some_unknown" });
      expect(unknown.targetCalories).toBe(health.targetCalories);
    });
  });

  describe("BMR floor", () => {
    test("BMR never falls below 1200 kcal", () => {
      // Very old, short person
      const result = estimateOnboardingCalories({ age: 90, heightCm: 140, goal: "health" });
      expect(result.bmr).toBeGreaterThanOrEqual(1200);
    });

    test("BMR minimum applies for extreme inputs", () => {
      const result = estimateOnboardingCalories({ age: 100, heightCm: 100, goal: "health" });
      expect(result.bmr).toBeGreaterThanOrEqual(1200);
    });
  });

  describe("targetCalories floor", () => {
    test("targetCalories never falls below 1400 kcal", () => {
      const result = estimateOnboardingCalories({ age: 90, heightCm: 140, goal: "lose" });
      expect(result.targetCalories).toBeGreaterThanOrEqual(1400);
    });
  });

  describe("TDEE floor", () => {
    test("TDEE is always at least BMR + 400", () => {
      const result = estimateOnboardingCalories(base);
      expect(result.tdee).toBeGreaterThanOrEqual(result.bmr + 400);
    });
  });

  describe("anthropometric scaling", () => {
    test("taller person has higher base calories", () => {
      const short = estimateOnboardingCalories({ ...base, heightCm: 155 });
      const tall = estimateOnboardingCalories({ ...base, heightCm: 185 });
      expect(tall.bmr).toBeGreaterThan(short.bmr);
    });

    test("younger person has higher base calories", () => {
      const young = estimateOnboardingCalories({ ...base, age: 18 });
      const old = estimateOnboardingCalories({ ...base, age: 60 });
      expect(young.bmr).toBeGreaterThanOrEqual(old.bmr);
    });
  });

  describe("macro calculations", () => {
    test("protein is 30% of targetCalories / 4 kcal per gram", () => {
      const result = estimateOnboardingCalories(base);
      expect(result.protein).toBe(Math.round((result.targetCalories * 0.3) / 4));
    });

    test("carbs is 40% of targetCalories / 4 kcal per gram", () => {
      const result = estimateOnboardingCalories(base);
      expect(result.carbs).toBe(Math.round((result.targetCalories * 0.4) / 4));
    });

    test("fat is 30% of targetCalories / 9 kcal per gram", () => {
      const result = estimateOnboardingCalories(base);
      expect(result.fat).toBe(Math.round((result.targetCalories * 0.3) / 9));
    });
  });

  describe("return shape", () => {
    test("returns all CaloricGoals fields", () => {
      const result = estimateOnboardingCalories(base);
      expect(result).toHaveProperty("bmr");
      expect(result).toHaveProperty("tdee");
      expect(result).toHaveProperty("targetCalories");
      expect(result).toHaveProperty("protein");
      expect(result).toHaveProperty("carbs");
      expect(result).toHaveProperty("fat");
    });

    test("all values are positive integers", () => {
      const result = estimateOnboardingCalories(base);
      for (const [key, val] of Object.entries(result)) {
        expect(val, `${key} should be positive`).toBeGreaterThan(0);
        expect(Number.isInteger(val), `${key} should be integer`).toBe(true);
      }
    });
  });
});
