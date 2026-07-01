import { describe, expect, test } from "bun:test";
import type { Recipe, WorkoutPreset } from "@/types/domain";
import {
  completedSetCount,
  recipePerServing,
  recipeTotals,
  totalFoodMacros,
  totalSetCount,
  workoutVolumeKg,
} from "./domain";

describe("domain calculations", () => {
  test("totals food macros", () => {
    expect(
      totalFoodMacros([
        { calories: 100, protein: 10, carbs: 5, fat: 2 },
        { calories: 250, protein: 20, carbs: 30, fat: 8 },
      ]),
    ).toEqual({ calories: 350, protein: 30, carbs: 35, fat: 10 });
  });

  test("calculates recipe totals and per serving macros", () => {
    const recipe: Recipe = {
      id: "r1",
      name: "Bowl",
      servings: 2,
      ingredients: [
        {
          id: "a",
          name: "Chicken",
          grams: 200,
          calories: 330,
          protein: 62,
          carbs: 0,
          fat: 7,
        },
        {
          id: "b",
          name: "Rice",
          grams: 240,
          calories: 310,
          protein: 6,
          carbs: 68,
          fat: 1,
        },
      ],
    };
    expect(recipeTotals(recipe)).toEqual({
      calories: 640,
      protein: 68,
      carbs: 68,
      fat: 8,
    });
    expect(recipePerServing(recipe)).toEqual({
      calories: 320,
      protein: 34,
      carbs: 34,
      fat: 4,
    });
  });

  test("calculates workout volume and set counts", () => {
    const preset: WorkoutPreset = {
      id: "p1",
      name: "Upper",
      duration: "45 min",
      focus: "Strength",
      exercises: [
        {
          id: "e1",
          name: "Bench",
          muscle: "Chest",
          sets: [
            { id: "s1", weight: 100, reps: 5, restSeconds: 120, done: true },
            { id: "s2", weight: 90, reps: 8, restSeconds: 120, done: false },
          ],
        },
      ],
    };
    expect(workoutVolumeKg(preset)).toBe(1220);
    expect(completedSetCount(preset)).toBe(1);
    expect(totalSetCount(preset)).toBe(2);
  });
});
