import * as z from "zod"
import { api } from "../../../../../convex/_generated/api"
import { action, matchByName, mealArg, nameArg } from "./deps"
import type { QuickActionDeps } from "./deps"

/**
 * The things that happen before eating: shopping lists, batch-cooked food, and
 * the meals that repeat on a timer.
 *
 * Also the navigation tool, which is the odd one out — it writes nothing and
 * opens a screen. It exists because "take me to my recipes" is a request the
 * model would otherwise answer with the empty call, and a refusal is a worse
 * answer than a route.
 */

type ListRow = {
  _id: string
  name: string
  archivedAt?: number
  items?: Array<{ id: string; name: string; checked: boolean }>
}

export function planningTools(deps: QuickActionDeps) {
  /** The list a bare "add milk" means: the newest one still open. */
  async function activeList() {
    const lists = (await deps.query(
      api.logs.groceryLists.list,
      {}
    )) as ListRow[]
    const open = lists.find((list) => !list.archivedAt) ?? lists[0]
    if (!open) {
      throw new Error(
        "There is no grocery list yet. Make one on the Groceries screen first."
      )
    }
    return open
  }

  /** Names in, ids out. See `matchByName` for why no tool here takes an id. */
  async function repeatMealFor(wanted: string) {
    const meals = (await deps.query(api.logs.repeatMeals.list, {})) as Array<{
      _id: string
      name: string
    }>
    return matchByName(
      meals,
      wanted,
      (row) => ({ id: row._id, name: row.name }),
      "repeating meal"
    )
  }

  return [
    action({
      name: "add_grocery_item",
      // "Shopping list" is deliberately not in here. Retrieval scores the
      // user's sentence against these strings, and with that phrase present
      // "take me to my shopping list" scored this above `open_screen` and added
      // an item called "shopping list". The verb carries the meaning; the noun
      // was only ever stealing matches from the navigation tool.
      description:
        "Add an item to buy to the groceries, so it is not forgotten.",
      /**
       * No amount and no unit, on purpose.
       *
       * They were optional and the model filled them in anyway — "add oat milk"
       * came back as `amount: 1, unit: "ml"`, ungrounded, and the invention
       * dragged the call's confidence to 0.22, under the threshold, so a
       * perfectly good request got escalated. An argument the user rarely says
       * costs more than it earns; the list takes a bare name happily.
       */
      input: z.object({
        name: z.string().min(1).describe("What to buy, e.g. 'oat milk'"),
      }),
      run: async ({ name }) => {
        const list = await activeList()
        await deps.mutate(
          api.logs.groceryLists.addItem,
          {
            id: list._id,
            item: {
              id: deps.id(),
              name,
              // The key is what de-duplicates two spellings of one thing, so it
              // is normalised rather than being the display name.
              key: name.trim().toLowerCase(),
              checked: false,
              manual: true,
            },
          },
          "logs.groceryLists.addItem"
        )
        return { added: name, list: list.name }
      },
    }),

    action({
      name: "show_grocery_list",
      description: "Read back what is on the shopping list.",
      input: z.object({}),
      run: async () => {
        const list = await activeList()
        return {
          list: list.name,
          items: (list.items ?? []).map((item) => ({
            name: item.name,
            checked: item.checked,
          })),
        }
      },
    }),

    action({
      name: "check_off_grocery_item",
      description: "Tick something off the shopping list, or untick it.",
      input: z.object({
        item: nameArg("shopping list item"),
        checked: z.boolean().optional().describe("Defaults to ticking it off"),
      }),
      run: async ({ item: wanted, checked }) => {
        const list = await activeList()
        const item = matchByName(
          list.items ?? [],
          wanted,
          (row) => ({ id: row.id, name: row.name }),
          "shopping list item"
        )
        await deps.mutate(
          api.logs.groceryLists.setItemChecked,
          { id: list._id, itemId: item.id, checked: checked ?? true },
          "logs.groceryLists.setItemChecked"
        )
        return { item: item.name, checked: checked ?? true }
      },
    }),

    action({
      name: "clear_checked_groceries",
      description: "Clear everything already ticked off the shopping list.",
      destructive: true,
      input: z.object({}),
      run: async () => {
        const list = await activeList()
        const checked = (list.items ?? []).filter((item) => item.checked).length
        await deps.mutate(
          api.logs.groceryLists.clearChecked,
          { id: list._id },
          "logs.groceryLists.clearChecked"
        )
        return { cleared: checked, list: list.name }
      },
    }),

    action({
      name: "list_meal_prep",
      description:
        "Batch-cooked food in the fridge, and how many servings are left.",
      input: z.object({}),
      run: async () => {
        const batches = (await deps.query(
          api.logs.mealPrep.list,
          {}
        )) as Array<{
          _id: string
          name: string
          servingsTotal: number
          servingsLogged: number
          archivedAt?: number
        }>
        return {
          batches: batches
            .filter((batch) => !batch.archivedAt)
            .map((batch) => ({
              name: batch.name,
              remaining: batch.servingsTotal - batch.servingsLogged,
            })),
        }
      },
    }),

    action({
      name: "consume_meal_prep",
      description: "Take servings out of a batch-cooked meal.",
      input: z.object({
        batch: nameArg("batch-cooked meal"),
        servings: z.number().positive().max(20).optional(),
      }),
      run: async ({ batch: wanted, servings }) => {
        const batches = (await deps.query(
          api.logs.mealPrep.list,
          {}
        )) as Array<{
          _id: string
          name: string
          archivedAt?: number
        }>
        const batch = matchByName(
          batches.filter((row) => !row.archivedAt),
          wanted,
          (row) => ({ id: row._id, name: row.name }),
          "batch-cooked meal"
        )
        const result = (await deps.mutate(
          api.logs.mealPrep.consume,
          { id: batch._id, servings: servings ?? 1 },
          "logs.mealPrep.consume"
        )) as { servingsRemaining: number }
        return { taken: servings ?? 1, remaining: result.servingsRemaining }
      },
    }),

    action({
      name: "create_repeat_meal",
      description:
        "Set a meal to log itself at the same time every day, from what was eaten for that meal today.",
      input: z.object({
        name: z.string().min(1),
        meal: mealArg,
        hour: z
          .number()
          .int()
          .min(0)
          .max(23)
          .describe("Hour of day, 24-hour clock"),
        minute: z.number().int().min(0).max(59).optional(),
      }),
      run: async ({ name, meal, hour, minute }) => {
        const day = ((await deps.query(api.logs.foodLogs.getDay, {
          date: deps.today(),
        })) ?? []) as Array<{ meal: string }>
        const entries = day.filter((entry) => entry.meal === meal)
        if (entries.length === 0) {
          throw new Error(
            `Nothing is logged for ${meal} today, so there is nothing to repeat.`
          )
        }
        await deps.mutate(
          api.logs.repeatMeals.save,
          { name, meal, hour, minute: minute ?? 0, entries },
          "logs.repeatMeals.save"
        )
        return {
          created: name,
          at: `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`,
          foods: entries.length,
        }
      },
    }),

    action({
      name: "list_repeat_meals",
      description: "The meals set to log themselves, and when.",
      input: z.object({}),
      run: async () => {
        const meals = (await deps.query(
          api.logs.repeatMeals.list,
          {}
        )) as Array<{
          _id: string
          name: string
          meal: string
          hour: number
          minute: number
          enabled: boolean
        }>
        return {
          repeats: meals.map((row) => ({
            name: row.name,
            meal: row.meal,
            at: `${String(row.hour).padStart(2, "0")}:${String(row.minute).padStart(2, "0")}`,
            enabled: row.enabled,
          })),
        }
      },
    }),

    action({
      name: "pause_repeat_meal",
      description:
        "Turn a repeating meal off, or back on, without deleting it.",
      input: z.object({
        repeat: nameArg("repeating meal"),
        enabled: z.boolean().optional().describe("Defaults to turning it off"),
      }),
      run: async ({ repeat: wanted, enabled }) => {
        const row = await repeatMealFor(wanted)
        await deps.mutate(
          api.logs.repeatMeals.setEnabled,
          { id: row._id, enabled: enabled ?? false },
          "logs.repeatMeals.setEnabled"
        )
        return { repeat: row.name, enabled: enabled ?? false }
      },
    }),

    action({
      name: "delete_repeat_meal",
      description: "Delete a repeating meal for good.",
      destructive: true,
      input: z.object({ repeat: nameArg("repeating meal") }),
      run: async ({ repeat: wanted }) => {
        const row = await repeatMealFor(wanted)
        await deps.mutate(
          api.logs.repeatMeals.remove,
          { id: row._id },
          "logs.repeatMeals.remove"
        )
        return { deleted: row.name }
      },
    }),

    action({
      name: "open_screen",
      /**
       * The description is doing retrieval's work, not the reader's.
       *
       * Only five tools enter the grammar per turn and they are chosen by
       * embedding the user's sentence against these strings. "Take me to my
       * shopping list" scored `add_grocery_item` higher than a description that
       * said "open a screen" — the noun matched and none of the verbs did. The
       * verbs are in here now because that is what gets scored.
       */
      description:
        "Navigate: open, show, go to, take me to, or view a screen in the app. Use for looking at something rather than changing it.",
      input: z.object({
        screen: z.enum([
          "dashboard",
          "nutrition",
          "workouts",
          "recipes",
          "groceries",
          "progress",
          "health",
          "coach",
          "settings",
          "supplements",
          "fasting",
          "meal prep",
          "food search",
        ]),
      }),
      run: ({ screen }) => {
        const path = SCREENS[screen]
        deps.navigate(path)
        return { opened: screen, path }
      },
    }),
  ]
}

/**
 * The routes behind the screen names, in one place.
 *
 * An enum rather than a free path: the grammar then makes an unroutable screen
 * literally undecodable, which beats navigating the user to a blank page and is
 * the sort of thing the constrained decode is for.
 */
const SCREENS: Record<string, string> = {
  dashboard: "/",
  nutrition: "/nutrition",
  workouts: "/workouts",
  recipes: "/recipes",
  groceries: "/nutrition/groceries",
  progress: "/progress",
  health: "/health",
  coach: "/coach",
  settings: "/settings",
  supplements: "/supplements",
  fasting: "/nutrition/fasting",
  "meal prep": "/nutrition/meal-prep",
  "food search": "/foods/search",
}
