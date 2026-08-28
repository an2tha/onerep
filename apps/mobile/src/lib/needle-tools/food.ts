import * as z from "zod"
import { api } from "../../../../../convex/_generated/api"
import {
  foodLogEntryFromFoodResult,
  logMicrosFromFoodDetail,
  mealEntriesSignature,
  mealPresetTemplateEntries,
  foodLogEntriesFromMealPreset,
  type FoodLogEntry,
  type MealPreset,
} from "@/lib/food-log"
import {
  action,
  dateArg,
  matchByName,
  mealArg,
  nameArg,
  resolveDate,
  shiftDate,
} from "./deps"
import type { QuickActionDeps } from "./deps"

/**
 * Everything the model can do to the food diary.
 *
 * The shape of the day is: `search_food` finds candidates and hands back codes,
 * the model picks one and calls `log_food` with it. That is two turns rather
 * than one, and it is the right two — the alternative is a single tool that
 * takes a name and guesses which of the eleven thousand entries called "chicken
 * breast" the user meant, silently, with no way for them to see the guess.
 */
export function foodTools(deps: QuickActionDeps) {
  return [
    action({
      name: "search_food",
      description:
        "Show what the food catalogue has for a name, with nutrition, without logging anything.",
      input: z.object({
        query: z
          .string()
          .min(2)
          .describe("What to search for, e.g. 'greek yoghurt'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe(
            "How many candidates to return. Fewer is easier to choose from."
          ),
      }),
      run: async ({ query, limit }) => {
        const results = await deps.searchFoods(query, limit ?? 5)
        if (results.length === 0) {
          return {
            found: 0,
            results: [],
            hint: "Nothing matched. Try a shorter or more common name.",
          }
        }
        // Trimmed hard on the way out. The full FoodDetail carries the whole
        // Open Food Facts payload — images, nutriment tables, provenance — and
        // this string goes back into a 2048-token context as the next prompt.
        return {
          found: results.length,
          results: results.map((food) => ({
            name: food.name,
            brand: food.brand,
            serving: food.servingLabel || food.serving,
            per100g: {
              calories: Math.round(food.calories),
              protein: round(food.protein),
              carbs: round(food.carbs),
              fat: round(food.fat),
            },
          })),
        }
      },
    }),

    action({
      name: "log_food",
      /**
       * Takes a name and searches inside, rather than a code from a previous
       * turn.
       *
       * It took a `code` first, on the reasoning that the user should see which
       * of eleven thousand "chicken breast" rows was picked. Run against the
       * real engine, "log 200g of greek yoghurt for breakfast" came back as
       * `log_food({ code: "200g", meal: "greek yoghurt" })` — the model will not
       * call `search_food` first, it fills the required argument from whatever
       * text is nearest, and a code is not something the user ever says.
       *
       * So the search moved in here and the match comes back in the result.
       * The user still sees what was chosen; they see it after the fact instead
       * of before, which is the trade a 45M model is actually able to keep.
       */
      description:
        "Log a food by name and portion — the everyday case. Searches the catalogue and logs the best match.",
      input: z.object({
        food: z
          .string()
          .min(2)
          .describe("What was eaten, e.g. 'greek yoghurt'"),
        grams: z
          .number()
          .positive()
          .max(5000)
          .optional()
          .describe("Portion in grams"),
        meal: mealArg.optional(),
        date: dateArg.optional(),
      }),
      run: async ({ food: wanted, grams, meal, date }) => {
        const [match] = await deps.searchFoods(wanted, 1)
        if (!match) {
          throw new Error(
            `Nothing in the food catalogue matches "${wanted}". Use log_quick_food with the numbers instead.`
          )
        }
        const portion = grams ?? match.servingGrams ?? 100
        const entry = foodLogEntryFromFoodResult(match, {
          grams: portion,
          detail: match,
          micros: logMicrosFromFoodDetail(match, portion),
          ...(meal ? { meal } : {}),
          loggedAt: deps.now(),
        })
        await deps.mutate(
          api.logs.foodLogs.addEntry,
          { date: resolveDate(date, deps.today()), entry },
          "logs.foodLogs.addEntry"
        )
        // `matched` is not decoration. The user asked for yoghurt and got a
        // specific brand's yoghurt, and this is the only place that says which.
        return { ...summarize(entry), matched: match.name, grams: portion }
      },
    }),

    action({
      name: "log_food_by_barcode",
      description:
        "Add a food to the diary from a scanned barcode. Only for actual barcode digits, never a food name.",
      input: z.object({
        barcode: z
          .string()
          .regex(/^[0-9]{6,14}$/)
          .describe("The digits under the barcode, nothing else"),
        grams: z.number().positive().max(5000).optional(),
        meal: mealArg.optional(),
        date: dateArg.optional(),
      }),
      run: async ({ barcode, grams, meal, date }) => {
        const food = await deps.foodByBarcode(barcode)
        if (!food)
          throw new Error(`Nothing in the catalogue matches barcode ${barcode}`)
        const detail = await deps.foodByCode(food.code)
        const portion = grams ?? detail?.servingGrams ?? 100
        const entry = foodLogEntryFromFoodResult(food, {
          grams: portion,
          detail,
          micros: logMicrosFromFoodDetail(detail, portion),
          ...(meal ? { meal } : {}),
          loggedAt: deps.now(),
        })
        await deps.mutate(
          api.logs.foodLogs.addEntry,
          { date: resolveDate(date, deps.today()), entry },
          "logs.foodLogs.addEntry"
        )
        return summarize(entry)
      },
    }),

    action({
      name: "log_quick_food",
      description:
        "Add a food by its numbers, for something not in the catalogue. Use only when search_food finds nothing.",
      input: z.object({
        name: z.string().min(1),
        calories: z.number().min(0).max(10_000),
        protein: z.number().min(0).max(1000).optional(),
        carbs: z.number().min(0).max(1000).optional(),
        fat: z.number().min(0).max(1000).optional(),
        meal: mealArg.optional(),
        date: dateArg.optional(),
      }),
      run: async ({ name, calories, protein, carbs, fat, meal, date }) => {
        const entry: FoodLogEntry = {
          id: deps.id(),
          name,
          calories,
          protein: protein ?? 0,
          carbs: carbs ?? 0,
          fat: fat ?? 0,
          meal: meal ?? "snack",
          loggedAt: deps.now(),
        } as FoodLogEntry
        await deps.mutate(
          api.logs.foodLogs.addEntry,
          { date: resolveDate(date, deps.today()), entry },
          "logs.foodLogs.addEntry"
        )
        return summarize(entry)
      },
    }),

    action({
      name: "list_food_log",
      description:
        "Read back what has been eaten on a day, with per-entry ids and totals.",
      input: z.object({ date: dateArg.optional() }),
      run: async ({ date }) => {
        const key = resolveDate(date, deps.today())
        const entries = ((await deps.query(api.logs.foodLogs.getDay, {
          date: key,
        })) ?? []) as FoodLogEntry[]
        return {
          date: key,
          entries: entries.map((entry) => ({
            name: entry.name,
            meal: entry.meal,
            calories: Math.round(entry.calories),
          })),
          totals: totals(entries),
        }
      },
    }),

    action({
      name: "remove_food_entry",
      description:
        "Delete, remove or undo one food already logged in the diary, by its name.",
      destructive: true,
      input: z.object({
        food: nameArg("logged food"),
        meal: mealArg
          .optional()
          .describe("Narrows it when the same food is in two meals"),
        date: dateArg.optional(),
      }),
      run: async ({ food: wanted, meal, date }) => {
        const key = resolveDate(date, deps.today())
        const day = ((await deps.query(api.logs.foodLogs.getDay, {
          date: key,
        })) ?? []) as FoodLogEntry[]
        // Matched by name, like everything else. The diary entry has an id but
        // the user has never seen it, so asking the model for one only ever got
        // the empty call back.
        const entry = matchByName(
          meal ? day.filter((row) => row.meal === meal) : day,
          wanted,
          (row) => ({ id: row.id, name: row.name }),
          "logged food"
        )
        await deps.mutate(
          api.logs.foodLogs.removeEntry,
          { date: key, entryId: entry.id },
          "logs.foodLogs.removeEntry"
        )
        return { removed: entry.name, meal: entry.meal, date: key }
      },
    }),

    action({
      name: "log_recipe",
      description:
        "Log a saved recipe as a meal, scaled to a number of servings.",
      input: z.object({
        recipe: nameArg("saved recipe"),
        servings: z.number().positive().max(20).optional(),
        meal: mealArg.optional(),
        date: dateArg.optional(),
      }),
      run: async ({ recipe: wanted, servings, meal, date }) => {
        const recipes = (await deps.query(
          api.logs.recipes.list,
          {}
        )) as RecipeRow[]
        const recipe = matchByName(
          recipes,
          wanted,
          (row) => ({ id: String(row.id ?? row._id), name: row.name }),
          "saved recipe"
        )
        // A recipe's totals are for the whole thing; the diary wants one entry
        // for the portion actually eaten.
        const portion = servings ?? 1
        const perServing = Math.max(1, recipe.servings ?? 1)
        const scale = portion / perServing
        const entry = {
          id: deps.id(),
          name:
            portion === perServing
              ? recipe.name
              : `${recipe.name} (${portion} serving${portion === 1 ? "" : "s"})`,
          calories: round(nutrient(recipe, "calories") * scale, 0),
          protein: round(nutrient(recipe, "protein") * scale),
          carbs: round(nutrient(recipe, "carbs") * scale),
          fat: round(nutrient(recipe, "fat") * scale),
          meal: meal ?? "dinner",
          loggedAt: deps.now(),
          recipeId: String(recipe.id ?? recipe._id),
        } as FoodLogEntry
        await deps.mutate(
          api.logs.foodLogs.addEntry,
          { date: resolveDate(date, deps.today()), entry },
          "logs.foodLogs.addEntry"
        )
        return summarize(entry)
      },
    }),

    action({
      name: "list_recipes",
      /**
       * No search argument, and that is the fix rather than an omission.
       *
       * As `search_recipes(query)` this was a magnet: any request the other
       * tools did not cover landed here, because a free string argument accepts
       * anything and retrieval had to pick something. "Who won the world cup in
       * 1998" came back as a recipe search at 0.99 confidence. With no argument
       * there is nothing to funnel an off-topic question into, and the worst
       * case is a harmless read.
       */
      description:
        "List the user's saved recipes, so one can be logged by name.",
      input: z.object({}),
      run: async () => {
        const recipes = (await deps.query(
          api.logs.recipes.list,
          {}
        )) as RecipeRow[]
        return {
          recipes: recipes.slice(0, 12).map((row) => ({
            name: row.name,
            servings: row.servings ?? 1,
            calories: Math.round(nutrient(row, "calories")),
          })),
        }
      },
    }),

    action({
      name: "log_meal_preset",
      description:
        "Log a saved meal — a group of foods the user eats together — in one go.",
      input: z.object({
        savedMeal: nameArg("saved meal"),
        meal: mealArg.optional(),
        date: dateArg.optional(),
      }),
      run: async ({ savedMeal, meal, date }) => {
        const presets = (await deps.query(
          api.logs.mealPresets.list,
          {}
        )) as MealPreset[]
        const preset = matchByName(
          presets,
          savedMeal,
          (row) => ({ id: String(row.id), name: row.name }),
          "saved meal"
        )
        const key = resolveDate(date, deps.today())
        const entries = foodLogEntriesFromMealPreset(preset, {
          meal: meal ?? preset.meal,
          loggedAt: deps.now(),
        })
        for (const entry of entries) {
          await deps.mutate(
            api.logs.foodLogs.addEntry,
            { date: key, entry },
            "logs.foodLogs.addEntry"
          )
        }
        return {
          logged: entries.length,
          name: preset.name,
          date: key,
          totals: totals(entries),
        }
      },
    }),

    action({
      name: "list_meal_presets",
      description:
        "The user's saved meals — groups of foods they log together.",
      input: z.object({}),
      run: async () => {
        const presets = (await deps.query(
          api.logs.mealPresets.list,
          {}
        )) as MealPreset[]
        return {
          presets: presets.slice(0, 12).map((preset) => ({
            name: preset.name,
            meal: preset.meal,
            items: preset.entries.length,
          })),
        }
      },
    }),

    action({
      name: "save_meal_preset",
      description:
        "Save what was logged for a meal today as a reusable saved meal, under a name.",
      input: z.object({
        name: z
          .string()
          .min(1)
          .describe("What to call it, e.g. 'usual breakfast'"),
        meal: mealArg,
        date: dateArg.optional(),
      }),
      run: async ({ name, meal, date }) => {
        const key = resolveDate(date, deps.today())
        const day = ((await deps.query(api.logs.foodLogs.getDay, {
          date: key,
        })) ?? []) as FoodLogEntry[]
        const entries = day.filter((entry) => entry.meal === meal)
        if (entries.length === 0) {
          throw new Error(
            `Nothing is logged for ${meal} on ${key}, so there is nothing to save.`
          )
        }
        await deps.mutate(
          api.logs.mealPresets.create,
          {
            name,
            meal,
            signature: mealEntriesSignature(entries),
            entries: mealPresetTemplateEntries(entries),
          },
          "logs.mealPresets.create"
        )
        return { saved: name, meal, items: entries.length }
      },
    }),

    action({
      name: "delete_meal_preset",
      description: "Delete a saved meal for good.",
      destructive: true,
      input: z.object({ savedMeal: nameArg("saved meal") }),
      run: async ({ savedMeal }) => {
        const presets = (await deps.query(
          api.logs.mealPresets.list,
          {}
        )) as MealPreset[]
        const preset = matchByName(
          presets,
          savedMeal,
          (row) => ({ id: String(row.id), name: row.name }),
          "saved meal"
        )
        await deps.mutate(
          api.logs.mealPresets.remove,
          { id: String(preset.id) },
          "logs.mealPresets.remove"
        )
        return { deleted: preset.name }
      },
    }),

    action({
      name: "repeat_meal_from_day",
      description:
        "Copy a meal from another day onto a day — 'the same breakfast as yesterday'.",
      input: z.object({
        meal: mealArg,
        from: dateArg
          .optional()
          .describe("The day to copy from. Defaults to yesterday."),
        to: dateArg
          .optional()
          .describe("The day to copy onto. Defaults to today."),
      }),
      run: async ({ meal, from, to }) => {
        const today = deps.today()
        const source = from ? resolveDate(from, today) : shiftDate(today, -1)
        const target = resolveDate(to, today)
        const day = ((await deps.query(api.logs.foodLogs.getDay, {
          date: source,
        })) ?? []) as FoodLogEntry[]
        const entries = day.filter((entry) => entry.meal === meal)
        if (entries.length === 0) {
          throw new Error(`No ${meal} was logged on ${source}.`)
        }
        for (const entry of entries) {
          await deps.mutate(
            api.logs.foodLogs.addEntry,
            {
              date: target,
              // A new id, or `addEntry` overwrites the original in place — it
              // de-duplicates on id, which is what makes an offline retry safe
              // and what makes a naive copy a no-op.
              entry: { ...entry, id: deps.id(), loggedAt: deps.now() },
            },
            "logs.foodLogs.addEntry"
          )
        }
        return { copied: entries.length, meal, from: source, to: target }
      },
    }),
  ]
}

type RecipeRow = {
  _id?: string
  id?: string
  name: string
  servings?: number
  totals?: { calories?: number; protein?: number; carbs?: number; fat?: number }
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

/**
 * Recipes have carried their macros in two shapes across the app's life — a
 * `totals` object and four loose fields — and both are still in the table.
 */
function nutrient(
  recipe: RecipeRow,
  key: "calories" | "protein" | "carbs" | "fat"
) {
  return Number(recipe.totals?.[key] ?? recipe[key] ?? 0) || 0
}

function round(value: number, places = 1) {
  const factor = 10 ** places
  return Math.round((Number(value) || 0) * factor) / factor
}

function summarize(entry: FoodLogEntry) {
  return {
    logged: entry.name,
    meal: entry.meal,
    calories: Math.round(entry.calories),
    protein: round(entry.protein),
    carbs: round(entry.carbs),
    fat: round(entry.fat),
  }
}

function totals(
  entries: Array<{
    calories: number
    protein: number
    carbs: number
    fat: number
  }>
) {
  return entries.reduce(
    (sum, entry) => ({
      calories: Math.round(sum.calories + (Number(entry.calories) || 0)),
      protein: round(sum.protein + (Number(entry.protein) || 0)),
      carbs: round(sum.carbs + (Number(entry.carbs) || 0)),
      fat: round(sum.fat + (Number(entry.fat) || 0)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}
