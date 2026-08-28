import * as z from "zod"
import { api } from "../../../../../convex/_generated/api"
import { action, matchByName, nameArg } from "./deps"
import type { QuickActionDeps } from "./deps"

/**
 * Workout presets: the saved sessions the user builds their week out of.
 *
 * Two things here are worth knowing before reading the tools. Preset *order* is
 * not a field on a preset — it lives in `schedules.presetOrder`, alongside the
 * weekly routine, and is written with one `schedules.set` that carries both. And
 * `presets.list` sorts by `updatedAt`, so a rename reorders the list unless the
 * explicit order is respected; `orderedPresets` below is the only ordering any
 * of these tools trusts.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

type PresetRow = { id: string; name: string; items?: unknown[]; focus?: string }
type Schedule = {
  routine?: Record<string, string | null>
  presetOrder?: string[]
} | null

export function presetTools(deps: QuickActionDeps) {
  /**
   * The presets as the user sees them, in the order they dragged them into.
   *
   * Anything not in `presetOrder` — a preset made on another device, or one
   * created before the order existed — goes on the end rather than vanishing.
   */
  async function orderedPresets() {
    const [presets, schedule] = await Promise.all([
      deps.query(api.logs.presets.list, {}) as Promise<PresetRow[]>,
      deps.query(api.users.schedules.get, {}) as Promise<Schedule>,
    ])
    const order = schedule?.presetOrder ?? []
    const byId = new Map(presets.map((preset) => [String(preset.id), preset]))
    const ordered = order
      .map((id) => byId.get(id))
      .filter((preset): preset is PresetRow => preset !== undefined)
    const rest = presets.filter((preset) => !order.includes(String(preset.id)))
    return { presets: [...ordered, ...rest], schedule, all: presets }
  }

  /** Both halves of the schedule travel together; `set` takes no partial. */
  async function writeOrder(order: string[], schedule: Schedule) {
    await deps.mutate(
      api.users.schedules.set,
      { routine: schedule?.routine ?? {}, presetOrder: order },
      "users.schedules.set"
    )
  }

  return [
    action({
      name: "list_presets",
      description:
        "The user's workout presets in their chosen order, with the ids the other preset tools need.",
      input: z.object({}),
      run: async () => {
        const { presets } = await orderedPresets()
        return {
          presets: presets.map((preset, index) => ({
            position: index + 1,
            name: preset.name,
            exercises: preset.items?.length ?? 0,
            focus: preset.focus,
          })),
        }
      },
    }),

    action({
      name: "create_preset",
      description:
        "Make a new workout preset from a list of exercise names. Sets and reps can be left out.",
      input: z.object({
        name: z
          .string()
          .min(1)
          .describe("What to call the session, e.g. 'Push A'"),
        exercises: z
          .array(
            z.object({
              name: z.string().min(1),
              sets: z.number().int().min(1).max(20).optional(),
              reps: z.number().int().min(1).max(100).optional(),
            })
          )
          .min(1)
          .max(20),
        focus: z
          .string()
          .optional()
          .describe("Muscle focus, e.g. 'chest and triceps'"),
      }),
      run: async ({ name, exercises, focus }) => {
        const items = exercises.map((exercise) => ({
          id: deps.id(),
          name: exercise.name,
          sets: exercise.sets ?? 3,
          reps: exercise.reps ?? 10,
        }))
        // `exerciseData` is the per-exercise state the workout screen fills in
        // as the user logs. A preset carries the empty shape so that starting
        // one does not have to invent it.
        const exerciseData = Object.fromEntries(
          items.map((item) => [
            item.id,
            {
              sets: Array.from({ length: item.sets }, () => ({
                weight: "",
                reps: "",
              })),
            },
          ])
        )
        await deps.mutate(
          api.logs.presets.create,
          { name, items, exerciseData, ...(focus ? { focus } : {}) },
          "logs.presets.create"
        )
        return { created: name, exercises: items.length }
      },
    }),

    action({
      name: "rename_preset",
      description:
        "Change a workout preset's name, leaving its exercises alone.",
      input: z.object({
        preset: nameArg("workout preset"),
        name: z.string().min(1).describe("The new name"),
      }),
      run: async ({ preset: wanted, name }) => {
        const { all } = await orderedPresets()
        const preset = describePreset(all, wanted)
        const presetId = String(preset.id)
        // `update` replaces the whole body, so everything not being changed has
        // to be echoed back. Omitting `items` here would empty the session.
        const { id: _alias, ...body } = preset as PresetRow &
          Record<string, unknown>
        await deps.mutate(
          api.logs.presets.update,
          { ...stripSystemFields(body), id: presetId, name },
          "logs.presets.update"
        )
        return { renamed: preset.name, to: name }
      },
    }),

    action({
      name: "delete_preset",
      // The verbs matter more than the prose. With a description that opened
      // "Delete a workout preset for good", "delete my push day preset" came
      // back as the empty call at full confidence — nothing scored, so nothing
      // was reachable. Leading with the words people use fixed it.
      description:
        "Delete, remove or get rid of a saved workout preset. Permanent; logged workouts keep their history.",
      destructive: true,
      input: z.object({
        preset: nameArg("workout preset"),
      }),
      run: async ({ preset: wanted }) => {
        const { all, schedule } = await orderedPresets()
        const preset = describePreset(all, wanted)
        const presetId = String(preset.id)
        await deps.mutate(
          api.logs.presets.remove,
          { id: presetId },
          "logs.presets.remove"
        )
        // The schedule keeps pointing at it otherwise: a dangling id in
        // `presetOrder` is harmless, but one in `routine` renders as an empty
        // slot on that day with no way to clear it.
        const routine = Object.fromEntries(
          Object.entries(schedule?.routine ?? {}).map(([day, id]) => [
            day,
            id === presetId ? null : id,
          ])
        )
        await deps.mutate(
          api.users.schedules.set,
          {
            routine,
            presetOrder: (schedule?.presetOrder ?? []).filter(
              (id) => id !== presetId
            ),
          },
          "users.schedules.set"
        )
        return { deleted: preset.name }
      },
    }),

    action({
      name: "reorder_presets",
      description:
        "Put the workout presets in a new order. Name them first to last; any left out keep their relative places.",
      input: z.object({
        presets: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("Workout preset names, in the order wanted, first to last"),
      }),
      run: async ({ presets: wanted }) => {
        const { all, schedule } = await orderedPresets()
        const presetIds = wanted.map((name) =>
          String(describePreset(all, name).id)
        )
        // A partial list is treated as a partial move, not a truncation. The
        // model happily returns "put Legs first" as a one-element array, and
        // reading that as "delete the other six from the order" would silently
        // reshuffle the user's week.
        const seen = new Set(presetIds)
        const order = [
          ...presetIds,
          ...all
            .map((preset) => String(preset.id))
            .filter((id) => !seen.has(id)),
        ]
        await writeOrder(order, schedule)
        return {
          order: order.map((id, index) => ({
            position: index + 1,
            name: all.find((preset) => String(preset.id) === id)?.name ?? id,
          })),
        }
      },
    }),

    action({
      name: "move_preset_to_position",
      description:
        "Move one workout preset up or down the list, without listing all the others.",
      input: z.object({
        preset: nameArg("workout preset"),
        position: z
          .number()
          .int()
          .min(1)
          .describe("Where it should end up. 1 is the top of the list."),
      }),
      run: async ({ preset: wanted, position }) => {
        const { presets, schedule } = await orderedPresets()
        const ids = presets.map((preset) => String(preset.id))
        const from = ids.indexOf(String(describePreset(presets, wanted).id))
        const to = Math.min(Math.max(position - 1, 0), ids.length - 1)
        ids.splice(to, 0, ...ids.splice(from, 1))
        await writeOrder(ids, schedule)
        return {
          moved: presets[from]?.name,
          from: from + 1,
          to: to + 1,
        }
      },
    }),

    action({
      name: "schedule_preset_on_day",
      description: "Put a workout preset on a day of the week in the routine.",
      input: z.object({
        preset: nameArg("workout preset"),
        day: z.enum(DAYS),
      }),
      run: async ({ preset: wanted, day }) => {
        const { all, schedule } = await orderedPresets()
        const preset = describePreset(all, wanted)
        const presetId = String(preset.id)
        await deps.mutate(
          api.users.schedules.set,
          {
            routine: { ...(schedule?.routine ?? {}), [day]: presetId },
            presetOrder:
              schedule?.presetOrder ?? all.map((row) => String(row.id)),
          },
          "users.schedules.set"
        )
        return { scheduled: preset.name, day }
      },
    }),

    action({
      name: "clear_scheduled_day",
      description: "Take whatever workout is scheduled off a day of the week.",
      input: z.object({ day: z.enum(DAYS) }),
      run: async ({ day }) => {
        const { all, schedule } = await orderedPresets()
        await deps.mutate(
          api.users.schedules.set,
          {
            routine: { ...(schedule?.routine ?? {}), [day]: null },
            presetOrder:
              schedule?.presetOrder ?? all.map((row) => String(row.id)),
          },
          "users.schedules.set"
        )
        return { cleared: day }
      },
    }),

    action({
      name: "show_weekly_routine",
      description:
        "Read back which workout is scheduled on each day of the week.",
      input: z.object({}),
      run: async () => {
        const { all, schedule } = await orderedPresets()
        const names = new Map(
          all.map((preset) => [String(preset.id), preset.name])
        )
        return {
          week: DAYS.map((day) => ({
            day,
            workout:
              names.get(String(schedule?.routine?.[day] ?? "")) ?? "rest",
          })),
        }
      },
    }),
  ]
}

/** Names in, presets out. See `matchByName` for why every tool takes a name. */
function describePreset(presets: readonly PresetRow[], wanted: string) {
  return matchByName(
    presets,
    wanted,
    (preset) => ({ id: String(preset.id), name: preset.name }),
    "workout preset"
  )
}

/**
 * Convex hands back `_id`, `_creationTime` and our own `id` alias on every row,
 * and `presets.update` validates its arguments strictly. Echoing a document
 * straight back at it fails on the fields it never declared.
 */
function stripSystemFields(row: Record<string, unknown>) {
  const {
    _id: _documentId,
    _creationTime: _created,
    userId: _userId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...body
  } = row
  return body
}
