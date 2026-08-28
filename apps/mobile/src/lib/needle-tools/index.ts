import {
  NeedleToolbox,
  type NeedleSessionOptions,
  type NeedleTool,
} from "@repo/needle"
import { needle } from "@/lib/needle"
import type { QuickActionDeps } from "./deps"
import { foodTools } from "./food"
import { planningTools } from "./planning"
import { presetTools } from "./presets"
import { trainingTools } from "./training"
import { wellbeingTools } from "./wellbeing"
import { quickActionDeps } from "./wire"

export type { QuickActionDeps } from "./deps"
export { action, dateArg, mealArg, resolveDate, shiftDate } from "./deps"

/**
 * Every quick action, in one toolbox — and usually the wrong thing to register.
 *
 * Past five declared tools Needle switches to retrieval: schemas are embedded
 * once at init, the query is embedded per turn, and only the five best-scoring
 * tools enter the grammar. An unselected tool is unreachable, not merely
 * unlikely. That makes retrieval accuracy the whole ball game, and it degrades
 * with catalogue size in a way that is easy to measure and easy to miss.
 *
 * Measured against the real engine with these fifty tools loaded:
 *
 *   "delete my push day preset"    50 tools -> the empty call, at confidence 1
 *                                   3 tools -> delete_preset("push day"), 0.71
 *   "take me to my shopping list"  50 tools -> add_grocery_item("shopping list")
 *                                  20 tools -> show_grocery_list(), 0.86
 *
 * The tool was fine both times. The competition was not. So prefer
 * `QUICK_ACTION_SCOPES` and register the family the current screen is about;
 * reach for the whole catalogue only where there is genuinely no context to
 * narrow by, and expect the tail of it to be unreachable when you do.
 *
 * The other corollary is that descriptions are load-bearing in a way they are
 * not for a big model — retrieval scores the user's sentence against that prose,
 * so it wants the verbs people say, not the ones a schema would use.
 */
export function buildQuickActionTools(
  deps: QuickActionDeps
): NeedleTool<never, unknown>[] {
  return [
    ...foodTools(deps),
    ...presetTools(deps),
    ...trainingTools(deps),
    ...wellbeingTools(deps),
    ...planningTools(deps),
  ] as NeedleTool<never, unknown>[]
}

/** The same set, ready to hand to a session. */
export function quickActionToolbox(deps: QuickActionDeps) {
  return new NeedleToolbox(buildQuickActionTools(deps))
}

/**
 * The families, so a screen can declare only what it is about.
 *
 * This is the recommended way in. A screen that registers `food` competes over
 * twelve tools rather than fifty, and every measurement above says that is the
 * difference between a tool that fires and one that cannot be reached.
 */
export const QUICK_ACTION_SCOPES: Record<
  string,
  (deps: QuickActionDeps) => NeedleTool<never, unknown>[]
> = {
  food: foodTools as Builder,
  presets: presetTools as Builder,
  training: trainingTools as Builder,
  wellbeing: wellbeingTools as Builder,
  planning: planningTools as Builder,
}

/**
 * Every family builder returns a differently-shaped union of tools, and the
 * toolbox only ever needs the common face of them.
 */
type Builder = (deps: QuickActionDeps) => NeedleTool<never, unknown>[]

export type QuickActionScope =
  "food" | "presets" | "training" | "wellbeing" | "planning"

/** A toolbox holding just the named families. */
export function scopedToolbox(
  deps: QuickActionDeps,
  scopes: readonly QuickActionScope[]
) {
  return new NeedleToolbox(
    scopes.flatMap((scope) => QUICK_ACTION_SCOPES[scope]!(deps))
  )
}

/**
 * The tools that destroy something, by name.
 *
 * Exported so a confirmation sheet can render the right copy without
 * re-deriving what is dangerous, and so the test that asserts this list has not
 * quietly shrunk has something to assert against.
 */
export function destructiveToolNames(deps: QuickActionDeps) {
  return buildQuickActionTools(deps)
    .filter((tool) => tool.destructive)
    .map((tool) => tool.name)
}

/**
 * The app's session, with every quick action registered and a sheet wired to
 * the destructive ones.
 *
 * `confirm` is not optional and is not defaulted to `() => true`. A model that
 * can pick `delete_preset` on its own needs a human between the pick and the
 * delete, and the one way to guarantee that is to make the caller supply the
 * human. Without a handler the run stops with `stop: "unconfirmed"` and the
 * calls it wanted to make in `pending`.
 */
export async function needleQuickActions(options: {
  navigate: (path: string) => void
  confirm: NonNullable<NeedleSessionOptions["confirm"]>
  language?: () => string | undefined
  /** Which subject families to declare. Omit for everything, and read the
   * note above before you do. */
  scopes?: readonly QuickActionScope[]
  /** Which fine families to declare — the ones retrieval can actually see all
   * of. Takes precedence over `scopes`. */
  families?: readonly NeedleFamily[]
}) {
  const session = await needle()
  session.setConfirm(options.confirm)
  const deps = quickActionDeps({
    navigate: options.navigate,
    ...(options.language ? { language: options.language } : {}),
  })
  session.toolbox
    .clear()
    .register(
      ...(options.families
        ? familyToolbox(deps, options.families).list()
        : options.scopes
          ? scopedToolbox(deps, options.scopes).list()
          : buildQuickActionTools(deps))
    )
  return session
}

/**
 * The same fifty tools, cut finer.
 *
 * `QUICK_ACTION_SCOPES` above groups by subject — everything about food, then
 * everything about the body. That is how a person would file them and it is
 * not how retrieval reads them: past five declared tools the engine embeds the
 * query and keeps only the five best-scoring schemas, so a ten-tool family is
 * five tools competing with five tools that are never going to win. Measured
 * on a device, "Log 250ml of water" against the ten-tool wellbeing family came
 * back at 35% confidence and under the floor — the tool was right there and
 * could not get out of its own crowd.
 *
 * So these are grouped by what somebody is *doing* instead, and every one of
 * them is at or under five. At five nothing is dropped and retrieval is not
 * consulted at all, which is the only configuration where a declared tool is
 * genuinely reachable.
 *
 * Names rather than builders because the tools are defined inline in five long
 * arrays and slicing those files would be surgery. The cost of naming them
 * here is drift, and `needle-families.test.ts` is what pays it: every tool in
 * the catalogue has to appear in exactly one family, and every name here has
 * to exist.
 */
export const NEEDLE_FAMILIES = {
  // Food, in the order of how often a day contains one.
  food: [
    "log_food",
    "log_quick_food",
    "log_food_by_barcode",
    "search_food",
    "remove_food_entry",
  ],
  diary: ["list_food_log", "repeat_meal_from_day"],
  meals: [
    "log_meal_preset",
    "save_meal_preset",
    "list_meal_presets",
    "delete_meal_preset",
  ],
  recipes: ["log_recipe", "list_recipes"],

  // The body's own small numbers.
  hydration: ["log_water", "undo_last_water"],
  fasting: ["start_fast", "stop_fast"],
  supplements: ["list_supplements", "log_supplement", "skip_supplement"],
  body: ["log_weight", "log_body_measurements", "log_daily_metric"],

  // Training, split at the line between a session and the week around it.
  workout: [
    "start_workout",
    "show_active_workout",
    "finish_workout",
    "abort_workout",
  ],
  restDays: ["mark_rest_day", "unmark_rest_day", "show_workout_history"],

  // Routines: the list, its order, and the week it is pinned to.
  routines: ["list_presets", "create_preset", "rename_preset", "delete_preset"],
  routineOrder: ["reorder_presets", "move_preset_to_position"],
  schedule: [
    "schedule_preset_on_day",
    "clear_scheduled_day",
    "show_weekly_routine",
  ],

  // Everything that happens before the eating does.
  groceries: [
    "add_grocery_item",
    "show_grocery_list",
    "check_off_grocery_item",
    "clear_checked_groceries",
  ],
  mealPrep: ["list_meal_prep", "consume_meal_prep"],
  repeats: [
    "create_repeat_meal",
    "list_repeat_meals",
    "pause_repeat_meal",
    "delete_repeat_meal",
  ],

  // On its own because it is the one tool that writes nothing, and because it
  // competes with everything when it shares a family with writers.
  navigation: ["open_screen"],
} as const satisfies Record<string, readonly string[]>

export type NeedleFamily = keyof typeof NEEDLE_FAMILIES

/** How many tools a set of families declares. Five is the ceiling worth
 * staying under; this is how a caller checks before it combines two. */
export function familySize(families: readonly NeedleFamily[]) {
  return families.reduce(
    (total, family) => total + NEEDLE_FAMILIES[family].length,
    0
  )
}

/**
 * A toolbox holding just the named families.
 *
 * Builds the catalogue and filters it, which costs a few dozen object
 * literals and no I/O — the expensive part was never construction, it is the
 * `prepare()` that follows, and that only ever sees what comes out of here.
 */
export function familyToolbox(
  deps: QuickActionDeps,
  families: readonly NeedleFamily[]
) {
  const wanted = new Set<string>(
    families.flatMap((name) => NEEDLE_FAMILIES[name] as readonly string[])
  )
  return new NeedleToolbox(
    buildQuickActionTools(deps).filter((tool) => wanted.has(tool.name))
  )
}
