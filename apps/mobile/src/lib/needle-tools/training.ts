import * as z from "zod"
import { api } from "../../../../../convex/_generated/api"
import { action, dateArg, matchByName, nameArg, resolveDate } from "./deps"
import type { QuickActionDeps } from "./deps"

/**
 * Starting, finishing and abandoning a session, plus rest days.
 *
 * There are two workout slots per day — the app supports a morning and an
 * evening session — and every tool here is explicit about which one it means
 * rather than guessing, because slot 2 is the one people forget exists and then
 * lose a session to.
 */

type PresetRow = {
  id: string
  name: string
  items?: unknown[]
  exerciseData?: unknown
}
type ActiveWorkout = {
  slot: 1 | 2
  presetId?: string
  items?: Array<{ id: string; name: string }>
  startedAt: number
  elapsedSeconds?: number
} | null

const slotArg = z
  .union([z.literal(1), z.literal(2)])
  .optional()
  .describe("Session slot: 1 for the first workout of the day, 2 for a second")

export function trainingTools(deps: QuickActionDeps) {
  return [
    action({
      name: "start_workout",
      description: "Start a workout from one of the saved presets.",
      input: z.object({
        preset: nameArg("workout preset"),
        slot: slotArg,
      }),
      run: async ({ preset: wanted, slot }) => {
        const presets = (await deps.query(
          api.logs.presets.list,
          {}
        )) as PresetRow[]
        const preset = matchByName(
          presets,
          wanted,
          (row) => ({ id: String(row.id), name: row.name }),
          "workout preset"
        )
        const { id } = (await deps.mutate(api.logs.activeWorkout.createActive, {
          slot: slot ?? 1,
          presetId: String(preset.id),
          items: preset.items ?? [],
          exerciseData: preset.exerciseData ?? {},
        })) as { id: string }
        return {
          started: preset.name,
          slot: slot ?? 1,
          exercises: preset.items?.length ?? 0,
          id,
        }
      },
    }),

    action({
      name: "show_active_workout",
      description:
        "What is running right now: which session, how long it has been going.",
      input: z.object({ slot: slotArg }),
      run: async ({ slot }) => {
        const active = (await deps.query(api.logs.activeWorkout.getActive, {
          slot: slot ?? 1,
        })) as ActiveWorkout
        if (!active) return { running: false }
        return {
          running: true,
          slot: active.slot,
          exercises: active.items?.length ?? 0,
          minutes: Math.round((active.elapsedSeconds ?? 0) / 60),
        }
      },
    }),

    action({
      name: "finish_workout",
      description:
        "Finish the workout that is running and write it to the log with everything recorded so far.",
      input: z.object({ slot: slotArg, date: dateArg.optional() }),
      run: async ({ slot, date }) => {
        const which = slot ?? 1
        const active = (await deps.query(api.logs.activeWorkout.getActive, {
          slot: which,
        })) as ActiveWorkout
        if (!active)
          throw new Error(
            "No workout is running, so there is nothing to finish."
          )
        const seconds =
          active.elapsedSeconds ??
          Math.round((Date.now() - active.startedAt) / 1000)
        // `finishActive` clears the live session; `completion` is what actually
        // writes the log. Both, in that order — finishing without the write
        // loses the session, and writing without finishing leaves a ghost timer
        // running on the dashboard.
        const finished = (await deps.mutate(
          api.logs.activeWorkout.finishActive,
          {
            slot: which,
          }
        )) as { exercises?: unknown[] } | undefined
        await deps.mutate(
          api.logs.workouts.completion,
          {
            date: resolveDate(date, deps.today()),
            sessionId: deps.id(),
            slot: which,
            exercises: finished?.exercises ?? [],
            durationSeconds: seconds,
          },
          "logs.workouts.completion"
        )
        return {
          finished: true,
          slot: which,
          minutes: Math.round(seconds / 60),
        }
      },
    }),

    action({
      name: "abort_workout",
      description:
        "Throw away the workout that is running. Every set recorded in it is lost and nothing is written to the log.",
      destructive: true,
      input: z.object({ slot: slotArg }),
      run: async ({ slot }) => {
        const which = slot ?? 1
        const active = (await deps.query(api.logs.activeWorkout.getActive, {
          slot: which,
        })) as ActiveWorkout
        if (!active) throw new Error("No workout is running.")
        await deps.mutate(api.logs.activeWorkout.abortActive, { slot: which })
        return {
          aborted: true,
          slot: which,
          exercises: active.items?.length ?? 0,
        }
      },
    }),

    action({
      name: "mark_rest_day",
      description:
        "Mark a day as a deliberate rest day so it does not read as a missed session.",
      input: z.object({ date: dateArg.optional() }),
      run: async ({ date }) => {
        const key = resolveDate(date, deps.today())
        await deps.mutate(api.logs.restDays.mark, {
          dates: [key],
          source: "needle",
        })
        return { rested: key }
      },
    }),

    action({
      name: "unmark_rest_day",
      description: "Take the rest-day mark off a day.",
      input: z.object({ date: dateArg.optional() }),
      run: async ({ date }) => {
        const key = resolveDate(date, deps.today())
        await deps.mutate(api.logs.restDays.unmark, { dates: [key] })
        return { cleared: key }
      },
    }),

    action({
      name: "show_workout_history",
      description:
        "The last few completed sessions, with dates and how long they took.",
      input: z.object({
        limit: z.number().int().min(1).max(10).optional(),
      }),
      run: async ({ limit }) => {
        const history = (await deps.query(
          api.logs.workouts.getHistory,
          {}
        )) as Array<{
          date: string
          durationSeconds?: number
          exercises?: unknown[]
        }>
        return {
          sessions: history.slice(0, limit ?? 5).map((log) => ({
            date: log.date,
            minutes: Math.round((log.durationSeconds ?? 0) / 60),
            exercises: log.exercises?.length ?? 0,
          })),
        }
      },
    }),
  ]
}
