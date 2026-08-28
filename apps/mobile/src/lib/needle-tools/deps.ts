import type { FunctionReference } from "convex/server"
import type { FoodDetail, FoodResult } from "@repo/models"
import type { JsonSchema, NeedleTool } from "@repo/needle"
import * as z from "zod"
import { defineTool } from "@repo/needle"
import type { OfflineMutationName } from "@/lib/offline-queue"

/**
 * Everything the quick actions need from the app, and nothing they need from
 * React.
 *
 * The tools are plain functions over this object rather than hooks, which is
 * what makes the whole set testable without a Convex server, a WebView or a
 * render. `wire-quick-actions.ts` is the only file that knows about
 * `convexClient` and the offline queue; every tool below knows about neither.
 */
export type QuickActionDeps = {
  /** A Convex query, awaited. */
  query<Query extends FunctionReference<"query">>(
    reference: Query,
    args: Record<string, unknown>
  ): Promise<unknown>
  /**
   * A Convex mutation.
   *
   * `offlineAs` opts the write into the offline queue, and is only accepted for
   * the names `MUTATION_REGISTRY` actually knows — which is also the list of
   * writes that survive a tunnel. Diary writes pass it; live-session writes do
   * not, deliberately. Replaying "start the workout" out of a queue twenty
   * minutes later would start a workout the user has walked away from.
   */
  mutate(
    reference: FunctionReference<"mutation">,
    args: Record<string, unknown>,
    offlineAs?: OfflineMutationName
  ): Promise<unknown>
  /** Today, as the `YYYY-MM-DD` key the diary is indexed by. */
  today(): string
  /** Now, as the ISO string entries carry. */
  now(): string
  /** A fresh client id, for the entries that need one. */
  id(): string
  /** Ranked food search, already filtered. */
  searchFoods(query: string, limit: number): Promise<FoodDetail[]>
  /** One food, by the code a search result carried. */
  foodByCode(code: string): Promise<FoodDetail | null>
  /** Barcode lookup, for the scanner's sake. */
  foodByBarcode(code: string): Promise<FoodResult | null>
  /** Opens a screen. The only tool family that writes nothing. */
  navigate(path: string): void
}

/**
 * A tool, minus the ceremony.
 *
 * Thirty-odd of these live in this directory and the boilerplate would
 * otherwise be most of the code. The only thing it adds beyond `defineTool` is
 * that `destructive` is spelled out at the definition rather than remembered at
 * the call site.
 */
export function action<Schema extends z.ZodType, Output>(definition: {
  name: string
  description: string
  input: Schema
  destructive?: boolean
  run: (input: z.output<Schema>) => Output | Promise<Output>
}): NeedleTool<z.output<Schema>, Output> {
  return {
    ...defineTool({
      name: definition.name,
      description: definition.description,
      input: definition.input,
      execute: definition.run,
    }),
    ...(definition.destructive ? { destructive: true } : {}),
  }
}

/**
 * A date argument that accepts what people actually say.
 *
 * Needle resolves "tomorrow at seven" against the `date:` system fact and
 * otherwise passes the human phrase through verbatim — that is the documented
 * behaviour, not a bug — so a tool that only took `YYYY-MM-DD` would reject
 * "yesterday" perfectly often. The grammar still constrains the shape; this
 * widens what the shape may say.
 */
export const dateArg = z
  .string()
  .describe("A date as YYYY-MM-DD, or 'today' / 'yesterday' / 'tomorrow'")

export function resolveDate(value: string | undefined, today: string) {
  if (!value) return today
  const trimmed = value.trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (trimmed === "today" || trimmed === "") return today
  if (trimmed === "yesterday") return shiftDate(today, -1)
  if (trimmed === "tomorrow") return shiftDate(today, 1)
  // Anything else is a phrase we have not taught it. Falling back to today
  // silently would log breakfast on the wrong day, which is worse than a
  // message the loop can feed back to the model.
  throw new Error(
    `"${value}" is not a date I can use — say a date like 2026-08-26, or today/yesterday/tomorrow`
  )
}

/** Calendar arithmetic on the key itself, so no timezone gets a second vote. */
export function shiftDate(date: string, days: number) {
  const stamp = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  )
  return new Date(stamp + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * An enum rather than the free string this started as.
 *
 * Meal categories are user-configurable, so a string was the honest type. It
 * was also the type that let "log a pot of greek yoghurt" come back with
 * `meal: "greek yoghurt"` — with nothing constraining it, the model fills the
 * slot from the nearest noun. Four literals compile into the grammar and make
 * that undecodable; a custom category is reachable from its own screen, which
 * is a smaller loss than a diary full of meals named after food.
 */
export const mealArg = z
  .enum(["breakfast", "lunch", "dinner", "snack"])
  .describe("Which meal it belongs to")

/**
 * Tools take names, not ids, and this is what turns one into the other.
 *
 * Learned the hard way, by running the real engine against the real catalogue.
 * A tool whose required argument is an opaque id is close to unreachable: the
 * model may only emit values evidenced by the input, the user never says
 * `k57d8...`, so the honest answer is the empty call. "delete my push day
 * preset" came back refused for exactly that reason, and "put legs first"
 * came back as `presetIds: ["legs first"]` — the model reaching for the only
 * evidence it had.
 *
 * Names are evidence. The user says them, the model can ground them, and the
 * lookup belongs here anyway — it is the sort of fuzzy match a 45M model should
 * not be doing in its head.
 */
export function matchByName<Item>(
  items: readonly Item[],
  query: string,
  describe: (item: Item) => { id: string; name: string },
  label: string
): Item {
  const wanted = query.trim().toLowerCase()
  const rows = items.map((item) => ({ item, ...describe(item) }))
  if (rows.length === 0) throw new Error(`There are no ${label}s yet.`)

  const byId = rows.find((row) => row.id === query.trim())
  if (byId) return byId.item

  const exact = rows.filter((row) => row.name.trim().toLowerCase() === wanted)
  if (exact.length === 1) return exact[0]!.item

  // Substring both ways: "push" should find "Push A", and "my push day preset"
  // should find "Push Day". The model paraphrases in both directions.
  const loose = rows.filter((row) => {
    const name = row.name.trim().toLowerCase()
    return name.includes(wanted) || wanted.includes(name)
  })
  if (loose.length === 1) return loose[0]!.item
  if (loose.length > 1) {
    throw new Error(
      `"${query}" matches more than one ${label}: ${loose.map((row) => row.name).join(", ")}. Which one?`
    )
  }
  throw new Error(
    `No ${label} called "${query}". These exist: ${rows.map((row) => row.name).join(", ")}.`
  )
}

/**
 * The argument that replaced every `somethingId: string`.
 *
 * No example value in the description, and that is not an oversight. With
 * `e.g. "Push A"` in there, "start my push workout" came back as
 * `start_workout({ preset: "Push A" })` against a user whose preset is called
 * "Push Day" — the model took the example as evidence, because in its context
 * that is exactly what it looks like. Examples belong in the tool description,
 * where they describe the tool, not in an argument, where they describe a value.
 */
export function nameArg(label: string) {
  return z.string().min(1).describe(`The name of the ${label}`)
}

export type { JsonSchema }
