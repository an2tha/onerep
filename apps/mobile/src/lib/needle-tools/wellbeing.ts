import * as z from "zod"
import { api } from "../../../../../convex/_generated/api"
import { action, dateArg, matchByName, nameArg, resolveDate } from "./deps"
import type { QuickActionDeps } from "./deps"

/**
 * Water, fasting, supplements, weight and measurements.
 *
 * The small stuff, which is most of what anybody actually logs. Every one of
 * these is a single tap in the UI already; the point of having them here is the
 * sentence that does four at once — "500ml of water and I took my creatine".
 */

/** Common glass and bottle sizes, so "a glass" does not become a guess. */
const WATER_PRESETS: Record<string, number> = {
  sip: 100,
  glass: 250,
  cup: 250,
  mug: 350,
  bottle: 500,
  "large bottle": 750,
  litre: 1000,
  liter: 1000,
}

export function wellbeingTools(deps: QuickActionDeps) {
  /** Names in, ids out. See `matchByName` for why no tool here takes an id. */
  async function supplementIdFor(wanted: string) {
    const overview = (await deps.query(api.logs.supplements.getOverview, {
      date: deps.today(),
    })) as { items?: Array<{ _id: string; name: string; active?: boolean }> }
    const item = matchByName(
      (overview.items ?? []).filter((row) => row.active !== false),
      wanted,
      (row) => ({ id: row._id, name: row.name }),
      "supplement"
    )
    return item._id
  }

  return [
    action({
      name: "log_water",
      description:
        "Log water. Use size for words like 'a glass' or 'a bottle'; use amountMl only when an actual number of millilitres is said.",
      input: z.object({
        size: z
          .enum([
            "sip",
            "glass",
            "cup",
            "mug",
            "bottle",
            "large bottle",
            "litre",
          ])
          .optional()
          // The millilitres each size means used to be spelled out here. They
          // were then emitted as evidence: "I drank a glass of water" came back
          // as `amountMl: 1000`, lifted from the word "litre" in this string.
          // The mapping belongs in WATER_PRESETS, where the model cannot read it.
          .describe("The size drunk, when said in words rather than numbers"),
        amountMl: z
          .number()
          .int()
          .min(10)
          .max(5000)
          .optional()
          .describe("Millilitres, only if the user gave a number"),
        date: dateArg.optional(),
      }),
      run: async ({ amountMl, size, date }) => {
        const ml = amountMl ?? (size ? WATER_PRESETS[size] : undefined)
        if (!ml)
          throw new Error(
            "Say how much water — millilitres, or a size like 'glass'."
          )
        const key = resolveDate(date, deps.today())
        await deps.mutate(
          api.logs.water.addEntry,
          {
            date: key,
            entry: { id: deps.id(), amountMl: ml, loggedAt: deps.now() },
          },
          "logs.water.addEntry"
        )
        const day = ((await deps.query(api.logs.water.getDay, { date: key })) ??
          []) as Array<{ amountMl: number }>
        return {
          logged: `${ml} ml`,
          date: key,
          totalMl: day.reduce(
            (sum, entry) => sum + (Number(entry.amountMl) || 0),
            0
          ),
        }
      },
    }),

    action({
      name: "undo_last_water",
      description: "Remove the most recent water entry, for a mis-tap.",
      input: z.object({ date: dateArg.optional() }),
      run: async ({ date }) => {
        const key = resolveDate(date, deps.today())
        const day = ((await deps.query(api.logs.water.getDay, { date: key })) ??
          []) as Array<{ id: string; amountMl: number }>
        const last = day.at(-1)
        if (!last) throw new Error(`No water is logged on ${key}.`)
        await deps.mutate(
          api.logs.water.removeEntry,
          { date: key, entryId: last.id },
          "logs.water.removeEntry"
        )
        return { removed: `${last.amountMl} ml`, date: key }
      },
    }),

    action({
      name: "start_fast",
      description: "Start a fast, with a target length in hours.",
      input: z.object({
        hours: z.number().min(1).max(72).describe("Target length, e.g. 16"),
        protocol: z
          .string()
          .optional()
          .describe("What to call it, e.g. '16:8'. Defaults to the hours."),
      }),
      run: async ({ hours, protocol }) => {
        await deps.mutate(api.logs.fasting.start, {
          targetMinutes: Math.round(hours * 60),
          protocol: protocol ?? `${hours}h`,
          startDate: deps.today(),
        })
        return { started: true, targetHours: hours }
      },
    }),

    action({
      name: "stop_fast",
      description:
        "End the fast that is running and record how long it lasted.",
      input: z.object({}),
      run: async () => {
        const active = (await deps.query(api.logs.fasting.getActive, {})) as {
          _id: string
          startedAt: number
        } | null
        if (!active) throw new Error("No fast is running.")
        await deps.mutate(api.logs.fasting.stop, { id: active._id })
        return {
          stopped: true,
          hours:
            Math.round(((Date.now() - active.startedAt) / 3_600_000) * 10) / 10,
        }
      },
    }),

    action({
      name: "list_supplements",
      description: "The supplements the user takes.",
      input: z.object({}),
      run: async () => {
        const overview = (await deps.query(api.logs.supplements.getOverview, {
          date: deps.today(),
        })) as {
          items?: Array<{ _id: string; name: string; active?: boolean }>
        }
        return {
          supplements: (overview.items ?? [])
            .filter((item) => item.active !== false)
            .slice(0, 15)
            .map((item) => ({ name: item.name })),
        }
      },
    }),

    action({
      name: "log_supplement",
      description: "Mark a supplement as taken.",
      input: z.object({
        supplement: nameArg("supplement"),
        servings: z
          .number()
          .positive()
          .max(10)
          .optional()
          .describe("How many servings, if not one"),
        date: dateArg.optional(),
      }),
      run: async ({ supplement, servings, date }) => {
        const supplementId = await supplementIdFor(supplement)
        await deps.mutate(
          api.logs.supplements.logTaken,
          {
            supplementId,
            date: resolveDate(date, deps.today()),
            loggedAt: deps.now(),
            ...(servings ? { servingMultiplier: servings } : {}),
          },
          "logs.supplements.logTaken"
        )
        return { taken: supplement, servings: servings ?? 1 }
      },
    }),

    action({
      name: "skip_supplement",
      description:
        "Mark a supplement as deliberately skipped, so the streak knows why.",
      input: z.object({
        supplement: nameArg("supplement"),
        date: dateArg.optional(),
        note: z.string().optional(),
      }),
      run: async ({ supplement, date, note }) => {
        const supplementId = await supplementIdFor(supplement)
        await deps.mutate(
          api.logs.supplements.markSkipped,
          {
            supplementId,
            date: resolveDate(date, deps.today()),
            loggedAt: deps.now(),
            ...(note ? { note } : {}),
          },
          "logs.supplements.markSkipped"
        )
        return { skipped: supplement }
      },
    }),

    action({
      name: "log_weight",
      description: "Record a body weight check-in.",
      input: z.object({
        weightKg: z.number().min(20).max(400).describe("Weight in kilograms"),
        date: dateArg.optional(),
        notes: z.string().max(200).optional(),
      }),
      run: async ({ weightKg, date, notes }) => {
        const key = resolveDate(date, deps.today())
        await deps.mutate(
          api.bodyProgress.save,
          {
            clientId: deps.id(),
            loggedAt: key,
            weightKg,
            ...(notes ? { notes } : {}),
          },
          "bodyProgress.save"
        )
        return { logged: `${weightKg} kg`, date: key }
      },
    }),

    action({
      name: "log_body_measurements",
      description:
        "Record tape measurements — waist, chest, arms and so on — in centimetres.",
      input: z.object({
        waistCm: z.number().min(20).max(300).optional(),
        chestCm: z.number().min(20).max(300).optional(),
        hipsCm: z.number().min(20).max(300).optional(),
        armsCm: z.number().min(10).max(150).optional(),
        thighsCm: z.number().min(10).max(200).optional(),
        calvesCm: z.number().min(10).max(150).optional(),
        neckCm: z.number().min(10).max(100).optional(),
        bodyFatPct: z.number().min(1).max(70).optional(),
        date: dateArg.optional(),
      }),
      run: async ({ date, ...measurements }) => {
        const given = Object.entries(measurements).filter(
          ([, value]) => value !== undefined
        )
        if (given.length === 0)
          throw new Error("Give at least one measurement.")
        const key = resolveDate(date, deps.today())
        await deps.mutate(
          api.bodyProgress.save,
          { clientId: deps.id(), loggedAt: key, ...Object.fromEntries(given) },
          "bodyProgress.save"
        )
        return { logged: given.map(([field]) => field), date: key }
      },
    }),

    action({
      name: "log_daily_metric",
      description:
        "Record a health number by hand — steps, resting heart rate, sleep hours — overriding the phone's sync for that day.",
      input: z.object({
        field: z
          .enum([
            "steps",
            "restingHeartRate",
            "sleepMinutes",
            "activeCalories",
            "hrv",
          ])
          .describe("Which metric"),
        value: z.number().min(0).max(100_000),
        date: dateArg.optional(),
      }),
      run: async ({ field, value, date }) => {
        const key = resolveDate(date, deps.today())
        await deps.mutate(api.logs.healthMetrics.setDailyMetric, {
          date: key,
          field,
          value,
        })
        return { set: field, value, date: key }
      },
    }),
  ]
}
